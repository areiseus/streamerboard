/* js/dashboard_main.js */

const COLS = 5; 
const CARD_W = 260;    
const CARD_H = 210;    
const GRID_W = 340;    
const GRID_H = 260;    

const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

async function init() {
    try {
        const res = await fetch('/api/get_list');
        const data = await res.json();
        
        if (!data || data.length === 0) return;

        data.sort((a, b) => a.id.localeCompare(b.id));

        const groupedNodes = [];
        const noGroupNodes = [];

        data.forEach(m => {
            m._groups = parseGroups(m);
            m.totalGroupCount = m._groups.length; 
            if (m._groups.length > 0) groupedNodes.push(m);
            else noGroupNodes.push(m);
        });

        renderFooter(noGroupNodes);
        if (groupedNodes.length > 0) {
            runLogic(groupedNodes);
        }

        checkLiveReal(data);

    } catch (e) { console.error("Init Error:", e); }
}

function runLogic(members) {
    const groupMap = {};
    members.forEach(m => {
        m._groups.forEach(gName => {
            if(!groupMap[gName]) groupMap[gName] = { name: gName, members: [], connScore: 0 };
            groupMap[gName].members.push(m);
        });
    });
    const groups = Object.values(groupMap);

    groups.forEach(g => {
        let score = 0;
        g.members.forEach(m => { if(m.totalGroupCount > 1) score += (m.totalGroupCount - 1); });
        g.connScore = score;
        g.size = g.members.length;
    });

    groups.sort((a, b) => {
        if (b.connScore !== a.connScore) return b.connScore - a.connScore;
        if (b.size !== a.size) return b.size - a.size;
        return a.name.localeCompare(b.name);
    });
    
    const groupA = groups[0];
    const chain = [groupA]; 
    const placedGroups = new Set([groupA.name]);
    let remaining = groups.slice(1);
    let topRef = groupA, btmRef = groupA;

    while(remaining.length > 0) {
        let bestUp = findBestNeighbor(topRef, remaining);
        if(bestUp) {
            chain.unshift(bestUp); placedGroups.add(bestUp.name);
            remaining = remaining.filter(g => g.name !== bestUp.name);
            topRef = bestUp;
        }
        if(remaining.length > 0) {
            let bestDown = findBestNeighbor(btmRef, remaining);
            if(bestDown) {
                chain.push(bestDown); placedGroups.add(bestDown.name);
                remaining = remaining.filter(g => g.name !== bestDown.name);
                btmRef = bestDown;
            }
        }
        if(!bestUp && !bestDown && remaining.length > 0) {
            const orphan = remaining.shift();
            chain.push(orphan);
            btmRef = orphan;
        }
    }

    const placedMemberIds = new Set();
    const memberPositions = new Map();
    const idxA = chain.indexOf(groupA);
    let upperRowCursor = 0;
    let lowerRowCursor = Math.ceil(groupA.members.filter(m=>true).length / COLS);
    if(groupA.members.length===0) lowerRowCursor=0;

    groupA.members.sort((a, b) => {
        if(a.totalGroupCount !== b.totalGroupCount) return a.totalGroupCount - b.totalGroupCount;
        return a.id.localeCompare(b.id);
    });
    {
        const newMembers = groupA.members.filter(m => !placedMemberIds.has(m.id));
        newMembers.forEach((m, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            memberPositions.set(m.id, { relRow: row, col: col });
            placedMemberIds.add(m.id);
        });
    }

    // (위쪽으로 확장)
    for(let i = idxA - 1; i >= 0; i--) {
        const g = chain[i];
        g.members.sort((a, b) => sortMembers(a, b, memberPositions));
        const newMembers = g.members.filter(m => !placedMemberIds.has(m.id));
        if(newMembers.length > 0) {
            const rowsNeeded = Math.ceil(newMembers.length / COLS);
            upperRowCursor -= rowsNeeded;
            newMembers.forEach((m, idx) => {
                const col = idx % COLS;
                const row = upperRowCursor + Math.floor(idx / COLS);
                memberPositions.set(m.id, { relRow: row, col: col });
                placedMemberIds.add(m.id);
            });
        }
    }

    // (아래쪽으로 확장)
    for(let i = idxA + 1; i < chain.length; i++) {
        const g = chain[i];
        g.members.sort((a, b) => sortMembers(a, b, memberPositions));
        const newMembers = g.members.filter(m => !placedMemberIds.has(m.id));
        if(newMembers.length > 0) {
            const rowsNeeded = Math.ceil(newMembers.length / COLS);
            newMembers.forEach((m, idx) => {
                const col = idx % COLS;
                const row = lowerRowCursor + Math.floor(idx / COLS);
                memberPositions.set(m.id, { relRow: row, col: col });
                placedMemberIds.add(m.id);
            });
            lowerRowCursor += rowsNeeded;
        }
    }

    // [레이아웃 계산]
    let minRow = Infinity, maxRow = -Infinity;
    memberPositions.forEach(pos => {
        if(pos.relRow < minRow) minRow = pos.relRow;
        if(pos.relRow > maxRow) maxRow = pos.relRow;
    });

    // 각 행에 몇 개가 있는지 카운트 (최대 너비 계산용)
    const rowCounts = {};
    let maxColsUsed = 0; // [NEW] 실제 사용된 최대 열 개수
    memberPositions.forEach(pos => {
        if(!rowCounts[pos.relRow]) rowCounts[pos.relRow]=0;
        rowCounts[pos.relRow]++;
        if(rowCounts[pos.relRow] > maxColsUsed) maxColsUsed = rowCounts[pos.relRow];
    });

    const rowShift = -minRow;
    const totalRows = maxRow - minRow + 1;
    const wrapper = document.getElementById('content-wrapper');
    const containerH = Math.max(800, totalRows * GRID_H + 300);
    wrapper.style.height = containerH + "px";
    
    // [핵심 수정] 실제 사용된 열 개수만큼만 너비를 잡음 -> 여백 최소화
    // COLS(5) 대신 maxColsUsed를 사용
    const visualCols = Math.max(maxColsUsed, 1); 
    const totalVisualWidth = visualCols * GRID_W; 
    wrapper.style.width = (totalVisualWidth + 50) + "px"; 

    const contentHeight = totalRows * GRID_H;
    const startY = (containerH - contentHeight) / 2;

    // 카드 배치
    memberPositions.forEach(pos => {
        const countInRow = rowCounts[pos.relRow];
        const rowWidth = countInRow * GRID_W;
        // 중앙 정렬 기준점도 '시각적 최대 너비'를 기준으로 잡음
        const startX = (totalVisualWidth - rowWidth) / 2;
        const cellOffsetX = (GRID_W - CARD_W) / 2;
        
        pos.finalX = startX + pos.col * GRID_W + cellOffsetX;
        pos.finalY = startY + (pos.relRow + rowShift) * GRID_H;
    });

    renderCards(memberPositions, members);
    renderBalloons(chain, memberPositions);
}

function sortMembers(a, b, posMap) {
    const colA = getTargetColumn(a, posMap);
    const colB = getTargetColumn(b, posMap);
    if (colA !== 99 && colB !== 99) return colA - colB;
    if (colA !== 99) return 1; 
    if (colA === 99 && colB !== 99) return -1;
    return a.id.localeCompare(b.id);
}
function getTargetColumn(member, posMap) {
    if(posMap.has(member.id)) return posMap.get(member.id).col;
    return 99;
}
function findBestNeighbor(baseGroup, candidates) {
    let best = null; let maxOverlap = -1;
    candidates.forEach(cand => {
        const overlap = cand.members.filter(cm => baseGroup.members.some(bm => bm.id === cm.id)).length;
        if(overlap > maxOverlap) { maxOverlap = overlap; best = cand; }
    });
    return maxOverlap > 0 ? best : null;
}

function getCardHTML(d) {
    const pf = d.platform || 'soop';
    const isSoop = (pf === 'soop' || pf === 'afreeca');
    const logoUrl = isSoop 
        ? "https://res.sooplive.co.kr/images/svg/soop_logo.svg" 
        : "https://ssl.pstatic.net/static/nng/glive/gif/logo_light.gif";
    const idDisplay = (!isSoop) ? 'display:none;' : '';
    const cardClass = isSoop ? '' : 'chzzk-theme';

    let groupListHTML = '';
    if(d._groups && d._groups.length > 0) {
        d._groups.forEach(g => {
            const dotColor = colorScale(g);
            groupListHTML += `<div class="group-item">
                                <span class="group-dot" style="background-color: ${dotColor};"></span>
                                <span class="g-name">${g}</span>
                              </div>`;
        });
    }

    return `
        <div class="card-inner-wrapper ${cardClass}" style="display:contents">
            <div class="card-left">
                <img src="${logoUrl}" class="platform-logo" alt="${pf}" loading="lazy">
                <div class="img-wrap">
                    <img src="${d.profile_img || 'https://via.placeholder.com/100'}" class="profile-img" loading="lazy">
                </div>
                <div class="status-badge badge-off">OFF</div>
                <div class="user-info-box">
                    <div class="nick">${d.nickname}</div>
                    <div class="id-text" style="${idDisplay}">@${d.id}</div>
                </div>
            </div>
            <div class="card-right">
                <div class="group-list">${groupListHTML}</div>
                <div class="stats-container">
                    <div class="stat-row sub-row" style="display:none">
                        <span class="stat-label">구독자</span> <span class="sub-cnt">-</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">애청자</span> <span class="fan-cnt">0</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCards(posMap, allMembers) {
    const overlay = document.getElementById('card-overlay');
    overlay.innerHTML = ''; 
    const fragment = document.createDocumentFragment();

    posMap.forEach((pos, id) => {
        const member = allMembers.find(m => m.id === id);
        if(!member) return;
        const card = document.createElement('div');
        
        // 초기 테마 설정
        const isChzzk = !(member.platform === 'soop' || member.platform === 'afreeca');
        card.className = isChzzk ? 'card chzzk-theme' : 'card';
        
        card.setAttribute('data-id', id);
        card.style.left = pos.finalX + "px";
        card.style.top = pos.finalY + "px";
        
        const innerHTML = getCardHTML(member).replace('<div class="card-inner-wrapper " style="display:contents">', '').replace('<div class="card-inner-wrapper chzzk-theme" style="display:contents">', '').replace(/<\/div>\s*$/, '');
        card.innerHTML = innerHTML;

        card.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openLink(member); };
        fragment.appendChild(card);
    });
    overlay.appendChild(fragment); 
}

function renderBalloons(chain, posMap) {
    const svg = d3.select("#svg-layer");
    svg.selectAll("*").remove(); 
    
    const drawOrder = [...chain].sort((a, b) => b.size - a.size);
    const labelPositions = []; 

    drawOrder.forEach(g => {
        let points = [];
        let memberCount = 0;
        g.members.forEach(m => {
            if(posMap.has(m.id)) {
                const pos = posMap.get(m.id);
                const padding = 10; 
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
        if(memberCount === 0) return;

        const hull = d3.polygonHull(points);
        if(hull) {
            const color = colorScale(g.name);
            const line = d3.line().curve(d3.curveLinearClosed); 

            svg.append("path")
                .attr("d", line(hull))
                .attr("class", "group-hull")
                .attr("fill", color)
                .attr("stroke", color)
                .attr("stroke-width", 20)
                .attr("stroke-linejoin", "round"); 

            const topY = d3.min(hull, d=>d[1]);
            let centerX = d3.mean(hull, d=>d[0]);
            let labelY = topY - 20; 
            let overlap = false;
            for(let lp of labelPositions) {
                if(Math.abs(lp.x - centerX) < 150 && Math.abs(lp.y - labelY) < 50) {
                    overlap = true; break;
                }
            }
            if(overlap) labelY = d3.max(hull, d=>d[1]) + 40;
            labelPositions.push({x: centerX, y: labelY});

            svg.append("text")
                .attr("class", "group-label")
                .attr("x", centerX)
                .attr("y", labelY)
                .style("fill", color)
                .text(g.name);
        }
    });
}

function renderFooter(list) {
    const area = document.getElementById('footer-area');
    const grid = document.getElementById('no-group-grid');
    grid.innerHTML = ''; 
    if(list.length === 0) { area.style.display = 'none'; return; }
    area.style.display = 'block';
    
    const fragment = document.createDocumentFragment();
    list.forEach(d => {
        const card = document.createElement('div');
        const isChzzk = !(d.platform === 'soop' || d.platform === 'afreeca');
        card.className = isChzzk ? 'card chzzk-theme' : 'card';
        const innerHTML = getCardHTML(d).replace('<div class="card-inner-wrapper " style="display:contents">', '').replace('<div class="card-inner-wrapper chzzk-theme" style="display:contents">', '').replace(/<\/div>\s*$/, '');
        card.innerHTML = innerHTML;
        card.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openLink(d); };
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

function openLink(d) {
    const isSoop = (d.platform==='soop'||d.platform==='afreeca');
    window.open(isSoop ? `https://play.afreecatv.com/${d.id}` : `https://chzzk.naver.com/live/${d.id}`);
}
function parseGroups(m) {
    const set = new Set();
    if(m.group_name) m.group_name.split(',').forEach(g=> {if(g.trim()) set.add(g.trim())});
    ['group_1','group_2','group_3'].forEach(k=>{ if(m[k]&&m[k].trim()) set.add(m[k].trim())});
    return Array.from(set);
}

async function checkLiveReal(data) {
    const uniqueIds = [...new Set(data.map(m=>m.id))];
    const targets = uniqueIds.map(id => {
        const org = data.find(m=>m.id===id);
        return {id: org.id, platform: org.platform};
    });
    
    try {
        const res = await fetch('/api/streamer_data_repeater', { 
                 method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({items: targets})
        });

        const results = await res.json();
        
        results.forEach(r => {
            // ID 공백 제거 후 매칭
            const safeId = r.id.trim();
            const cards = document.querySelectorAll(`.card[data-id="${safeId}"]`);
            
            cards.forEach(c => {
                const badge = c.querySelector('.status-badge');
                const fanEl = c.querySelector('.fan-cnt');
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row');
                
                const fanCount = (r.fans !== undefined && r.fans !== null) ? r.fans : 0;
                const subCount = (r.subscribers !== undefined && r.subscribers !== null) ? r.subscribers : 0;
                
                if(fanEl) fanEl.innerText = Number(fanCount).toLocaleString();
                
                if(subRow) {
                    if(subCount > 0) {
                        subRow.style.display = 'flex';
                        if(subEl) subEl.innerText = Number(subCount).toLocaleString();
                    } else {
                        subRow.style.display = 'none';
                    }
                }

                // [ON/OFF 로직 수정] 확실하게 클래스 교체
                if(r.isLive) {
                    c.classList.add('is-live');
                    if(badge) {
                        badge.innerText = "LIVE";
                        badge.classList.remove('badge-off');
                        badge.classList.add('badge-live');
                    }
                } else {
                    c.classList.remove('is-live');
                    if(badge) {
                        badge.innerText = "OFF";
                        badge.classList.remove('badge-live');
                        badge.classList.add('badge-off');
                    }
                }
            });
        });
    } catch(e) { console.error('API Error:', e); }
}

init();
