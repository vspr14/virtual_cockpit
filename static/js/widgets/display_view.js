/* Displays tab: live cockpit screens streamed from the sim (markup: templates/widgets/display_view.html).
   - no toolbar: tapping the open DISPLAYS tab again (tabTapped) opens a small menu with the screen toggles (saved
     per aircraft on this device), ARRANGE, AUTO LAYOUT and SETUP; the screens get the whole stage
   - AUTO layout: the aircraft's preset (displays.json "layout": a cols x rows grid of equal tiles in the screens'
     true shape, touching, as large as the stage allows, filling its height when that's the limit; unused rows/columns drop
     out; used when every selected screen has a cell), otherwise the tiles as large as the stage allows (best rows x
     columns for the count and aspect ratios)
   - ARRANGE: drag a tile to move it, its corner handle to resize (aspect ratio kept, edges snap to the stage and
     to the other tiles); the arrangement is saved on this device, AUTO goes back to the automatic layout
   - each tile asks the server for exactly its on-screen pixel width, so nothing bigger than needed is sent
   - Setup assigns the sim's pop-out windows to displays, and calibrates the automatic pop-out (a ChasePlane view and
     where each screen is in it; the server then pops them out like Pop Out Panel Manager, on demand or when a flight
     starts)
   - web tiles (displays.json "web": {id, label, name, url with {host} = this server's host}) show the aircraft's own
     web page (e.g. the Fenix EFB) in an iframe: live and touchable, nothing streamed; its button grows it to the
     whole stage and back
   Aircraft-agnostic: the display list comes from aircraft/<id>/displays.json via data-config. */
import {
    assignDisplay, displayWindows, displayWindowThumbUrl, popoutPicture, popoutSettings, popoutViews, runPopout,
} from '../core/api.js';
import { createDisplayStream } from '../core/display_stream.js';
import { fastTap } from '../core/touch.js';

const GAP_PX = 6;
const SNAP_PX = 14;
const MIN_TILE_PX = 120;
const STATUS_TEXT = {
    unassigned: 'Not set up yet: tap DISPLAYS, then SETUP.',
    missing: 'Pop-out not found. In the sim hold Right-Alt and click this screen, then pick it in SETUP.',
    minimized: 'The pop-out window is minimized.',
    idle: 'Connecting…',
    starting: 'Connecting…',
    stale: 'No picture from the sim.',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Largest tile width for n tiles of aspect a (w/h) in W x H: try every column count. */
export function bestGrid(n, W, H, aspect = 1, gap = GAP_PX) {
    let best = { cols: 1, rows: n, tileW: 0 };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const byW = (W - gap * (cols - 1)) / cols;
        const byH = ((H - gap * (rows - 1)) / rows) * aspect;
        const tileW = Math.floor(Math.min(byW, byH));
        if (tileW > best.tileW) best = { cols, rows, tileW };
    }
    return best;
}

/* Nearest snap of a span [pos, pos + size) to the lines (stage edges, other tiles' edges), or pos. */
function snapSpan(pos, size, lines) {
    let best = pos;
    let dist = SNAP_PX;
    for (const line of lines) {
        for (const cand of [line, line + GAP_PX, line - size, line - size - GAP_PX]) {
            const d = Math.abs(cand - pos);
            if (d < dist) { dist = d; best = cand; }
        }
    }
    return best;
}

export function initDisplayView(root, { aircraftId, fps = 30, quality = 80 } = {}) {
    if (!root) return { show() {}, hide() {}, tabTapped() {} };
    const cfg = JSON.parse(root.dataset.config || '{}');
    const screenDefs = cfg.displays || [];   // streamed from the sim's pop-outs
    const webDefs = (cfg.web || []).map((d) => ({ aspect: 2, ...d, web: true }));
    const defs = [...screenDefs, ...webDefs];
    const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    const stage = root.querySelector('.display-stage');
    const chips = [...root.querySelectorAll('[data-display]')];
    const setupBtn = root.querySelector('.display-setup-btn');
    const arrangeBtn = root.querySelector('.display-arrange-btn');
    const autoBtn = root.querySelector('.display-auto-btn');
    const menu = root.querySelector('.display-menu');
    const arrangeAuto = root.querySelector('.display-arrange-auto');
    const arrangeDone = root.querySelector('.display-arrange-done');
    const setup = root.querySelector('.display-setup');
    const storageKey = `vc.displays.${aircraftId}`;
    const layoutKey = `vc.displays.${aircraftId}.layout2`;   // .layout (before the preset) is dropped
    const tiles = new Map();   // id -> { el, img, overlay, url, busy, next, aspect }
    const rects = new Map();   // id -> { x, y, w, h } in stage pixels
    let visible = false;
    let arranging = false;
    let dragging = false;
    let topZ = 1;
    let expanded = null;   // id of the web tile grown to the whole stage
    let status = {};
    let lastSubs = '';

    const load = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (e) { return fallback; }
    };
    const store = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    };

    function loadSelection() {
        const saved = load(storageKey, null);
        if (Array.isArray(saved)) return saved.filter((id) => byId[id]);
        return (cfg.default || defs.slice(0, 2).map((d) => d.id)).filter((id) => byId[id]);
    }
    let selected = loadSelection();
    /* { custom: bool, tiles: { id: { x, y, w } } }: fractions of the stage width (x, w) and height (y). */
    let arrangement = load(layoutKey, null) || { custom: false, tiles: {} };

    const stream = createDisplayStream(aircraftId, {
        onFrame(id, blob, meta) {
            const t = tiles.get(id);
            if (!t) return;
            const a = meta && meta.height ? meta.width / meta.height : null;
            if (a && Math.abs(a - t.aspect) / t.aspect > 0.01) {   // the real picture's shape wins over the config
                t.aspect = a;
                layout();
            }
            if (t.busy) { t.next = blob; return; }   // keep only the newest while one decodes
            paint(t, blob);
        },
        onStatus(st) {
            status = st;
            tiles.forEach((t, id) => renderStatus(t, id));
        },
    });

    function paint(t, blob) {
        t.busy = true;
        const url = URL.createObjectURL(blob);
        const done = () => {
            if (t.url) URL.revokeObjectURL(t.url);
            t.url = url;
            t.busy = false;
            t.el.classList.add('has-frame');
            if (t.next) { const b = t.next; t.next = null; paint(t, b); }
        };
        t.img.onload = done;
        t.img.onerror = done;
        t.img.src = url;
    }

    function renderStatus(t, id) {
        if (t.web) return;
        const st = (status[id] || {}).state;
        const text = STATUS_TEXT[st];
        const showText = text && !((st === 'starting' || st === 'idle') && t.el.classList.contains('has-frame'));
        t.overlay.innerHTML = showText
            ? `<div class="display-tile-name">${esc(byId[id].name || byId[id].label)}</div><div>${esc(text)}</div>` : '';
        t.overlay.classList.toggle('hidden', !showText);
    }

    function makeWebTile(id) {
        const el = document.createElement('div');
        el.className = 'display-tile display-tile-web';
        el.dataset.display = id;
        const frame = document.createElement('iframe');
        frame.title = byId[id].name || byId[id].label;
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'display-tile-expand';
        expand.setAttribute('aria-label', 'Expand');
        expand.textContent = '\u2922';
        fastTap(expand);
        expand.addEventListener('click', () => {
            expanded = expanded === id ? null : id;
            layout();
        });
        const label = document.createElement('div');
        label.className = 'display-tile-label';
        label.textContent = byId[id].label;
        const handle = document.createElement('div');
        handle.className = 'display-tile-handle';
        handle.setAttribute('aria-hidden', 'true');
        el.append(frame, expand, label, handle);
        const t = { el, frame, expand, web: true, aspect: byId[id].aspect };
        bindDrag(id, t, handle);
        return t;
    }

    /* Loaded the first time the tab shows it, then kept (hidden with the tab: no drawing, its state kept). */
    function loadWeb(t, id) {
        if (!t.web || t.frame.getAttribute('src')) return;
        t.frame.src = String(byId[id].url || '').replace('{host}', location.hostname);
    }

    function makeTile(id) {
        if (byId[id].web) return makeWebTile(id);
        const el = document.createElement('div');
        el.className = 'display-tile';
        el.dataset.display = id;
        const img = document.createElement('img');
        img.alt = byId[id].label;
        img.decoding = 'async';
        img.draggable = false;
        const overlay = document.createElement('div');
        overlay.className = 'display-tile-status';
        const label = document.createElement('div');
        label.className = 'display-tile-label';
        label.textContent = byId[id].label;
        const handle = document.createElement('div');
        handle.className = 'display-tile-handle';
        handle.setAttribute('aria-hidden', 'true');
        el.append(img, overlay, label, handle);
        const t = { el, img, overlay, url: null, busy: false, next: null, aspect: byId[id].aspect || 1 };
        bindDrag(id, t, handle);
        renderStatus(t, id);
        return t;
    }

    function order() {
        return defs.map((d) => d.id).filter((id) => selected.includes(id));
    }

    function render() {
        chips.forEach((c) => {
            const on = selected.includes(c.dataset.display);
            c.classList.toggle('active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const ids = order();
        tiles.forEach((t, id) => {
            if (!ids.includes(id)) {
                if (t.url) URL.revokeObjectURL(t.url);
                t.el.remove();
                tiles.delete(id);
                rects.delete(id);
            }
        });
        ids.forEach((id) => {
            if (!tiles.has(id)) tiles.set(id, makeTile(id));
            if (!tiles.get(id).el.parentNode) stage.appendChild(tiles.get(id).el);
            if (visible) loadWeb(tiles.get(id), id);
        });
        if (expanded && !ids.includes(expanded)) expanded = null;
        stage.classList.toggle('is-empty', ids.length === 0);
        layout();
    }

    /* ---------- layout ---------- */

    /* The preset: equal tiles in the screens' true shape (the widest one's) on its grid, as large as the stage allows.
       Only the rows and columns the selection uses count, so e.g. PFD + ND alone get one bigger row. When the height
       is what limits them the rows fill it exactly (top row at the top, bottom row at the bottom); otherwise the
       block is centred. Across, it's centred with the normal gap. null if the preset doesn't cover the selection. */
    function presetRects(ids, W, H) {
        const p = cfg.layout;
        if (!p || !p.cells || !ids.every((id) => p.cells[id])) return null;
        const span = (id) => p.cells[id][2] || 1;   // [column, row, columns spanned]
        const colsUsed = [...new Set(ids.flatMap((id) => Array.from({ length: span(id) }, (_, k) => p.cells[id][0] + k)))]
            .sort((x, y) => x - y);
        const rowsUsed = [...new Set(ids.map((id) => p.cells[id][1]))].sort((x, y) => x - y);
        const gap = 0;   // screens butt together: any strip between them read as a separator on the iPad
        const cols = colsUsed.length;
        const rows = rowsUsed.length;
        const screens = ids.filter((id) => !byId[id].web);   // web tiles take any shape: the screens set the size
        const a = screens.length ? Math.max(...screens.map((id) => tiles.get(id).aspect)) : 1;
        const byW = (W - gap * (cols - 1)) / cols;
        const byH = ((H - gap * (rows - 1)) / rows) * a;
        const w = Math.floor(Math.min(byW, byH));
        const h = Math.floor(w / a);
        const x0 = Math.floor((W - cols * w - gap * (cols - 1)) / 2);
        const spare = H - rows * h - gap * (rows - 1);
        const heightBound = byH <= byW;
        const y0 = heightBound ? 0 : Math.floor(spare / 2);
        const gapY = heightBound && rows > 1 ? gap + spare / (rows - 1) : gap;   // soaks up the rounding (<1px)
        const out = new Map();
        ids.forEach((id) => {
            const c = colsUsed.indexOf(p.cells[id][0]);
            const r = rowsUsed.indexOf(p.cells[id][1]);
            const y = Math.round(y0 + r * (h + gapY));
            if (byId[id].web) {   // the whole cell (all spanned columns)
                const n = span(id);
                out.set(id, { x: x0 + c * (w + gap), y, w: n * w + (n - 1) * gap, h });
            } else {
                out.set(id, { x: x0 + c * (w + gap), y, w, h: Math.round(w / tiles.get(id).aspect) });
            }
        });
        return out;
    }

    function autoRects(ids, W, H) {
        const preset = presetRects(ids, W, H);
        if (preset) return preset;
        const out = new Map();
        const aspect = ids.reduce((a, id) => a + tiles.get(id).aspect, 0) / ids.length;
        const g = bestGrid(ids.length, W, H, aspect);
        const rowsH = [];
        ids.forEach((id, i) => {
            const r = Math.floor(i / g.cols);
            rowsH[r] = Math.max(rowsH[r] || 0, Math.round(g.tileW / tiles.get(id).aspect));
        });
        const totalH = rowsH.reduce((a, h) => a + h, 0) + GAP_PX * (rowsH.length - 1);
        let y = Math.max(0, Math.floor((H - totalH) / 2));
        for (let r = 0; r < rowsH.length; r++) {
            const row = ids.slice(r * g.cols, (r + 1) * g.cols);
            const rowW = row.length * g.tileW + GAP_PX * (row.length - 1);
            let x = Math.max(0, Math.floor((W - rowW) / 2));
            row.forEach((id) => {
                const h = Math.round(g.tileW / tiles.get(id).aspect);
                out.set(id, { x, y: y + Math.floor((rowsH[r] - h) / 2), w: g.tileW, h });
                x += g.tileW + GAP_PX;
            });
            y += rowsH[r] + GAP_PX;
        }
        return out;
    }

    function fitRect(id, x, y, w, W, H) {
        const a = tiles.get(id).aspect;
        w = clamp(w, MIN_TILE_PX, Math.min(W, H * a));
        const h = w / a;
        return { x: clamp(x, 0, W - w), y: clamp(y, 0, H - h), w, h };
    }

    function layout() {
        const ids = order();
        if (!visible || !ids.length) { subscribe(); return; }
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        if (W < 20 || H < 20) return;
        const auto = autoRects(ids, W, H);
        ids.forEach((id) => {
            const f = arrangement.custom && arrangement.tiles[id];
            const a = auto.get(id);
            if (!f && byId[id].web && a.h) tiles.get(id).aspect = a.w / a.h;   // arrange keeps the shape it got
            rects.set(id, f ? fitRect(id, f.x * W, f.y * H, f.w * W, W, H) : a);
        });
        const grown = expanded && !arranging ? expanded : null;
        if (grown) rects.set(grown, { x: 0, y: 0, w: W, h: H });
        tiles.forEach((t, id) => {
            t.el.classList.toggle('expanded', id === grown);
            if (t.expand) {
                t.expand.textContent = id === grown ? '\u2921' : '\u2922';
                t.expand.setAttribute('aria-label', id === grown ? 'Shrink' : 'Expand');
            }
        });
        ids.forEach(place);
        bleedEdges(ids, W);
        subscribe();
    }

    /* AUTO layout: black instead of the panel colour around the screens: out from the outermost tiles to the stage's
       left / right edge (only beside tiles in the outermost columns: nothing where a row has no tile at that edge),
       and the gaps between neighbouring tiles. Box-shadow copies of the tile, shifted, draw it; corners go square so
       no panel colour peeks through. */
    function bleedEdges(ids, W) {
        const on = !arrangement.custom && !arranging;
        const all = ids.map((id) => rects.get(id));
        const minX = Math.min(...all.map((r) => r.x));
        const maxR = Math.max(...all.map((r) => r.x + r.w));
        const near = (d) => d > 0 && d <= GAP_PX + 2;
        ids.forEach((id) => {
            const r = rects.get(id);
            const left = Math.round(r.x);
            const right = Math.round(W - r.x - r.w);
            const shadows = [];
            if (on) {
                const dxs = [0];   // sideways copies: the edge bleeds (and, below, the corners they leave)
                if (r.x - minX < 1 && left > 0) dxs.push(-left);
                if (maxR - r.x - r.w < 1 && right > 0) dxs.push(right);
                const nextRight = all.find((o) => near(o.x - r.x - r.w) && o.y < r.y + r.h && o.y + o.h > r.y);
                if (nextRight) shadows.push(`${Math.round(nextRight.x - r.x - r.w)}px 0 0 #000`);
                const below = all.find((o) => near(o.y - r.y - r.h) && o.x < r.x + r.w && o.x + o.w > r.x);
                const dy = below ? Math.round(below.y - r.y - r.h) : 0;
                dxs.forEach((dx) => {
                    if (dx) shadows.push(`${dx}px 0 0 #000`);
                    if (dy) shadows.push(`${dx}px ${dy}px 0 #000`);
                });
            }
            const s = tiles.get(id).el.style;
            s.boxShadow = shadows.join(', ');
            s.borderRadius = on ? '0' : '';
        });
    }

    function place(id) {
        const r = rects.get(id);
        const s = tiles.get(id).el.style;
        s.left = `${Math.round(r.x)}px`;
        s.top = `${Math.round(r.y)}px`;
        s.width = `${Math.round(r.w)}px`;
        s.height = `${Math.round(r.h)}px`;
    }

    function saveArrangement() {
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        const next = { custom: true, tiles: { ...arrangement.tiles } };
        rects.forEach((r, id) => { next.tiles[id] = { x: r.x / W, y: r.y / H, w: r.w / W }; });
        arrangement = next;
        store(layoutKey, arrangement);
    }

    function subscribe() {
        if (dragging) return;   // tiles scale with CSS while dragging; ask for the new size on release
        const subs = {};
        if (visible && !document.hidden) {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const covered = expanded && !arranging;   // screens under an expanded web tile aren't seen
            rects.forEach((r, id) => {
                if (tiles.has(id) && !byId[id].web && !covered) subs[id] = { width: Math.round(r.w * dpr) };
            });
        }
        const key = JSON.stringify(subs);
        if (key === lastSubs) return;
        lastSubs = key;
        stream.setSubscriptions(subs, { fps, quality });
    }

    /* ---------- arrange: move / resize with snapping ---------- */

    function bindDrag(id, t, handle) {
        let start = null;
        const onDown = (ev) => {
            if (!arranging || start) return;
            ev.preventDefault();
            const r = rects.get(id);
            if (!r) return;
            start = { px: ev.clientX, py: ev.clientY, r: { ...r }, resize: ev.target === handle, pointer: ev.pointerId };
            dragging = true;
            t.el.setPointerCapture(ev.pointerId);
            t.el.classList.add('dragging');
            t.el.style.zIndex = String(++topZ);   // on top of the others (re-inserting it would drop the capture)
        };
        const onMove = (ev) => {
            if (!start || ev.pointerId !== start.pointer) return;
            const W = stage.clientWidth;
            const H = stage.clientHeight;
            const dx = ev.clientX - start.px;
            const dy = ev.clientY - start.py;
            const others = [...rects.entries()].filter(([k]) => k !== id).map(([, r]) => r);
            const xs = [0, W, ...others.flatMap((o) => [o.x, o.x + o.w])];
            const ys = [0, H, ...others.flatMap((o) => [o.y, o.y + o.h])];
            let next;
            if (start.resize) {
                /* Top-left stays; the right edge follows the finger and snaps, else the bottom edge may. */
                const { x, y } = start.r;
                const right = start.r.x + start.r.w + dx;
                let w = snapSpan(right, 0, xs) - x;
                if (x + w === right) {
                    const bottom = y + w / t.aspect;
                    w = (snapSpan(bottom, 0, ys) - y) * t.aspect;
                }
                next = fitRect(id, x, y, w, W, H);
            } else {
                const r = start.r;
                const x = snapSpan(clamp(r.x + dx, 0, W - r.w), r.w, xs);
                const y = snapSpan(clamp(r.y + dy, 0, H - r.h), r.h, ys);
                next = fitRect(id, x, y, r.w, W, H);
            }
            rects.set(id, next);
            place(id);
        };
        const onUp = (ev) => {
            if (!start || ev.pointerId !== start.pointer) return;
            start = null;
            dragging = false;
            t.el.classList.remove('dragging');
            saveArrangement();
            subscribe();
        };
        t.el.addEventListener('pointerdown', onDown);
        t.el.addEventListener('pointermove', onMove);
        t.el.addEventListener('pointerup', onUp);
        t.el.addEventListener('pointercancel', onUp);
    }

    function setArranging(on) {
        arranging = on;
        if (on) expanded = null;
        root.classList.toggle('arranging', on);
        if (on) setMenu(false);
        layout();   // the edge bleed is off while arranging
    }

    function autoLayout() {
        arrangement = { custom: false, tiles: {} };
        store(layoutKey, arrangement);
        layout();
    }

    /* ---------- the menu (opened from the DISPLAYS tab) ---------- */

    let justShown = false;   // the tap that opened the tab mustn't also open the menu
    function setMenu(open) {
        menu.classList.toggle('hidden', !open);
    }

    const tap = (btn, fn) => { fastTap(btn); btn.addEventListener('click', fn); };
    tap(arrangeBtn, () => setArranging(true));
    tap(autoBtn, () => { autoLayout(); setMenu(false); });
    tap(arrangeAuto, autoLayout);
    tap(arrangeDone, () => setArranging(false));
    document.addEventListener('pointerdown', (ev) => {
        if (menu.classList.contains('hidden') || menu.contains(ev.target)) return;
        if (ev.target.closest && ev.target.closest('#tabDisplays')) return;   // the tab toggles it itself
        setMenu(false);
    }, true);

    chips.forEach((c) => {
        fastTap(c);
        c.addEventListener('click', () => {
            const id = c.dataset.display;
            selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
            store(storageKey, selected);
            render();
        });
    });

    new ResizeObserver(() => layout()).observe(stage);
    document.addEventListener('visibilitychange', () => subscribe());

    /* ---------- setup: assign pop-out windows ---------- */

    async function openSetup() {
        setup.classList.remove('hidden');
        const list = setup.querySelector('.display-setup-list');
        const dockNote = setup.querySelector('.display-dock-note');
        list.innerHTML = '<p class="display-setup-note">Looking for sim windows…</p>';
        const res = await displayWindows(aircraftId);
        if (res.error) {
            list.innerHTML = `<p class="display-setup-note">${esc(res.error)}</p>`;
            return;
        }
        const dock = res.dock || {};
        dockNote.textContent = dock.present
            ? 'Virtual monitor found: assigned screens are hidden there.'
            : 'No virtual monitor (tools/virtual_display/install.ps1): assigned windows stay on your desktop; keep them open and not minimized.';
        const wins = (res.windows || []).filter((w) => !w.main);
        if (!wins.length) {
            list.innerHTML = '<p class="display-setup-note">No pop-out windows found. Is MSFS running with screens popped out?</p>';
            return;
        }
        list.innerHTML = wins.map((w) => `
            <div class="display-setup-item">
                <img src="${displayWindowThumbUrl(aircraftId, w.hwnd)}" alt="">
                <div class="display-setup-meta">
                    <div>Pop-out · ${w.width}×${w.height}${w.docked ? ' · on virtual monitor' : ''}${w.minimized ? ' · minimized' : ''}</div>
                    <select data-hwnd="${w.hwnd}" aria-label="Display shown in this window">
                        <option value="">Not used</option>
                        ${screenDefs.map((d) => `<option value="${esc(d.id)}" ${w.display === d.id ? 'selected' : ''}>${esc(d.label)} · ${esc(d.name)}</option>`).join('')}
                    </select>
                </div>
            </div>`).join('');
        list.querySelectorAll('select').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const hwnd = Number(sel.dataset.hwnd);
                const before = wins.find((w) => w.hwnd === hwnd).display;
                if (before) await assignDisplay(aircraftId, before, null);
                if (sel.value) await assignDisplay(aircraftId, sel.value, hwnd);
                openSetup();
            });
        });
    }

    /* ---------- setup: automatic pop-out (ChasePlane view + where each screen is in it) ---------- */

    const pop = setup.querySelector('.display-popout');
    const popView = pop.querySelector('.display-popout-camera');
    const popAuto = pop.querySelector('.display-popout-auto input');
    const popShot = pop.querySelector('.display-popout-shot');
    const popImg = popShot.querySelector('img');
    const popMarkers = pop.querySelector('.display-popout-markers');
    const popStatus = pop.querySelector('.display-popout-status');
    const popTargets = [...pop.querySelectorAll('[data-target]')];
    const popPicture = pop.querySelector('.display-popout-picture');
    const popRun = pop.querySelector('.display-popout-run');
    let cal = { view: null, points: {}, auto: false };
    let target = screenDefs.length ? screenDefs[0].id : null;
    let popPoll = 0;
    let shotView = null;   // view the picture was taken in: new points remember it
    const RESULT_TEXT = {
        ok: 'popped out', no_window: 'no window appeared (check its point)', covered: 'another window covers that spot',
        view_not_found: 'ChasePlane view not found',
    };

    function renderPopout(st = {}) {
        if (cal.view && [...popView.options].some((o) => o.value === cal.view)) popView.value = cal.view;
        popAuto.checked = !!cal.auto;
        popTargets.forEach((b) => {
            b.classList.toggle('active', b.dataset.target === target);
            b.classList.toggle('placed', !!cal.points[b.dataset.target]);
        });
        const shown = Object.entries(cal.points).filter(([, p]) => shotView == null || (p[2] || cal.view) === shotView);
        popMarkers.innerHTML = shown.map(([id, [fx, fy]]) => `
            <div class="display-popout-marker${id === target ? ' current' : ''}" style="left:${fx * 100}%;top:${fy * 100}%">
                <span>${esc((byId[id] || {}).label || id)}</span></div>`).join('');
        const results = Object.entries(st.results || {}).map(([id, r]) => `${(byId[id] || {}).label || id}: ${RESULT_TEXT[r] || r}`);
        const placed = Object.keys(cal.points).length;
        popStatus.textContent = st.message
            ? `${st.running ? 'Working: ' : 'Last run: '}${st.message}${results.length ? ` (${results.join(', ')})` : ''}`
            : `${placed} of ${screenDefs.length} screens placed.`;
        popRun.disabled = !!st.running || !placed;
    }

    async function savePopout(changes) {
        const res = await popoutSettings(aircraftId, changes);
        if (res.error) { popStatus.textContent = `Not saved: ${res.error}`; return; }
        cal = { view: null, points: {}, auto: false, ...res.calibration };
        renderPopout(res.status);
    }

    async function loadViews() {
        const res = await popoutViews(aircraftId);
        const names = res.views || [];
        if (cal.view && !names.includes(cal.view)) names.unshift(cal.view);
        popView.innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        if (res.error) popStatus.textContent = `ChasePlane views: ${res.error}`;
        renderPopout();
    }

    async function loadPopout() {
        const res = await popoutSettings(aircraftId);
        if (res.error) { popStatus.textContent = res.error; return; }
        cal = { view: null, points: {}, auto: false, ...res.calibration };
        renderPopout(res.status);
        if (res.status && res.status.running) watchRun();
        loadViews();
    }

    function watchRun() {
        clearTimeout(popPoll);
        popPoll = setTimeout(async () => {
            const res = await popoutSettings(aircraftId);
            if (!res.error) renderPopout(res.status);
            if (res.status && res.status.running) watchRun();
            else openSetup();   // new windows: refresh the list
        }, 700);
    }

    popTargets.forEach((b) => {
        fastTap(b);
        b.addEventListener('click', () => { target = b.dataset.target; renderPopout(); });
    });
    popView.addEventListener('change', () => savePopout({ view: popView.value }));
    popAuto.addEventListener('change', () => savePopout({ auto: popAuto.checked }));
    fastTap(popPicture);
    popPicture.addEventListener('click', async () => {
        popPicture.disabled = true;
        popStatus.textContent = 'Switching the view and taking a picture…';
        const view = popView.value;
        if (cal.view !== view) await savePopout({ view });
        const res = await popoutPicture(aircraftId, view);
        popPicture.disabled = false;
        if (res instanceof Blob) {
            if (popImg.src) URL.revokeObjectURL(popImg.src);
            popImg.src = URL.createObjectURL(res);
            popShot.classList.add('has-picture');
            shotView = view;
            renderPopout();
        } else {
            popStatus.textContent = `No picture: ${res.error}`;
        }
    });
    popShot.addEventListener('click', (ev) => {
        if (!target || !popShot.classList.contains('has-picture')) return;
        const r = popImg.getBoundingClientRect();
        const fx = (ev.clientX - r.left) / r.width;
        const fy = (ev.clientY - r.top) / r.height;
        if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
        const points = { ...cal.points, [target]: [fx, fy, shotView] };
        const next = screenDefs.find((d) => !points[d.id]);
        if (next) target = next.id;
        savePopout({ points });
    });
    fastTap(popRun);
    popRun.addEventListener('click', async () => {
        const res = await runPopout(aircraftId);
        if (res.error) { popStatus.textContent = res.error === 'already_running' ? 'Already running…' : res.error; }
        watchRun();
    });

    fastTap(setupBtn);
    setupBtn.addEventListener('click', () => { setMenu(false); openSetup(); loadPopout(); });
    setup.querySelector('.display-setup-refresh').addEventListener('click', openSetup);
    setup.querySelector('.display-setup-close').addEventListener('click', () => setup.classList.add('hidden'));

    return {
        show() {
            visible = true;
            justShown = true;
            setTimeout(() => { justShown = false; }, 0);
            render();
        },
        hide() { visible = false; setArranging(false); setMenu(false); setup.classList.add('hidden'); subscribe(); },
        /* A tap on the DISPLAYS tab: opens / closes the menu when the tab was already showing. */
        tabTapped() {
            if (justShown || !visible) return;
            setMenu(menu.classList.contains('hidden'));
        },
    };
}
