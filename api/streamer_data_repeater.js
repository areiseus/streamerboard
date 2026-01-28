// api/streamer_data_repeater.js
import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
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
            // [SOOP / AfreecaTV]
            if (item.platform === 'soop' || item.platform === 'afreeca') {
                try {
                    // 1. 라이브 정보
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // 2. 방송국 정보 (구독자 포함)
                    // 사용자가 알려준 StationInfo 인터페이스 구조 반영
                    const stationInfo = await client.channel.station(item.id);
                    
                    let fans = 0;
                    let subscribers = 0;

                    // 애청자 수 (기존 경로)
                    if (stationInfo?.station?.upd) {
                        fans = stationInfo.station.upd.fan_cnt || 0;
                    }

                    // [수정됨] 구독자 수 (subscription 객체 확인)
                    // 구독 정보가 있고, 공개 상태(subscribe_visible)라면 카운트를 가져옴
                    if (stationInfo && stationInfo.subscription) {
                        // 보통 cnt, count, 혹은 total 등으로 옴. fan_cnt 관례상 cnt일 확률 높음
                        subscribers = stationInfo.subscription.cnt || stationInfo.subscription.count || 0;
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
            // [CHZZK / 치지직]
            else {
                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    
                    if (!chzzkRes.ok) throw new Error(`Chzzk API Error: ${chzzkRes.status}`);
                    
                    const chzzkData = await chzzkRes.json();
                    const content = chzzkData.content || {};

                    const isLive = content.openLive || false;
                    const fans = content.followerCount || 0;
                    const subscribers = 0; // 치지직은 API로 구독자 수 미제공 (0 처리)
                    let viewers = 0;

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
                        platform: 'chzzk',
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
