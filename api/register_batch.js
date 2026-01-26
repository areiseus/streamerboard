import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 1. 데이터 받기
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }

    // 봇 차단 방지용 헤더 (형님이 쓰시던 것 그대로)
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // DB에 넣을 기본 틀
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,     
                is_active: true,
                last_updated_at: new Date(),
                profile_img: null,
                total_broadcast_time: null // [변경] 개설일 대신 이거 넣음
            };

            try {
                // ===============================================
                // [1] SOOP (아프리카) 상세 정보 수집
                // ===============================================
                if (item.platform === 'soop') {
                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${item.id}/station`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            dbData.nickname = json.station.user_nick;
                            
                            // [수정됨] 총 방송 시간 수집 (단순 대입이라 코드가 짧음)
                            if (json.station.total_broad_time) {
                                dbData.total_broadcast_time = json.station.total_broad_time;
                            }
                            
                            // 프로필 이미지 (형님 로직 유지)
                            let img = json.station.image_profile;
                            if (img) {
                                if (img.startsWith('//')) dbData.profile_img = 'https:' + img;
                                else if (!img.startsWith('http')) dbData.profile_img = 'https://' + img;
                                else dbData.profile_img = img;
                            }
                        }
                    }
                } 
                // ===============================================
                // [2] CHZZK (치지직) 상세 정보 수집
                // ===============================================
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, { headers });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl || null;
                            
                            // 치지직은 '총 방송 시간'을 주지 않으므로 null 유지
                            // (날짜 계산하던 긴 코드가 빠져서 전체 길이가 줄어듦)
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`[수집 실패] ${item.id}:`, crawlErr);
            }

            return dbData;
        }));

        // 3. DB에 진짜 저장 (Upsert)
        const { data, error } = await supabase
            .from('streamers')
            .upsert(results)
            .select();

        if (error) {
            console.error('DB Error:', error);
            throw error;
        }

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
