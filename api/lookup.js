import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { id, platform } = req.body;

    if (!id) return res.status(400).json({ error: 'ID 입력 필요' });

    try {
        // [수정됨] single() -> maybeSingle()
        // single()은 데이터가 없으면 에러를 뱉지만, maybeSingle()은 null을 뱉습니다.
        // 신규 등록이므로 null이 나오는 게 정상입니다.
        const { data: exist, error } = await supabase
            .from('streamers')
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;

        // DB에 이미 존재하면 중복 처리
        if (exist) {
            return res.json({ status: 'duplicate', message: '이미 등록된 스트리머입니다.' });
        }

        // 2. 외부 API로 닉네임 조회 (저장 X, 확인용)
        let nickname = '';
        let found = false;

        if (platform === 'soop') {
            const resp = await fetch(`https://bjapi.afreecatv.com/api/${id}/station`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const json = await resp.json();
            if (json.station) {
                nickname = json.station.user_nick;
                found = true;
            }
        } else if (platform === 'chzzk') {
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
            return res.status(404).json({ error: '해당 플랫폼에서 스트리머를 찾을 수 없습니다.' });
        }

        // 성공 결과 반환
        res.status(200).json({ status: 'ok', id, platform, nickname });

    } catch (e) {
        console.error('Lookup Error:', e);
        // 프론트엔드에서 에러 내용을 알 수 있게 메시지 전달
        res.status(500).json({ error: e.message });
    }
}
