import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. DB 연결
    const supabase = createClient(
        process.env.streamer_db_URL,
        process.env.streamer_dbkey_anon
    );
    
    // 2. 클라이언트가 보낸 수정 데이터 받기
    const { id, platform, group_name, group_1, group_2, group_3 } = req.body;

    // ID가 없으면 에러
    if (!id) return res.status(400).json({ error: 'ID 정보가 없습니다.' });

    try {
        // 3. DB 업데이트 (해당 ID를 찾아서 내용 변경)
        const { error } = await supabase
            .from('streamers')
            .update({ 
                platform: platform,
                group_name: group_name, // 통합 그룹명
                group_1: group_1,       // 세부 그룹 1
                group_2: group_2,       // 세부 그룹 2
                group_3: group_3,       // 세부 그룹 3
                last_updated_at: new Date()
            })
            .eq('id', id);

        if (error) throw error;

        // 4. 성공 응답
        res.status(200).json({ success: true, message: '수정 완료되었습니다.' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
