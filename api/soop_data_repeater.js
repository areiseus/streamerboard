import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. CORS 허용 (Vercel 필수)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { items } = req.body || {};
        if (!items) return res.status(400).json({ error: 'No items provided' });

        const client = new SoopClient();
        const results = [];

        await Promise.all(items.map(async (item) => {
            if (item.platform === 'soop' || item.platform === 'afreeca') {
                try {
                    // [1] 라이브 상태는 라이브러리로 확인 (이건 잘 되니까 유지)
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // [2] 애청자 수는 사용자님이 찾은 '직통 API'로 해결
                    let fans = 0;
                    try {
                        // 사용자님이 찾으신 그 주소!
                        const apiUrl = `https://api-channel.sooplive.co.kr/v1.1/channel/${item.id}/dashboard`;
                        
                        const dashRes = await fetch(apiUrl, {
                            method: 'GET',
                            headers: {
                                // 봇으로 오해받지 않게 사람인 척 헤더 추가
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': `https://ch.sooplive.co.kr/${item.id}`
                            }
                        });
                        
                        if (dashRes.ok) {
                            const dashData = await dashRes.json();
                            // 데이터 구조: { data: { station: { upd: 965, ... } } }
                            if (dashData && dashData.data && dashData.data.station) {
                                fans = dashData.data.station.upd || 0;
                            }
                        }
                    } catch (fetchErr) {
                        console.error(`[Dashboard API Error] ${item.id}:`, fetchErr);
                        // 실패 시 라이브러리로 2차 시도 (보험)
                        const stationInfo = await client.channel.station(item.id);
                        fans = stationInfo?.station?.upd || 0;
                    }

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans) // 이제 무조건 나옵니다
                    });
                } catch (e) {
                    console.error(`Error processing ${item.id}:`, e);
                    results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
                }
            } else {
                results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
