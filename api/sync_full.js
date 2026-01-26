import { createClient } from '@supabase/supabase-js';

// Supabase 연결 설정 (환경변수 사용)
const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 1. HTML에서 [최초 등록] 버튼을 눌러 보낸 리스트 받기
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }

    try {
        // 2. 각 스트리머별 정보 수집 + 데이터 정리
        const results = await Promise.all(items.map(async (item) => {
            
            let dbData = {
                id: item.id,
                platform: item.platform,
                
                // [중요] DB 컬럼명 group_name에 맞춰서 저장
                group_name: item.group_name, 
                
                is_active: true,
                last_updated_at: new Date()
            };

            // [정보 수집 로직] - 닉네임, 프사, 개설일 긁어오기
            try {
                // SOOP (아프리카)
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
            }

            return dbData;
        }));

        // 3. Supabase DB에 저장 (파일 저장이 아님!)
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
