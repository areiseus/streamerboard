/* js/renderer.js */
const COLS = 5; 
const CARD_W = 260;    
const CARD_H = 210;    
const GRID_W = 340;    
const GRID_H = 260;    
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// 카드를 화면에 그림
export function renderCards(posMap, allMembers) {
    const overlay = document.getElementById('card-overlay');
    overlay.innerHTML = ''; 
    const fragment = document.createDocumentFragment();

    // posMap이 배열(캐시)로 올 수도 있고 Map(계산직후)으로 올 수도 있음
    const iterable = (posMap instanceof Map) ? posMap : new Map(posMap);

    iterable.forEach((pos, id) => {
        const member = allMembers.find(m => m.id === id);
        if(!member) return;
        const card = document.createElement('div');
        
        const isChzzk = !(member.platform === 'soop' || member.platform === 'afreeca');
        card.className = isChzzk ? 'card chzzk-theme' : 'card';
        
        card.setAttribute('data-id', id);
        card.style.left = pos.finalX + "px";
        card.style.top = pos.finalY + "px";
        
        card.innerHTML = getCardHTML(member).replace(/<div class="card-inner-wrapper.*?>/, '').replace(/<\/div>\s*$/, '');
        card.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openLink(member); };
        fragment.appendChild(card);
    });
    overlay.appendChild(fragment);
}

// 배경 풍선(그룹 선)을 그림
/* js/renderer.js */
// (나머지 코드는 동일, renderBalloons 부분만 확인)

export function renderBalloons(chain, posMap) {
    const svg = d3.select("#svg-layer");
    svg.selectAll("*").remove(); 
    
    const iterableMap = (posMap instanceof Map) ? posMap : new Map(posMap);
    const drawOrder = [...chain].sort((a, b) => b.size - a.size);

    drawOrder.forEach(g => {
        let points = [];
        let memberCount = 0;
        
        // chain에 저장된 members 목록을 순회
        // (주의: 여기 members는 캐시 저장 시점의 데이터일 수 있음. 
        //  하지만 우리는 ID만 보고 posMap에서 좌표를 찾으므로 상관없음!)
        const membersList = Array.isArray(g.members) ? g.members : [];
        
        membersList.forEach(m => {
            if(iterableMap.has(m.id)) {
                const pos = iterableMap.get(m.id);
                const padding = 10; 
                // ... 좌표 계산 로직 동일 ...
                const x = pos.finalX; 
                const y = pos.finalY;
                const w = CARD_W; 
                const h = CARD_H;
                points.push([x - padding, y - padding]);       
                points.push([x + w + padding, y - padding]);    
                points.push([x + w + padding, y + h + padding]); 
                points.push([x - padding, y + h + padding]);    
                memberCount++;
            }
        });
        
        // ... 폴리곤 그리기 로직 동일 ...
        if(memberCount === 0) return;
        const hull = d3.polygonHull(points);
        if(hull) {
             const color = colorScale(g.name);
             const line = d3.line().curve(d3.curveLinearClosed); 
             svg.append("path").attr("d", line(hull)).attr("class", "group-hull")
                .attr("fill", color).attr("stroke", color).attr("stroke-width", 20).attr("stroke-linejoin", "round"); 
             
             const topY = d3.min(hull, d=>d[1]);
             const centerX = d3.mean(hull, d=>d[0]);
             const labelY = topY - 20; 
             svg.append("text").attr("class", "group-label").attr("x", centerX).attr("y", labelY)
                .style("fill", color).text(g.name);
        }
    });
}
// ... 나머지 함수 동일 ...

// 하단 푸터(미분류) 그림
export function renderFooter(list) {
    const area = document.getElementById('footer-area');
    const grid = document.getElementById('no-group-grid');
    grid.innerHTML = ''; 
    if(!list || list.length === 0) { area.style.display = 'none'; return; }
    area.style.display = 'block';
    const fragment = document.createDocumentFragment();
    list.forEach(d => {
        const card = document.createElement('div');
        const isChzzk = !(d.platform === 'soop' || d.platform === 'afreeca');
        card.className = isChzzk ? 'card chzzk-theme' : 'card';
        card.innerHTML = getCardHTML(d).replace(/<div class="card-inner-wrapper.*?>/, '').replace(/<\/div>\s*$/, '');
        card.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openLink(d); };
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

// 컨테이너 크기 조정 (정렬 문제 해결용)
export function adjustWrapperSize(posMap) {
    const iterableMap = (posMap instanceof Map) ? posMap : new Map(posMap);
    let maxColsUsed = 0; 
    const rowCounts = {};
    
    iterableMap.forEach(pos => {
        if(!rowCounts[pos.relRow]) rowCounts[pos.relRow]=0;
        rowCounts[pos.relRow]++;
        if(rowCounts[pos.relRow] > maxColsUsed) maxColsUsed = rowCounts[pos.relRow];
    });

    const wrapper = document.getElementById('content-wrapper');
    const visualCols = Math.max(maxColsUsed, 1); 
    const totalVisualWidth = visualCols * GRID_W; 
    wrapper.style.width = (totalVisualWidth + 50) + "px"; 
}

// 내부 헬퍼 함수
function getCardHTML(d) {
    const pf = d.platform || 'soop';
    const isSoop = (pf === 'soop');
    const logoUrl = isSoop ? "https://res.sooplive.co.kr/images/svg/soop_logo.svg" : "https://ssl.pstatic.net/static/nng/glive/gif/logo_light.gif";
    const idDisplay = (!isSoop) ? 'display:none;' : '';
    const cardClass = isSoop ? '' : 'chzzk-theme';
    let groupListHTML = '';
    if(d._groups && d._groups.length > 0) {
        d._groups.forEach(g => {
            const dotColor = colorScale(g);
            groupListHTML += `<div class="group-item"><span class="group-dot" style="background-color: ${dotColor};"></span><span class="g-name">${g}</span></div>`;
        });
    }
    return `<div class="card-inner-wrapper ${cardClass}">
            <div class="card-left"><img src="${logoUrl}" class="platform-logo" loading="lazy"><div class="img-wrap"><img src="${d.profile_img||'https://via.placeholder.com/100'}" class="profile-img" loading="lazy"></div><div class="status-badge badge-off">OFF</div><div class="user-info-box"><div class="nick">${d.nickname}</div><div class="id-text" style="${idDisplay}">@${d.id}</div></div></div>
            <div class="card-right"><div class="group-list">${groupListHTML}</div><div class="stats-container"><div class="stat-row sub-row" style="display:none"><span class="stat-label">구독자</span> <span class="sub-cnt">-</span></div><div class="stat-row"><span class="stat-label">애청자</span> <span class="fan-cnt">0</span></div></div></div></div>`;
}
function openLink(d) {
    const isSoop = (d.platform==='soop');
    window.open(isSoop ? `https://www.sooplive.co.kr/${d.id}` : `https://chzzk.naver.com/live/${d.id}`);
}
