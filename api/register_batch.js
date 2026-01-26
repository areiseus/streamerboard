import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { items } = req.body; 
    
    // [핵심] 형님 화면으로 보낼 로그 보따리
    let logBuffer = [];
    
    // 로그 쌓는 함수
    const addLog = (msg) => {
        console.log(msg); // 서버에도 남기고
        logBuffer.push(msg); // 형님한테도 보냄
    };

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음', logs: ['데이터가 없습니다.'] });
    }

    try {
        addLog(`=== 총 ${items.length}명 처리 시작 ===`);

        const results = items.map((item) => {
            const platform = item.platform ? item.platform.trim().toLowerCase() : '';
            const id = item.id ? item.id.trim() : '';

            // 1. URL 강제 생성
            const safeId = id || 'unknown';
            const firstTwo = safeId.length >= 2 ? safeId.substring(0, 2) : 'xx';
            const forcedSoopImg = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${safeId}/m/${safeId}.webp`;

            // 2. SOOP 여부 확인
            const isSoop = platform.includes('soop') || platform.includes('afreeca');

            // 3. 로그 기록 (여기가 화면에 뜹니다)
            addLog(`--------------------------------------------------`);
            addLog(`[ID: ${id}] 플랫폼: ${platform}`);
            
            let finalProfileImg = "에러";

            if (isSoop) {
                finalProfileImg = forcedSoopImg;
                addLog(`✅ SOOP 감지됨 -> 강제 주소 적용`);
                addLog(`🔗 주소: ${forcedSoopImg}`);
            } else {
                finalProfileImg = item.profile_img || null;
                addLog(`☑️ SOOP 아님 -> 기존 데이터 사용`);
            }

            return {
                id: id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: finalProfileImg,
                total_broadcast_time: item.total_broadcast_time || null 
            };
        });

        // 4. DB 저장
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
            // 첫 번째 데이터 샘플 확인
            if (data.length > 0) {
                addLog(`[샘플 확인] 첫번째 유저(${data[0].id}) 이미지: ${data[0].profile_img}`);
            }
        }

        // [최종 응답] logs 배열을 함께 보냅니다.
        res.status(200).json({ success: true, logs: logBuffer });

    } catch (e) {
        addLog(`❌ [치명적 에러] ${e.message}`);
        res.status(500).json({ error: e.message, logs: logBuffer });
    }
}
