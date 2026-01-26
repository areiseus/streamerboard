import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음' });
    }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name,
                is_active: true,
                last_updated_at: new Date()
            };

            // [상세 정보 수집]
            try {
                // ===============================================
                // 1. SOOP (숲/아프리카)
                // ===============================================
                if (item.platform === 'soop') {
                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { 
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
                    });
                    const json = await resp.json();
                    
                    if (json.station) {
                        dbData.nickname = json.station.user_nick;
                        dbData.station_open_date = json.station.station_open_date || null;
                        
                        // [이미지 주소 처리 핵심 수정]
                        let imgUrl = json.station.image_profile;
                        if (imgUrl) {
                            if (imgUrl.startsWith('//')) {
                                dbData.profile_img = 'https:' + imgUrl;
                            } else if (!imgUrl.startsWith('http')) {
                                // 혹시라도 http가 아예 없으면 붙여줌
                                dbData.profile_img = 'https://' + imgUrl;
                            } else {
                                // 이미 http나 https로 시작하면 그대로 씀
                                dbData.profile_img = imgUrl;
                            }
                        }
                    }
                } 
                // ===============================================
                // 2. CHZZK (치지직)
                // ===============================================
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { 
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
                    });
                    const json = await resp.json();
                    
                    if (json.content) {
                        dbData.nickname = json.content.channelName;
                        dbData.profile_img = json.content.channelImageUrl || null;
                        
                        // 날짜 포맷 정리 (YYYY-MM-DD HH:mm:ss -> YYYY-MM-DD)
                        if (json.content.openDate) {
                            dbData.station_open_date = json.content.openDate.split(' ')[0];
                        }
                    }
                }
            } catch (err) {
                console.error(`[수집 실패] ${item.id}:`, err);
                // 실패해도 기본 데이터는 남기기 위해 에러를 던지지 않음
            }

            return dbData;
        }));

        // DB Upsert
        const { data, error } = await supabase
            .from('streamers')
            .upsert(results)
            .select();

        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
