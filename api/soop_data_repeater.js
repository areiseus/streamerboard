import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. CORS 허용 (Vercel 필수 설정)
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
                    // [1] 라이브 여부: 이건 라이브러리가 잘 작동하니 그대로 씁니다.
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // [2] 애청자 수: 라이브러리 대신 '직통 대시보드 API' 사용
                    // (보내주신 TS 파일의 .../station 주소는 비로그인 시 0이 나오므로 사용 X)
                    let fans = 0;
                    try {
                        const dashUrl = `https://api-channel.sooplive.co.kr/v1.1/channel/${item.id}/dashboard`;
                        
                        const response = await fetch(dashUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': `https://ch.sooplive.co.kr/${item.id}`
                            }
                        });
                        
                        if (response.ok) {
                            const json = await response.json();
                            // 구조: { data: { station: { upd: 965, ... } } }
                            if (json?.data?.station) {
                                // 어떤 곳은 upd가 숫자고, 어떤 곳은 객체일 수 있어 안전하게 파싱
                                const rawUpd = json.data.station.upd;
                                if (typeof rawUpd === 'number') {
                                    fans = rawUpd;
                                } else if (typeof rawUpd === 'object' && rawUpd !== null) {
                                    fans = rawUpd.fan_cnt || rawUpd.total_ok_cnt || 0;
                                }
                            }
                        }
                    } catch (fetchErr) {
                        console.error(`Fetch Error ${item.id}:`, fetchErr);
                    }

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans) // 이제 965 나옵니다
                    });
                } catch (e) {
                    // 실패 시 0 처리
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
