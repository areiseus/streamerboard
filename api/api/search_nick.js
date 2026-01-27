import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const supabase = createClient(process.env.streamer_db_URL, process.env.streamer_dbkey_anon);
    
    // group_name(기존) + group_1, 2, 3 (신규) 모두 받음
    const { id, platform, group_name, group_1, group_2, group_3 } = req.body;

    if (!id) return res.status(400).json({ error: 'ID 정보가 누락되었습니다.' });

    try {
        const { error } = await supabase
            .from('streamers')
            .update({ 
                platform: platform,
                group_name: group_name, // 기존 통합 그룹명도 수정 가능
                group_1: group_1,
                group_2: group_2,
                group_3: group_3,
                last_updated_at: new Date()
            })
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ success: true, message: '모든 그룹 정보가 수정되었습니다.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
