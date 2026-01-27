import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // ✅ [수정] DB 연결을 함수 안으로 넣어서 에러 방지
    const supabase = createClient(
        process.env.streamer_db_URL,
        process.env.streamer_dbkey_anon
    );

    try {
        // 1. DB에서 현재 저장된 모든 스트리머 명단 가져오기
        const { data: streamers, error: fetchError } = await supabase
            .from('streamers')
            .select('*');

        if (fetchError) throw fetchError;
        if (!streamers || streamers.length === 0) {
            return res.status(200).json({ message: '데이터가 없습니다.' });
        }

        // 2. [핵심] 방금 형님이 수정한 'register_batch'를 호출합니다.
        // register_batch가 이제 이미지를 따오도록 업그레이드되었으니,
        // 여기서 명단만 넘겨주면 알아서 이미지 갱신까지 싹 다 처리합니다.
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const batchUrl = `${protocol}://${host}/api/register_batch`;

        // register_batch에 "야, 이 명단 전부 최신화(이미지 포함) 해라" 하고 명령 보냄
        const response = await fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: streamers }) 
        });

        if (response.ok) {
            const result = await response.json();
            // register_batch에서 만든 로그를 받아서 같이 보여줌
            res.status(200).json({ 
                success: true, 
                message: "전체 갱신 완료 (이미지 포함)",
                logs: result.logs 
            });
        } else {
            throw new Error('배치 호출 실패');
        }

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
