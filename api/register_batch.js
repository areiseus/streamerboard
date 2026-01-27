import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. DB 연결
    const supabase = createClient(
        process.env.streamer_db_URL,
        process.env.streamer_dbkey_anon
    );

    const { items } = req.body;
    let logBuffer = [];
    
    // [수정 1] try 블록 밖에서 선언 (에러 나도 finally에서 주소 찍기 위함)
    let results = []; 

    const addLog = (msg) => {
        console.log(msg);      // 서버 콘솔 출력
        logBuffer.push(msg);   // 클라이언트 응답용
    };

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음', logs: ['데이터가 없습니다.'] });
    }

    try {
        addLog(`=== 총 ${items.length}명 처리 시작 (규칙 기반 주소 생성) ===`);

        // 2. API 호출 없이 텍스트 규칙으로만 주소 생성
        results = items.map((item) => {
            const platform = item.platform ? item.platform.trim().toLowerCase() : '';
            const id = item.id ? item.id.trim() : '';
            const isSoop = platform.includes('soop') || platform.includes('afreeca');

            // --- [핵심] SOOP 이미지 주소 강제 생성 로직 ---
            let finalProfileImg = item.profile_img || null;

            if (isSoop && id.length >= 2) {
                const head = id.substring(0, 2);
                const forcedUrl = `https://stimg.sooplive.co.kr/LOGO/${head}/${id}/m/${id}.webp`;
                
                finalProfileImg = forcedUrl;
                // [로그] 여기서 생성 즉시 콘솔에 찍힘
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
                profile_img: finalProfileImg, 
                total_broadcast_time: item.total_broadcast_time || null
            };
        });

        // 3. DB 저장 (await 필수)
        addLog(`=== DB 저장 시도 (Upsert) ===`);

        const { data, error } = await supabase
            .from('streamers')
            .upsert(results, { onConflict: 'id' })
            .select();

        if (error) {
            addLog(`❌ DB 저장 실패: ${error.message}`);
            throw error; // 에러를 catch로 보냄
        } else {
            addLog(`🎉 DB 저장 성공! (총 ${data.length}건)`);
        }

        res.status(200).json({ success: true, logs: logBuffer });

    } catch (e) {
        addLog(`❌ [에러] ${e.message}`);
        res.status(500).json({ error: e.message, logs: logBuffer });

    } finally {
        // 4. [요청하신 부분 구현] 성공/실패 여부와 관계없이 URL 무조건 출력
        console.log("\n============================================");
        console.log(" [시스템 로그] 생성된 URL 목록 (저장 결과 무관) ");
        console.log("============================================");
        
        if (results.length > 0) {
            results.forEach(r => {
                console.log(` >> [${r.id}] URL: ${r.profile_img}`);
            });
        } else {
            console.log(" >> 생성된 데이터가 없습니다.");
        }
        console.log("============================================\n");
    }
}
