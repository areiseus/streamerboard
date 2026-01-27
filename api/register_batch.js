import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. DB 연결 (함수 안에서 안전하게)
    const supabase = createClient(
        process.env.streamer_db_URL,
        process.env.streamer_dbkey_anon
    );

    const { items } = req.body;
    let logBuffer = [];

    const addLog = (msg) => {
        console.log(msg);
        logBuffer.push(msg);
    };

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음', logs: ['데이터가 없습니다.'] });
    }

    try {
        addLog(`=== 총 ${items.length}명 처리 시작 ===`);

        // 2. [핵심] API 호출이 필요하므로 map 대신 Promise.all 사용
        // 저장 직전에 각 플랫폼 API를 찔러서 최신 이미지를 가져옵니다.
        const results = await Promise.all(items.map(async (item) => {
            const platform = item.platform ? item.platform.trim().toLowerCase() : '';
            const id = item.id ? item.id.trim() : '';
            const isSoop = platform.includes('soop') || platform.includes('afreeca');

            addLog(`--------------------------------------------------`);
            addLog(`[ID: ${id}] 처리 중...`);

            let finalProfileImg = item.profile_img || null; // 기본값

            // ✅ [형님 의도 반영] 여기서 직접 SOOP API를 호출해서 이미지를 따옵니다.
            if (isSoop) {
                try {
                    const resp = await fetch(`https://bjapi.afreecatv.com/api/${id}/station`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const json = await resp.json();

                    if (json.station && json.station.station_logo) {
                        let rawImg = json.station.station_logo;
                        // 숲은 주소를 '//stimg...' 이렇게 줘서 https: 붙여야 합니다.
                        if (rawImg.startsWith('//')) rawImg = 'https:' + rawImg;
                        
                        finalProfileImg = rawImg;
                        addLog(`📸 SOOP 이미지 확보 완료`);
                    } else {
                        addLog(`⚠️ SOOP API 응답에 이미지가 없습니다.`);
                    }
                } catch (err) {
                    addLog(`❌ SOOP 이미지 조회 실패: ${err.message}`);
                }
            } 
            // 치지직이나 다른 플랫폼도 필요하면 여기에 else if 추가하면 됩니다.
            else {
                addLog(`☑️ SOOP 아님 -> 기존 데이터 유지`);
            }

            // DB에 넣을 데이터 포장
            return {
                id: id,
                platform: item.platform,
                group_name: item.group_name,
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: finalProfileImg, // 방금 따온 따끈따끈한 이미지
                total_broadcast_time: item.total_broadcast_time || null
            };
        }));

        // 3. DB에 진짜 저장 (Upsert)
        addLog(`=== DB 저장 시도 (Upsert) ===`);

        const { data, error } = await supabase
            .from('streamers')
            .upsert(results, { onConflict: 'id' })
            .select();

        if (error) {
            addLog(`❌ DB 저장 실패: ${error.message}`);
            throw error;
        } else {
            addLog(`🎉 DB 저장 성공! (총 ${data.length}건)`);
        }

        res.status(200).json({ success: true, logs: logBuffer });

    } catch (e) {
        addLog(`❌ [치명적 에러] ${e.message}`);
        res.status(500).json({ error: e.message, logs: logBuffer });
    }
}
