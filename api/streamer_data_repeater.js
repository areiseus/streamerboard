// api/streamer_data_repeater.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // [설정] 수집하신 Client ID
    const SOOP_CLIENT_ID = 'ae1d3e4XXXXXXX'; // 실제 키값으로 변경

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const results = [];

        await Promise.all(items.map(async (item) => {
            
            // =========================================================
            // [CASE 1] SOOP (숲) - 3단계 리트라이 전략
            // =========================================================
            if (item.platform === 'soop') {
                let resultData = {
                    id: item.id,
                    platform: 'soop',
                    isLive: false,
                    viewers: 0,
                    fans: 0,
                    subscribers: 0,
                    title: '',
                    thumbnail: '',
                    profileUrl: '',
                    _success: false // 성공 여부 체크용
                };

                // -----------------------------------------------------
                // METHOD 1: 공식 API (OpenAPI)
                // -----------------------------------------------------
                try {
                    const listUrl = `https://openapi.sooplive.co.kr/broad/list?client_id=${SOOP_CLIENT_ID}&select_key=bj_id&select_value=${item.id}&page_no=1`;
                    const listRes = await fetch(listUrl, { headers: { 'Accept': '*/*' } });
                    
                    if (listRes.ok) {
                        const listData = await listRes.json();
                        // 방송 정보가 있으면 성공으로 간주
                        if (listData) {
                            // 라이브 여부 확인
                            if (listData.broadcast_list && listData.broadcast_list.length > 0) {
                                const broad = listData.broadcast_list[0];
                                resultData.isLive = true;
                                resultData.viewers = parseInt(broad.total_view_cnt || 0);
                                resultData.title = broad.broad_title || "";
                                resultData.thumbnail = broad.broad_thumb || "";
                                if (broad.profile_img) {
                                    resultData.profileUrl = broad.profile_img.startsWith('//') ? 'https:' + broad.profile_img : broad.profile_img;
                                }
                            }
                            
                            // 팬 수 확인 (Station API)
                            try {
                                const stationUrl = `https://openapi.sooplive.co.kr/user/stationinfo`;
                                const params = new URLSearchParams();
                                params.append('client_id', SOOP_CLIENT_ID);
                                params.append('bj_id', item.id);
                                const stationRes = await fetch(stationUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': '*/*' },
                                    body: params
                                });
                                if (stationRes.ok) {
                                    const sData = await stationRes.json();
                                    const rawFan = sData.total_fan_cnt || sData.fan_cnt || (sData.station ? sData.station.total_fan_cnt : 0);
                                    if (rawFan > 0) resultData.fans = parseInt(rawFan);
                                }
                            } catch (e) {}

                            // 데이터가 어느정도 찼으면 성공 처리
                            resultData._success = true;
                        }
                    }
                } catch (e) {
                    console.error(`Method 1 Fail (${item.id})`);
                }

                // -----------------------------------------------------
                // METHOD 2: 비공식 API 1 (User Snippet Logic - JSON)
                // -----------------------------------------------------
                // 공식 API 실패 혹은 팬/방송 정보가 불충분할 때 시도
                if (!resultData._success || (resultData.fans === 0 && !resultData.isLive)) {
                    try {
                        // 1. Live Detail (Player Live API) - 사용자 코드의 client.live.detail 대응
                        // 내부 API 구조를 fetch로 직접 호출
                        const liveUrl = `https://live.sooplive.co.kr/afreeca/player_live_api.php`;
                        const liveParams = new URLSearchParams();
                        liveParams.append('bid', item.id);
                        
                        const liveRes = await fetch(liveUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: liveParams
                        });
                        const liveDetail = await liveRes.json();

                        // 2. Station Info (Get Station Status) - 사용자 코드의 client.channel.station 대응
                        const stUrl = `https://st.sooplive.co.kr/api/get_station_status.php`;
                        const stParams = new URLSearchParams();
                        stParams.append('szBjId', item.id);
                        
                        const stRes = await fetch(stUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: stParams
                        });
                        const stationInfo = await stRes.json();

                        // [사용자 제공 로직 적용]
                        const isLive = liveDetail && liveDetail.broad_no ? true : false;
                        const viewers = isLive ? (liveDetail.view_cnt || liveDetail.total_view_cnt || 0) : 0;
                        
                        let fans = 0;
                        let subscribers = 0;

                        // 팬 수 파싱
                        if (stationInfo?.station?.upd) {
                            fans = stationInfo.station.upd.fan_cnt || 0;
                        } else if (stationInfo?.total_bj_fan_cnt) {
                             fans = stationInfo.total_bj_fan_cnt;
                        }

                        // 구독자 수 파싱 (사용자 로직 그대로 사용)
                        if (stationInfo && stationInfo.subscription !== undefined) {
                            if (typeof stationInfo.subscription === 'number') {
                                subscribers = stationInfo.subscription;
                            } else if (!isNaN(Number(stationInfo.subscription))) {
                                subscribers = Number(stationInfo.subscription);
                            } else if (stationInfo.subscription.cnt) {
                                subscribers = stationInfo.subscription.cnt;
                            }
                        }

                        // 기존 데이터 덮어쓰기 (Method 2가 성공했으므로)
                        resultData.isLive = isLive;
                        resultData.viewers = parseInt(viewers);
                        resultData.fans = parseInt(fans);
                        resultData.subscribers = parseInt(subscribers);
                        
                        // 썸네일/프로필 정보 보완
                        if (isLive && liveDetail.thumb) {
                            resultData.thumbnail = `https:${liveDetail.thumb}`;
                        }
                        
                        resultData._success = true;

                    } catch (e) {
                        console.error(`Method 2 Fail (${item.id})`);
                    }
                }

                // -----------------------------------------------------
                // METHOD 3: 비공식 API 2 (Web Scraping - Fallback)
                // -----------------------------------------------------
                // 앞선 모든 방법 실패 시 최후의 수단
                if (!resultData._success && !resultData.isLive) {
                    try {
                        const targetUrl = `https://ch.sooplive.co.kr/${item.id}`;
                        const webRes = await fetch(targetUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
                        });

                        if (webRes.ok) {
                            const html = await webRes.text();

                            // 방송 상태
                            const broadNoMatch = html.match(/"broad_no"\s*:\s*"?(\d+)"?/);
                            if (broadNoMatch && parseInt(broadNoMatch[1]) > 0) {
                                resultData.isLive = true;
                                const viewMatch = html.match(/"current_sum_viewer"\s*:\s*"?(\d+)"?/);
                                resultData.viewers = viewMatch ? parseInt(viewMatch[1]) : 0;
                                
                                // 썸네일/타이틀
                                const titleMatch = html.match(/"broad_title"\s*:\s*"([^"]+)"/);
                                if(titleMatch) resultData.title = titleMatch[1];
                                const thumbMatch = html.match(/"broad_thumb"\s*:\s*"([^"]+)"/);
                                if(thumbMatch) resultData.thumbnail = thumbMatch[1];
                            }

                            // 팬 수
                            if (resultData.fans === 0) {
                                const fanMatch = html.match(/"fan_cnt"\s*:\s*"?(\d+)"?/);
                                if (fanMatch) resultData.fans = parseInt(fanMatch[1]);
                            }

                            resultData._success = true;
                        }
                    } catch (e) {
                        console.error(`Method 3 Fail (${item.id})`);
                    }
                }
                
                // 내부용 플래그 삭제 후 결과 푸시
                delete resultData._success;
                results.push(resultData);
            } 
            
            // =========================================================
            // [CASE 2] CHZZK (치지직)
            // =========================================================
            else {
                let chzzkData = {
                    id: item.id,
                    platform: 'chzzk',
                    isLive: false,
                    viewers: 0,
                    fans: 0,
                    subscribers: 0,
                    profileUrl: ''
                };

                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (chzzkRes.ok) {
                        const json = await chzzkRes.json();
                        const content = json.content || {};

                        chzzkData.isLive = content.openLive || false; 
                        chzzkData.fans = content.followerCount || 0;
                        chzzkData.profileUrl = content.channelImageUrl || "";

                        if (chzzkData.isLive) {
                            const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                            if (liveRes.ok) {
                                const liveJson = await liveRes.json();
                                if (liveJson.content) chzzkData.viewers = liveJson.content.concurrentUserCount || 0;
                            }
                        }
                    }
                } catch (e) {}
                results.push(chzzkData);
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
