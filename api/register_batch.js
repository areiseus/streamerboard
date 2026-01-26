import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. DB 연결 확인
const supabaseUrl = process.env.streamer_db_URL;
const supabaseKey = process.env.streamer_db_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error(" [치명적 오류] 환경변수(DB URL/KEY)가 없습니다!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    console.log("=== [1] 배치 작업 시작 ===");
    
    const { items } = req.body; 

    if (!items || items.length === 0) {
        console.error(" [오류] 받아온 데이터가 없습니다 (items is empty)");
        return res.status(400).json({ error: '보낼 데이터가 없습니다.' });
    }

    // 쿠키 로드 (생략 가능하지만 에러 방지용으로 둠)
    let soopCookieVal = '';
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            soopCookieVal = json.img_soop_cookie || '';
        }
    } catch (err) {}

    try {
        // 2. 쏠 데이터 준비
        console.log(`=== [2] ${items.length}개 데이터 가공 시작 ===`);
        
        const results = await Promise.all(items.map(async (item) => {
            
            // SOOP 이미지 주소 강제 생성
            const firstTwo = item.id.substring(0, 2);
            const forcedImgUrl = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

            // DB에 쏠 최종 데이터 객체
            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                // [확인 포인트] 여기서 주소가 제대로 박히는지 로그로 확인 가능
                profile_img: item.platform === 'soop' ? forcedImgUrl : (item.profile_img || null),
                total_broadcast_time: item.total_broadcast_time || null 
            };
            
            // (부가 정보 수집 로직은 에러나도 무시하고 진행하도록 try-catch 감쌈)
            if (item.platform === 'soop') {
                try {
                    const resp = await fetch(`https://chapi.sooplive.co.kr/api/${item.id}/station`, {
                        headers: { "User-Agent": "Mozilla/5.0", "Cookie": soopCookieVal, "Referer": `https://ch.sooplive.co.kr/${item.id}` }
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.station) {
                            dbData.nickname = json.station.user_nick || dbData.nickname;
                            dbData.total_broadcast_time = json.station.total_broad_time;
                        }
                    }
                } catch (e) {}
            } else if (item.platform === 'chzzk') {
                try {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl;
                        }
                    }
                } catch (e) {}
            }

            return dbData;
        }));

        // 3. 쏘는 데이터 눈으로 확인 (Vercel 로그에서 확인 가능)
        console.log("=== [3] DB로 쏘기 직전 데이터 샘플 (첫번째 놈) ===");
        console.log(JSON.stringify(results[0], null, 2)); 
        // 여기서 profile_img가 찍혀있으면 '쏘는 놈'은 무죄임.

        // 4. DB에 전송 (Upsert)
        console.log("=== [4] Supabase Upsert 실행 ===");
        const { data, error } = await supabase.from('streamers').upsert(results);

        // 5. 결과 판독
        if (error) {
            console.error("!!! [5] DB 저장 실패 (받는 놈이 거부함) !!!");
            console.error("에러 코드:", error.code);
            console.error("에러 메시지:", error.message);
            console.error("상세 내용:", error.details);
            
            // 형님 브라우저에 에러 내용 그대로 전달
            return res.status(500).json({ 
                success: false, 
                stage: 'DB_WRITE_FAIL',
                error_code: error.code,
                error_msg: error.message,
                error_detail: error.details 
            });
        }

        console.log("=== [5] DB 저장 성공 ===");
        res.status(200).json({ success: true, count: results.length, message: "저장 성공" });

    } catch (e) {
        console.error("!!! [시스템 에러] 코드 실행 중 뻗음 !!!");
        console.error(e);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
}
