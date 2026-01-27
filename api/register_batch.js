import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. DB 연결 (서버 에러 방지를 위해 함수 안으로 이동)
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
        addLog(`=== 총 ${items.length}명 처리 시작 (규칙 기반 주소 생성) ===`);

        // 2. API 호출 없이 텍스트 규칙으로만 주소 생성 (가장 빠름)
        const results = items.map((item) => {
            const platform = item.platform ? item.platform.trim().toLowerCase() : '';
            const id = item.id ? item.id.trim() : '';
            const isSoop = platform.includes('soop') || platform.includes('afreeca');

            // --- [핵심] SOOP 이미지 주소 강제 생성 로직 ---
            // 기존에 뭐가 있든 상관없이, ID가 있으면 무조건 공식 규칙대로 주소를 만듭니다.
            let finalProfileImg = item.profile_img || null;

            if (isSoop && id.length >= 2) {
                const head = id.substring(0, 2); // 아이디 앞 2글자
                // 숲 공식 이미지 주소 규칙 (https://stimg.sooplive.co.kr/LOGO/앞2글자/아이디/m/아이디.webp)
                const forcedUrl = `https://stimg.sooplive.co.kr/LOGO/${head}/${id}/m/${id}.webp`;
                
                finalProfileImg = forcedUrl;
                addLog(`🔧 [SOOP] ${id} -> 주소 강제 생성: ${forcedUrl}`);
            }
            // ----------------------------------------------

            return {
                id: id,
                platform: item.platform,
                group_name: item.group_name,
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: finalProfileImg, // 강제로 만든 주소 저장
                total_broadcast_time: item.total_broadcast_time || null
            };
        });

        // 3. DB 저장
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
        addLog(`❌ [에러] ${e.message}`);
        res.status(500).json({ error: e.message, logs: logBuffer });
    }
}
