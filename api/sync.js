import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

// 1. Supabase 접속 설정
const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 관리자 키 체크 (보안) - 나중에 admin.html에서 보낼 예정
    // const { adminKey } = req.body; 

    // 2. 관리 대상 스트리머 목록 가져오기 (list.json)
    // 주의: 실제로는 DB의 streamers 테이블을 읽는 게 더 좋지만, 
    // 지금은 초기 단계니 GitHub에 있는 list.json 구조를 기반으로 수집합니다.
    const { ids } = req.body; 

    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ID 목록이 없습니다.' });
    }

    const results = [];

    try {
        // 3. 한 명씩 순서대로 처리 (너무 빠르면 차단될 수 있으니 순차 처리 권장)
        for (const id of ids) {
            try {
                // A. 숲 방송국 접속
                const url = `https://bj.afreecatv.com/${id}`;
                const { data: html } = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const $ = cheerio.load(html);

                // B. 데이터 추출
                let nickname = $('meta[property="og:title"]').attr('content') || id;
                nickname = nickname.replace(' | 아프리카TV', '').trim();
                const profileImg = $('meta[property="og:image"]').attr('content');
                
                // 방송국 개설일 등은 메타태그에 없어서 생략하거나 추가 크롤링 필요
                // 여기서는 기본 정보 업데이트만 수행

                // C. DB - streamers 테이블 업데이트 (Upsert)
                const { error: streamerError } = await supabase
                    .from('streamers')
                    .upsert({ 
                        id: id, 
                        nickname: nickname, 
                        profile_img: profileImg,
                        last_updated_at: new Date()
                    }, { onConflict: 'id' });

                if (streamerError) throw streamerError;

                // D. DB - daily_stats (일일 통계) 초기화
                // 오늘 날짜로 빈 통계 row를 미리 만들어둡니다. (나중에 채우기 위해)
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                await supabase
                    .from('daily_stats')
                    .upsert({
                        streamer_id: id,
                        date: today
                    }, { onConflict: 'streamer_id, date' }); // 중복이면 무시

                results.push({ id, status: 'success', name: nickname });

            } catch (innerErr) {
                console.error(`Error processing ${id}:`, innerErr);
                results.push({ id, status: 'failed', error: innerErr.message });
            }
        }

        res.status(200).json({ message: 'Sync complete', results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
}
