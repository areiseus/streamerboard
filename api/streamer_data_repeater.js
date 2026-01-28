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
            // [CASE 1] SOOP (AfreecaTV)
            // ============================================================
            if (item.platform === 'soop') {
                try {
                    // 라이브 상세 정보
                    const liveDetail = await client.live.detail(item.id);
                    // broad_no가 존재하면 방송 중으로 판단
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    
                    // 방송국 정보 (애청자, 구독자)
                    const stationInfo = await client.channel.station(item.id);
                    let fans = 0;
                    let subscribers = 0;

                    if (stationInfo && stationInfo.station && stationInfo.station.upd) {
                        fans = stationInfo.station.upd.fan_cnt || 0;
                        subscribers = stationInfo.subscription || 0; // 구독자 수
                    }

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        fans: parseInt(fans),
                        subscribers: parseInt(subscribers)
                    });
                } catch (e) {
                    console.error(`SOOP Error (${item.id}):`, e.message);
                    results.push({ id: item.id, platform: 'soop', isLive: false, fans: 0, subscribers: 0 });
                }
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
