import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_dbkey_anon
);

export default async function handler(req, res) {
    // [중요] 이 줄이 없으면 "id is not defined" 에러가 뜹니다.
    // HTML에서 보낸 데이터를 변수로 선언하는 부분입니다.
    const { id, platform } = req.body;

    // 변수가 비어있으면 에러 처리
    if (!id) {
        return res.status(400).json({ error: 'ID를 입력해주세요.' });
    }

    try {
        // 1. DB 중복 체크 (이미 등록된 사람인지)
        const { data: exist, error } = await supabase
            .from('streamers')
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        
        if (exist) {
            return res.json({ status: 'duplicate', message: '이미 등록된 스트리머입니다.' });
        }

        // 2. 실제 존재하는지 플랫폼 API로 닉네임 조회
        let nickname = '';
        let found = false;

        // SOOP (숲/아프리카)
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
            return res.status(404).json({ error: '해당 플랫폼에서 아이디를 찾을 수 없습니다.' });
        }

        // 성공 결과 반환
        res.status(200).json({ status: 'ok', id, platform, nickname });

    } catch (e) {
        // 서버 에러 발생 시 메시지 전송
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
