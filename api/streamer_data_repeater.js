// api/streamer_data_repeater.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const SOOP_CLIENT_ID = 'ae1d3e4XXXXXXX'; // [필수] 실제 키값 입력

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const results = [];

        await Promise.all(items.map(async (item) => {
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
                    _debug: [] 
                };

                let isValidDataFound = false; // [핵심] 유효 데이터 확보 여부 플래그

                // ----------------------------------------------------------------
                // METHOD 1: 공식 API (검증 기준: broadcast_list 키 존재 여부)
                // ----------------------------------------------------------------
                try {
                    const listUrl = `https://openapi.sooplive.co.kr/broad/list?client_id=${SOOP_CLIENT_ID}&select_key=bj_id&select_value=${item.id}&page_no=1`;
                    const listRes = await fetch(listUrl, { headers: { 'Accept': '*/*' } });
                    
                    if (listRes.ok) {
                        const listData = await listRes.json();
                        
                        // [검증] 응답에 'broadcast_list'라는 키가 있는가? (SOOP 공식 규격)
                        if (listData && Array.isArray(listData.broadcast_list)) {
                            // 데이터 구조가 정상이므로 '유효 데이터'로 인정
                            isValidDataFound = true; 
                            resultData._debug.push("M1:ValidStruct");

                            if (listData.broadcast_list.length > 0) {
                                const broad = listData.broadcast_list[0];
                                resultData.isLive = true;
                                resultData.viewers = parseInt(broad.total_view_cnt || 0);
                                resultData.title = broad.broad_title || "";
                                resultData.thumbnail = broad.broad_thumb || "";
                                if (broad.profile_img) {
                                    resultData.profileUrl = broad.profile_img.startsWith('//') ? 'https:' + broad.profile_img : broad.profile_img;
                                }
                            }
                        }
                    }

                    // 팬 수 확인 (Station API)
                    if (isValidDataFound) { // 리스트 조회가 성공했을 때만 시도
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
                                // [검증] station 객체가 있는가?
                                if (sData && (sData.station || sData.total_fan_cnt !== undefined)) {
                                    const rawFan = (sData.station && sData.station.total_fan_cnt) 
                                                || sData.total_fan_cnt 
                                                || 0;
                                    if(rawFan > 0) resultData.fans = parseInt(rawFan);
                                }
                            }
                        } catch (e) {}
                    }
                } catch (e) {
                    resultData._debug.push("M1:Err");
                }

                // ----------------------------------------------------------------
                // METHOD 2: 비공식 API 1 (검증 기준: RESULT 코드 확인)
                // ----------------------------------------------------------------
                // 공식 API에서 구조적 검증에 실패했거나(키 문제), 데이터를 못 얻었을 때 실행
                if (!isValidDataFound) {
                    try {
                        // 1. Live Detail (RESULT: 1 확인)
                        const liveUrl = `https://live.sooplive.co.kr/afreeca/player_live_api.php`;
                        const liveParams = new URLSearchParams();
                        liveParams.append('bid', item.id);
                        
                        const liveRes = await fetch(liveUrl, { method: 'POST', body: liveParams });
                        const liveDetail = await liveRes.json();

                        // [검증] SOOP 비공식 API는 성공 시 RESULT: 1을 반환함
                        if (liveDetail && liveDetail.RESULT === 1) {
                            isValidDataFound = true; // 유효 데이터 확보!
                            resultData._debug.push("M2:ValidResult");
                            
                            if (liveDetail.broad_no) {
                                resultData.isLive = true;
                                resultData.viewers = parseInt(liveDetail.view_cnt || 0);
                                if(liveDetail.thumb) resultData.thumbnail = `https:${liveDetail.thumb}`;
                            }
                        }

                        // 2. Station Info (station 객체 확인)
                        const stUrl = `https://st.sooplive.co.kr/api/get_station_status.php`;
                        const stParams = new URLSearchParams();
                        stParams.append('szBjId', item.id);
                        
                        const stRes = await fetch(stUrl, { method: 'POST', body: stParams });
                        const stationInfo = await stRes.json();

                        // [검증] 응답에 'station' 객체가 있는가?
                        if (stationInfo && stationInfo.station) {
                            // 여기서도 유효성 인정 가능
                            isValidDataFound = true;
                            
                            // 팬 수
                            if (stationInfo.station.upd && stationInfo.station.upd.fan_cnt) {
                                resultData.fans = parseInt(stationInfo.station.upd.fan_cnt);
                            }
                            // 구독자 수
                            if (stationInfo.subscription) {
                                if (typeof stationInfo.subscription === 'number') resultData.subscribers = stationInfo.subscription;
                                else if (stationInfo.subscription.cnt) resultData.subscribers = stationInfo.subscription.cnt;
                            }
                        }

                    } catch (e) {
                        resultData._debug.push("M2:Err");
                    }
                }

                // ----------------------------------------------------------------
                // METHOD 3: HTML 파싱 (검증 기준: BJ ID 매칭 확인)
                // ----------------------------------------------------------------
                // 앞선 API들이 모두 엉뚱한 응답을 줬을 때 실행
                if (!isValidDataFound) {
                    try {
                        const targetUrl = `https://ch.sooplive.co.kr/${item.id}`;
                        const webRes = await fetch(targetUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
                        });

                        if (webRes.ok) {
                            const html = await webRes.text();
                            
                            // [검증] HTML 안에 우리가 요청한 BJ ID가 포함되어 있는가? (엉뚱한 페이지 방지)
                            // 예: szBjId = "test_id"
                            if (html.includes(`szBjId = "${item.id}"`) || html.includes(`szBjId="${item.id}"`)) {
                                isValidDataFound = true;
                                resultData._debug.push("M3:ValidHTML");

                                // 데이터 추출
                                const broadNoMatch = html.match(/"broad_no"\s*:\s*"?(\d+)"?/);
                                if (broadNoMatch && parseInt(broadNoMatch[1]) > 0) {
                                    resultData.isLive = true;
                                    const viewMatch = html.match(/"current_sum_viewer"\s*:\s*"?(\d+)"?/);
                                    if(viewMatch) resultData.viewers = parseInt(viewMatch[1]);
                                }

                                const fanMatch = html.match(/"fan_cnt"\s*:\s*"?(\d+)"?/);
                                if (fanMatch) resultData.fans = parseInt(fanMatch[1]);
                            }
                        }
                    } catch (e) {
                        resultData._debug.push("M3:Err");
                    }
                }

                // 최종적으로 유효 데이터를 못 찾았으면 로그 남기기
                if (!isValidDataFound) {
                    resultData._debug.push("ALL_FAIL");
                }
                
                resultData._debug = resultData._debug.join('|');
                results.push(resultData);
            } 
            
            // [CASE 2] CHZZK (치지직) - 기존 코드 유지
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
                        // 치지직 검증: content 객체가 있는가?
                        if (json.content) {
                            chzzkData.isLive = json.content.openLive || false; 
                            chzzkData.fans = json.content.followerCount || 0;
                            chzzkData.profileUrl = json.content.channelImageUrl || "";
                            if (chzzkData.isLive) {
                                const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                                if (liveRes.ok) {
                                    const liveJson = await liveRes.json();
                                    if (liveJson.content) chzzkData.viewers = liveJson.content.concurrentUserCount || 0;
                                }
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
