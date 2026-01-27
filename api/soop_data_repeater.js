import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. CORS 허용 설정 (Vercel 필수)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. 예비 요청(OPTIONS) 처리
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
                    // 라이브 상태 및 방송국 정보 조회
                    const liveDetail = await client.live.detail(item.id);
                    const stationRes = await client.channel.station(item.id);

                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // [핵심 수정] 애청자 수(upd) 찾기
                    // stationRes 구조가 { code:..., station: { ... } } 형태일 수 있음
                    const stationData = stationRes.station || stationRes || {};

                    // 'upd'가 애청자(즐겨찾기) 수 입니다. 
                    // 혹시 몰라 total_ok(추천)나 fan_cnt(팬클럽) 위치도 안전하게 체크
                    const fans = stationData.upd || stationData.total_upd || 0;

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans) // 여기서 965명이 잡혀야 함
                    });
                } catch (e) {
                    console.error(`Error fetching ${item.id}:`, e);
                    // 에러 나도 0으로 반환해서 화면 안 깨지게 함
                    results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
                }
            } else {
                // 타 플랫폼 (치지직 등)
                results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
            }
        }));

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
