import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { items } = req.body; 
    const { id, platform } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // 1. 기본 데이터 세팅
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, // 그룹명 (형님이 바꾼 컬럼명)
                is_active: true,
                last_updated_at: new Date(),
                // 혹시 모르니 초기값 null 설정
                profile_img: null,
                station_open_date: null,
                nickname: item.nickname || item.id // 닉네임 없으면 ID라도 넣음
            };

            // 2. 플랫폼별 상세 정보(프사, 개설일) 다시 긁어오기
            try {
                // [SOOP / 아프리카]
                if (item.platform === 'soop') {
                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { 
                        headers: { 'User-Agent': 'Mozilla/5.0' } 
                    });
                    const json = await resp.json();
                    
                    if (json && json.station) {
                        // 닉네임 갱신
                        dbData.nickname = json.station.user_nick;
                        
                        // 개설일
                        if(json.station.station_open_date) {
                            dbData.station_open_date = json.station.station_open_date;
                        }

                        // [문제 해결] 이미지 주소 처리
                        // image_profile이 진짜로 있을 때만 https를 붙입니다.
                        if (json.station.image_profile) {
                            dbData.profile_img = 'https:' + json.station.image_profile;
                        }
                    }
                } 
                // [CHZZK / 치지직]
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { 
                        headers: { 'User-Agent': 'Mozilla/5.0' } 
                    });
                    const json = await resp.json();
                    
                    if (json && json.content) {
                        dbData.nickname = json.content.channelName;
                        
                        // 이미지는 치지직이 주는 그대로 저장
                        if(json.content.channelImageUrl) {
                            dbData.profile_img = json.content.channelImageUrl;
                        }

                        // 개설일 (YYYY-MM-DD 만 잘라서 저장)
                        if (json.content.openDate) {
                            dbData.station_open_date = json.content.openDate.split(' ')[0];
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`[상세정보 수집 실패] ${item.id} - DB에는 기본정보만 저장됨`);
            }

            return dbData;
        }));

        // 3. DB 저장 (Upsert)
        const { data, error } = await supabase
            .from('streamers')
            .upsert(results)
            .select();

        if (error) {
            console.error('DB 저장 에러:', error);
            throw error;
        }

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
