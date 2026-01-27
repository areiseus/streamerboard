import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_dbkey_anon
);

export default async function handler(req, res) {
    // 삭제할 ID 받기
    const { id } = req.body;

    if (!id) return res.status(400).json({ error: '삭제할 ID가 없습니다.' });

    try {
        // DB에서 해당 ID 삭제
        const { error } = await supabase
            .from('streamers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ success: true, message: '삭제 완료' });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
