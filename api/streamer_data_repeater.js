// api/streamer_data_repeater.js
import { SoopClient } from 'soop-extension';


export default async function handler(req, res) {
    // 1. CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const client = new SoopClient();
        const results = [];

        await Promise.all(items.map(async (item) => {
            // ============================================================
            // [CASE 1] SOOP
            // ============================================================
            if (item.platform === 'soop') {

                
                let fans = 0;
                let subscribers = 0;


// ----------------------------------------------------------------
                // 1. https://dictionary.cambridge.org/ko/%EC%82%AC%EC%A0%84/%EC%98%81%EC%96%B4-%ED%95%9C%EA%B5%AD%EC%96%B4/check play.sooplive.co.kr 접속 -> 리다이렉트 주소 분석
                // ----------------------------------------------------------------
                try {
                    const playUrl = `https://play.sooplive.co.kr/${item.id}/`;
                    
                    const playRes = await fetch(playUrl, { 
                        method: 'GET',
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        redirect: 'follow' 
                    });

                    // 최종 리다이렉트된 주소 (예: https://play.sooplive.co.kr/bttolang/null/)
                    const finalUrl = playRes.url;

                    // 1) URL 끝에 있는 '/' 제거 (파싱 정확도를 위해)
                    // 예: .../null/ -> .../null
                    const cleanUrl = finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl;

                    // 2) '/' 기준으로 주소를 쪼갬
                    const parts = cleanUrl.split('/');

                    // 3) 맨 마지막 부분(value) 추출
                    const value = parts[parts.length - 1];

                    // 4) value가 정확히 'null' 문자열인지 확인
                    if (value === 'null') {
                        isLive = false;
                    } else {
                        isLive = true;
                    }

                } catch (e) {
                    console.error(`SOOP Live URL Check Error (${item.id}):`, e.message);
                    isLive = false; // 에러 시 기본값
                }
                
                //try{
                    // 라이브 상세 정보
                    //const liveDetail = await client.live.livedetail.channel(item.id);
                    //const liveDetail = await client.live.livedetail(item.id);
                    //const liveDetail = await client.live.detail(item.id);
                 
                    ///if (liveDetail) {
                    //isLive = liveDetail.channel.result === 1 ;
                    //isLive = liveDetail.detail.result === 1 ;
                    //isLive =  Boolean(liveDetail.channel?.stno);
                    //isLive =  Boolean(liveDetail.bno);
                  //  }
                        
                } catch (e) {
                    console.error(`SOOP Error (${item.id}):`, e.message);
                }

                
                try{
                    // 방송국 정보 (구독자)
                    const stationInfo = await client.channel.station(item.id);
                    if (stationInfo) {
                        fans = stationInfo.station.upd.fan_cnt || 0;
                        }
                } catch (e) {
                    console.error(`SOOP Error (${item.id}):`, e.message);
                }


                try{
                    // 방송국 정보 (구독자)
                    const stationInfo = await client.channel.station(item.id);
                    if (stationInfo) {
                        subscribers = stationInfo.subscription.total || 0; // 구독자 수
                        }
                  } catch (e) {
                    console.error(`SOOP Error (${item.id}):`, e.message);
                  }                   
                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        fans: parseInt(fans),
                        subscribers: parseInt(subscribers)
                    });
            } 
            // ============================================================
            // [CASE 2] CHZZK (치지직)
            // ============================================================
            else {
                try {
                    // 채널 정보 조회
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    
                    if (!chzzkRes.ok) throw new Error(`Chzzk API Error: ${chzzkRes.status}`);
                    
                    const chzzkData = await chzzkRes.json();
                    const content = chzzkData.content || {};

                    const isLive = content.openLive || false; // 라이브 여부
                    const fans = content.followerCount || 0;  // 팔로워(애청자)
                    const subscribers = 0; // 치지직 공개 API는 구독자 수 미제공 -> 0 처리
                    

                    results.push({
                        id: item.id,
                        platform: 'chzzk',
                        isLive: isLive,
                        fans: parseInt(fans),
                        subscribers: parseInt(subscribers)
                    });

                } catch (e) {
                    console.error(`Chzzk Error (${item.id}):`, e.message);
                    results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0, subscribers: 0 });
                }
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
