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
        console.error('admin.json 읽기 에러');
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
                // [1] SOOP (숲) - 도메인 및 고정 주소 수정
                // ===============================================
                if (item.platform === 'soop') {
                    // 1. 이미지 주소 강제 생성 (스샷의 stimg.sooplive.co.kr 규칙 적용)
                    const firstTwo = item.id.substring(0, 2);
                    dbData.profile_img = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

                    // 2. 데이터 수집 API (도메인 변경 대응)
                    // bjapi.afreecatv.com도 동작하지만 최신은 chapi.sooplive.co.kr 등으로 전환 중입니다.
                    // 안전하게 형님 스샷의 리퍼러 주소 체계를 따릅니다.
                    const apiUrl = `https://chapi.sooplive.co.kr/api/${item.id}/station`; 
                    
                    const resp = await fetch(apiUrl, {
                        headers: {
                            ...commonHeaders,
                            "Referer": `https://ch.sooplive.co.kr/${item.id}`,
                            "Cookie": soopCookieVal,
                            "Origin": "https://ch.sooplive.co.kr"
                        }
                    });

                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            dbData.nickname = json.station.user_nick || dbData.nickname;
                            dbData.total_broadcast_time = json.station.total_broad_time || dbData.total_broadcast_time;
                        }
                    }
                } 
                // ===============================================
                // [2] CHZZK (치지직)
                // ===============================================
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { ...commonHeaders, 'Cookie': chzzkCookieVal }
                    });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl || dbData.profile_img;
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`수집 에러 (${item.id}): ${crawlErr.message}`);
            }

            return dbData;
        }));

        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
