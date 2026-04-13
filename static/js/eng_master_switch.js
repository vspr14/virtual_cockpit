import * as THREE from 'three';
import { ENG_MASTER_VB64, ENG_MASTER_NB64 } from './eng_master_geom_b64.js';

function readPanelBgCss() {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--airbus-panel').trim();
        if (v) return v;
    } catch (e) {}
    return '#384a5f';
}

function resolvePanelBg(viewportEl) {
    const c = new THREE.Color();
    try {
        if (viewportEl) {
            const bc = getComputedStyle(viewportEl).backgroundColor;
            if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent') {
                c.setStyle(bc);
                return { color: c, css: bc };
            }
        }
    } catch (e) {}
    const css = readPanelBgCss();
    try {
        c.setStyle(css);
    } catch (e2) {
        c.setStyle('#384a5f');
    }
    return { color: c, css };
}

function b64f(s) {
    const b = atob(s);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new Float32Array(u.buffer);
}

function splitLeverStemHead(geom, stemFraction) {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const ex = bb.max.x - bb.min.x;
    const ey = bb.max.y - bb.min.y;
    const ez = bb.max.z - bb.min.z;
    let ax = 2;
    if (ey >= ex && ey >= ez) ax = 1;
    else if (ex >= ey && ex >= ez) ax = 0;
    const minC = bb.min.getComponent(ax);
    const maxC = bb.max.getComponent(ax);
    const span = Math.max(maxC - minC, 1e-6);
    const thresh = minC + span * stemFraction;
    const pos = geom.getAttribute('position');
    const nor = geom.getAttribute('normal');
    const idx = geom.getIndex();
    const stemP = [];
    const stemN = [];
    const headP = [];
    const headN = [];
    const gc = (vi) => pos.getComponent(vi, ax);
    const pushTri = (a, b, c, stem) => {
        const p = stem ? stemP : headP;
        const n = stem ? stemN : headN;
        for (const vi of [a, b, c]) {
            p.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
            n.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
        }
    };
    if (idx) {
        for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i);
            const b = idx.getX(i + 1);
            const c = idx.getX(i + 2);
            const avg = (gc(a) + gc(b) + gc(c)) / 3;
            pushTri(a, b, c, avg < thresh);
        }
    } else {
        for (let i = 0; i < pos.count; i += 3) {
            const a = i;
            const b = i + 1;
            const c = i + 2;
            const avg = (gc(a) + gc(b) + gc(c)) / 3;
            pushTri(a, b, c, avg < thresh);
        }
    }
    const mk = (p, n) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(p), 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n), 3));
        return g;
    };
    return { stemGeo: mk(stemP, stemN), headGeo: mk(headP, headN), leverAxis: ax };
}

export function attachEngMasterSwitch(viewportEl, options = {}) {
    if (!viewportEl) return null;

    const initialState = options.initialState === 1 ? 1 : 0;
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
    const labelSecondRow = options.labelSecondRow != null ? String(options.labelSecondRow) : '1';
    const angles = [-0.4, 0.4];
    let state = initialState;
    const pivotSmooth = 16;

    let w = 96;
    let h = 96;
    let raf = 0;
    let resizeDoneOnce = false;

    const bgResolved = resolvePanelBg(viewportEl);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / Math.max(h, 1), 0.1, 400);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    if ('SRGBColorSpace' in THREE) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.background = 'transparent';
    renderer.domElement.style.outline = 'none';
    renderer.domElement.style.setProperty('-webkit-tap-highlight-color', 'transparent');

    viewportEl.innerHTML = '';
    try {
        viewportEl.style.backgroundColor = bgResolved.css;
    } catch (e) {}
    viewportEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x283038, 1.2));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.15);
    key.position.set(20, 35, -80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x304860, 0.8);
    fill.position.set(-30, 20, -20);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x101820, 0.4);
    rim.position.set(0, -40, 30);
    scene.add(rim);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(b64f(ENG_MASTER_VB64), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(b64f(ENG_MASTER_NB64), 3));

    let stemFraction = 0.7;
    let split = splitLeverStemHead(geo, stemFraction);
    if (split.headGeo.attributes.position.count < 12) {
        stemFraction = 0.58;
        split = splitLeverStemHead(geo, stemFraction);
    }
    if (split.stemGeo.attributes.position.count < 12) {
        stemFraction = 0.78;
        split = splitLeverStemHead(geo, stemFraction);
    }

    const stemMat = new THREE.MeshStandardMaterial({
        color: 0xb4bac4,
        roughness: 0.28,
        metalness: 0.9,
    });

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 768;
    labelCanvas.height = 768;
    const lctx = labelCanvas.getContext('2d');
    lctx.fillStyle = '#000000';
    lctx.fillRect(0, 0, 768, 768);
    lctx.fillStyle = '#ffffff';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.font = 'bold 168px system-ui, Segoe UI, Arial, sans-serif';
    lctx.fillText('ENG', 384, 268);
    lctx.font = 'bold 210px system-ui, Segoe UI, Arial, sans-serif';
    lctx.fillText(labelSecondRow, 384, 520);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    if ('SRGBColorSpace' in THREE) labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.needsUpdate = true;
    labelTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    labelTex.magFilter = THREE.LinearFilter;
    labelTex.minFilter = THREE.LinearFilter;

    split.headGeo.computeVertexNormals();

    const headMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    if ('toneMapped' in headMat) headMat.toneMapped = false;

    const stemMesh = new THREE.Mesh(split.stemGeo, stemMat);
    stemMesh.name = 'eng_master_stem';
    const headMesh = new THREE.Mesh(split.headGeo, headMat);
    headMesh.name = 'eng_master_head';

    const knobPivot = new THREE.Group();
    const body = new THREE.Group();
    knobPivot.add(body);

    const sw = new THREE.Object3D();
    sw.name = 'eng_master_sw';

    const capGeo = new THREE.PlaneGeometry(20, 21);
    const capMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        color: 0xffffff,
    });
    if ('toneMapped' in capMat) capMat.toneMapped = false;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.name = 'eng_master_cap';
    sw.add(cap);
    cap.rotation.x = -Math.PI / 2;
    const cap2 = new THREE.Mesh(capGeo, capMat);
    cap2.name = 'eng_master_cap2';
    cap2.position.set(0, -23, 0);
    cap2.rotation.x = Math.PI / 2;
    cap2.rotation.z = Math.PI;
    sw.add(cap2);

    body.add(stemMesh);
    body.add(headMesh);
    body.add(sw);

    const panelZ = 9;
    const panelGeo = new THREE.PlaneGeometry(220, 220);
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x1c2022,
        roughness: 0.88,
        metalness: 0.1,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0, panelZ);

    const bezR = 14.5;
    const bezGeo = new THREE.CylinderGeometry(bezR + 2.2, bezR + 2.2, 2.5, 64);
    const bezMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    if ('toneMapped' in bezMat) bezMat.toneMapped = false;
    const bez = new THREE.Mesh(bezGeo, bezMat);
    bez.rotation.x = Math.PI / 2;
    bez.position.set(0, 0, panelZ + 12);
    bez.name = 'eng_master_bez';

    const iringGeo = new THREE.CylinderGeometry(bezR, bezR, 2.4, 64);
    const iringMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    if ('toneMapped' in iringMat) iringMat.toneMapped = false;
    const iring = new THREE.Mesh(iringGeo, iringMat);
    iring.rotation.x = Math.PI / 2;
    iring.position.set(0, 0, panelZ + 11.9);
    iring.name = 'eng_master_iring';

    const ringOutlineGeo = new THREE.TorusGeometry(bezR + 0.95, 0.22, 10, 64);
    const ringOutlineMat = new THREE.MeshBasicMaterial({ color: 0xe8edf4 });
    if ('toneMapped' in ringOutlineMat) ringOutlineMat.toneMapped = false;
    const ringOutline = new THREE.Mesh(ringOutlineGeo, ringOutlineMat);
    ringOutline.position.set(0, 0, panelZ + 11.72);
    ringOutline.name = 'eng_master_ring_outline';

    const root = new THREE.Group();
    root.add(knobPivot);
    root.add(panel);
    root.add(bez);
    root.add(iring);
    root.add(ringOutline);
    scene.add(root);

    stemMesh.rotation.x = Math.PI / 2;
    headMesh.rotation.x = Math.PI / 2;
    knobPivot.rotation.x = 0;
    stemMesh.position.set(0, 0, 0);
    headMesh.position.set(0, 0, 0);
    knobPivot.updateMatrixWorld(true);
    {
        const stemBox = new THREE.Box3().setFromObject(knobPivot);
        const mx = (stemBox.min.x + stemBox.max.x) * 0.5;
        const my = (stemBox.min.y + stemBox.max.y) * 0.5;
        const ringZ = panelZ + 11.9;
        const dMaxZ = Math.abs(stemBox.max.z - ringZ);
        const dMinZ = Math.abs(stemBox.min.z - ringZ);
        const pz = dMaxZ <= dMinZ ? stemBox.max.z : stemBox.min.z;
        body.position.set(-mx, -my, -pz);
        body.rotation.x = Math.PI / 2;
        stemMesh.rotation.set(0, 0, 0);
        headMesh.rotation.set(0, 0, 0);
        stemMesh.position.set(0, 0, 0);
        headMesh.position.set(0, 0, 0);
    }
    knobPivot.updateMatrixWorld(true);
    knobPivot.rotation.x = angles[state];
    knobPivot.updateMatrixWorld(true);

    const pickables = [stemMesh, headMesh, cap, cap2, bez, iring, ringOutline];
    const pickSet = new Set(pickables);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragFromHit = false;
    let startY = 0;
    let startX = 0;
    let movedPx = 0;
    const dragThreshold = 32;
    const clickMoveMax = 14;
    const canvas = renderer.domElement;

    const setMouseFromEvent = (e) => {
        const r = canvas.getBoundingClientRect();
        const rw = Math.max(1, r.width);
        const rh = Math.max(1, r.height);
        mouse.x = ((e.clientX - r.left) / rw) * 2 - 1;
        mouse.y = -((e.clientY - r.top) / rh) * 2 + 1;
    };

    const tryHit = (e) => {
        setMouseFromEvent(e);
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(root, true);
        for (let i = 0; i < hits.length; i++) {
            if (pickSet.has(hits[i].object)) return true;
        }
        return false;
    };

    const emitState = () => {
        if (onStateChange) onStateChange(state);
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (!tryHit(e)) return;
        dragFromHit = true;
        isDragging = true;
        startY = e.clientY;
        startX = e.clientX;
        movedPx = 0;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDragging || !dragFromHit) return;
        movedPx = Math.max(movedPx, Math.hypot(e.clientX - startX, e.clientY - startY));
        const diff = e.clientY - startY;
        if (Math.abs(diff) > dragThreshold) {
            if (diff > 0 && state > 0) {
                state--;
                emitState();
                startY = e.clientY;
                startX = e.clientX;
            } else if (diff < 0 && state < 1) {
                state++;
                emitState();
                startY = e.clientY;
                startX = e.clientX;
            }
        }
    };

    const onPointerUp = (e) => {
        if (dragFromHit && isDragging && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
            if (movedPx < clickMoveMax) {
                state = state === 0 ? 1 : 0;
                emitState();
            }
        }
        isDragging = false;
        dragFromHit = false;
        try {
            if (document.activeElement === canvas) canvas.blur();
        } catch (e) {}
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const setupCamera = () => {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const fovRad = (camera.fov * Math.PI) / 180;
        const tanHalf = Math.tan(fovRad / 2);
        const aspect = Math.max(0.001, camera.aspect);
        const margin = 1.2;
        const halfY = Math.max(size.y * 0.5, 0.01) * margin;
        const halfX = Math.max(size.x * 0.5, 0.01) * margin;
        const distV = halfY / tanHalf;
        const distW = halfX / (tanHalf * aspect);
        const dist = Math.max(distV, distW, 1) * 0.3;
        camera.position.copy(center).add(new THREE.Vector3(0, 0, -dist));
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
    };

    const syncViewportAspect = () => {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        const pct = (sz.y / Math.max(sz.x, 1e-4)) * 100 * 1.02;
        viewportEl.style.paddingBottom = pct.toFixed(4) + '%';
    };

    const resize = () => {
        syncViewportAspect();
        const r = viewportEl.getBoundingClientRect();
        const nw = Math.max(64, Math.round(r.width));
        const nh = Math.max(64, Math.round(r.height));
        if (resizeDoneOnce && nw === w && nh === h) return;
        resizeDoneOnce = true;
        w = nw || 96;
        h = nh || 96;
        camera.aspect = w / Math.max(h, 1);
        setupCamera();
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(viewportEl);
    if (viewportEl.parentElement) ro.observe(viewportEl.parentElement);

    const onWin = () => {
        resizeDoneOnce = false;
        resize();
    };
    window.addEventListener('resize', onWin);

    resize();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            resizeDoneOnce = false;
            resize();
        });
    });

    const animClock = new THREE.Clock();
    animClock.getDelta();

    const tick = () => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(animClock.getDelta(), 0.05);
        knobPivot.rotation.x = THREE.MathUtils.damp(knobPivot.rotation.x, angles[state], pivotSmooth, dt);
        renderer.render(scene, camera);
    };
    tick();

    return {
        getState() {
            return state;
        },
        setState(next) {
            const s = next === 1 ? 1 : 0;
            if (s === state) return;
            state = s;
            emitState();
        },
        dispose() {
            cancelAnimationFrame(raf);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            ro.disconnect();
            window.removeEventListener('resize', onWin);
            geo.dispose();
            split.stemGeo.dispose();
            split.headGeo.dispose();
            stemMat.dispose();
            headMat.dispose();
            labelCanvas.width = 0;
            labelCanvas.height = 0;
            panelGeo.dispose();
            panelMat.dispose();
            bezGeo.dispose();
            bezMat.dispose();
            iringGeo.dispose();
            iringMat.dispose();
            ringOutlineGeo.dispose();
            ringOutlineMat.dispose();
            capGeo.dispose();
            capMat.map = null;
            capMat.dispose();
            labelTex.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode) renderer.domElement.remove();
        },
    };
}
