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

    // 1. admin.json에서 형님이 저장한 쿠키 변수 가져오기
    let soopCookieVal = '';
    let chzzkCookieVal = '';
    
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(fileData);
            
            // 형님이 admin.json에 적은 변수명 그대로 읽어옴
            soopCookieVal = json.img_soop_cookie || '';
            chzzkCookieVal = json.img_chzzk_cookie || '';
        }
    } catch (err) {
        console.error('admin.json 읽기 실패:', err);
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
                profile_img: null,
                total_broadcast_time: null 
            };

            // 기본 헤더
            let headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            };

            try {
                // [SOOP / 아프리카]
                if (item.platform === 'soop') {
                    // 아프리카 쿠키 적용
                    if (soopCookieVal) headers['Cookie'] = soopCookieVal;
                    headers['Referer'] = `https://bj.afreecatv.com/${item.id}`;

                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            dbData.nickname = json.station.user_nick;
                            
                            // 방송 시간 (초 단위 저장)
                            if (json.station.total_broad_time) {
                                dbData.total_broadcast_time = json.station.total_broad_time;
                            }

                            // 이미지 주소 (https 붙이기)
                            let img = json.station.image_profile;
                            if (img) {
                                if (img.startsWith('//')) dbData.profile_img = 'https:' + img;
                                else if (!img.startsWith('http')) dbData.profile_img = 'https://' + img;
                                else dbData.profile_img = img;
                            }
                        }
                    }
                } 
                // [CHZZK / 치지직]
                else if (item.platform === 'chzzk') {
                    // 치지직 쿠키 적용
                    if (chzzkCookieVal) headers['Cookie'] = chzzkCookieVal;

                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            // 치지직 이미지 저장
                            dbData.profile_img = json.content.channelImageUrl || null;
                            dbData.total_broadcast_time = null;
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`수집 실패 (${item.id})`);
            }

            return dbData;
        }));

        // DB 저장 (Upsert)
        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
