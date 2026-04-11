import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export function attachMetalToggle(viewportEl, { positions = 2, initialState = 0, onStateChange } = {}) {
    if (!viewportEl || typeof onStateChange !== 'function') return null;

    const maxIdx = Math.max(1, positions - 1);
    let state = Math.min(maxIdx, Math.max(0, initialState | 0));
    const angles =
        positions >= 3
            ? [0.72, 0, -0.72]
            : [-0.66, 0.66];

    const scene = new THREE.Scene();
    const bgHex = 0x0d1118;
    scene.background = new THREE.Color(bgHex);
    const rect0 = viewportEl.getBoundingClientRect();
    let w = Math.max(64, Math.floor(rect0.width)) || 104;
    let h = Math.max(64, Math.floor(rect0.height)) || 104;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.02, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(bgHex, 1);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.background = '#0d1118';
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.0;
    viewportEl.innerHTML = '';
    viewportEl.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(0.6, 9, 1.2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xb8cce8, 0.45);
    rimLight.position.set(-1.2, 0.85, 1.6);
    scene.add(rimLight);

    const panelBgMat = new THREE.MeshBasicMaterial({ color: bgHex });
    if ('toneMapped' in panelBgMat) panelBgMat.toneMapped = false;
    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.15,
        side: THREE.DoubleSide,
    });

    const canvasTex = document.createElement('canvas');
    canvasTex.width = 256;
    canvasTex.height = 256;
    const ctx = canvasTex.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#555');
    grad.addColorStop(0.5, '#aaa');
    grad.addColorStop(1, '#555');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 20;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 60 + 20);
        ctx.lineTo(256, i * 60 + 20);
        ctx.stroke();
    }
    const stripedMat = new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(canvasTex),
        metalness: 0.9,
        roughness: 0.3,
        side: THREE.DoubleSide,
    });

    const root = new THREE.Group();
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(0.22);
    scene.add(root);

    const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 0.2), panelBgMat);
    panelMesh.name = 'ovhd_panel';
    root.add(panelMesh);

    const baseGroup = new THREE.Group();
    baseGroup.position.z = 0.05;
    root.add(baseGroup);

    const recessMatBlack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    if ('toneMapped' in recessMatBlack) recessMatBlack.toneMapped = false;
    const recess = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.1, 0.2, 32), recessMatBlack);
    recess.rotation.x = Math.PI / 2;
    baseGroup.add(recess);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.2, 0.04, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    ring.position.z = 0.1;
    baseGroup.add(ring);

    const pivot = new THREE.Group();
    pivot.position.z = 0.05;
    root.add(pivot);

    const stemGeom = new THREE.CylinderGeometry(0.08, 0.17, 1.4, 16);
    const stem = new THREE.Mesh(stemGeom, chromeMat);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.7;
    pivot.add(stem);

    const headGeom = new THREE.BoxGeometry(0.7, 0.15, 0.9);
    const head = new THREE.Mesh(headGeom, stripedMat);
    head.position.z = 1.4;
    pivot.add(head);

    pivot.rotation.x = angles[state];

    const setupFixedCamera = () => {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = Math.max(0.001, camera.aspect);
        const halfH = Math.max(size.x, size.y, 0.01) * 0.52;
        const halfW = halfH * aspect;
        const distV = halfH / Math.tan(fovRad / 2);
        const distH = halfW / (Math.tan(fovRad / 2) * aspect);
        const dist = Math.max(distV, distH) * 1.06;
        const viewN = new THREE.Vector3(0, 0, 1);
        camera.position.copy(center).addScaledVector(viewN, dist);
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
    };
    setupFixedCamera();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragFromHit = false;
    let startY = 0;
    let startX = 0;
    let movedPx = 0;
    const threshold = 32;

    const pickables = [recess, ring, stem, head];
    const canvas = renderer.domElement;

    const setMouseFromEvent = (e) => {
        const r = canvas.getBoundingClientRect();
        const rw = Math.max(1, r.width);
        const rh = Math.max(1, r.height);
        mouse.x = ((e.clientX - r.left) / rw) * 2 - 1;
        mouse.y = -((e.clientY - r.top) / rh) * 2 + 1;
    };

    const pickSet = new Set(pickables);

    const tryHit = (e) => {
        setMouseFromEvent(e);
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(root, true);
        for (let i = 0; i < hits.length; i++) {
            const o = hits[i].object;
            if (o.name === 'ovhd_panel') return false;
            if (pickSet.has(o)) return true;
        }
        return false;
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (!tryHit(e)) return;
        dragFromHit = true;
        isDragging = true;
        startY = e.clientY;
        startX = e.clientX;
        movedPx = 0;
        viewportEl.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDragging || !dragFromHit) return;
        movedPx = Math.max(movedPx, Math.hypot(e.clientX - startX, e.clientY - startY));
        const diff = e.clientY - startY;
        if (Math.abs(diff) > threshold) {
            if (diff > 0 && state > 0) {
                state--;
                onStateChange(state);
                startY = e.clientY;
                startX = e.clientX;
            } else if (diff < 0 && state < maxIdx) {
                state++;
                onStateChange(state);
                startY = e.clientY;
                startX = e.clientX;
            }
        }
    };

    const onPointerUp = (e) => {
        if (dragFromHit && isDragging && viewportEl.hasPointerCapture(e.pointerId)) {
            viewportEl.releasePointerCapture(e.pointerId);
            if (movedPx < 14 && positions === 2) {
                state = state === 0 ? 1 : 0;
                onStateChange(state);
            }
        }
        isDragging = false;
        dragFromHit = false;
    };

    viewportEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    viewportEl.addEventListener('pointermove', onPointerMove, { passive: false });
    viewportEl.addEventListener('pointerup', onPointerUp);
    viewportEl.addEventListener('pointercancel', onPointerUp);

    let raf = 0;
    const resize = () => {
        const r = viewportEl.getBoundingClientRect();
        const nw = Math.max(64, Math.floor(r.width)) || 104;
        const nh = Math.max(64, Math.floor(r.height)) || 104;
        if (nw === w && nh === h) return;
        w = nw;
        h = nh;
        camera.aspect = w / h;
        setupFixedCamera();
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(viewportEl);
    resize();

    const animClock = new THREE.Clock();
    animClock.getDelta();
    const pivotSmooth = 16;
    const tick = () => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(animClock.getDelta(), 0.05);
        pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x, angles[state], pivotSmooth, dt);
        renderer.render(scene, camera);
    };
    tick();

    return {
        dispose() {
            cancelAnimationFrame(raf);
            ro.disconnect();
            viewportEl.removeEventListener('pointerdown', onPointerDown);
            viewportEl.removeEventListener('pointermove', onPointerMove);
            viewportEl.removeEventListener('pointerup', onPointerUp);
            viewportEl.removeEventListener('pointercancel', onPointerUp);
            renderer.dispose();
            stripedMat.map?.dispose?.();
            recessMatBlack.dispose?.();
            panelBgMat.dispose?.();
            canvas.remove();
        },
    };
}
