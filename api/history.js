import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const supabase = createClient(
    process.env.streamer_db_URL,
    process.env.streamer_db_KEY
);

// 날짜 포맷 헬퍼 (YYYY-MM-DD)
const getYMD = (d) => d.toISOString().split('T')[0];

export default async function handler(req, res) {
    // items: [{id: '...', platform: '...'}, ...]
    const { items } = req.body;
    
    // 타겟 날짜 (기본값: 어제) - 크론잡에서 date 파라미터로 지정 가능
    const targetDateStr = req.body.date || getYMD(new Date(Date.now() - 86400000)); 

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: '목록이 필요합니다.' });
    }

    const results = [];

    try {
        for (const item of items) {
            const id = typeof item === 'string' ? item : item.id;
            const platform = typeof item === 'string' ? 'soop' : (item.platform || 'soop');
            
            try {
                // 📊 1. 일일 스탯 (구독자 수 등) 수집
                let fanCount = 0;
                let postCount = 0; // 숲은 게시글 수 수집 가능

                if (platform === 'chzzk') {
                    // ⚡ 치지직 채널 정보
                    const chUrl = `https://api.chzzk.naver.com/service/v1/channels/${id}`;
                    const { data: chJson } = await axios.get(chUrl);
                    if (chJson.code === 200) {
                        fanCount = chJson.content.followerCount;
                    }

                    // ⚡ 치지직 지난 방송(VOD) 기록 수집
                    // (비공식 API라 구조가 바뀔 수 있음)
                    const vodUrl = `https://api.chzzk.naver.com/service/v1/channels/${id}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=20`;
                    const { data: vodJson } = await axios.get(vodUrl);
                    
                    if (vodJson.code === 200) {
                        const videos = vodJson.content.data;
                        for (const v of videos) {
                            // 방송 날짜 확인 (publishDate)
                            const vDate = v.publishDate.split(' ')[0]; // '2024-01-01 12:00:00' -> '2024-01-01'
                            
                            // 타겟 날짜의 방송만 DB에 저장
                            if (vDate === targetDateStr) {
                                await supabase.from('broadcast_history').upsert({
                                    vod_id: `chzzk_${v.videoNo}`,
                                    streamer_id: id,
                                    title: v.videoTitle,
                                    started_at: v.publishDate, // 정확한 시작 시간은 아닐 수 있음 (업로드 시간)
                                    duration: v.duration, // 초 단위
                                    max_viewers: v.readCount, // 치지직은 VOD 조회수를 넣거나, 별도 메타데이터 필요
                                    thumbnail_url: v.videoImageImageUrl,
                                    created_at: new Date()
                                }, { onConflict: 'vod_id' });
                            }
                        }
                    }

                } else {
                    // 🌲 숲(SOOP) 방송국 정보 크롤링
                    const stationUrl = `https://bj.afreecatv.com/${id}`;
                    const { data: html } = await axios.get(stationUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const $ = cheerio.load(html);

                    // 애청자 수 파싱 (text에서 숫자만 추출)
                    const fanText = $('#g_bs_ok').text().replace(/,/g, ''); 
                    fanCount = parseInt(fanText) || 0;
                    
                    // 오늘 방문자수 등으로 활동성 추정 가능하지만 일단 생략

                    // 🌲 숲 VOD 리스트 크롤링 (최근 방송)
                    // (모바일 페이지가 파싱하기 쉬움)
                    const vodListUrl = `https://m.afreecatv.com/station/video/a/view/list?nStationNo=${id}&nPageNo=1`; 
                    // 주의: nStationNo는 숫자 ID가 필요한데, 영문 ID로 변환하는 과정이 필요할 수 있음.
                    // 숲은 영문ID -> 고유번호(StationNo) 변환이 필요합니다.
                    // 일단은 PC 페이지 메타데이터에서 StationNo를 찾는 로직 추가
                    
                    // StationNo 찾기
                    let stationNo = '';
                    const scripts = $('script').text();
                    const match = scripts.match(/szBjId\s*=\s*"([^"]+)"/); // 이건 BJID고..
                    const matchNo = scripts.match(/nStationNo\s*=\s*([0-9]+)/);
                    if (matchNo) stationNo = matchNo[1];

                    if (stationNo) {
                        const mvodUrl = `https://st.afreecatv.com/api/get_station_video.php?szBjId=${id}&nStationNo=${stationNo}&nPageNo=1&nCategoryCode=00010000`; // 다시보기 카테고리
                        // API 호출이 막힐 수 있으므로, 실제로는 브라우저 렌더링이나 우회법이 필요할 수 있습니다.
                        // 여기서는 로직 예시로 작성합니다.
                        
                        // (간단 구현을 위해) 여기서는 '일일 스탯' 저장에 집중하고, 
                        // 숲 VOD 상세 수집은 복잡도가 높으므로 추후 고도화 단계에서 추가하는 것을 권장합니다.
                        // 일단은 '애청자 수' 업데이트만 수행합니다.
                    }
                }

                // 📊 2. 일일 통계(daily_stats) 확정 저장
                // sync.js에서 빈 껍데기를 만들었다면, 여기서 숫자를 채워 넣습니다.
                await supabase.from('daily_stats').upsert({
                    streamer_id: id,
                    date: targetDateStr, // 오늘 수집한 거라면 오늘 날짜, 어제거면 어제 날짜
                    fan_count: fanCount,
                    post_count: postCount,
                    // clip_count 등은 추가 구현 필요
                }, { onConflict: 'streamer_id, date' });

                results.push({ id, platform, status: 'success', fanCount });

            } catch (innerErr) {
                console.error(`History Error ${id}:`, innerErr);
                results.push({ id, status: 'failed', error: innerErr.message });
            }
        }

        res.status(200).json({ message: 'History processed', results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
}
