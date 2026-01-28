// api/streamer_data_repeater.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --------------------------------------------------------------------------
    // [설정] 라임환상곡님 쿠키 (Dashboard API용) - 이게 진짜 핵심 키
    // --------------------------------------------------------------------------
    const MY_SOOP_COOKIE = `_au=977e0815b0e1ca2a278c486f2970ae3e; _au3rd=977e0815b0e1ca2a278c486f2970ae3e; _fbp=fb.2.1755271305719.754580412350607138; _tt_enable_cookie=1; _ttp=01K2Q556SFGTTZP0G0S7DYGEK0_.tt.2; __gads=ID=6a19f2555102dd9d:T=1755359700:RT=1757937689:S=ALNI_MbvLd7EdNR92gxgcHfzZ4a6gpC-_Q; __gpi=UID=000011813eff1829:T=1755359700:RT=1757937689:S=ALNI_Mbd-BQbOYY-YXj54dta6PGQ1Lt3tg; __eoi=ID=4f5d5e5448b7869e:T=1755359700:RT=1757937689:S=AA-AfjZBpSNgVVM1MKeQCGXudBVY; _ga_5EYT9PM505=GS2.1.s1757953559$o94$g1$t1757953647$j5$l0$h0; _ga_6HE3866SMQ=GS2.1.s1762692340$o2$g0$t1762692351$j49$l0$h0; chk_popup=%26%26%26%26%26%26%EC%8A%A4%ED%8A%B8%EB%A6%AC%EB%A8%B8%20%EB%8C%80%EC%83%81%20%EB%93%9C%EB%A1%AD%EC%8A%A4%20%EA%B3%B5%EC%A7%80%3D20251228002123; chk_confetti=%26%EC%8A%A4%ED%8A%B8%EB%A6%AC%EB%A8%B8%20%EB%8C%80%EC%83%81%20%3D20251228235959; vod_thumb_edit_tempty001=1; NextChangePwd=1; BbsTicket=tempty001; isBbs=1; RDB=c80300000000004b52000000000000000000000000000000010000002b2b0000000000000001; BbsSaveTicket=.A32.pxqRXFPZNcY9Qg1.7Wc0Ny6G2DE7iLsKUDar3A; _lang=ko_KR; UserTicket=uid%3Dtempty001%26uno%3D36295456%26age%3D43%26sex%3DA%26A%3DAAG%26B%3DBAED%26unick%3D%EB%9D%BC%EC%9E%84%ED%99%98%EC%83%81%EA%B3%A1%26apply_date%3D1452095497%26name_chk%3D1%26sess_adult_chk%3D1%26broad_name_chk%3D1%26change_password%3D1%26chnnl_cd%3D1%26chnnl_name_chk%3D1; ttcsid=1769332391882::TWXehZp9xdgSGLdEuToK.57.1769354710342.0; AbroadChk=FAIL; AbroadVod=FAIL;`;

    // --------------------------------------------------------------------------
    // [검증] 엄격한 규칙
    // --------------------------------------------------------------------------
    const Validator = {
        isValidFan: (val) => {
            if (val === null || val === undefined || val === '') return false;
            const num = Number(val);
            if (isNaN(num) || !Number.isInteger(num) || num <= 0) return false;
            return true;
        },
        isValidLive: (val) => {
            if (val === null || val === undefined) return false;
            if (typeof val === 'boolean') return true;
            if (val === 0 || val === 1) return true;
            return false;
        },
        isValidViewer: (val) => {
            if (val === null || val === undefined || val === '') return false;
            const num = Number(val);
            if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
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
                    title: '', thumbnail: '', profileUrl: ''
                };

                let isFanOk = false;
                let isLiveOk = false;
                
                // 디버그 로그용 (L:라이브, F:팬)
                let debugLive = "L:Fail";
                let debugFan = "F:Fail";

                // =================================================================
                // 1. [M1] 비공식 Station API (st.sooplive) - 팬 수 위주
                // =================================================================
                try {
                    const stUrl = `https://st.sooplive.co.kr/api/get_station_status.php`;
                    const stParams = new URLSearchParams();
                    stParams.append('szBjId', item.id);
                    const stRes = await fetch(stUrl, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, 
                        body: stParams 
                    });
                    
                    if (stRes.ok) {
                        const stInfo = await stRes.json();
                        
                        // 팬 수
                        let rawFan = stInfo?.station?.upd?.fan_cnt || stInfo?.total_bj_fan_cnt || 0;
                        if (Validator.isValidFan(rawFan)) {
                            resultData.fans = parseInt(rawFan);
                            isFanOk = true;
                            debugFan = "F:M1";
                        }
                        
                        // 구독자 (옵션)
                        if (stInfo?.subscription) {
                            let sub = stInfo.subscription;
                            if (sub.cnt) sub = sub.cnt;
                            if (!isNaN(Number(sub))) resultData.subscribers = Number(sub);
                        }
                    }
                } catch(e) {}

                // =================================================================
                // 2. [M2] HTML Scraping (ch.sooplive) - 라이브 위주 (팬 수 보완)
                // =================================================================
                // 이미 팬수랑 라이브 다 찾았으면 건너뜀
                if (!isLiveOk || !isFanOk) {
                    try {
                        const webRes = await fetch(`https://ch.sooplive.co.kr/${item.id}`, { 
                            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } 
                        });

                        if (webRes.ok) {
                            const html = await webRes.text();
                            if (html.includes(`szBjId="${item.id}"`) || html.includes(`szBjId = "${item.id}"`)) {
                                
                                // Live Check
                                if (!isLiveOk) {
                                    const broadNoMatch = html.match(/"broad_no"\s*:\s*"?(\d+)"?/);
                                    const rawIsLive = (broadNoMatch && parseInt(broadNoMatch[1]) > 0);
                                    const viewMatch = html.match(/"current_sum_viewer"\s*:\s*"?(\d+)"?/);
                                    const rawViewers = viewMatch ? viewMatch[1] : 0;

                                    if (Validator.isValidLive(rawIsLive) && Validator.isValidViewer(rawViewers)) {
                                        resultData.isLive = rawIsLive;
                                        resultData.viewers = parseInt(rawViewers);
                                        if(rawIsLive) {
                                            const titleMatch = html.match(/"broad_title"\s*:\s*"([^"]+)"/);
                                            if(titleMatch) resultData.title = titleMatch[1];
                                            const thumbMatch = html.match(/"broad_thumb"\s*:\s*"([^"]+)"/);
                                            if(thumbMatch) resultData.thumbnail = thumbMatch[1];
                                        }
                                        isLiveOk = true;
                                        debugLive = "L:M2";
                                    }
                                }

                                // Fan Check (M1 실패시)
                                if (!isFanOk) {
                                    const fanMatch = html.match(/"fan_cnt"\s*:\s*"?(\d+)"?/);
                                    const rawFan = fanMatch ? fanMatch[1] : 0;
                                    if (Validator.isValidFan(rawFan)) {
                                        resultData.fans = parseInt(rawFan);
                                        isFanOk = true;
                                        debugFan = "F:M2";
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }

                // =================================================================
                // 3. [M3] Dashboard API (Cookie) - 강력한 최후의 수단
                // =================================================================
                // 뭐라도 하나 실패했으면 쿠키 써서 긁어옴
                if (!isLiveOk || !isFanOk) {
                    try {
                        const dashUrl = `https://api-channel.sooplive.co.kr/v1.1/channel/${item.id}/dashboard`;
                        const dashRes = await fetch(dashUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Cookie': MY_SOOP_COOKIE, // [중요] 쿠키 사용
                                'Referer': 'https://www.sooplive.co.kr/',
                                'Accept': 'application/json'
                            }
                        });

                        if (dashRes.ok) {
                            const json = await dashRes.json();
                            const data = json.data || json;

                            // Fan Check
                            if (!isFanOk) {
                                const rawFan = data?.station?.total_fan_cnt || data?.station?.fan_cnt || 0;
                                if (Validator.isValidFan(rawFan)) {
                                    resultData.fans = parseInt(rawFan);
                                    isFanOk = true;
                                    debugFan = "F:M3";
                                }
                            }

                            // Live Check
                            if (!isLiveOk) {
                                const broad = data?.broad;
                                const rawIsLive = (broad && broad.broad_no) ? true : false;
                                const rawViewers = broad ? broad.current_sum_viewer : 0;
                                
                                if (Validator.isValidLive(rawIsLive) && Validator.isValidViewer(rawViewers)) {
                                    resultData.isLive = rawIsLive;
                                    resultData.viewers = parseInt(rawViewers);
                                    if(rawIsLive) {
                                        resultData.title = broad.broad_title || "";
                                        resultData.thumbnail = broad.broad_thumb || "";
                                    }
                                    isLiveOk = true;
                                    debugLive = "L:M3";
                                }
                            }
                        }
                    } catch (e) {}
                }

                // 결과 조합
                resultData._debug = `${debugLive} | ${debugFan}`;
                
                // 팬수 0이면 0으로 확정
                if (!isFanOk) resultData.fans = 0;

                results.push(resultData);
            } 
            
            // [CASE 2] CHZZK (치지직)
            else {
                let chzzkData = { id: item.id, platform: 'chzzk', isLive: false, viewers: 0, fans: 0, _debug: 'CHZZK:OK' };
                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (chzzkRes.ok) {
                        const json = await chzzkRes.json();
                        if (json.content) {
                            chzzkData.isLive = json.content.openLive || false; 
                            chzzkData.fans = json.content.followerCount || 0;
                            if (chzzkData.isLive) {
                                const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                                if (liveRes.ok) {
                                    const liveJson = await liveRes.json();
                                    if(liveJson.content) chzzkData.viewers = liveJson.content.concurrentUserCount || 0;
                                }
                            }
                        }
                    }
                } catch (e) { chzzkData._debug = "CHZZK:Fail"; }
                results.push(chzzkData);
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
