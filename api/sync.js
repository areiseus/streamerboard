import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // items: [{ id, platform, group_name(선택) }]
    const { items } = req.body;
    if (!items || items.length === 0) return res.status(200).json({ message: 'No items' });

    const results = [];

    for (const item of items) {
        try {
            // 1. 저장할 데이터 뼈대 (ID, 플랫폼)
            let data = {
                id: item.id,
                platform: item.platform,
                last_updated: new Date().toISOString()
            };

            // 2. 그룹명이 같이 들어왔다면(관리자에서 등록/수정 시) DB에도 넣음
            if (item.group_name) {
                data.group_name = item.group_name;
            }

            // 3. SOOP/치지직 정보 긁어오기 (프사, 닉네임, 개설일 등)
            try {
                if (item.platform === 'soop') {
                    const url = `https://m.afreecatv.com/station/${item.id}`;
                    const html = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const $ = cheerio.load(html.data);
                    
                    data.nickname = $('.nick').text().trim() || item.id;
                    let img = $('.profile_img > img').attr('src');
                    if(img) data.profile_img = img.startsWith('//') ? 'https:' + img : img;

                } else if (item.platform === 'chzzk') {
                    const url = `https://api.chzzk.naver.com/service/v1/channels/${item.id}`;
                    const response = await axios.get(url);
                    const content = response.data.content;
                    
                    if (content) {
                        data.nickname = content.channelName;
                        data.profile_img = content.channelImageUrl;
                        data.channel_open_date = content.openDate; // 개설일
                    }
                }
            } catch (crawlErr) {
                console.error(`크롤링 실패 (${item.id}):`, crawlErr.message);
                // 크롤링 실패해도 그룹명이나 ID는 저장되게 그냥 진행
            }

            // 4. DB에 저장 (Upsert: 있으면 수정, 없으면 추가)
            const { error } = await supabase.from('streamers').upsert(data);
            if (error) throw error;
            
            results.push(data);

        } catch (e) {
            console.error(`DB Error (${item.id}):`, e.message);
        }
    }

    res.status(200).json({ success: true, updated: results.length });
}
