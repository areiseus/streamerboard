/* js/layout_calculator.js */
const COLS = 5; 
const GRID_W = 340;    
const GRID_H = 260;    
const CARD_W = 260;

export function calculateLayout(members) {
    // 1. 그룹핑 및 정렬
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
    groups.sort((a, b) => (b.connScore - a.connScore) || (b.size - a.size) || a.name.localeCompare(b.name));
    
    // 2. 체인 알고리즘
    if(groups.length === 0) return { memberPositions: [], chain: [] };

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

    // 3. 좌표 계산
    const placedMemberIds = new Set();
    const memberPositions = []; // Map 대신 배열로 저장 (JSON 직렬화 및 renderer 전달 용이성)
    const idxA = chain.indexOf(groupA);
    let upperRowCursor = 0;
    let lowerRowCursor = Math.ceil(groupA.members.length / COLS) || 0;

    // A그룹 배치
    placeGroup(groupA, 0); 
    function placeGroup(g, rowBase) {
        // 내부 정렬은 이미 되어있다고 가정하거나 여기서 수행
        const newMembers = g.members.filter(m => !placedMemberIds.has(m.id));
        newMembers.forEach((m, i) => {
            const col = i % COLS;
            const row = rowBase + Math.floor(i / COLS);
            memberPositions.push([m.id, { relRow: row, col: col }]);
            placedMemberIds.add(m.id);
        });
        return Math.ceil(newMembers.length / COLS);
    }

    // 위쪽 확장
    for(let i = idxA - 1; i >= 0; i--) {
        const rows = placeGroup(chain[i], upperRowCursor - Math.ceil(chain[i].members.filter(m=>!placedMemberIds.has(m.id)).length/COLS));
        upperRowCursor -= rows;
    }
    // 아래쪽 확장
    for(let i = idxA + 1; i < chain.length; i++) {
        const rows = placeGroup(chain[i], lowerRowCursor);
        lowerRowCursor += rows;
    }

    // 4. 최종 좌표 보정 (음수 좌표 제거 및 중앙 정렬 계산)
    let minRow = Infinity, maxRow = -Infinity;
    memberPositions.forEach(entry => {
        const pos = entry[1];
        if(pos.relRow < minRow) minRow = pos.relRow;
        if(pos.relRow > maxRow) maxRow = pos.relRow;
    });

    const rowCounts = {};
    let maxColsUsed = 0;
    memberPositions.forEach(entry => {
        const pos = entry[1];
        if(!rowCounts[pos.relRow]) rowCounts[pos.relRow]=0;
        rowCounts[pos.relRow]++;
        if(rowCounts[pos.relRow] > maxColsUsed) maxColsUsed = rowCounts[pos.relRow];
    });

    const rowShift = -minRow;
    const totalRows = maxRow - minRow + 1;
    const visualCols = Math.max(maxColsUsed, 1); 
    const totalVisualWidth = visualCols * GRID_W; 
    const containerH = Math.max(800, totalRows * GRID_H + 300);
    const contentHeight = totalRows * GRID_H;
    const startY = (containerH - contentHeight) / 2;

    memberPositions.forEach(entry => {
        const pos = entry[1];
        const countInRow = rowCounts[pos.relRow];
        const rowWidth = countInRow * GRID_W;
        const startX = (totalVisualWidth - rowWidth) / 2;
        const cellOffsetX = (GRID_W - CARD_W) / 2;
        
        pos.finalX = startX + pos.col * GRID_W + cellOffsetX;
        pos.finalY = startY + (pos.relRow + rowShift) * GRID_H;
    });

    return { 
        positions: memberPositions, // [ [id, {x,y}], ... ] 형태
        chain: chain,
        visualWidth: totalVisualWidth 
    };
}

function findBestNeighbor(baseGroup, candidates) {
    let best = null; let maxOverlap = -1;
    candidates.forEach(cand => {
        const overlap = cand.members.filter(cm => baseGroup.members.some(bm => bm.id === cm.id)).length;
        if(overlap > maxOverlap) { maxOverlap = overlap; best = cand; }
    });
    return maxOverlap > 0 ? best : null;
}
