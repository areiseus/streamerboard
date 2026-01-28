// api/steamer_data_repeater.js
import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. Vercel용 CORS 헤더
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
            if (item.platform === 'soop' || item.platform === 'afreeca') {
                try {
                    // 1-1. 라이브 상태 및 시청자 수
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // 1-2. 방송국 정보 (애청자, 구독자)
                    const stationInfo = await client.channel.station(item.id);
                    let fans = 0;
                    let subscribers = 0;

                    if (stationInfo && stationInfo.station && stationInfo.station.upd) {
                        fans = stationInfo.station.upd.fan_cnt || 0; // 애청자 수
                        subscribers = stationInfo.station.upd.sub_cnt || 0; // 구독자 수
                    }

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans),
                        subscribers: parseInt(subscribers)
                    });
                } catch (e) {
                    console.error(`SOOP Error (${item.id}):`, e.message);
                    results.push({ id: item.id, platform: 'soop', isLive: false, viewers: 0, fans: 0, subscribers: 0 });
                }
            } 
            // ============================================================
            // [CASE 2] CHZZK (치지직)
            // ============================================================
            else {
                try {
                    // 2-1. 채널 기본 정보 조회 (팔로워 수, 방송 여부)
                    // GitBook 참조: https://api.chzzk.naver.com/service/v1/channels/{channelId}
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                    });
                    
                    if (!chzzkRes.ok) throw new Error(`Chzzk API Error: ${chzzkRes.status}`);
                    
                    const chzzkData = await chzzkRes.json();
                    const content = chzzkData.content || {};

                    const isLive = content.openLive || false;
                    const fans = content.followerCount || 0; // 치지직 팔로워 = 애청자 매핑
                    let subscribers = 0; // 치지직은 공개 API에서 유료 구독자 수를 제공하지 않음 (0 처리)
                    let viewers = 0;

                    // 2-2. 방송 중이라면 라이브 상세 정보 조회 (시청자 수)
                    if (isLive) {
                        const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        if (liveRes.ok) {
                            const liveData = await liveRes.json();
                            if (liveData.content) {
                                viewers = liveData.content.concurrentUserCount || 0;
                            }
                        }
                    }

                    results.push({
                        id: item.id,
                        platform: 'chzzk', // 혹은 item.platform 그대로 사용
                        isLive: isLive,
                        viewers: parseInt(viewers),
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
