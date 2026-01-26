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

    // 1. admin.json에서 쿠키 가져오기
    let soopCookieVal = '';
    let chzzkCookieVal = '';
    
    try {
        const filePath = path.join(process.cwd(), 'admin.json');
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(fileData);
            soopCookieVal = json.img_soop_cookie || '';
            chzzkCookieVal = json.img_chzzk_cookie || '';
        }
    } catch (err) {
        console.error('admin.json 읽기 에러 (쿠키 건너뜀)');
    }

    try {
        const results = await Promise.all(items.map(async (item) => {
            
            // [핵심] SOOP일 경우, 기존 이미지 유무 상관없이 스샷 규칙대로 강제 생성
            const firstTwo = item.id.substring(0, 2);
            const forcedSoopImg = `https://stimg.sooplive.co.kr/LOGO/${firstTwo}/${item.id}/m/${item.id}.webp`;

            let dbData = {
                id: item.id,
                platform: item.platform,
                group_name: item.group_name, 
                nickname: item.nickname,
                is_active: true,
                last_updated_at: new Date(),
                // SOOP이면 강제 주소 할당, 아니면 기존/NULL 유지
                profile_img: item.platform === 'soop' ? forcedSoopImg : (item.profile_img || null),
                total_broadcast_time: item.total_broadcast_time || null 
            };

            let commonHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            };

            try {
                // ===============================================
                // [1] SOOP (숲) - 최신 도메인 및 데이터 수집
                // ===============================================
                if (item.platform === 'soop') {
                    const apiUrl = `https://chapi.sooplive.co.kr/api/${item.id}/station`;
                    const referer = `https://ch.sooplive.co.kr/${item.id}`;

                    const resp = await fetch(apiUrl, {
                        headers: { 
                            ...commonHeaders, 
                            'Referer': referer,
                            'Origin': 'https://ch.sooplive.co.kr',
                            'Cookie': soopCookieVal 
                        }
                    });

                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.station) {
                            dbData.nickname = json.station.user_nick || dbData.nickname;
                            dbData.total_broadcast_time = json.station.total_broad_time || dbData.total_broadcast_time;
                        }
                    }
                } 
                // ===============================================
                // [2] CHZZK (치지직)
                // ===============================================
                else if (item.platform === 'chzzk') {
                    const resp = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { ...commonHeaders, 'Cookie': chzzkCookieVal }
                    });
                    
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.content) {
                            dbData.nickname = json.content.channelName;
                            dbData.profile_img = json.content.channelImageUrl || dbData.profile_img;
                        }
                    }
                }
            } catch (crawlErr) {
                console.error(`수집 실패 (${item.id})`);
            }

            return dbData;
        }));

        // DB 저장 (Upsert로 강제 갱신)
        const { error } = await supabase.from('streamers').upsert(results);
        if (error) throw error;

        res.status(200).json({ success: true, count: results.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
