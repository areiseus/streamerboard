import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const supabase = createClient(process.env.streamer_db_URL, process.env.streamer_dbkey_anon);
    const { nickname } = req.body;

    if (!nickname) return res.status(400).json({ error: '닉네임을 입력하세요.' });

    try {
        // 모든 컬럼(*)을 가져오므로 group_name, group_1,2,3 다 포함됨
        const { data, error } = await supabase
            .from('streamers')
            .select('*')
            .eq('nickname', nickname)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '해당 닉네임의 스트리머가 없습니다.' });
        }

        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
