import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 1. 화면(admin.html)에서 보낸 데이터 받기
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // ▼▼▼ 여기가 제일 중요합니다 ▼▼▼
            // 화면에서 보낸 group_name을 DB에 그대로 넣습니다.
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, // (수동으로 바꾼 DB 컬럼명과 일치)
                is_active: true,
                last_updated_at: new Date()
            };

            // [상세 정보 수집: 닉네임, 프사, 방송국개설일]
            try {
                // SOOP (숲)
                if (item.platform === 'soop') {
                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const json = await resp.json();
                    if (json.station) {
                        dbData.nickname = json.station.user_nick;
                        dbData.profile_img = 'https:' + json.station.image_profile;
                        dbData.station_open_date = json.station.station_open_date;
                    }
                } 
                // CHZZK (치지직)
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const json = await resp.json();
                    if (json.content) {
                        dbData.nickname = json.content.channelName;
                        dbData.profile_img = json.content.channelImageUrl;
                        dbData.station_open_date = json.content.openDate ? json.content.openDate.split(' ')[0] : null;
                    }
                }
            } catch (err) {
                console.error(`수집 실패 (${item.id})`, err);
                // 실패해도 기본 정보(ID, 그룹명)는 저장합니다.
            }

            return dbData;
        }));

        // 3. 진짜 DB에 넣기
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
