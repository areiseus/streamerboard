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

    // 1. admin.json 쿠키 로드 (닉네임/시간 수집용)
    let soopCookieVal = '';
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            soopCookieVal = json.img_soop_cookie || '';
        }
    } catch (err) { console.error('쿠키 로드 실패'); }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // [강제 갱신 핵심] DB에 기존 이미지가 있든 말든 무시하고 
            // 형님이 주신 스샷 규칙에 따라 현재 ID로 주소를 새로 생성합니다.
            const firstTwo = item.id.substring(0, 2);
            const forcedImgUrl = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                // 숲(soop)이면 무조건 생성된 고정 주소로 덮어씁니다.
                profile_img: item.platform === 'soop' ? forcedImgUrl : (item.profile_img || null),
                total_broadcast_time: item.total_broadcast_time || null 
            };

            // 닉네임/시간 정보는 덤으로 수집 (실패해도 이미지는 위에서 박힘)
            if (item.platform === 'soop') {
                try {
                    const resp = await fetch(`https://chapi.sooplive.co.kr/api/${item.id}/station`, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                            "Referer": `https://ch.sooplive.co.kr/${item.id}`,
                            "Cookie": soopCookieVal
                        }
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.station) {
                            dbData.nickname = json.station.user_nick || dbData.nickname;
                            dbData.total_broadcast_time = json.station.total_broad_time || dbData.total_broadcast_time;
                        }
                    }
                } catch (e) { console.error(`${item.id} 수집 실패`); }
            } 
            else if (item.platform === 'chzzk') {
                try {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl;
                        }
                    }
                } catch (e) {}
            }

            return dbData;
        }));

        // DB 저장 (Upsert로 기존 레코드의 profile_img를 강제 교체)
        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
