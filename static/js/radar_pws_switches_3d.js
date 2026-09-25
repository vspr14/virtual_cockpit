import * as THREE from 'three';

const ANGLE_DAMP_LAMBDA = 3.25;
const DRAG_PX_PER_STEP = 44;
const MIN_STEP_MS = 200;

function readCssColorVar(name, fallbackHex) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        if (v) return new THREE.Color().setStyle(v);
    } catch (e) { }
    return new THREE.Color().setStyle(fallbackHex);
}

function backdropColorFromMount(mount) {
    let el = mount;
    while (el) {
        try {
            const bc = getComputedStyle(el).backgroundColor;
            if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent') return new THREE.Color().setStyle(bc);
        } catch (e) { }
        el = el.parentElement;
    }
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--airbus-subpanel').trim();
        if (v) return new THREE.Color().setStyle(v);
    } catch (e) { }
    return new THREE.Color(0x2f3f52);
}

function makeLabelTexture(txt, size, color) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 72;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 256, 72);
    ctx.font = `bold ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 128, 36);
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
}

function addLabel(root, txt, x, y, z, w, h, size, color) {
    const map = makeLabelTexture(txt, size, color);
    const mat = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.renderOrder = 8;
    root.add(m);
    return { mesh: m, texture: map, material: mat };
}

function buildToggle(root, xPos, panelDepth, panelW, panelH, positions, axis, labelBelow, posLabels, mats, compact) {
    const SHAFT_R = 2.85;
    const SHAFT_LEN = 28;
    const PIVOT_Z = panelDepth / 2;
    const matHole = mats.matHole;
    const matBushing = mats.matBushing;
    const matPureMetal = mats.matPureMetal;

    const hole = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R + 2.5, SHAFT_R + 2.5, panelDepth + 2, 20), matHole);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(xPos, 0, 0);
    hole.renderOrder = 2;
    root.add(hole);

    const oRing = new THREE.Mesh(
        new THREE.RingGeometry(SHAFT_R + 1, SHAFT_R + 4.5, 24),
        new THREE.MeshStandardMaterial({ color: 0x404850, roughness: 0.45, metalness: 0.75 })
    );
    oRing.position.set(xPos, 0, panelDepth / 2 + 0.2);
    oRing.renderOrder = 3;
    root.add(oRing);

    const collarGeo = new THREE.CylinderGeometry(SHAFT_R + 4.5, SHAFT_R + 4.5, 1.5, 24);
    const collar = new THREE.Mesh(collarGeo, matBushing);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(xPos, 0, panelDepth / 2 + 0.5);
    root.add(collar);

    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(xPos, 0, PIVOT_Z);
    root.add(pivotGroup);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_LEN, 18), matPureMetal);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, SHAFT_LEN / 2);
    shaft.castShadow = true;
    pivotGroup.add(shaft);

    const tipGeo = new THREE.SphereGeometry(SHAFT_R, 24, 16);
    const tip = new THREE.Mesh(tipGeo, matPureMetal);
    tip.position.set(0, 0, SHAFT_LEN);
    tip.castShadow = true;
    pivotGroup.add(tip);

    const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false
    });
    const hitVol = new THREE.Mesh(new THREE.BoxGeometry(22, 34, 32), hitMat);
    hitVol.position.set(0, 0, SHAFT_LEN * 0.45);
    pivotGroup.add(hitVol);

    const lz = panelDepth / 2 + 1.5;
    const labelW = compact ? 14 : 15;
    const labelH = compact ? 6 : 6.5;
    posLabels.forEach(({ text, dx, dy }) => {
        addLabel(root, text, xPos + dx, dy, lz, labelW, labelH, 30, '#b8c8d4');
    });
    addLabel(root, labelBelow, xPos, -panelH / 2 + 8, lz, 26, 6.5, 26, '#c8d4de');

    let cur = 0;
    const N = positions.length;
    let curAngle = positions[0];
    let targetAngle = positions[0];
    let lastStepAt = 0;

    if (axis === 'y') pivotGroup.rotation.y = curAngle;
    else if (axis === 'x') pivotGroup.rotation.x = curAngle;
    else pivotGroup.rotation.z = curAngle;

    function applyAngle(a) {
        if (axis === 'y') pivotGroup.rotation.y = a;
        else if (axis === 'x') pivotGroup.rotation.x = a;
        else pivotGroup.rotation.z = a;
    }

    return {
        pivotGroup,
        getState: () => cur,
        setState: (idx) => {
            const clamped = Math.max(0, Math.min(N - 1, idx | 0));
            cur = clamped;
            targetAngle = positions[cur];
            curAngle = targetAngle;
            applyAngle(curAngle);
        },
        step: (dir) => {
            const now = performance.now();
            if (now - lastStepAt < MIN_STEP_MS) return false;
            const next = Math.max(0, Math.min(N - 1, cur + dir));
            if (cur !== next) {
                cur = next;
                targetAngle = positions[cur];
                lastStepAt = now;
                return true;
            }
            return false;
        },
        update: (dt) => {
            const d = Math.min(Math.max(dt, 0), 0.1);
            curAngle = THREE.MathUtils.damp(curAngle, targetAngle, ANGLE_DAMP_LAMBDA, d);
            if (Math.abs(targetAngle - curAngle) < 0.0008) curAngle = targetAngle;
            applyAngle(curAngle);
        }
    };
}

export function initRadarPwsSwitches3D(mount, options) {
    if (!mount) return { destroy: () => { } };

    const onChange = options && typeof options.onChange === 'function' ? options.onChange : () => { };
    const onUserInteraction = options && typeof options.onUserInteraction === 'function' ? options.onUserInteraction : null;
    const compact = options && options.compact !== undefined ? !!options.compact : true;

    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    mount.innerHTML = '';
    mount.appendChild(canvas);
    mount.style.cssText += ';padding:0;margin:0;overflow:hidden;line-height:0;font-size:0;box-sizing:border-box;';

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText =
        'display:block;width:100%;height:100%;margin:0;padding:0;outline:none;-webkit-tap-highlight-color:transparent;touch-action:none;vertical-align:top;';

    const scene = new THREE.Scene();
    scene.background = null;

    const root = new THREE.Group();
    scene.add(root);

    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);

    scene.add(new THREE.AmbientLight(0x2c3c50, 0.82));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.25);
    key.position.set(80, 120, 200);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x405878, 0.55);
    fill.position.set(-80, 60, 100);
    scene.add(fill);
    const back = new THREE.DirectionalLight(0x101820, 0.35);
    back.position.set(0, -80, -60);
    scene.add(back);

    const panelBase = readCssColorVar('--airbus-subpanel', '#2f3f52');
    const matPanel = new THREE.MeshStandardMaterial({ color: panelBase.clone(), roughness: 0.78, metalness: 0.22 });
    const matPanelFace = new THREE.MeshStandardMaterial({ color: panelBase.clone(), roughness: 0.78, metalness: 0.22 });
    const matBushing = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: 0.5, metalness: 0.7 });
    const matHole = new THREE.MeshBasicMaterial({ color: 0x050809, toneMapped: false });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x283038, roughness: 0.55, metalness: 0.6 });
    const matPureMetal = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, roughness: 0.12, metalness: 1.0 });

    const mats = { matBushing, matHole, matPureMetal };

    const PW = compact ? 102 : 118;
    const PH = compact ? 76 : 88;
    const PD = 10;

    const panel = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PD), matPanel);
    panel.receiveShadow = true;
    root.add(panel);

    const face = new THREE.Mesh(new THREE.BoxGeometry(PW - 4, PH - 4, 1.2), matPanelFace);
    face.position.z = PD / 2 + 0.5;
    root.add(face);

    const trimT = 3;
    const trimOut = 1;
    [
        [0, PH / 2 + trimOut, new THREE.BoxGeometry(PW + 4, trimT, PD + 1)],
        [0, -PH / 2 - trimOut, new THREE.BoxGeometry(PW + 4, trimT, PD + 1)],
        [PW / 2 + trimOut, 0, new THREE.BoxGeometry(trimT, PH, PD + 1)],
        [-PW / 2 - trimOut, 0, new THREE.BoxGeometry(trimT, PH, PD + 1)]
    ].forEach(([x, y, geo]) => {
        const m = new THREE.Mesh(geo, trimMat);
        m.position.set(x, y, 0);
        root.add(m);
    });

    const cInset = 5;
    [
        [-PW / 2 + cInset, -PH / 2 + cInset],
        [PW / 2 - cInset, -PH / 2 + cInset],
        [-PW / 2 + cInset, PH / 2 - cInset],
        [PW / 2 - cInset, PH / 2 - cInset]
    ].forEach(([x, y]) => {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.5, 16), matBushing);
        h.rotation.x = Math.PI / 2;
        h.position.set(x, y, PD / 2 + 0.6);
        root.add(h);
        const i = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 12), matHole);
        i.rotation.x = Math.PI / 2;
        i.position.set(x, y, PD / 2 + 0.8);
        root.add(i);
    });

    const TILT = 0.52;
    const xGap = compact ? 20 : 34;

    const sysSwitch = buildToggle(
        root,
        -xGap,
        PD,
        PW,
        PH,
        [-TILT, 0, TILT],
        'y',
        'SYS',
        [
            { text: '1', dx: -14, dy: 8 },
            { text: 'OFF', dx: 0, dy: 18 },
            { text: '2', dx: 14, dy: 8 }
        ],
        mats,
        compact
    );

    const pwsSwitch = buildToggle(
        root,
        xGap,
        PD,
        PW,
        PH,
        [-TILT, TILT],
        'y',
        'PWS',
        [
            { text: 'OFF', dx: -12, dy: 7 },
            { text: 'AUTO', dx: 12, dy: 7 }
        ],
        mats,
        compact
    );

    root.scale.setScalar(1.48);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let activeSwitch = null;
    let lastPointerX = 0;
    let dragAccum = 0;
    let activePointerId = null;

    function notify() {
        onChange({
            sys: sysSwitch.getState(),
            pws: pwsSwitch.getState()
        });
    }

    function pointerPosToMouse(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        mouse.x = x * 2 - 1;
        mouse.y = -(y * 2 - 1);
    }

    function pickSwitchAt(clientX, clientY) {
        pointerPosToMouse(clientX, clientY);
        raycaster.setFromCamera(mouse, cam);
        const sysHit = raycaster.intersectObjects([sysSwitch.pivotGroup], true).length > 0;
        const pwsHit = raycaster.intersectObjects([pwsSwitch.pivotGroup], true).length > 0;
        if (sysHit) return sysSwitch;
        if (pwsHit) return pwsSwitch;
        return null;
    }

    function consumeDragAccum(sw) {
        let any = false;
        while (dragAccum >= DRAG_PX_PER_STEP) {
            if (sw.step(1)) any = true;
            dragAccum -= DRAG_PX_PER_STEP;
        }
        while (dragAccum <= -DRAG_PX_PER_STEP) {
            if (sw.step(-1)) any = true;
            dragAccum += DRAG_PX_PER_STEP;
        }
        dragAccum = Math.max(-DRAG_PX_PER_STEP + 1, Math.min(DRAG_PX_PER_STEP - 1, dragAccum));
        if (any) notify();
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const picked = pickSwitchAt(e.clientX, e.clientY);
        if (!picked) return;
        e.preventDefault();
        if (onUserInteraction) onUserInteraction();
        activeSwitch = picked;
        lastPointerX = e.clientX;
        dragAccum = 0;
        activePointerId = e.pointerId;
        try {
            canvas.setPointerCapture(activePointerId);
        } catch (err) { }
    }

    function onPointerMove(e) {
        if (!activeSwitch || activePointerId !== e.pointerId) return;
        e.preventDefault();
        if (onUserInteraction) onUserInteraction();
        const dx = e.clientX - lastPointerX;
        lastPointerX = e.clientX;
        dragAccum += dx;
        consumeDragAccum(activeSwitch);
    }

    function endDrag(e) {
        if (!activeSwitch) return;
        if (activePointerId === e.pointerId) {
            try { canvas.releasePointerCapture(activePointerId); } catch (err) { }
        }
        activeSwitch = null;
        activePointerId = null;
        dragAccum = 0;
    }

    let touchActive = false;
    function onTouchStart(ev) {
        if (ev.touches.length !== 1) return;
        const t = ev.touches[0];
        const picked = pickSwitchAt(t.clientX, t.clientY);
        if (!picked) return;
        ev.preventDefault();
        if (onUserInteraction) onUserInteraction();
        touchActive = true;
        activeSwitch = picked;
        lastPointerX = t.clientX;
        dragAccum = 0;
        activePointerId = t.identifier;
    }
    function onTouchMove(ev) {
        if (!touchActive || !activeSwitch) return;
        const t = ev.touches[0];
        if (!t || t.identifier !== activePointerId) return;
        ev.preventDefault();
        if (onUserInteraction) onUserInteraction();
        const dx = t.clientX - lastPointerX;
        lastPointerX = t.clientX;
        dragAccum += dx;
        consumeDragAccum(activeSwitch);
    }
    function onTouchEnd(ev) {
        if (!touchActive) return;
        for (let i = 0; i < ev.changedTouches.length; i++) {
            if (ev.changedTouches[i].identifier === activePointerId) {
                touchActive = false;
                activeSwitch = null;
                activePointerId = null;
                dragAccum = 0;
                return;
            }
        }
    }

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    let raf = 0;
    let destroyed = false;

    function fitCameraToRoot() {
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const margin = 1.07;
        const vFOV = (cam.fov * Math.PI) / 180;
        const tanHalfV = Math.tan(vFOV / 2);
        const halfH = size.y / 2;
        const halfW = size.x / 2;
        const distV = halfH / tanHalfV;
        const distH = halfW / (tanHalfV * Math.max(0.001, cam.aspect));
        const dist = Math.max(distV, distH, 120) * margin;
        cam.position.set(center.x, center.y + size.y * 0.08, center.z + dist);
        cam.lookAt(center.x, center.y, center.z);
    }

    function resize() {
        if (!mount.isConnected) return;
        const w = Math.max(1, mount.clientWidth | 0);
        const h = Math.max(1, mount.clientHeight | 0);
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        fitCameraToRoot();
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(mount);
    resize();

    const clock = new THREE.Clock();

    function animate() {
        if (destroyed) return;
        const dt = clock.getDelta();
        sysSwitch.update(dt);
        pwsSwitch.update(dt);
        renderer.render(scene, cam);
        raf = requestAnimationFrame(animate);
    }

    animate();

    return {
        getState: () => ({ sys: sysSwitch.getState(), pws: pwsSwitch.getState() }),
        /** Apply positions from sim/L:Var poll without re-emitting onChange (avoids feedback loops). */
        applySimState: (s) => {
            if (s && typeof s.sys === 'number' && s.sys !== sysSwitch.getState()) sysSwitch.setState(s.sys);
            if (s && typeof s.pws === 'number' && s.pws !== pwsSwitch.getState()) pwsSwitch.setState(s.pws);
        },
        setState: (s) => {
            if (s && typeof s.sys === 'number') sysSwitch.setState(s.sys);
            if (s && typeof s.pws === 'number') pwsSwitch.setState(s.pws);
            notify();
        },
        destroy: () => {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', endDrag);
            canvas.removeEventListener('pointercancel', endDrag);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchcancel', onTouchEnd);
            try { ro.disconnect(); } catch (e) { }
            try { renderer.dispose(); } catch (e) { }
            mount.innerHTML = '';
        }
    };
}

