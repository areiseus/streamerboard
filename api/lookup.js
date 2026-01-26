import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.streamer_db_URL, process.env.streamer_db_KEY);

export default async function handler(req, res) {
    const { id, platform } = req.body;
    if (!id) return res.status(400).json({ error: 'ID 입력 필요' });

    try {
        // DB 중복 체크 (maybeSingle로 에러 방지)
        const { data: exist } = await supabase.from('streamers').select('id').eq('id', id).maybeSingle();
        if (exist) return res.json({ status: 'duplicate', message: '이미 등록된 스트리머입니다.' });

        // 플랫폼별 닉네임만 가볍게 조회
        let nickname = '';
        if (platform === 'soop') {
            const resp = await fetch(`https://bjapi.afreecatv.com/api/${id}/station`, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const json = await resp.json();
            if (json.station) nickname = json.station.user_nick;
        } else if (platform === 'chzzk') {
            const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${id}`, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const json = await resp.json();
            if (json.content) nickname = json.content.channelName;
        }

        if (!nickname) return res.status(404).json({ error: '스트리머를 찾을 수 없습니다.' });
        res.status(200).json({ status: 'ok', id, platform, nickname });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
