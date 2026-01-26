import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음' });
    }

    // 1. admin.json에서 쿠키 가져오기
    let soopCookieVal = '';
    let chzzkCookieVal = '';
    
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(fileData);
            soopCookieVal = json.img_soop_cookie || '';
            chzzkCookieVal = json.img_chzzk_cookie || '';
        }
    } catch (err) {
        console.error('admin.json 읽기 에러 (쿠키 건너뜀)');
    }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: item.profile_img || null,
                total_broadcast_time: item.total_broadcast_time || null 
            };

            // 기본 헤더
            let commonHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            };

            try {
                // ===============================================
                // [1] SOOP (아프리카) - 스샷 기반 헤더 보강 완료
                // ===============================================
                if (item.platform === 'soop') {
                    const apiUrl = `https://bjapi.afreecatv.com/api/${item.id}/station`;
                    const referer = `https://bj.afreecatv.com/${item.id}`;

                    // --- [시도 1] 쿠키 넣어서 요청 (스샷 분석 헤더 적용) ---
                    let headers1 = { 
                        ...commonHeaders, 
                        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
                        "Referer": referer,
                        "Origin": "https://bj.afreecatv.com",
                        "Authority": "bjapi.afreecatv.com"
                    };
                    if (soopCookieVal) headers1['Cookie'] = soopCookieVal;

                    let resp = await fetch(apiUrl, { headers: headers1 });
                    let success = false;
                    let json = null;

                    if (resp.ok) {
                        json = await resp.json();
                        // profile_image 필드까지 확실히 체크
                        if (json?.station?.profile_image || json?.station?.image_profile) success = true;
                    }

                    // --- [시도 2] 실패 시, 쿠키 빼고 '순수 시청자 모드'로 재요청 ---
                    if (!success) {
                        console.log(`[SOOP 재시도] ${item.id} - 쿠키 빼고 재요청`);
                        let headers2 = { 
                            ...commonHeaders,
                            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
                            "Referer": referer,
                            "Origin": "https://bj.afreecatv.com",
                            "Authority": "bjapi.afreecatv.com"
                        };
                        resp = await fetch(apiUrl, { headers: headers2 });
                        if (resp.ok) json = await resp.json();
                    }

                    // --- 데이터 저장 ---
                    if (json && json.station) {
                        dbData.nickname = json.station.user_nick || dbData.nickname;
                        
                        if (json.station.total_broad_time) {
                            dbData.total_broadcast_time = json.station.total_broad_time;
                        }

                        // 스샷에서 확인된 stimg 서버 주소를 가져오는 로직
                        let img = json.station.profile_image || json.station.image_profile || json.station.user_image;
                        if (img) {
                            if (img.startsWith('//')) dbData.profile_img = 'https:' + img;
                            else if (!img.startsWith('http')) dbData.profile_img = 'https://' + img;
                            else dbData.profile_img = img;
                        }
                    }
                } 
                // ===============================================
                // [2] CHZZK (치지직)
                // ===============================================
                else if (item.platform === 'chzzk') {
                    let headers = { 
                        ...commonHeaders,
                        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8"
                    };
                    if (chzzkCookieVal) headers['Cookie'] = chzzkCookieVal;

                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl || dbData.profile_img;
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`수집 실패 (${item.id})`);
            }

            return dbData;
        }));

        // DB 저장
        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
