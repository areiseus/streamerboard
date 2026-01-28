// api/streamer_data_repeater.js

export default async function handler(req, res) {
    // 1. [설정] 라임환상곡님 쿠키 (Dashboard API용 - 가장 정확함)
    const MY_SOOP_COOKIE = `_au=977e0815b0e1ca2a278c486f2970ae3e; _au3rd=977e0815b0e1ca2a278c486f2970ae3e; _fbp=fb.2.1755271305719.754580412350607138; _tt_enable_cookie=1; _ttp=01K2Q556SFGTTZP0G0S7DYGEK0_.tt.2; __gads=ID=6a19f2555102dd9d:T=1755359700:RT=1757937689:S=ALNI_MbvLd7EdNR92gxgcHfzZ4a6gpC-_Q; __gpi=UID=000011813eff1829:T=1755359700:RT=1757937689:S=ALNI_Mbd-BQbOYY-YXj54dta6PGQ1Lt3tg; __eoi=ID=4f5d5e5448b7869e:T=1755359700:RT=1757937689:S=AA-AfjZBpSNgVVM1MKeQCGXudBVY; _ga_5EYT9PM505=GS2.1.s1757953559$o94$g1$t1757953647$j5$l0$h0; _ga_6HE3866SMQ=GS2.1.s1762692340$o2$g0$t1762692351$j49$l0$h0; chk_popup=%26%26%26%26%26%26%EC%8A%A4%ED%8A%B8%EB%A6%AC%EB%A8%B8%20%EB%8C%80%EC%83%81%20%EB%93%9C%EB%A1%AD%EC%8A%A4%20%EA%B3%B5%EC%A7%80%3D20251228002123; chk_confetti=%26%EC%8A%A4%ED%8A%B8%EB%A6%AC%EB%A8%B8%20%EB%8C%80%EC%83%81%20%3D20251228235959; vod_thumb_edit_tempty001=1; NextChangePwd=1; BbsTicket=tempty001; isBbs=1; RDB=c80300000000004b52000000000000000000000000000000010000002b2b0000000000000001; BbsSaveTicket=.A32.pxqRXFPZNcY9Qg1.7Wc0Ny6G2DE7iLsKUDar3A; _lang=ko_KR; UserTicket=uid%3Dtempty001%26uno%3D36295456%26age%3D43%26sex%3DA%26A%3DAAG%26B%3DBAED%26unick%3D%EB%9D%BC%EC%9E%84%ED%99%98%EC%83%81%EA%B3%A1%26apply_date%3D1452095497%26name_chk%3D1%26sess_adult_chk%3D1%26broad_name_chk%3D1%26change_password%3D1%26chnnl_cd%3D1%26chnnl_name_chk%3D1; ttcsid=1769332391882::TWXehZp9xdgSGLdEuToK.57.1769354710342.0; AbroadChk=FAIL; AbroadVod=FAIL;`;

    // 2. [검증] 자연수 체크
    const isValidFan = (val) => {
        if (!val) return false;
        const num = Number(val);
        return !isNaN(num) && Number.isInteger(num) && num > 0;
    };

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const results = [];

        await Promise.all(items.map(async (item) => {
            // [A] SOOP (숲) - Dashboard API (One Shot)
            if (item.platform === 'soop') {
                let data = {
                    id: item.id, platform: 'soop',
                    isLive: false, viewers: 0, fans: 0, subscribers: 0,
                    title: '', thumbnail: '', profileUrl: ''
                };

                try {
                    const dashUrl = `https://api-channel.sooplive.co.kr/v1.1/channel/${item.id}/dashboard`;
                    const dashRes = await fetch(dashUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Cookie': MY_SOOP_COOKIE,
                            'Referer': 'https://www.sooplive.co.kr/',
                            'Accept': 'application/json'
                        }
                    });

                    if (dashRes.ok) {
                        const json = await dashRes.json();
                        const d = json.data || json;

                        // 1. 팬 & 구독
                        const rawFan = d?.station?.total_fan_cnt || 0;
                        if (isValidFan(rawFan)) data.fans = parseInt(rawFan);
                        
                        // 구독자
                        if(d?.station?.subscription?.cnt) {
                            data.subscribers = parseInt(d.station.subscription.cnt);
                        }

                        // 2. 라이브 정보
                        const broad = d?.broad;
                        if (broad && broad.broad_no) {
                            data.isLive = true;
                            data.viewers = parseInt(broad.current_sum_viewer || 0);
                            data.title = broad.broad_title || "";
                            data.thumbnail = broad.broad_thumb || "";
                            if(broad.profile_img) {
                                data.profileUrl = broad.profile_img.startsWith('//') ? 'https:'+broad.profile_img : broad.profile_img;
                            }
                        } else {
                            // 방송 안 할 때 프로필 이미지
                            if(d?.station?.logo) {
                                data.profileUrl = d.station.logo.startsWith('//') ? 'https:'+d.station.logo : d.station.logo;
                            }
                        }
                    }
                } catch (e) { console.error(e); }
                results.push(data);
            } 
            
            // [B] CHZZK (치지직)
            else {
                let chzzkData = { id: item.id, platform: 'chzzk', isLive: false, viewers: 0, fans: 0 };
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
                } catch (e) {}
                results.push(chzzkData);
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
