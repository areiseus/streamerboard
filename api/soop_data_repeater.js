// 파일 경로: API/soop_data_repeater.js

const express = require('express');
const cors = require('cors');
const { SoopClient } = require('soop-extension'); // 비공식 라이브러리

const app = express();
const PORT = 3000;

// CORS 허용 (프론트엔드에서 요청 가능하게 설정)
app.use(cors());
app.use(express.json());

const client = new SoopClient();

app.post('/live', async (req, res) => {
    const { items } = req.body; // 요청받은 스트리머 목록
    const results = [];

    console.log(`[${new Date().toLocaleTimeString()}] 데이터 요청 수신: ${items.length}명`);

    // 병렬 처리로 속도 향상
    await Promise.all(items.map(async (item) => {
        // SOOP(아프리카) 플랫폼인 경우만 라이브러리 사용
        if (item.platform === 'soop' || item.platform === 'afreeca') {
            try {
                // 1. 라이브 상태 상세 조회
                const liveDetail = await client.live.detail(item.id);
                // 2. 방송국 정보(애청자 수 포함) 조회
                const stationInfo = await client.channel.station(item.id);

                // 라이브 여부 판단 (broad_no가 있으면 방송 중)
                const isLive = liveDetail && liveDetail.broad_no ? true : false;
                const viewers = isLive ? (liveDetail.total_view_cnt || 0) : 0;
                
                // 애청자 수 (upd가 즐겨찾기 수)
                const fans = stationInfo && stationInfo.station ? (stationInfo.station.upd || 0) : 0;

                results.push({
                    id: item.id,
                    platform: 'soop',
                    isLive: isLive,
                    viewers: parseInt(viewers),
                    fans: parseInt(fans)
                });
            } catch (e) {
                console.error(`Error fetching ${item.id}:`, e.message);
                // 에러 발생 시 기본값 반환 (화면이 깨지지 않게)
                results.push({ id: item.id, isLive: false, viewers: 0, fans: 0 });
            }
        } else {
            // 치지직 등 타 플랫폼은 현재 라이브러리 미지원으로 0 처리
            results.push({ id: item.id, platform: item.platform, isLive: false, viewers: 0, fans: 0 });
        }
    }));

    res.json(results);
});

app.listen(PORT, () => {
    console.log(`✅ SOOP 데이터 중계 서버 가동 중...`);
    console.log(`📂 파일 위치: API/soop_data_repeater.js`);
    console.log(`📡 접속 주소: http://localhost:${PORT}/live`);
});
