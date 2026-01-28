// api/streamer_data_repeater.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --------------------------------------------------------------------------
    // [핵심] 데이터 검증 규칙 (Strict Validators)
    // --------------------------------------------------------------------------
    const Validator = {
        // [규칙 1] 애청자 수: "자연수" (1, 2, 3...)가 아니면 무조건 Fail
        isValidFan: (val) => {
            if (val === null || val === undefined || val === '') return false;
            const num = Number(val);
            if (isNaN(num)) return false;           // 숫자 아님
            if (!Number.isInteger(num)) return false; // 정수 아님
            if (num <= 0) return false;             // 0 이하 (자연수 아님)
            return true;
        },

        // [규칙 2] 라이브 상태: boolean 또는 0/1 아니면 Fail
        isValidLive: (val) => {
            if (val === null || val === undefined) return false;
            if (typeof val === 'boolean') return true;
            if (val === 0 || val === 1) return true;
            return false;
        },

        // [규칙 3] 시청자 수: 0 이상의 정수
        isValidViewer: (val) => {
            if (val === null || val === undefined || val === '') return false;
            const num = Number(val);
            if (isNaN(num)) return false;
            if (!Number.isInteger(num)) return false;
            if (num < 0) return false;
            return true;
        }
    };

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const results = [];

        await Promise.all(items.map(async (item) => {
            if (item.platform === 'soop') {
                let resultData = {
                    id: item.id, platform: 'soop',
                    isLive: false, viewers: 0, fans: 0, subscribers: 0,
                    title: '', thumbnail: '', profileUrl: '',
                    _debug: []
                };

                let isFanSuccess = false;
                let isLiveSuccess = false;

                // =================================================================
                // STEP 1: 애청자 & 구독자 수집 (Station API)
                // URL: https://st.sooplive.co.kr/api/get_station_status.php
                // 특징: 키 값 불필요, 가장 정확한 팬 수 제공
                // =================================================================
                try {
                    const stUrl = `https://st.sooplive.co.kr/api/get_station_status.php`;
                    const stParams = new URLSearchParams();
                    stParams.append('szBjId', item.id);
                    
                    const stRes = await fetch(stUrl, { 
                        method: 'POST', 
                        headers: { 
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'Mozilla/5.0' 
                        }, 
                        body: stParams 
                    });
                    
                    if (stRes.ok) {
                        const stationInfo = await stRes.json();
                        
                        // 팬 수 추출
                        let rawFan = 0;
                        if (stationInfo?.station?.upd?.fan_cnt) rawFan = stationInfo.station.upd.fan_cnt;
                        else if (stationInfo?.total_bj_fan_cnt) rawFan = stationInfo.total_bj_fan_cnt;

                        // [검증] 자연수인가?
                        if (Validator.isValidFan(rawFan)) {
                            resultData.fans = parseInt(rawFan);
                            isFanSuccess = true;
                            resultData._debug.push("Fan:API_OK");
                        } else {
                            resultData._debug.push(`Fan:Invalid(${rawFan})`);
                        }

                        // 구독자 수 추출 (옵션)
                        if (stationInfo?.subscription) {
                            let sub = stationInfo.subscription;
                            if (sub.cnt) sub = sub.cnt;
                            if (!isNaN(Number(sub))) resultData.subscribers = Number(sub);
                        }
                    } else {
                        resultData._debug.push(`Fan:HTTP_${stRes.status}`);
                    }
                } catch (e) {
                    resultData._debug.push("Fan:Err");
                }

                // =================================================================
                // STEP 2: 라이브 상태 & 시청자 수집 (HTML 파싱)
                // URL: https://ch.sooplive.co.kr/{id}
                // 특징: 라이브 정보는 여기가 제일 확실함 (공식 API 못 쓸 때)
                // =================================================================
                try {
                    const targetUrl = `https://ch.sooplive.co.kr/${item.id}`;
                    const webRes = await fetch(targetUrl, {
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
                            'Accept': 'text/html' 
                        }
                    });

                    if (webRes.ok) {
                        const html = await webRes.text();

                        // 엉뚱한 페이지 방지 (ID 확인)
                        if (html.includes(`szBjId="${item.id}"`) || html.includes(`szBjId = "${item.id}"`)) {
                            
                            // A. 라이브 상태 추출
                            const broadNoMatch = html.match(/"broad_no"\s*:\s*"?(\d+)"?/);
                            const rawBroadNo = broadNoMatch ? broadNoMatch[1] : null;
                            const rawIsLive = (rawBroadNo && parseInt(rawBroadNo) > 0) ? true : false;

                            // B. 시청자 수 추출
                            const viewMatch = html.match(/"current_sum_viewer"\s*:\s*"?(\d+)"?/);
                            const rawViewers = viewMatch ? viewMatch[1] : 0;

                            // [검증] 라이브 값이 boolean/0/1 인가? + 시청자가 정수인가?
                            if (Validator.isValidLive(rawIsLive) && Validator.isValidViewer(rawViewers)) {
                                resultData.isLive = rawIsLive;
                                resultData.viewers = parseInt(rawViewers);
                                isLiveSuccess = true;
                                resultData._debug.push("Live:Web_OK");
                            } else {
                                resultData._debug.push("Live:Invalid");
                            }

                            // C. 썸네일/타이틀 (방송 중일 때만)
                            if (resultData.isLive) {
                                const titleMatch = html.match(/"broad_title"\s*:\s*"([^"]+)"/);
                                if(titleMatch) resultData.title = titleMatch[1];
                                const thumbMatch = html.match(/"broad_thumb"\s*:\s*"([^"]+)"/);
                                if(thumbMatch) resultData.thumbnail = thumbMatch[1];
                            }

                            // D. 팬 수 보완 (API 실패 시에만 HTML에서 긁어옴)
                            if (!isFanSuccess) {
                                const fanMatch = html.match(/"fan_cnt"\s*:\s*"?(\d+)"?/);
                                const rawFanWeb = fanMatch ? fanMatch[1] : 0;
                                if (Validator.isValidFan(rawFanWeb)) {
                                    resultData.fans = parseInt(rawFanWeb);
                                    isFanSuccess = true;
                                    resultData._debug.push("Fan:Web_OK");
                                }
                            }
                        } else {
                            resultData._debug.push("Live:WrongPage");
                        }
                    } else {
                        resultData._debug.push(`Live:HTTP_${webRes.status}`);
                    }
                } catch (e) {
                    resultData._debug.push("Live:Err");
                }

                // 최종 결과 정리
                // 팬 수 자연수 아니면 무조건 0 처리
                if (!isFanSuccess) {
                    resultData.fans = 0; 
                    resultData._debug.push("FINAL:FanFail");
                }
                
                resultData._debug = resultData._debug.join('|');
                results.push(resultData);
            } 
            
            // [CASE 2] CHZZK (치지직)
            else {
                let chzzkData = {
                    id: item.id, platform: 'chzzk',
                    isLive: false, viewers: 0, fans: 0, subscribers: 0, profileUrl: '',
                    _debug: 'CHZZK'
                };
                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (chzzkRes.ok) {
                        const json = await chzzkRes.json();
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
