import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    // 1. 요청받은 목록 (ID와 플랫폼 정보)
    // 예: [ { id: 'woowakgood', platform: 'soop' }, { id: 'uid...', platform: 'chzzk' } ]
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: '목록이 필요합니다.' });
    }

    try {
        // 2. 병렬 처리 (모든 스트리머 동시에 조사)
        const promises = items.map(async (item) => {
            // 문자로만 오면 숲으로 간주, 아니면 플랫폼 확인
            const id = typeof item === 'string' ? item : item.id;
            const platform = typeof item === 'string' ? 'soop' : (item.platform || 'soop');

            try {
                if (platform === 'chzzk') {
                    // ⚡ 치지직 실시간 확인 (Polling API 사용)
                    const url = `https://api.chzzk.naver.com/polling/v2/channels/${id}/live-status`;
                    const { data: json } = await axios.get(url);
                    
                    const content = json.content || {};
                    const isLive = content.status === 'OPEN';

                    return {
                        id,
                        platform,
                        name: id, // 라이브 체크에선 닉네임 굳이 갱신 안 함 (속도 우선)
                        isLive: isLive,
                        title: content.liveTitle || '',
                        viewers: content.concurrentUserCount || 0,
                        img: content.liveImageUrl ? content.liveImageUrl.replace('{type}', '480') : null,
                        link: `https://chzzk.naver.com/live/${id}`
                    };

                } else {
                    // 🌲 숲(SOOP) 실시간 확인 (모바일 페이지 크롤링이 더 가벼움)
                    // PC 페이지 대신 모바일 페이지를 찔러서 데이터 절약
                    const url = `https://m.afreecatv.com/station/${id}`;
                    const { data: html } = await axios.get(url, {
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' 
                        }
                    });
                    
                    // 숲은 HTML 안에 JSON 데이터가 숨겨져 있음
                    // "broad_info" 라는 변수를 찾아서 파싱
                    const $ = cheerio.load(html);
                    let isLive = false;
                    let title = '';
                    let viewers = 0;
                    let thumbnail = null;

                    // 스크립트 태그에서 방송 정보 찾기
                    $('script').each((i, el) => {
                        const scriptContent = $(el).html();
                        if (scriptContent && scriptContent.includes('var stationInfo')) {
                            // 방송 중인지 체크 (is_broadcasting: true/false 같은 플래그 확인 필요하지만, 
                            // 모바일 페이지에서는 .live-on 클래스나 onair 아이콘 유무로 판단 가능)
                        }
                    });
                    
                    // 간단한 방식: HTML 태그로 확인
                    // 모바일 페이지 구조상 'onair' 클래스가 있거나 특정 태그가 있으면 방송 중
                    const onAirBadge = $('.label_onair').length > 0 || html.includes('"is_broad":true');
                    
                    if (onAirBadge) {
                        isLive = true;
                        title = $('meta[property="og:title"]').attr('content') || '';
                        thumbnail = $('meta[property="og:image"]').attr('content');
                        
                        // 시청자 수는 모바일 HTML에서 파싱하기 까다로울 수 있음 (API가 막혀있어서)
                        // 일단 방송 여부만 확실히 체크
                    }

                    return {
                        id,
                        platform,
                        name: id,
                        isLive: isLive,
                        title: title,
                        viewers: viewers, // 숲 크롤링으로는 정확한 시청자 수 가져오기 어려울 수 있음
                        img: thumbnail,
                        link: `https://play.afreecatv.com/${id}`
                    };
                }
            } catch (e) {
                console.error(`Live Check Error (${id}):`, e.message);
                return { id, platform, isLive: false, error: true };
            }
        });

        const results = await Promise.all(promises);
        res.status(200).json(results);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Live Check Failed' });
    }
}
