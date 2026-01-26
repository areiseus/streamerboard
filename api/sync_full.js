import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 1. admin.json에서 쿠키 변수 가져오기 (이미지/데이터 수집용)
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
        console.error('admin.json 읽기 실패:', err);
    }

    try {
        // 2. DB에 저장된 모든 스트리머 가져오기
        const { data: streamers, error: fetchError } = await supabase
            .from('streamers')
            .select('*');

        if (fetchError) throw fetchError;
        if (!streamers || streamers.length === 0) {
            return res.status(200).json({ message: '갱신할 데이터가 없습니다.' });
        }

        // 3. 최신 정보 크롤링 (register_batch 로직 재사용)
        const results = await Promise.all(streamers.map(async (item) => {
            
            // 기존 데이터 유지하면서 업데이트할 객체 생성
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, // 그룹명 유지
                nickname: item.nickname,     // 닉네임 갱신 시도
                is_active: true,
                last_updated_at: new Date(),
                profile_img: item.profile_img,             // 실패 시 기존거 유지
                total_broadcast_time: item.total_broadcast_time // 실패 시 기존거 유지
            };

            let headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            };

            try {
                // [SOOP / 아프리카]
                if (item.platform === 'soop') {
                    if (soopCookieVal) headers['Cookie'] = soopCookieVal;
                    headers['Referer'] = `https://bj.afreecatv.com/${item.id}`;

                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            dbData.nickname = json.station.user_nick;
                            
                            // 방송 시간 갱신
                            if (json.station.total_broad_time) {
                                dbData.total_broadcast_time = json.station.total_broad_time;
                            }

                            // 이미지 갱신
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
                    if (chzzkCookieVal) headers['Cookie'] = chzzkCookieVal;

                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            // 치지직 이미지 갱신
                            if (json.content.channelImageUrl) {
                                dbData.profile_img = json.content.channelImageUrl;
                            }
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`갱신 실패 (${item.id}): 유지함`);
            }

            return dbData;
        }));

        // 4. DB 일괄 업데이트 (Upsert)
        const { error: upsertError } = await supabase
            .from('streamers')
            .upsert(results);

        if (upsertError) throw upsertError;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
