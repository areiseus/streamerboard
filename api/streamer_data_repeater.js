// api/streamer_data_repeater.js
import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items' });

        const client = new SoopClient();
        const results = [];

        await Promise.all(items.map(async (item) => {
            if (item.platform === 'soop' || item.platform === 'afreeca') {
                try {
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    const stationInfo = await client.channel.station(item.id);
                    
                    let fans = 0;
                    let subscribers = 0;

                    if (stationInfo?.station?.upd) {
                        fans = stationInfo.station.upd.fan_cnt || 0;
                    }

                    // [수정] subscription 자체가 구독자 수일 경우를 최우선으로 체크
                    if (stationInfo && stationInfo.subscription !== undefined) {
                        if (typeof stationInfo.subscription === 'number') {
                            subscribers = stationInfo.subscription;
                        } else if (!isNaN(Number(stationInfo.subscription))) {
                            subscribers = Number(stationInfo.subscription);
                        } else if (stationInfo.subscription.cnt) {
                            subscribers = stationInfo.subscription.cnt;
                        }
                    }

                    results.push({
                        id: item.id, platform: 'soop', isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans),
                        subscribers: parseInt(subscribers)
                    });
                } catch (e) {
                    results.push({ id: item.id, platform: 'soop', isLive: false, viewers: 0, fans: 0, subscribers: 0 });
                }
            } else {
                // 치지직 로직 (변경 없음)
                try {
                    const chzzkRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (!chzzkRes.ok) throw new Error(`Status ${chzzkRes.status}`);
                    const content = (await chzzkRes.json()).content || {};
                    const isLive = content.openLive || false;
                    const fans = content.followerCount || 0;
                    let viewers = 0;

                    if (isLive) {
                        const liveRes = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${item.id}/live-detail`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        if (liveRes.ok) viewers = (await liveRes.json()).content?.concurrentUserCount || 0;
                    }
                    results.push({ id: item.id, platform: 'chzzk', isLive, viewers, fans, subscribers: 0 });
                } catch (e) {
                    results.push({ id: item.id, platform: 'chzzk', isLive: false, viewers: 0, fans: 0, subscribers: 0 });
                }
            }
        }));

        res.status(200).json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
