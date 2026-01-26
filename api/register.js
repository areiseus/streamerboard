import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    const { items } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ error: '데이터 없음' });
    }

    // [설정] admin.json에서 서비스별 개인 쿠키 로드
    let soopCookieVal = '';
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            soopCookieVal = json.img_soop_cookie || '';
        }
    } catch (err) { console.error('쿠키 로드 실패'); }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // [데이터 구조 정의] 기본 스트리머 정보 객체 생성
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                profile_img: item.profile_img || null,
                total_broadcast_time: item.total_broadcast_time || null 
            };

            // [SOOP 전용 로직] 숲 플랫폼 데이터 수집 및 이미지 강제 생성
            if (item.platform === 'soop') {
                /** * 1. 이미지 주소 강제 생성 (이미지 긁어오지 않고 ID로 조합)
                 * 규칙: https://stimg.sooplive.co.kr/LOGO/[ID앞2자리]/[전체ID]/m/[전체ID].webp
                 */
                const firstTwo = item.id.substring(0, 2);
                dbData.profile_img = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

                try {
                    // 2. 숲 스테이션 API 호출 (최신 sooplive 도메인 사용)
                    const resp = await fetch(`https://chapi.sooplive.co.kr/api/${item.id}/station`, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                            "Referer": `https://ch.sooplive.co.kr/${item.id}`,
                            "Cookie": soopCookieVal // 로그인이 필요한 데이터 접근용
                        }
                    });

                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            /**
                             * [수집 데이터 종류]
                             * json.station.user_nick : 스트리머의 현재 닉네임
                             * json.station.total_broad_time : 누적 방송 시간 (단위: 분)
                             * json.station.profile_image : API가 주는 이미지 (우리는 위에서 강제로 만든걸 우선 사용)
                             */
                            dbData.nickname = json.station.user_nick || dbData.nickname;
                            dbData.total_broadcast_time = json.station.total_broad_time || dbData.total_broadcast_time;
                            dbData.profile_img = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;
                        }
                    }
                } catch (e) { 
                    console.error(`${item.id} 정보 수집 실패 (이미지는 조합된 주소로 유지)`); 
                }
            } 
            // [CHZZK 전용 로직] 치지직 플랫폼 데이터 수집
            else if (item.platform === 'chzzk') {
                try {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            /**
                             * [수집 데이터 종류]
                             * json.content.channelName : 채널 명(닉네임)
                             * json.content.channelImageUrl : 치지직 프로필 이미지 URL
                             */
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl;
                        }
                    }
                } catch (e) {}
            }

            return dbData;
        }));

        // [최종] 수집/생성된 데이터를 DB에 강제로 덮어쓰기(Upsert)
        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
