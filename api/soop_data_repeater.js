const express = require('express');
const cors = require('cors');
const { SoopClient } = require('soop-extension');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const client = new SoopClient();

app.post('/live', async (req, res) => {
    const { items } = req.body;
    const results = [];

    console.log(`[LOG] 요청 수신: ${items.length}명`);

    await Promise.all(items.map(async (item) => {
        if (item.platform === 'soop' || item.platform === 'afreeca') {
            try {
                // 1. 방송 상태 (LIVE 여부)
                const liveDetail = await client.live.detail(item.id);
                // 2. 방송국 정보 (애청자 수) - 방송 유무와 상관없이 조회됨
                const stationInfo = await client.channel.station(item.id);

                // 디버깅용: 서버 콘솔에 데이터 구조 출력 (확인 후 주석 처리 가능)
                // console.log(`[DEBUG] ${item.id} Station:`, stationInfo);

                const isLive = liveDetail && liveDetail.broad_no ? true : false;
                const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                
                // [수정] 애청자(즐겨찾기) 수 찾기 로직 강화
                // 라이브러리 버전에 따라 위치가 다를 수 있어 여러 경로를 체크합니다.
                let fans = 0;
                if (stationInfo && stationInfo.station) {
                    fans = stationInfo.station.upd // 보통 'upd'가 즐겨찾기 수
                        || stationInfo.station.total_ok 
                        || stationInfo.station.fan_cnt 
                        || 0;
                }

                results.push({
                    id: item.id,
                    platform: 'soop',
                    isLive: isLive,
                    viewers: parseInt(viewers),
                    fans: parseInt(fans) // 무조건 숫자형으로 변환
                });
            } catch (e) {
                console.error(`[ERROR] ${item.id} 조회 실패:`, e.message);
                results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
            }
        } else {
            // 치지직 등 타 플랫폼 (현재는 0 처리)
            results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
        }
    }));

    res.json(results);
});

app.listen(PORT, () => {
    console.log(`✅ SOOP 데이터 중계 서버 가동 중 (http://localhost:${PORT})`);
});
