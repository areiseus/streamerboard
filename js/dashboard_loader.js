/* js/dashboard_loader.js */

import { renderCards, renderBalloons, renderFooter, adjustWrapperSize } from './renderer.js';

async function init() {
    try {
        // 1. [항상 실행] DB에서 최신 멤버 정보 가져오기 (가벼움)
        // 닉네임, 프사 변경 등은 여기서 바로 반영됨
        const res = await fetch('/api/get_list');
        const data = await res.json();
        
        if (!data || data.length === 0) return;
        data.sort((a, b) => a.id.localeCompare(b.id));

        // 데이터 분류
        const groupedNodes = [];
        const noGroupNodes = [];
        data.forEach(m => {
            m._groups = parseGroups(m);
            if (m._groups.length > 0) groupedNodes.push(m);
            else noGroupNodes.push(m);
        });

        // 미분류(Footer)는 계산 필요 없으니 즉시 렌더링
        renderFooter(noGroupNodes);

        // 2. [캐시 확인] 그룹 멤버가 있는 경우
        if (groupedNodes.length > 0) {
            const currentSignature = generateListSignature(groupedNodes);
            
            // 캐시에서 '좌표'와 '체인(순서)'만 가져옴 (멤버 정보 X)
            const cachedLayout = loadLayoutCache(currentSignature);

            if (cachedLayout) {
                // [A] 인원 변동 없음 -> 계산기 안 돌림 (매우 빠름)
                console.log("⚡ [Smart Cache] 최신 DB 정보에 + 캐시된 좌표 적용");
                
                // 최신 데이터(groupedNodes)를 그릴 건데, 위치는 캐시(cachedLayout.positions)를 씀
                renderCards(cachedLayout.positions, groupedNodes);
                
                // 그룹 묶음 선 그리기 (캐시된 체인 정보 사용)
                renderBalloons(cachedLayout.chain, cachedLayout.positions);
                
                adjustWrapperSize(cachedLayout.positions);
            } else {
                // [B] 인원 변동 있음 -> 계산기 가동 (느림)
                console.log("🐢 [Recalculate] 인원 변동 감지! 좌표 재계산...");
                
                const calculator = await import('./layout_calculator.js'); 
                const result = calculator.calculateLayout(groupedNodes);
                
                // 화면 그리기
                renderCards(result.positions, groupedNodes);
                renderBalloons(result.chain, new Map(result.positions));
                adjustWrapperSize(result.positions);

                // [저장] 멤버 정보는 빼고, '좌표'와 '체인'만 저장함
                saveLayoutCache(currentSignature, result.positions, result.chain);
            }
        }

        // 3. [항상 실행] 라이브 상태 및 시청자 수 체크 (실시간성 필수)
        checkLiveReal(data);

    } catch (e) { console.error("Loader Error:", e); }
}

// -------------------------------------------------------
// 헬퍼 함수들
// -------------------------------------------------------

function generateListSignature(nodes) {
    return nodes.map(n => n.id).sort().join('|');
}

function parseGroups(m) {
    const set = new Set();
    if(m.group_name) m.group_name.split(',').forEach(g=> {if(g.trim()) set.add(g.trim())});
    ['group_1','group_2','group_3'].forEach(k=>{ if(m[k]&&m[k].trim()) set.add(m[k].trim())});
    return Array.from(set);
}

// [수정] 캐시 로드: 좌표와 체인구조만 불러옴
function loadLayoutCache(sig) {
    try {
        const raw = localStorage.getItem('layout_v3_light'); // 키 이름 변경 (구버전 충돌 방지)
        if(!raw) return null;
        
        const parsed = JSON.parse(raw);
        if(parsed.signature !== sig) return null; // 멤버 구성이 다르면 무효

        return { 
            positions: new Map(parsed.positions), 
            chain: parsed.chain 
        };
    } catch(e) { return null; }
}

// [수정] 캐시 저장: 멤버 상세정보(members)는 저장하지 않음! (용량 절약 & 정보 갱신 보장)
function saveLayoutCache(sig, positionsArr, chain) {
    // positionsArr가 Map이면 Array로 변환
    const posArray = (positionsArr instanceof Map) ? Array.from(positionsArr.entries()) : positionsArr;
    
    // chain 객체 내부의 members 배열도 ID만 남기거나 최소화하면 좋지만, 
    // 로직 단순화를 위해 chain 구조는 그대로 저장 (좌표 계산의 결과물이므로)
    const data = { 
        signature: sig, 
        positions: posArray, 
        chain: chain 
    };
    localStorage.setItem('layout_v3_light', JSON.stringify(data));
}


async function checkLiveReal(data) {
    // 1. 중복 ID 제거 및 타겟 목록 생성
    const uniqueIds = [...new Set(data.map(m => m.id))];
    const targets = uniqueIds.map(id => {
        const org = data.find(m => m.id === id);
        return { id: org.id, platform: org.platform };
    });

    // [UI] 시작 시: 제목 옆에 '로딩 중' 표시
    const titleDebugEl = document.getElementById('title-debug-info');
    if (titleDebugEl) {
        titleDebugEl.innerText = " ⏳ 업데이트 중...";
        titleDebugEl.style.color = "#888"; // 회색
    }

    try {
        // 2. 서버에 데이터 요청
        const res = await fetch('/api/streamer_data_repeater', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: targets })
        });

        // 3. 응답 대기 (여기서 시간이 걸림)
        const results = await res.json();

        // [UI] 성공 시: '완료' 및 시간 표시
        if (titleDebugEl) {
            titleDebugEl.innerText = ` ✅ 업데이트 완료 (${new Date().toLocaleTimeString()})`;
            titleDebugEl.style.color = "green"; // 초록색
        }

        // 4. 받아온 데이터로 카드 업데이트
        results.forEach(r => {
            const safeId = r.id.trim();
            // 해당 ID를 가진 모든 카드 선택 (멀티 그룹일 수 있으므로 All)
            const cards = document.querySelectorAll(`.card[data-id="${safeId}"]`);

            cards.forEach(c => {
                const badge = c.querySelector('.status-badge');
                const fanEl = c.querySelector('.fan-cnt');
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row');
                const profileImg = c.querySelector('.profile-img');
                const thumbEl = c.querySelector('.card-thumb'); // 썸네일 이미지 태그 (클래스명 확인 필요)

                // [디버그 로그] 성공/실패 여부 카드 구석에 표시
                const debugEl = c.querySelector('.debug-log');
                if (debugEl && r._debug) {
                    debugEl.innerText = r._debug;
                    // Fail 텍스트가 있으면 빨간색, 아니면 형광 초록
                    if (r._debug.toUpperCase().includes('FAIL')) {
                        debugEl.style.color = 'red';
                    } else {
                        debugEl.style.color = '#00ff00';
                    }
                }

                // [팬 수 업데이트]
                if (fanEl) fanEl.innerText = Number(r.fans || 0).toLocaleString();

                // [구독자 업데이트]
                if (subRow) {
                    if ((r.subscribers || 0) > 0) {
                        subRow.style.display = 'flex';
                        if (subEl) subEl.innerText = Number(r.subscribers).toLocaleString();
                    } else {
                        subRow.style.display = 'none';
                    }
                }

                // [프로필 이미지 업데이트]
                if (profileImg && r.profileUrl) {
                    if (profileImg.src !== r.profileUrl) profileImg.src = r.profileUrl;
                }

                // [라이브 상태 업데이트]
                if (r.isLive) {
                    // 방송 중 (ON)
                    c.classList.add('is-live');
                    if (badge) {
                        badge.innerText = "LIVE";
                        badge.classList.remove('badge-off');
                        badge.classList.add('badge-live');
                    }
                    // 썸네일/타이틀 업데이트
                    if (thumbEl && r.thumbnail) thumbEl.src = r.thumbnail;
                    
                } else {
                    // 방송 종료 (OFF)
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
        // [UI] 실패 시: 에러 메시지 표시
        if (titleDebugEl) {
            titleDebugEl.innerText = " ❌ 업데이트 실패";
            titleDebugEl.style.color = "red";
        }
    }
}




init();
