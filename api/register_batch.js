const fs = require('fs');
const path = require('path');

// DB 파일 위치 (api 폴더 기준 상위 폴더의 list.json)
const DB_FILE = path.join(__dirname, '../list.json');

module.exports = async (req, res) => {
    // 1. 요청 데이터 받기
    // (서버 환경에 따라 req.body를 쓰는 방식이 다를 수 있음. Express 기준)
    const { id, platform, group_name } = req.body;

    if (!id || !platform) {
        return res.status(400).json({ error: 'ID와 플랫폼을 입력해주세요.' });
    }

    console.log(`[등록 시작] ${platform} - ${id}`);

    // 저장할 기본 데이터 틀
    let streamerInfo = {
        id: id,
        platform: platform,
        group_name: group_name || '미분류',
        nickname: id, // 못 가져오면 ID라도 씀
        profile_img: '',
        open_date: '',
        registered_at: new Date().toISOString().split('T')[0]
    };

    try {
        // 2. 플랫폼별 정보 긁어오기 (라이브러리 없이 내장 fetch 사용)
        if (platform === 'chzzk') {
            const url = `https://api.chzzk.naver.com/service/v1/channels/${id}`;
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            
            if (response.ok) {
                const json = await response.json();
                const content = json.content;
                if (content) {
                    streamerInfo.nickname = content.channelName;
                    streamerInfo.profile_img = content.channelImageUrl;
                    streamerInfo.open_date = content.openDate ? content.openDate.split(' ')[0] : '';
                }
            }
        } 
        else if (platform === 'soop') {
            const url = `https://bjapi.afreecatv.com/api/${id}/station`;
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            
            if (response.ok) {
                const json = await response.json();
                const station = json.station;
                if (station) {
                    streamerInfo.nickname = station.user_nick;
                    streamerInfo.profile_img = 'https:' + station.image_profile;
                    streamerInfo.open_date = station.station_open_date || '';
                }
            }
        }

        // 3. list.json 파일 읽어서 저장하기
        let currentList = [];
        if (fs.existsSync(DB_FILE)) {
            const fileData = fs.readFileSync(DB_FILE, 'utf8');
            try {
                currentList = JSON.parse(fileData);
            } catch (e) { currentList = []; }
        }

        // 이미 있는 ID면 정보 갱신, 없으면 추가
        const idx = currentList.findIndex(item => item.id === id);
        if (idx !== -1) {
            currentList[idx] = { ...currentList[idx], ...streamerInfo };
        } else {
            currentList.push(streamerInfo);
        }

        // 파일에 쓰기 (DB 저장)
        fs.writeFileSync(DB_FILE, JSON.stringify(currentList, null, 2), 'utf8');

        console.log(`[성공] ${streamerInfo.nickname} 저장 완료`);
        
        // 성공 응답
        res.status(200).json({ success: true, data: streamerInfo });

    } catch (error) {
        console.error('등록 에러:', error);
        res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
    }
};
