import { createClient } from '@supabase/supabase-js';

// Supabase 연결
const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // [핵심] 여기서 id를 정의 안 하면 "id is not defined" 에러가 뜹니다.
    // HTML에서 보낸 { id: "...", platform: "..." }을 여기서 받아서 변수로 만듭니다.
    const { id, platform } = req.body;

    // 변수가 제대로 들어왔는지 방어 코드
    if (!id) {
        return res.status(400).json({ error: 'ID가 입력되지 않았습니다.' });
    }

    try {
        // 1. DB 중복 체크 (maybeSingle로 에러 방지)
        const { data: exist, error: dbError } = await supabase
            .from('streamers')
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (dbError) throw dbError;
        
        if (exist) {
            return res.status(200).json({ status: 'duplicate', message: '이미 등록된 스트리머입니다.' });
        }

        // 2. 닉네임 조회 (플랫폼 API)
        let nickname = '';
        let found = false;

        // SOOP (숲)
        if (platform === 'soop') {
            const resp = await fetch(`https://bjapi.afreecatv.com/api/${id}/station`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const json = await resp.json();
            if (json.station) {
                nickname = json.station.user_nick;
                found = true;
            }
        } 
        // CHZZK (치지직)
        else if (platform === 'chzzk') {
            const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${id}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const json = await resp.json();
            if (json.content) {
                nickname = json.content.channelName;
                found = true;
            }
        }

        if (!found) {
            return res.status(404).json({ error: '해당 아이디의 방송국을 찾을 수 없습니다.' });
        }

        // 성공 시 닉네임 반환
        res.status(200).json({ status: 'ok', id, platform, nickname });

    } catch (e) {
        console.error(e);
        // 에러가 나면 여기서 e.message를 보냅니다.
        // 아까 보신 "id is not defined"는 여기서 잡힌 문법 에러였습니다.
        res.status(500).json({ error: e.message });
    }
}
