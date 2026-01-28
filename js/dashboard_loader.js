async function checkLiveReal(data) {
    // 1. 중복 ID 제거 및 타겟 목록 생성
    const uniqueIds = [...new Set(data.map(m => m.id))];
    const targets = uniqueIds.map(id => {
        const org = data.find(m => m.id === id);
        return { id: org.id, platform: org.platform };
    });

    // [UI] 제목 옆 로딩 표시
    const titleDebugEl = document.getElementById('title-debug-info');
    if (titleDebugEl) {
        titleDebugEl.innerText = " ⏳ 조회 중...";
        titleDebugEl.style.color = "#888";
    }

    try {
        // 2. 서버 요청
        const res = await fetch('/api/streamer_data_repeater', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: targets })
        });

        const results = await res.json();

        // [UI] 제목 옆 완료 표시
        if (titleDebugEl) {
            titleDebugEl.innerText = ` ✅ 업데이트 완료 (${new Date().toLocaleTimeString()})`;
            titleDebugEl.style.color = "green";
        }

        // 3. 데이터 업데이트 (제공해주신 잘 작동하는 로직 적용)
        results.forEach(r => {
            const safeId = r.id.trim();
            const cards = document.querySelectorAll(`.card[data-id="${safeId}"]`);

            cards.forEach(c => {
                // -------------------------------------------------------------
                // [1] 디버그 로그 (기존 기능 유지)
                // -------------------------------------------------------------
                let debugEl = c.querySelector('.debug-log');
                if (!debugEl) {
                    debugEl = document.createElement('div');
                    debugEl.className = 'debug-log';
                    c.appendChild(debugEl);
                }
                if (r._debug) {
                    debugEl.innerText = r._debug;
                    if (r._debug.toUpperCase().includes('FAIL')) {
                        debugEl.style.color = '#ff4444';
                    } else {
                        debugEl.style.color = '#00ff00';
                    }
                }

                // -------------------------------------------------------------
                // [2] 애청자 & 구독자 (제공해주신 코드 로직 이식)
                // -------------------------------------------------------------
                const fanEl = c.querySelector('.fan-cnt');
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row'); // 구독자 줄 전체

                // 값 안전하게 가져오기
                const fanCount = (r.fans !== undefined && r.fans !== null) ? r.fans : 0;
                const subCount = (r.subscribers !== undefined && r.subscribers !== null) ? r.subscribers : 0;

                // 애청자 업데이트
                if (fanEl) fanEl.innerText = Number(fanCount).toLocaleString();

                // 구독자 로우 표시/숨김 처리 (중요!)
                if (subRow) {
                    if (subCount > 0) {
                        subRow.style.display = 'flex';
                        if (subEl) subEl.innerText = Number(subCount).toLocaleString();
                    } else {
                        subRow.style.display = 'none'; // 구독자 없으면 줄 자체를 숨김
                    }
                }

                // -------------------------------------------------------------
                // [3] 라이브 상태 / 배지 / 이미지 (제공해주신 코드 로직 이식)
                // -------------------------------------------------------------
                const badge = c.querySelector('.status-badge');
                const profileImg = c.querySelector('.profile-img');
                const thumbEl = c.querySelector('.card-thumb');

                // 프로필 이미지 업데이트
                if (profileImg && r.profileUrl) {
                    if (profileImg.src !== r.profileUrl) profileImg.src = r.profileUrl;
                }

                if (r.isLive) {
                    // 방송 ON
                    c.classList.add('is-live');
                    if (badge) {
                        badge.innerText = "LIVE";
                        badge.classList.remove('badge-off');
                        badge.classList.add('badge-live');
                    }
                    // 썸네일 업데이트 (추가된 기능 유지)
                    if (thumbEl && r.thumbnail) thumbEl.src = r.thumbnail;
                } else {
                    // 방송 OFF
                    c.classList.remove('is-live');
                    if (badge) {
                        badge.innerText = "OFF";
                        badge.classList.remove('badge-live');
                        badge.classList.add('badge-off');
                    }
                }
            });
        });

    } catch (e) {
        console.error(e);
        if (titleDebugEl) {
            titleDebugEl.innerText = " ❌ 실패";
            titleDebugEl.style.color = "red";
        }
    }
}
