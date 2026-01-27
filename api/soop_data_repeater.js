import { SoopClient } from 'soop-extension';

export default async function handler(req, res) {
    // 1. Vercel용 CORS 헤더 (필수)
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
            if (item.platform === 'soop' || item.platform === 'afreeca') {
                try {
                    // [1] 라이브 상태 조회
                    const liveDetail = await client.live.detail(item.id);
                    const isLive = liveDetail && liveDetail.broad_no ? true : false;
                    const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                    
                    // [2] 애청자 수 조회 (SoopChannel.ts 파일 분석 결과 반영)
                    // client.channel.station() 함수가 내부적으로 /api/.../station을 호출합니다.
                    const stationInfo = await client.channel.station(item.id);
                    
                    let fans = 0;
                    if (stationInfo && stationInfo.station && stationInfo.station.upd) {
                        // 사용자님이 보여주신 TS 파일 interface Upd 참조:
                        // upd 객체 안에 fan_cnt(애청자)가 있습니다.
                        fans = stationInfo.station.upd.fan_cnt || 0;
                    }

                    results.push({
                        id: item.id,
                        platform: 'soop',
                        isLive: isLive,
                        viewers: parseInt(viewers),
                        fans: parseInt(fans)
                    });
                } catch (e) {
                    // 에러 발생 시 0 처리
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
