import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        // ✅ [핵심] 연결 코드를 함수 안으로 넣어서 에러 방지
        const supabase = createClient(
            process.env.streamer_db_URL,
            process.env.streamer_dbkey_anon
        );

        // 1. DB 조회
        const { data, error } = await supabase
            .from('streamers')
            .select('*')
            .order('is_active', { ascending: false });

        if (error) throw error;

        // 2. 결과 반환
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
