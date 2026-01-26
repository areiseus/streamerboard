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
        console.log(`=== [진단 시작] 총 ${items.length}명 데이터 처리 시작 ===`);

        const results = items.map((item) => {
            // 1. 공백 제거 및 소문자 변환 (오동작 방지)
            const platform = item.platform ? item.platform.trim().toLowerCase() : '';
            const id = item.id ? item.id.trim() : '';

            // 2. SOOP URL 강제 생성
            // ID가 없으면 'unknown'이라고 박아서 주소가 깨지는지 확인
            const safeId = id || 'unknown'; 
            const firstTwo = safeId.length >= 2 ? safeId.substring(0, 2) : 'xx';
            const forcedSoopImg = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${safeId}/m/${safeId}.webp`;

            // 3. SOOP 여부 판단
            const isSoop = platform.includes('soop') || platform.includes('afreeca');

            // [요청하신 부분 1] 할당 직전 URL과 판단 결과 출력
            console.log(`--------------------------------------------------`);
            console.log(`[개별 진단] ID: ${id} | Platform: ${platform}`);
            console.log(`ㄴ SOOP 판단결과: ${isSoop}`);
            console.log(`ㄴ 생성된 강제 URL: ${forcedSoopImg}`);

            // 4. URL 결정 (형님 요청: 없으면 NULL 말고 "에러" 입력)
            let finalProfileImg = "에러"; // 기본값 "에러"

            if (isSoop) {
                // SOOP이면 무조건 강제 생성 주소
                finalProfileImg = forcedSoopImg;
            } else {
                // SOOP 아니면 기존꺼 쓰되, 없으면 "에러"
                finalProfileImg = item.profile_img || "에러";
            }
            
            console.log(`ㄴ [최종 할당 값]: ${finalProfileImg}`);

            // 5. DB 객체 리턴
            return {
                id: id,
                platform: item.platform, 
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: finalProfileImg, // 여기가 핵심
                total_broadcast_time: item.total_broadcast_time || null 
            };
        });

        // [요청하신 부분 2] 모두 완료 후 DB 넣기 전 전체 데이터 검사
        console.log(`==================================================`);
        console.log(`=== [최종 점검] DB 전송 직전 데이터 리스트 ===`);
        results.forEach((r, idx) => {
            console.log(`${idx + 1}. [${r.id}] 최종 이미지: ${r.profile_img}`);
        });
        console.log(`==================================================`);

        // 6. DB 저장 (onConflict: id -> 덮어쓰기)
        const { data, error } = await supabase
            .from('streamers')
            .upsert(results, { onConflict: 'id' })
            .select();

        if (error) {
            console.error("!!! DB 저장 중 에러 발생 !!!", error);
            throw error;
        }

        res.status(200).json({ 
            success: true, 
            message: "디버깅 완료. 로그를 확인하세요.", 
            saved_count: data.length
        });

    } catch (e) {
        console.error("스크립트 실행 에러:", e);
        res.status(500).json({ error: e.message });
    }
}
