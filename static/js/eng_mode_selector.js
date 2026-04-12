import * as THREE from 'three';

const ENG_LABEL_WORLD_MUL = 0.00635 * 1.5;
const ENG_VIEW_MAG = 1.1;

function readPanelBgCss() {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--airbus-panel').trim();
        if (v) return v;
    } catch (e) {}
    return '#384a5f';
}

function resolveEngPanelColor(viewportEl) {
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

function syncEngModeHidden(p) {
    document.querySelectorAll('.eng-mode-pos').forEach((el) => {
        const m = parseInt(el.dataset.mode, 10);
        el.classList.toggle('selected', m === p);
    });
}

function makeEngLabelPlane(text, { w = 480, h = 144, fontPx = 65 } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.font = `500 ${fontPx}px Barlow Condensed, "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(248,250,252,0.98)';
    g.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const pw = w * ENG_LABEL_WORLD_MUL;
    const ph = h * ENG_LABEL_WORLD_MUL;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: true,
        })
    );
    if ('toneMapped' in mesh.material) mesh.material.toneMapped = false;
    mesh.renderOrder = 4;
    return { mesh, tex, w, h, fontPx };
}

function makeEngLabelStack(lines, { w = 420, h = 198, fontPx = 53, lineGap = 1.42 } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.font = `500 ${fontPx}px Barlow Condensed, "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(248,250,252,0.98)';
    const lh = fontPx * lineGap;
    const block = (lines.length - 1) * lh;
    let y = h * 0.5 - block * 0.5;
    for (let i = 0; i < lines.length; i++) {
        g.fillText(lines[i], w * 0.5, y);
        y += lh;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const pw = w * ENG_LABEL_WORLD_MUL;
    const ph = h * ENG_LABEL_WORLD_MUL;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: true,
        })
    );
    if ('toneMapped' in mesh.material) mesh.material.toneMapped = false;
    mesh.renderOrder = 4;
    return { mesh, tex, w, h, fontPx };
}

function attachDullEngMode(viewportEl, rootEl, { emit }) {
    let w = 280;
    let h = 150;
    let raf = 0;
    let resizeDoneOnce = false;

    const bgResolved = resolveEngPanelColor(viewportEl);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, w / Math.max(h, 1), 0.05, 120);

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    if ('SRGBColorSpace' in THREE) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.background = 'transparent';
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.38;

    viewportEl.innerHTML = '';
    try {
        viewportEl.style.backgroundColor = bgResolved.css;
    } catch (e) {}
    viewportEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(0.4, 0.35, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa8c0d8, 0.42);
    rim.position.set(-1.4, 0.9, 1.4);
    scene.add(rim);

    const dullPlastic = new THREE.MeshStandardMaterial({
        color: 0xbcbcbc,
        roughness: 1.0,
        metalness: 0.0,
    });

    const dullIndicator = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.7,
    });

    const focusRoot = new THREE.Group();
    scene.add(focusRoot);

    const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.05, 64), dullPlastic);
    basePlate.rotation.x = Math.PI / 2;
    basePlate.position.z = 0.12;
    focusRoot.add(basePlate);

    const knobPivot = new THREE.Group();
    knobPivot.position.z = 0.15;
    focusRoot.add(knobPivot);

    const barShape = new THREE.Shape();
    barShape.moveTo(0, 1.1);
    barShape.quadraticCurveTo(0.3, 1.05, 0.5, 0.85);
    barShape.lineTo(0.5, -1.0);
    barShape.quadraticCurveTo(0, -1.3, -0.5, -1.0);
    barShape.lineTo(-0.5, 0.85);
    barShape.quadraticCurveTo(-0.3, 1.05, 0, 1.1);

    const barGeom = new THREE.ExtrudeGeometry(barShape, {
        depth: 1.1,
        bevelEnabled: true,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        bevelSegments: 2,
    });
    const bar = new THREE.Mesh(barGeom, dullPlastic);
    knobPivot.add(bar);

    const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.02), dullIndicator);
    line.position.set(0, 0.55, 1.15);
    knobPivot.add(line);

    let state = 1;
    const dp0 = parseInt(rootEl.dataset.pos, 10);
    if (!Number.isNaN(dp0) && dp0 >= 0 && dp0 <= 2) state = dp0;

    const baseRimR = 1.15;
    const arcStandoff = 0.26;
    const arcRadius = baseRimR + arcStandoff;
    const zArc = 0.118;
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xf2f6fb });
    if ('toneMapped' in arcMat) arcMat.toneMapped = false;
    const ellipseArc = new THREE.EllipseCurve(0, 0, arcRadius, arcRadius, Math.PI / 4, (3 * Math.PI) / 4, false, 0);
    const arcPts2 = ellipseArc.getPoints(56);
    const arcPts3 = arcPts2.map((p) => new THREE.Vector3(p.x, p.y, zArc));
    const arcPath = new THREE.CatmullRomCurve3(arcPts3, false, 'catmullrom', 0.45);
    const arcTubeGeom = new THREE.TubeGeometry(arcPath, 56, 0.011, 8, false);
    const arcTube = new THREE.Mesh(arcTubeGeom, arcMat);
    focusRoot.add(arcTube);

    const tickMat = new THREE.MeshBasicMaterial({ color: 0xf7fafc });
    if ('toneMapped' in tickMat) tickMat.toneMapped = false;
    const bezelPhi = [(3 * Math.PI) / 4, Math.PI / 2, Math.PI / 4];
    const labelMeshes = [];
    const tickGeoms = [];
    const tickLen = 0.22;
    for (let i = 0; i < 3; i++) {
        const phi = bezelPhi[i];
        const tickGeom = new THREE.BoxGeometry(0.018, tickLen, 0.01);
        tickGeoms.push(tickGeom);
        const tick = new THREE.Mesh(tickGeom, tickMat);
        const rTick = arcRadius + tickLen * 0.42;
        tick.position.set(Math.cos(phi) * rTick, Math.sin(phi) * rTick, zArc + 0.003);
        tick.rotation.z = phi - Math.PI / 2;
        focusRoot.add(tick);

        let L;
        if (i === 0) {
            L = makeEngLabelPlane('CRANK', { w: 450, h: 132, fontPx: 59 });
        } else if (i === 1) {
            L = makeEngLabelStack(['NORM'], { w: 390, h: 192, fontPx: 50 });
        } else {
            L = makeEngLabelStack(['IGN/', 'START'], { w: 390, h: 195, fontPx: 50 });
        }
        const labelR = arcRadius + tickLen + 0.3;
        const lx = Math.cos(phi) * labelR;
        const ly = Math.sin(phi) * labelR;
        const lift = 0.2 + Math.sin(phi) * 0.04;
        const ignStartLift = i === 2 ? 0.3 : 0;
        L.mesh.position.set(lx, ly + lift + ignStartLift, zArc + 0.018);
        focusRoot.add(L.mesh);
        labelMeshes.push(L);
    }

    const knobWorldScale = 0.4;
    focusRoot.scale.setScalar(knobWorldScale);

    const angles = [Math.PI / 4, 0, -Math.PI / 4];
    let isDragging = false;
    let startX = 0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const setNdcFromEvent = (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        const rw = Math.max(1, r.width);
        const rh = Math.max(1, r.height);
        pointerNdc.x = ((e.clientX - r.left) / rw) * 2 - 1;
        pointerNdc.y = -((e.clientY - r.top) / rh) * 2 + 1;
    };

    const setupCamera = () => {
        focusRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(focusRoot);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const fovRad = (camera.fov * Math.PI) / 180;
        const tanHalf = Math.tan(fovRad / 2);
        const aspect = Math.max(0.001, camera.aspect);
        const margin = 1.14;
        const halfY = Math.max(size.y * 0.5, 0.01) * margin;
        const halfX = Math.max(size.x * 0.5, 0.01) * margin;
        const distV = halfY / tanHalf;
        const distW = halfX / (tanHalf * aspect);
        const dist = Math.max(distV, distW) / ENG_VIEW_MAG;
        camera.position.copy(center).add(new THREE.Vector3(0, 0, dist));
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
    };

    const syncViewportAspect = () => {
        focusRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(focusRoot);
        const size = new THREE.Vector3();
        box.getSize(size);
        const pct = (size.y / Math.max(size.x, 1e-4)) * 100 * 1.08;
        viewportEl.style.paddingBottom = pct.toFixed(4) + '%';
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        setNdcFromEvent(e);
        raycaster.setFromCamera(pointerNdc, camera);
        if (raycaster.intersectObject(bar).length > 0) {
            isDragging = true;
            startX = e.clientX;
            try {
                viewportEl.setPointerCapture(e.pointerId);
            } catch (err) {}
        }
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        const diff = e.clientX - startX;
        if (Math.abs(diff) > 50) {
            const prev = state;
            if (diff < 0 && state > 0) state--;
            else if (diff > 0 && state < 2) state++;
            startX = e.clientX;
            rootEl.dataset.pos = String(state);
            syncEngModeHidden(state);
            if (prev !== state) emit(state);
        }
    };

    const onPointerUp = (e) => {
        isDragging = false;
        try {
            viewportEl.releasePointerCapture(e.pointerId);
        } catch (err) {}
    };

    viewportEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    viewportEl.addEventListener('pointermove', onPointerMove, { passive: true });
    viewportEl.addEventListener('pointerup', onPointerUp);
    viewportEl.addEventListener('pointercancel', onPointerUp);

    const resize = () => {
        syncViewportAspect();
        const r = viewportEl.getBoundingClientRect();
        const nw = Math.max(160, Math.round(r.width));
        const nh = Math.max(100, Math.round(r.height));
        if (resizeDoneOnce && nw === w && nh === h) return;
        resizeDoneOnce = true;
        w = nw || 280;
        h = nh || 150;
        camera.aspect = w / Math.max(h, 1);
        setupCamera();
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(viewportEl);
    if (viewportEl.parentElement) ro.observe(viewportEl.parentElement);

    const onWinResize = () => {
        resizeDoneOnce = false;
        resize();
    };
    window.addEventListener('resize', onWinResize);

    resize();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            resizeDoneOnce = false;
            resize();
        });
    });

    const animate = () => {
        raf = requestAnimationFrame(animate);
        knobPivot.rotation.z = THREE.MathUtils.lerp(knobPivot.rotation.z, angles[state], 0.2);
        renderer.render(scene, camera);
    };
    animate();

    rootEl.dataset.pos = String(state);
    syncEngModeHidden(state);

    return {
        applyExternal(p) {
            state = Math.min(2, Math.max(0, p | 0));
            rootEl.dataset.pos = String(state);
            syncEngModeHidden(state);
        },
        dispose() {
            cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener('resize', onWinResize);
            viewportEl.removeEventListener('pointerdown', onPointerDown);
            viewportEl.removeEventListener('pointermove', onPointerMove);
            viewportEl.removeEventListener('pointerup', onPointerUp);
            viewportEl.removeEventListener('pointercancel', onPointerUp);
            barGeom.dispose();
            arcTubeGeom.dispose();
            arcMat.dispose();
            tickGeoms.forEach((g) => g.dispose());
            tickMat.dispose();
            labelMeshes.forEach((L) => {
                L.tex.dispose();
                L.mesh.geometry.dispose();
                L.mesh.material.dispose();
            });
            dullPlastic.dispose();
            basePlate.geometry.dispose();
            line.geometry.dispose();
            dullIndicator.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode) renderer.domElement.remove();
        },
    };
}

export async function initEngModeSelector(root, { emit }) {
    if (!root || typeof emit !== 'function') return null;
    const viewport = root.querySelector('.eng-mode-3d-viewport');
    if (!viewport) return null;
    try {
        if (document.fonts?.ready) await document.fonts.ready;
    } catch (e) {}
    return attachDullEngMode(viewport, root, { emit });
}
