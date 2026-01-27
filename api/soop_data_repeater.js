import { SoopClient } from 'soop-extension';

// Vercel Serverless Function 형식
export default async function handler(req, res) {
    // 1. CORS 처리 (다른 곳에서도 접속 가능하게)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // OPTIONS 요청(사전 검사)이면 바로 종료
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // POST 요청만 처리
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { items } = req.body;
    if (!items) {
        return res.status(400).json({ error: 'No items provided' });
    }

    const client = new SoopClient();
    const results = [];

    await Promise.all(items.map(async (item) => {
        if (item.platform === 'soop' || item.platform === 'afreeca') {
            try {
                const liveDetail = await client.live.detail(item.id);
                const stationInfo = await client.channel.station(item.id);

                const isLive = liveDetail && liveDetail.broad_no ? true : false;
                const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                
                let fans = 0;
                if (stationInfo && stationInfo.station) {
                    fans = stationInfo.station.upd || stationInfo.station.total_ok || 0;
                }

                results.push({
                    id: item.id,
                    platform: 'soop',
                    isLive: isLive,
                    viewers: parseInt(viewers),
                    fans: parseInt(fans)
                });
            } catch (e) {
                results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
            }
        } else {
            results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
        }
    }));

    res.status(200).json(results);
}
