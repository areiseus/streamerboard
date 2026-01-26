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

            let commonHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            };

            try {
                // ===============================================
                // [1] SOOP (숲) - 최신 도메인 & 고정 URL 방식 적용
                // ===============================================
                if (item.platform === 'soop') {
                    // [핵심] 스샷 규칙대로 이미지 주소 고정 생성 (ID 기반)
                    const firstTwo = item.id.substring(0, 2);
                    dbData.profile_img = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

                    // [수정] 도메인 싹 다 sooplive.co.kr로 변경
                    const apiUrl = `https://chapi.sooplive.co.kr/api/${item.id}/station`;
                    const referer = `https://ch.sooplive.co.kr/${item.id}`;

                    // --- [시도 1] 쿠키 넣어서 요청 ---
                    let headers1 = { 
                        ...commonHeaders, 
                        'Referer': referer,
                        'Origin': 'https://ch.sooplive.co.kr'
                    };
                    if (soopCookieVal) headers1['Cookie'] = soopCookieVal;

                    let resp = await fetch(apiUrl, { headers: headers1 });
                    let success = false;
                    let json = null;

                    if (resp.ok) {
                        json = await resp.json();
                        // 숲 스테이션 데이터 유무 확인
                        if (json?.station) success = true;
                    }

                    // --- [시도 2] 실패 시 재요청 ---
                    if (!success) {
                        let headers2 = { ...commonHeaders, 'Referer': referer, 'Origin': 'https://ch.sooplive.co.kr' };
                        resp = await fetch(apiUrl, { headers: headers2 });
                        if (resp.ok) json = await resp.json();
                    }

                    // --- 데이터 저장 (이미지는 이미 위에서 고정함) ---
                    if (json && json.station) {
                        dbData.nickname = json.station.user_nick || dbData.nickname;
                        if (json.station.total_broad_time) {
                            dbData.total_broadcast_time = json.station.total_broad_time;
                        }
                    }
                } 
                // ===============================================
                // [2] CHZZK (치지직)
                // ===============================================
                else if (item.platform === 'chzzk') {
                    let headers = { ...commonHeaders };
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
