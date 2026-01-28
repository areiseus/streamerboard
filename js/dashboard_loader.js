/* js/dashboard_loader.js */

import { renderCards, renderBalloons, renderFooter, adjustWrapperSize } from './renderer.js';

async function init() {
    try {
        // 1. [Always Run] Get latest member info from DB (lightweight)
        const res = await fetch('/api/get_list');
        const data = await res.json();
        
        if (!data || data.length === 0) return;
        data.sort((a, b) => a.id.localeCompare(b.id));

        // Classify data
        const groupedNodes = [];
        const noGroupNodes = [];
        data.forEach(m => {
            m._groups = parseGroups(m);
            if (m._groups.length > 0) groupedNodes.push(m);
            else noGroupNodes.push(m);
        });

        // Render footer immediately
        renderFooter(noGroupNodes);

        // 2. [Check Cache] If there are grouped members
        if (groupedNodes.length > 0) {
            const currentSignature = generateListSignature(groupedNodes);
            
            // Load only 'coordinates' and 'chain' from cache
            const cachedLayout = loadLayoutCache(currentSignature);

            if (cachedLayout) {
                // [A] No changes -> Use cache
                console.log("⚡ [Smart Cache] Applying cached coordinates to latest DB info");
                
                renderCards(cachedLayout.positions, groupedNodes);
                renderBalloons(cachedLayout.chain, cachedLayout.positions);
                adjustWrapperSize(cachedLayout.positions);
            } else {
                // [B] Changes detected -> Recalculate
                console.log("🐢 [Recalculate] Member changes detected! Recalculating...");
                
                const calculator = await import('./layout_calculator.js'); 
                const result = calculator.calculateLayout(groupedNodes);
                
                renderCards(result.positions, groupedNodes);
                renderBalloons(result.chain, new Map(result.positions));
                adjustWrapperSize(result.positions);

                // Save only 'coordinates' and 'chain'
                saveLayoutCache(currentSignature, result.positions, result.chain);
            }
        }

        // 3. [Always Run] Check live status and viewer count (Real-time essential)
        checkLiveReal(data);

    } catch (e) { console.error("Loader Error:", e); }
}

// -------------------------------------------------------
// Helper Functions
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

// Load cache: retrieves coordinates and chain structure
function loadLayoutCache(sig) {
    try {
        const raw = localStorage.getItem('layout_v3_light');
        if(!raw) return null;
        
        const parsed = JSON.parse(raw);
        if(parsed.signature !== sig) return null;

        return { 
            positions: new Map(parsed.positions), 
            chain: parsed.chain 
        };
    } catch(e) { return null; }
}

// Save cache: does NOT save member details
function saveLayoutCache(sig, positionsArr, chain) {
    const posArray = (positionsArr instanceof Map) ? Array.from(positionsArr.entries()) : positionsArr;
    
    const data = { 
        signature: sig, 
        positions: posArray, 
        chain: chain 
    };
    localStorage.setItem('layout_v3_light', JSON.stringify(data));
}

// -------------------------------------------------------
// [Updated] Live & Data Check Function
// -------------------------------------------------------
async function checkLiveReal(data) {
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

        results.forEach(r => {
            const safeId = r.id.trim();
            const cards = document.querySelectorAll(`.card[data-id="${safeId}"]`);

            cards.forEach(c => {
                // -----------------------------------------------------------
                // [1] Debug Log (Force create if missing)
                // -----------------------------------------------------------
                let debugEl = c.querySelector('.debug-log');
                if (!debugEl) {
                    debugEl = document.createElement('div');
                    debugEl.className = 'debug-log';
                    c.appendChild(debugEl);
                }

                if (r._debug) {
                    debugEl.innerText = r._debug;
                    if (r._debug.toUpperCase().includes('FAIL')) {
                        debugEl.style.color = '#ff4444'; // Red
                    } else {
                        debugEl.style.color = '#00ff00'; // Green
                    }
                }

                // -----------------------------------------------------------
                // [2] Update Stats (Fan count, Subscribers)
                // -----------------------------------------------------------
                const fanEl = c.querySelector('.fan-cnt');
                const subEl = c.querySelector('.sub-cnt');
                const subRow = c.querySelector('.sub-row');

                // Update Fan Count
                if (fanEl) fanEl.innerText = Number(r.fans || 0).toLocaleString();

                // Update Subscriber Row (Hide if 0 or error)
                if (subRow) {
                    if ((r.subscribers || 0) > 0) {
                        subRow.style.display = 'flex';
                        if (subEl) subEl.innerText = Number(r.subscribers).toLocaleString();
                    } else {
                        subRow.style.display = 'none';
                    }
                }

                // -----------------------------------------------------------
                // [3] Update Live Status & UI
                // -----------------------------------------------------------
                const badge = c.querySelector('.status-badge');
                const profileImg = c.querySelector('.profile-img');
                const thumbEl = c.querySelector('.card-thumb');

                // Update Profile Image
                if (profileImg && r.profileUrl) {
                    if (profileImg.src !== r.profileUrl) profileImg.src = r.profileUrl;
                }

                if (r.isLive) {
                    // LIVE ON
                    c.classList.add('is-live');
                    if (badge) {
                        badge.innerText = "LIVE";
                        badge.classList.remove('badge-off');
                        badge.classList.add('badge-live');
                    }
                    if (thumbEl && r.thumbnail) thumbEl.src = r.thumbnail;
                } else {
                    // LIVE OFF
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

init();
