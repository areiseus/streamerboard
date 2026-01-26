import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

// 🔥 선생님이 설정한 변수명 그대로 사용
const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    // 이제 단순 ID가 아니라, 플랫폼 정보가 담긴 'items'를 받습니다.
    const { items } = req.body; 

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: '목록이 올바르지 않습니다.' });
    }

    const results = [];

    try {
        for (const item of items) {
            // 옛날 데이터(문자열)면 'soop'으로 처리, 아니면 플랫폼 확인
            const id = typeof item === 'string' ? item : item.id;
            const platform = typeof item === 'string' ? 'soop' : (item.platform || 'soop');

            let nickname = '';
            let profileImg = '';

            try {
                // 🔀 갈림길: 플랫폼에 따라 다르게 행동
                if (platform === 'chzzk') {
                    // ⚡ 치지직 (네이버 API 사용)
                    const url = `https://api.chzzk.naver.com/service/v1/channels/${id}`;
                    const { data: json } = await axios.get(url);
                    
                    if (json.code !== 200) throw new Error('Chzzk API Error');
                    
                    nickname = json.content.channelName;
                    profileImg = json.content.channelImageUrl;

                } else {
                    // 🌲 숲 (크롤링 사용)
                    const url = `https://bj.afreecatv.com/${id}`;
                    const { data: html } = await axios.get(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const $ = cheerio.load(html);

                    nickname = $('meta[property="og:title"]').attr('content') || id;
                    nickname = nickname.replace(' | 아프리카TV', '').trim();
                    profileImg = $('meta[property="og:image"]').attr('content');
                }

                // 💾 DB에 저장 (platform 정보 포함!)
                const { error: streamerError } = await supabase
                    .from('streamers')
                    .upsert({ 
                        id: id, 
                        nickname: nickname, 
                        profile_img: profileImg,
                        platform: platform, 
                        last_updated_at: new Date()
                    }, { onConflict: 'id' });

                if (streamerError) throw streamerError;

                // 통계 테이블 초기화 (오늘 날짜 칸 만들기)
                const today = new Date().toISOString().split('T')[0];
                await supabase.from('daily_stats').upsert({
                    streamer_id: id,
                    date: today
                }, { onConflict: 'streamer_id, date' });

                results.push({ id, status: 'success', name: nickname, platform });

            } catch (innerErr) {
                console.error(`Error processing ${id} (${platform}):`, innerErr);
                results.push({ id, status: 'failed', platform, error: innerErr.message });
            }
        }

        res.status(200).json({ message: 'Sync complete', results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
}
