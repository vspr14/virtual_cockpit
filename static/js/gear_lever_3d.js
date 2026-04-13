import * as THREE from 'three';

const GEAR_LEVER_LERP = 0.22;

function readCssColor(prop, fallbackHex) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
        if (v) return new THREE.Color().setStyle(v);
    } catch (e) { }
    return new THREE.Color().setStyle(fallbackHex);
}

function resolveMountSurfaceColor(mount) {
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

function basicFromColor(col) {
    const m = new THREE.MeshBasicMaterial({ color: col.clone() });
    if ('toneMapped' in m) m.toneMapped = false;
    return m;
}

export function initGearLever3D(mount, options) {
    const onCommit = options && typeof options.onCommit === 'function' ? options.onCommit : function () { };
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.position.set(0, -7, 56);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    const surfaceCol = resolveMountSurfaceColor(mount);
    scene.background = surfaceCol.clone();
    renderer.domElement.style.outline = 'none';
    renderer.domElement.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5, 5, 10);
    scene.add(sun);
    const subCol = readCssColor('--airbus-subpanel', '#2f3f52');
    const airbusBlue = basicFromColor(surfaceCol.clone());
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x010101, roughness: 1 });
    const darkAirbusBlue = new THREE.MeshStandardMaterial({ color: subCol.clone(), roughness: 0.8 });
    if ('toneMapped' in darkAirbusBlue) darkAirbusBlue.toneMapped = false;
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.9 });
    const root = new THREE.Group();
    scene.add(root);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(9, 10, 0.5), airbusBlue));
    const slotHeight = 9;
    const slotPosY = -3;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(3.45, slotHeight, 1.58), slotMat);
    slot.position.set(0, slotPosY, -0.4);
    root.add(slot);
    const leverPivot = new THREE.Group();
    leverPivot.position.set(0, -4, -3.5);
    root.add(leverPivot);
    const leverArm = new THREE.Group();
    leverPivot.add(leverArm);
    const leverBar = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 10.25), darkAirbusBlue);
    leverBar.position.z = 5;
    leverArm.add(leverBar);
    const wheelGroup = new THREE.Group();
    wheelGroup.position.z = 10;
    wheelGroup.rotation.y = Math.PI / 2;
    leverArm.add(wheelGroup);
    const tireMajor = 1.38;
    const tireTube = 0.52;
    const tireGeom = new THREE.TorusGeometry(tireMajor, tireTube, 24, 48);
    const capGeom = new THREE.CircleGeometry(tireMajor, 32);
    const lateralOffset = 0.47;
    const capZ = 0.23;
    [lateralOffset, -lateralOffset].forEach(function (zOff) {
        const tire = new THREE.Mesh(tireGeom, tireMat);
        tire.position.z = zOff;
        wheelGroup.add(tire);
        const outerCap = new THREE.Mesh(capGeom, tireMat);
        outerCap.position.z = zOff + capZ;
        wheelGroup.add(outerCap);
        const innerCap = new THREE.Mesh(capGeom, tireMat);
        innerCap.position.z = zOff - capZ;
        innerCap.rotation.y = Math.PI;
        wheelGroup.add(innerCap);
    });
    wheelGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.05, 16), darkAirbusBlue));
    root.scale.setScalar(0.78);
    let targetProgress = 0;
    let currentProgress = 0;
    let isDragging = false;
    let startY = 0;
    let lastCommittedDown = true;
    function ndcFromEvent(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
    function hitWheel(e) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndcFromEvent(e), camera);
        return raycaster.intersectObjects(wheelGroup.children, false).length > 0;
    }
    renderer.domElement.addEventListener('pointerdown', function (e) {
        if (!hitWheel(e)) return;
        isDragging = true;
        startY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
    });
    renderer.domElement.addEventListener('pointermove', function (e) {
        if (!isDragging) return;
        const diff = (startY - e.clientY) / 300;
        targetProgress = Math.max(0, Math.min(1, targetProgress + diff));
        startY = e.clientY;
    });
    renderer.domElement.addEventListener('pointerup', function (e) {
        if (!isDragging) return;
        isDragging = false;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) { }
        targetProgress = targetProgress > 0.5 ? 1 : 0;
        const down = targetProgress <= 0.5;
        if (down !== lastCommittedDown) {
            lastCommittedDown = down;
            onCommit(down);
        }
    });
    renderer.domElement.addEventListener('pointercancel', function (e) {
        if (isDragging) {
            try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) { }
        }
        isDragging = false;
    });
    function frameCameraToRoot() {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) return;
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const margin = 1.05;
        const vFov = (camera.fov * Math.PI) / 180;
        const aspect = Math.max(0.001, camera.aspect);
        const distY = (size.y * margin) / (2 * Math.tan(vFov / 2));
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const distX = (size.x * margin) / (2 * Math.tan(hFov / 2));
        let dist = Math.max(distX, distY, 11);
        dist *= 1.02;
        camera.position.set(center.x, center.y - dist * 0.1, center.z + dist);
        camera.lookAt(center);
        camera.near = Math.max(0.05, dist * 0.008);
        camera.far = dist * 80;
        camera.updateProjectionMatrix();
    }
    function syncSize() {
        const w = Math.max(80, Math.floor(mount.clientWidth));
        const h = Math.max(100, Math.floor(mount.clientHeight));
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        frameCameraToRoot();
    }
    syncSize();
    requestAnimationFrame(syncSize);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncSize).observe(mount);
    }
    window.addEventListener('resize', syncSize);
    function animate() {
        requestAnimationFrame(animate);
        currentProgress = THREE.MathUtils.lerp(currentProgress, targetProgress, GEAR_LEVER_LERP);
        leverArm.rotation.x = THREE.MathUtils.lerp(0.45, -0.65, currentProgress);
        renderer.render(scene, camera);
    }
    animate();
}
