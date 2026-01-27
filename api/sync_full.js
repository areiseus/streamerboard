import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_dbkey_anon
);

export default async function handler(req, res) {
    try {
        // 1. DB에서 모든 스트리머 데이터 가져오기 (리스트 뽑기)
        const { data: streamers, error: fetchError } = await supabase
            .from('streamers')
            .select('*');

        if (fetchError) throw fetchError;
        if (!streamers || streamers.length === 0) {
            return res.status(200).json({ message: '데이터가 없습니다.' });
        }

        // 2. 같은 서버에 있는 register_batch.js 호출하기
        // Vercel 환경에서는 절대 경로가 필요하므로 현재 요청의 도메인을 활용합니다.
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const batchUrl = `${protocol}://${host}/api/register_batch`;

        const response = await fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: streamers }) // 뽑아온 리스트 통째로 전달
        });

        if (response.ok) {
            res.status(200).json({ success: true, message: "전체 갱신 완료" });
        } else {
            throw new Error('배치 호출 실패');
        }

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
