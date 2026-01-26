import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    try {
        // 1. DB에서 모든 스트리머 정보를 가져옵니다.
        const { data, error } = await supabase
            .from('streamers')
            .select('*')
            .order('is_active', { ascending: false }); // 활성화된 순서대로

        if (error) throw error;

        // 2. 프론트엔드에 전달
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
