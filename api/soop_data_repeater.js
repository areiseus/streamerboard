import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. CORS 설정 (이게 있어야 브라우저에서 차단 안 당함)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. 예비 요청(OPTIONS) 처리
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. 데이터 처리
    try {
        // POST 요청의 본문(body) 받기
        const { items } = req.body || {};
        
        if (!items) {
            return res.status(400).json({ error: 'No items data' });
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
                    
                    // 애청자 수 (방송 켜져있든 꺼져있든 가져옴)
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
                    console.error(e);
                    results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
                }
            } else {
                // 치지직 등 타 플랫폼은 일단 0 처리
                results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
