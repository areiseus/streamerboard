/* js/dashboard_loader.js */

// 그리기 도구는 항상 필요하므로 import
import { renderCards, renderBalloons, renderFooter, adjustWrapperSize } from './renderer.js';

async function init() {
    try {
        // 1. 데이터 가져오기 (매우 빠름)
        const res = await fetch('/api/get_list');
        const data = await res.json();
        if (!data || data.length === 0) return;

        data.sort((a, b) => a.id.localeCompare(b.id));

        // 2. 데이터 분류 (단순 로직이라 여기서 수행)
        const groupedNodes = [];
        const noGroupNodes = [];
        data.forEach(m => {
            m._groups = parseGroups(m);
            if (m._groups.length > 0) groupedNodes.push(m);
            else noGroupNodes.push(m);
        });

        // 3. 미분류(Footer)는 계산 불필요하므로 즉시 렌더링
        renderFooter(noGroupNodes);

        // 4. [핵심] 캐시 확인 및 분기 처리
        if (groupedNodes.length > 0) {
            const signature = generateListSignature(groupedNodes); // 현재 멤버 명단 Hash
            const cachedData = loadLayoutCache(signature);

            if (cachedData) {
                // [A] 캐시 적중: 계산기(layout_calculator.js) 안 부름! 바로 그림.
                console.log("⚡ 캐시 사용: 계산기 로딩 생략");
                renderCards(cachedData.positions, groupedNodes);
                renderBalloons(cachedData.chain, cachedData.positions);
                adjustWrapperSize(cachedData.positions);
            } else {
                // [B] 캐시 실패(인원 변동): 계산기 모듈을 동적으로 가져옴 (Dynamic Import)
                console.log("🐢 인원 변동 감지: 계산기 로딩 중...");
                
                // 여기서 layout_calculator.js를 불러옴
                const calculator = await import('./layout_calculator.js'); 
                
                // 계산 수행
                const result = calculator.calculateLayout(groupedNodes);
                
                // 결과 그리기
                renderCards(result.positions, groupedNodes);
                renderBalloons(result.chain, new Map(result.positions));
                adjustWrapperSize(result.positions);

                // 결과 캐시에 저장
                saveLayoutCache(signature, result.positions, result.chain);
            }
        }

        // 5. 라이브 상태 체크 (항상 수행)
        checkLiveReal(data);

    } catch (e) { console.error("Loader Error:", e); }
}

// 헬퍼: 멤버 명단으로 고유 키 생성
function generateListSignature(nodes) {
    return nodes.map(n => n.id).sort().join('|');
}
function parseGroups(m) {
    const set = new Set();
    if(m.group_name) m.group_name.split(',').forEach(g=> {if(g.trim()) set.add(g.trim())});
    ['group_1','group_2','group_3'].forEach(k=>{ if(m[k]&&m[k].trim()) set.add(m[k].trim())});
    return Array.from(set);
}

// 캐시 관리
function loadLayoutCache(sig) {
    try {
        const raw = localStorage.getItem('layout_v2');
        if(!raw) return null;
        const parsed = JSON.parse(raw);
        if(parsed.signature !== sig) return null; // 명단 다르면 무효
        return { positions: new Map(parsed.positions), chain: parsed.chain };
    } catch(e) { return null; }
}
function saveLayoutCache(sig, positionsArr, chain) {
    // positionsArr는 이미 [[id, pos], ...] 형태여야 함 (Map은 JSON저장 불가)
    const data = { signature: sig, positions: positionsArr, chain: chain };
    localStorage.setItem('layout_v2', JSON.stringify(data));
}

// 라이브 체크 (기존과 동일)
async function checkLiveReal(data) {
    const uniqueIds = [...new Set(data.map(m=>m.id))];
    const targets = uniqueIds.map(id => {
        const org = data.find(m=>m.id===id);
        return {id: org.id, platform: org.platform};
    });
    try {
        const res = await fetch('/api/streamer_data_repeater', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({items: targets})
        });
        const results = await res.json();
        results.forEach(r => {
            const cards = document.querySelectorAll(`.card[data-id="${r.id.trim()}"]`);
            cards.forEach(c => {
                const badge = c.querySelector('.status-badge');
                const fanEl = c.querySelector('.fan-cnt');
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row');
                
                if(fanEl) fanEl.innerText = Number(r.fans||0).toLocaleString();
                if(subRow) {
                    if((r.subscribers||0) > 0) {
                        subRow.style.display = 'flex';
                        if(subEl) subEl.innerText = Number(r.subscribers).toLocaleString();
                    } else { subRow.style.display = 'none'; }
                }
                if(r.isLive) {
                    c.classList.add('is-live');
                    if(badge) { badge.innerText = "LIVE"; badge.classList.remove('badge-off'); badge.classList.add('badge-live'); }
                } else {
                    c.classList.remove('is-live');
                    if(badge) { badge.innerText = "OFF"; badge.classList.remove('badge-live'); badge.classList.add('badge-off'); }
                }
            });
        });
    } catch(e) {}
}

init();
