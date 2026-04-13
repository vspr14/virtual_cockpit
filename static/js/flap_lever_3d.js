import * as THREE from 'three';

const MODEL_SCALE = 10.2;
const PULL_KNOB_SCALE = 0.82;
const TOP_KNOB_SCALE = 0.55;
const TOP_KNOB_Z_TOWARD_USER = 16.5;
const CONNECTOR_SHAFT_END_TRIM = 14;
const LOW_DETENT_Y_OFFSET = 3.7;
const LABEL_TEX_W = 256;
const LABEL_TEX_H = 80;
const LABEL_PLANE_W = 24;
const LABEL_PLANE_H = 8;
const LABEL_FACE_Z = (d) => d * 0.5 + 1.55;
const DETENT_TICK_LEN = 5.2;
const DETENT_TICK_THK = 0.9;
const DETENT_TICK_Z = (d) => d * 0.5 + 0.48;
const CAMERA_VIEW_PAD_Y = 0;
const CAMERA_VIEW_PAD_X = 0;
const CAMERA_MARGIN = 1;
const CAMERA_VERT_PAD = 1;
const CAMERA_HOR_PAD = 1;
const CAMERA_BASE_FOV = 35;
const CAMERA_DIST_SCALE = 1;
const DRAG_PIXELS_PER_FULL_RANGE = 400;
const LEVER_LERP = 0.12;

function readCssColor(prop, fallbackHex) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
        if (v) return new THREE.Color().setStyle(v);
    } catch (e) { }
    return new THREE.Color().setStyle(fallbackHex);
}

function backdropColorFromMount(mount) {
    let el = mount;
    while (el) {
        try {
            const bc = getComputedStyle(el).backgroundColor;
            if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent') {
                return new THREE.Color().setStyle(bc);
            }
        } catch (e) { }
        el = el.parentElement;
    }
    return readCssColor('--airbus-subpanel', '#2f3f52');
}

function makeGeo(d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    return g;
}

export async function initFlapLever3D(mount, options) {
    const onCommit = options && typeof options.onCommit === 'function' ? options.onCommit : () => { };
    const posEl = options && options.posEl
        ? typeof options.posEl === 'string' ? document.getElementById(options.posEl) : options.posEl
        : null;
    const hiddenInput = options && options.hiddenInput
        ? typeof options.hiddenInput === 'string' ? document.getElementById(options.hiddenInput) : options.hiddenInput
        : null;
    const rawDetents = (options && options.detents) || [];
    if (!mount || rawDetents.length < 2) {
        return { applyAxisValue: () => { }, getAxisValue: () => 0, getDetentIndex: () => 0 };
    }

    let componentScale = Math.max(
        0.05,
        options && typeof options.componentScale === 'number'
            ? options.componentScale
            : CAMERA_DIST_SCALE
    );

    const [pakoMod, geom] = await Promise.all([
        import('pako'),
        import('./flap_lever_geom_b64.js'),
    ]);
    const inflate = (pakoMod.default && pakoMod.default.inflate) || pakoMod.inflate;

    function decodeGz(b64, vcount) {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const inf = inflate(u);
        const half = vcount * 3 * 4;
        return {
            pos: new Float32Array(inf.buffer.slice(0, half)),
            nor: new Float32Array(inf.buffer.slice(half)),
        };
    }

    const DETENTS = rawDetents.map(d => d && d.label != null ? String(d.label) : '');
    const VALS = rawDetents.map(d => d && typeof d.val === 'number' ? d.val : parseFloat(d.val) || 0);
    const N = DETENTS.length;
    const LS = geom.FLAP_LS;

    let curDetent = 0;
    let targetDetent = 0;
    let targetProgress = 0;
    let currentProgress = 0;
    let isDragging = false;
    let dragLastY = 0;
    let activePointerId = null;

    const PLATE_W = 82;
    const PLATE_H = 190;
    const PLATE_D = 14;
    const PLATE_OVERHANG = 0;
    const SLOT_W = 15;
    const SLOT_H = (PLATE_H + PLATE_OVERHANG * 2) * 0.88;
    const SLOT_D = PLATE_D + 4;
    const slotTop = +SLOT_H / 2;
    const slotBot = -SLOT_H / 2;

    function detentToProgress(i) { return N <= 1 ? 0 : i / (N - 1); }
    function progressToDetent(p) { return Math.round(Math.max(0, Math.min(1, p)) * (N - 1)); }

    function yForProgress(p) {
        const x = Math.max(0, Math.min(1, p));
        return slotTop + (slotBot - slotTop) * x;
    }

    function tiltForProgress(p) {
        const x = Math.max(0, Math.min(1, p));
        const pDet1 = N > 1 ? 1 / (N - 1) : 0;
        const tAtDet1 = THREE.MathUtils.lerp(-0.45, 0.65, pDet1);
        if (N >= 4 && progressToDetent(x) === 3) {
            return -tAtDet1;
        }
        let t = THREE.MathUtils.lerp(-0.45, 0.65, x);
        if (N >= 3) {
            const pLow = (N - 2) / (N - 1);
            if (x >= pLow) {
                const u = (x - pLow) / Math.max(1e-6, 1 - pLow);
                t *= THREE.MathUtils.lerp(1, 0.72, u);
            }
        }
        return t;
    }

    function yOffsetForProgress(p) {
        const x = Math.max(0, Math.min(1, p));
        if (N < 3) return 0;
        const pLow = (N - 2) / (N - 1);
        if (x < pLow) return 0;
        const edge = Math.min(0.06, (1 - pLow) * 0.35);
        const w = THREE.MathUtils.smoothstep(x, pLow, pLow + edge);
        return LOW_DETENT_Y_OFFSET * w;
    }

    function applyLeverPose(p) {
        leverAsm.position.y = yForProgress(p) + yOffsetForProgress(p);
        leverAsm.rotation.x = tiltForProgress(p);
    }

    function axisToIndex(axis) {
        let best = 0, dist = Infinity;
        for (let i = 0; i < VALS.length; i++) {
            const dd = Math.abs(VALS[i] - axis);
            if (dd < dist) { dist = dd; best = i; }
        }
        return best;
    }

    function updateLabel(i) {
        if (!posEl) return;
        const L = DETENTS[i] || '';
        posEl.textContent = String(L).toUpperCase() === 'FULL' ? 'FLAPS FULL' : 'FLAPS ' + L;
        posEl.style.color = '#ffffff';
        posEl.style.fontWeight = '600';
    }
    function syncHidden(i) { if (hiddenInput) hiddenInput.value = String(VALS[i]); }
    function emitCommit(i) { syncHidden(i); updateLabel(i); onCommit(i, VALS[i]); }

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = false;

    mount.style.cssText += ';padding:0;margin:0;overflow:hidden;line-height:0;font-size:0;display:block;';
    renderer.domElement.style.cssText =
        'display:block;width:100%;height:100%;outline:none;-webkit-tap-highlight-color:transparent;touch-action:none;';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x2c3c50, 1.05));
    const kl = new THREE.DirectionalLight(0xfff0d8, 1.5);
    kl.position.set(80, 120, 200); scene.add(kl);
    const fl = new THREE.DirectionalLight(0x405878, 0.7);
    fl.position.set(-80, 60, 100); scene.add(fl);
    const rl = new THREE.DirectionalLight(0x101820, 0.3);
    rl.position.set(0, -80, -60); scene.add(rl);

    const panelCol = backdropColorFromMount(mount);
    const matPlate = new THREE.MeshBasicMaterial({ color: panelCol });
    if ('toneMapped' in matPlate) matPlate.toneMapped = false;
    const matTick = new THREE.MeshBasicMaterial({ color: 0xf2f6fa, toneMapped: false, depthWrite: true });
    const matBlack = new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.8, metalness: 0.08 });
    const matSlot = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, depthWrite: true });
    const root = new THREE.Group();
    root.scale.setScalar(MODEL_SCALE * componentScale);
    scene.add(root);

    const TOTAL_H = PLATE_H + PLATE_OVERHANG * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W, TOTAL_H, PLATE_D), matPlate);
    root.add(plate);

    const slotMesh = new THREE.Mesh(new THREE.BoxGeometry(SLOT_W, SLOT_H, SLOT_D), matSlot);
    slotMesh.renderOrder = 2;
    root.add(slotMesh);

    function makeTextTex(text) {
        const cv = document.createElement('canvas');
        cv.width = LABEL_TEX_W; cv.height = LABEL_TEX_H;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, LABEL_TEX_W, LABEL_TEX_H);
        ctx.font = 'bold 44px "Helvetica Neue",Helvetica,Arial,sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 10, LABEL_TEX_H / 2);
        const tex = new THREE.CanvasTexture(cv);
        if ('colorSpace' in tex && THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    const tickD = Math.max(PLATE_D * 0.35, 0.55);
    const tz = DETENT_TICK_Z(PLATE_D);
    const labelZ = LABEL_FACE_Z(PLATE_D);
    const tickHalf = DETENT_TICK_LEN * 0.5;
    const gap = 1.1;
    const labelCenterX = SLOT_W / 2 + gap + tickHalf + gap * 0.5 + LABEL_PLANE_W * 0.5;

    for (let ii = 0; ii < N; ii++) {
        const p = detentToProgress(ii);
        const ny = yForProgress(p);
        const label = DETENTS[ii] || String(ii);

        const tickL = new THREE.Mesh(new THREE.BoxGeometry(DETENT_TICK_LEN, DETENT_TICK_THK, tickD), matTick);
        tickL.position.set(-SLOT_W / 2 - gap - tickHalf, ny, tz);
        tickL.renderOrder = 4;
        root.add(tickL);

        const tickR = new THREE.Mesh(new THREE.BoxGeometry(DETENT_TICK_LEN, DETENT_TICK_THK, tickD), matTick);
        tickR.position.set(SLOT_W / 2 + gap + tickHalf, ny, tz);
        tickR.renderOrder = 4;
        root.add(tickR);

        const tex = makeTextTex(label);
        const lMat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
            depthTest: true, toneMapped: false, side: THREE.DoubleSide, opacity: 1,
        });
        const lMesh = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_PLANE_W, LABEL_PLANE_H), lMat);
        lMesh.position.set(labelCenterX, ny, labelZ);
        lMesh.renderOrder = 8;
        root.add(lMesh);
    }

    const leverAsm = new THREE.Group();
    root.add(leverAsm);

    const pullD = decodeGz(geom.FLAP_PB64, geom.FLAP_PCOUNT);
    const pullPos = new Float32Array(pullD.pos);
    const pullNor = new Float32Array(pullD.nor);
    for (let i = 2; i < pullPos.length; i += 3) pullPos[i] += LS;
    const pullM = new THREE.Mesh(makeGeo({ pos: pullPos, nor: pullNor }), matBlack);
    pullM.scale.setScalar(PULL_KNOB_SCALE);
    leverAsm.add(pullM);

    const topD = decodeGz(geom.FLAP_TB64, geom.FLAP_TCOUNT);
    const topPos = new Float32Array(topD.pos);
    const topNor = new Float32Array(topD.nor);
    for (let i = 2; i < topPos.length; i += 3) topPos[i] += LS;
    const topM = new THREE.Mesh(makeGeo({ pos: topPos, nor: topNor }), matBlack);
    topM.scale.setScalar(TOP_KNOB_SCALE);
    topM.position.z = TOP_KNOB_Z_TOWARD_USER;
    topM.renderOrder = 2;
    leverAsm.add(topM);

    const shaftLen = Math.max(7, 11 + TOP_KNOB_Z_TOWARD_USER - CONNECTOR_SHAFT_END_TRIM);
    const shaftMid = (28 + 39) / 2 + LS + TOP_KNOB_Z_TOWARD_USER * 0.5 - CONNECTOR_SHAFT_END_TRIM * 0.5;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, shaftLen, 32), matBlack);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, shaftMid);
    shaft.renderOrder = 0;
    leverAsm.add(shaft);

    const stemLen = LS + PLATE_D + 8;
    const stemMid = (LS - PLATE_D - 8) / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, stemLen, 24), matBlack);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0, 0, stemMid);
    leverAsm.add(stem);

    function frameCameraToScene() {
        const poseSamples = [0, 0.5, 1];
        if (N >= 4) poseSamples.push((N - 2) / (N - 1));
        const merged = new THREE.Box3();
        for (let pi = 0; pi < poseSamples.length; pi++) {
            const pr = poseSamples[pi];
            leverAsm.position.y = yForProgress(pr) + yOffsetForProgress(pr);
            leverAsm.rotation.x = tiltForProgress(pr);
            root.updateMatrixWorld(true);
            merged.union(new THREE.Box3().setFromObject(root));
        }
        applyLeverPose(currentProgress);
        root.updateMatrixWorld(true);
        if (merged.isEmpty()) return;

        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        merged.getCenter(center);
        merged.getSize(size);

        const yFit = size.y + CAMERA_VIEW_PAD_Y;
        const xFit = size.x + CAMERA_VIEW_PAD_X;
        camera.fov = CAMERA_BASE_FOV;
        const vFov = (CAMERA_BASE_FOV * Math.PI) / 180;
        const aspect = Math.max(0.001, camera.aspect);
        const distY =
            (yFit * CAMERA_MARGIN * CAMERA_VERT_PAD) / (2 * Math.tan(vFov / 2));
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const distX =
            (xFit * CAMERA_MARGIN * CAMERA_HOR_PAD) / (2 * Math.tan(hFov / 2));
        const camDist = Math.max(distX, distY, 8);

        camera.position.set(center.x, center.y, center.z + camDist);
        camera.lookAt(center);
        camera.near = Math.max(0.05, camDist * 0.008);
        camera.far = Math.max(camDist * 80, 5000);
        camera.updateProjectionMatrix();
    }

    function syncSize() {
        const w = Math.max(80, Math.floor(mount.clientWidth));
        const h = Math.max(88, Math.floor(mount.clientHeight));
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        frameCameraToScene();
    }
    syncSize();
    requestAnimationFrame(syncSize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSize).observe(mount);
    window.addEventListener('resize', syncSize);

    targetProgress = detentToProgress(0);
    currentProgress = targetProgress;
    applyLeverPose(currentProgress);
    updateLabel(0);
    syncHidden(0);

    renderer.domElement.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        activePointerId = e.pointerId;
        dragLastY = e.clientY;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault();
    }, { passive: false });

    renderer.domElement.addEventListener('pointermove', function (e) {
        if (!isDragging || e.pointerId !== activePointerId) return;
        const diff = (e.clientY - dragLastY) / DRAG_PIXELS_PER_FULL_RANGE;
        dragLastY = e.clientY;
        targetProgress = Math.max(0, Math.min(1, targetProgress + diff));
        e.preventDefault();
    });

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        activePointerId = null;
        targetDetent = progressToDetent(targetProgress);
        targetProgress = detentToProgress(targetDetent);
        curDetent = targetDetent;
        emitCommit(curDetent);
    }

    renderer.domElement.addEventListener('pointerup', function (e) {
        if (e.pointerId !== activePointerId) return;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { }
        endDrag();
    });
    renderer.domElement.addEventListener('pointercancel', function (e) {
        if (e.pointerId !== activePointerId) return;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { }
        endDrag();
    });

    function animate() {
        requestAnimationFrame(animate);
        currentProgress = THREE.MathUtils.lerp(currentProgress, targetProgress, LEVER_LERP);
        if (Math.abs(currentProgress - targetProgress) < 0.0004) currentProgress = targetProgress;
        applyLeverPose(currentProgress);
        renderer.render(scene, camera);
    }
    animate();

    return {
        applyAxisValue(axis) {
            const i = axisToIndex(axis);
            curDetent = targetDetent = i;
            targetProgress = currentProgress = detentToProgress(i);
            applyLeverPose(currentProgress);
            syncHidden(i);
            updateLabel(i);
        },
        setComponentScale(s) {
            componentScale = Math.max(0.01, s);
            root.scale.setScalar(MODEL_SCALE * componentScale);
            frameCameraToScene();
        },
        getAxisValue() { return VALS[curDetent]; },
        getDetentIndex() { return curDetent; },
    };
}