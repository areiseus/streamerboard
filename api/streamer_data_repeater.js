// api/streamer_data_repeater.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // [설정] 수집하신 Client ID
    const SOOP_CLIENT_ID = 'ae1d3e4XXXXXXX'; // <-- 실제 키값으로 변경 필요

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const results = [];

        await Promise.all(items.map(async (item) => {
            
            // =========================================================
            // [CASE 1] SOOP (숲) - 하이브리드 방식 (공식 -> 비공식)
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
                    thumbnail: ''
                };

                try {
                    // -------------------------------------------------
                    // STEP 1: 공식 API 시도 (OpenAPI)
                    // -------------------------------------------------
                    
                    // 1-A. 방송 상태 확인 (broad/list)
                    const listUrl = `https://openapi.sooplive.co.kr/broad/list?client_id=${SOOP_CLIENT_ID}&select_key=bj_id&select_value=${item.id}&page_no=1`;
                    const listRes = await fetch(listUrl, { headers: { 'Accept': '*/*' } });
                    
                    if (listRes.ok) {
                        const listData = await listRes.json();
                        if (listData && listData.broadcast_list && listData.broadcast_list.length > 0) {
                            const broad = listData.broadcast_list[0];
                            resultData.isLive = true;
                            resultData.viewers = parseInt(broad.total_view_cnt || 0);
                            resultData.title = broad.broad_title || "";
                            resultData.thumbnail = broad.broad_thumb || "";
                        }
                    }

                    // 1-B. 팬 수 확인 (user/stationinfo)
                    // (공식 API에서 팬 수를 주지 않거나 실패할 경우를 대비해 try-catch로 감쌈)
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
                            const stationData = await stationRes.json();
                            // 응답 구조에서 팬 수 추출
                            if (stationData) {
                                // 구조가 유동적일 수 있어 여러 키 확인
                                const rawFan = stationData.total_fan_cnt || stationData.fan_cnt || (stationData.station ? stationData.station.total_fan_cnt : 0);
                                if (rawFan > 0) resultData.fans = parseInt(rawFan);
                            }
                        }
                    } catch (e) {
                        // 공식 팬 수 조회 실패 시 패스 (비공식에서 재시도)
                    }

                    // -------------------------------------------------
                    // STEP 2: 비공식 API 시도 (Fallback) - 데이터가 부족할 때만 실행
                    // -------------------------------------------------
                    // 조건: 공식에서 라이브 확인이 안 됐는데 실제로는 켜져 있을 수도 있음 OR 팬 수를 못 가져왔을 때
                    if (!resultData.isLive || resultData.fans === 0) {
                        
                        const targetUrl = `https://ch.sooplive.co.kr/${item.id}`;
                        const webRes = await fetch(targetUrl, {
                            headers: { 
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                'Accept': 'text/html'
                            }
                        });

                        if (webRes.ok) {
                            const html = await webRes.text();

                            // 2-A. 방송 상태 및 시청자 (공식에서 놓쳤을 경우 보정)
                            if (!resultData.isLive) {
                                const broadNoMatch = html.match(/"broad_no"\s*:\s*"?(\d+)"?/);
                                const broadNo = broadNoMatch ? parseInt(broadNoMatch[1]) : 0;
                                if (broadNo > 0) {
                                    resultData.isLive = true;
                                    const viewMatch = html.match(/"current_sum_viewer"\s*:\s*"?(\d+)"?/);
                                    resultData.viewers = viewMatch ? parseInt(viewMatch[1]) : 0;
                                }
                            }

                            // 2-B. 팬 수 (공식에서 0이 나왔다면 웹 파싱 데이터로 대체)
                            if (resultData.fans === 0) {
                                const fanMatch = html.match(/"fan_cnt"\s*:\s*"?(\d+)"?/);
                                if (fanMatch) {
                                    resultData.fans = parseInt(fanMatch[1]);
                                }
                            }
                        }
                    }

                } catch (err) {
                    console.error(`SOOP Hybrid Error (${item.id}):`, err.message);
                    // 에러 발생 시 기본값 유지
                }

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
                    subscribers: 0
                };

                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    
                    if (chzzkRes.ok) {
                        const json = await chzzkRes.json();
                        const content = json.content || {};

                        chzzkData.isLive = content.openLive || false; 
                        chzzkData.fans = content.followerCount || 0;

                        if (chzzkData.isLive) {
                            const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, {
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            if (liveRes.ok) {
                                const liveJson = await liveRes.json();
                                if (liveJson.content) {
                                    chzzkData.viewers = liveJson.content.concurrentUserCount || 0;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 치지직 에러 무시 (기본값 리턴)
                }
                results.push(chzzkData);
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
