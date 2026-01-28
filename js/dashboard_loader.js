/* js/dashboard_loader.js */

import { renderCards, renderBalloons, renderFooter, adjustWrapperSize } from './renderer.js';

async function init() {
    try {
        // 1. [기본] 최신 멤버 리스트 가져오기
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

        // 푸터 렌더링
        renderFooter(noGroupNodes);

        // 2. [배치] 캐시 확인 및 그리기
        if (groupedNodes.length > 0) {
            const currentSignature = generateListSignature(groupedNodes);
            const cachedLayout = loadLayoutCache(currentSignature);

            if (cachedLayout) {
                console.log("⚡ [Cache] 좌표 캐시 적용");
                renderCards(cachedLayout.positions, groupedNodes);
                renderBalloons(cachedLayout.chain, cachedLayout.positions);
                adjustWrapperSize(cachedLayout.positions);
            } else {
                console.log("🐢 [Calc] 좌표 재계산");
                const calculator = await import('./layout_calculator.js'); 
                const result = calculator.calculateLayout(groupedNodes);
                
                renderCards(result.positions, groupedNodes);
                renderBalloons(result.chain, new Map(result.positions));
                adjustWrapperSize(result.positions);
                saveLayoutCache(currentSignature, result.positions, result.chain);
            }
        }

        // 3. [실시간] 라이브 상태 및 애청자 수 업데이트 (핵심 기능)
        checkLiveReal(data);

    } catch (e) { console.error("Loader Error:", e); }
}

// -------------------------------------------------------
// [핵심] 라이브 & 데이터 갱신 함수 (복잡한 로직 제거됨)
// -------------------------------------------------------
async function checkLiveReal(data) {
    // 중복 제거 후 타겟 설정
    const uniqueIds = [...new Set(data.map(m => m.id))];
    const targets = uniqueIds.map(id => {
        const org = data.find(m => m.id === id);
        return { id: org.id, platform: org.platform };
    });

    const titleDebugEl = document.getElementById('title-debug-info');
    if (titleDebugEl) {
        titleDebugEl.innerText = " ⏳ 조회 중...";
        titleDebugEl.style.color = "#888";
    }

    try {
        // API 호출 (단순화된 백엔드 호출)
        const res = await fetch('/api/streamer_data_repeater', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: targets })
        });

        const results = await res.json();

        if (titleDebugEl) {
            titleDebugEl.innerText = ` ✅ 업데이트 완료 (${new Date().toLocaleTimeString()})`;
            titleDebugEl.style.color = "green";
        }

        // 받아온 데이터로 화면 갱신 (사용자님이 성공했다던 그 로직)
        results.forEach(r => {
            const safeId = r.id.trim();
            const cards = document.querySelectorAll(`.card[data-id="${safeId}"]`);

            cards.forEach(c => {
                // 1. 애청자 수 업데이트
                const fanEl = c.querySelector('.fan-cnt');
                if (fanEl) fanEl.innerText = Number(r.fans || 0).toLocaleString();

                // 2. 구독자 수 업데이트 (없으면 숨김)
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row');
                if (subRow) {
                    if ((r.subscribers || 0) > 0) {
                        subRow.style.display = 'flex';
                        if (subEl) subEl.innerText = Number(r.subscribers).toLocaleString();
                    } else {
                        subRow.style.display = 'none';
                    }
                }

                // 3. 라이브 상태 & 배지 & 썸네일 업데이트
                const badge = c.querySelector('.status-badge');
                const thumbEl = c.querySelector('.card-thumb');
                const profileImg = c.querySelector('.profile-img');

                // 프사 갱신 (있을 경우만)
                if (profileImg && r.profileUrl) {
                    if (profileImg.src !== r.profileUrl) profileImg.src = r.profileUrl;
                }

                if (r.Liveon) {
                    // [방송 중]
                    c.classList.add('is-live');
                    if (badge) {
                        badge.innerText = "LIVE";
                        badge.classList.remove('badge-off');
                        badge.classList.add('badge-live');
                    }
                    if (thumbEl && r.thumbnail) thumbEl.src = r.thumbnail;
                } else {
                    // [방송 종료]
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

// -------------------------------------------------------
// 헬퍼 함수들 (캐시/그룹파싱)
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

function loadLayoutCache(sig) {
    try {
        const raw = localStorage.getItem('layout_v3_light');
        if(!raw) return null;
        const parsed = JSON.parse(raw);
        if(parsed.signature !== sig) return null;
        return { positions: new Map(parsed.positions), chain: parsed.chain };
    } catch(e) { return null; }
}

function saveLayoutCache(sig, positionsArr, chain) {
    const posArray = (positionsArr instanceof Map) ? Array.from(positionsArr.entries()) : positionsArr;
    const data = { signature: sig, positions: posArray, chain: chain };
    localStorage.setItem('layout_v3_light', JSON.stringify(data));
}

init();
