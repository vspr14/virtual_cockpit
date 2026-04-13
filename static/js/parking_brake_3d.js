import * as THREE from 'three';

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
    return readCssColor('--airbus-panel', '#384a5f');
}

function createRoundedRect(width, height, r) {
    const s = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    s.moveTo(-w + r, h);
    s.lineTo(w - r, h);
    s.quadraticCurveTo(w, h, w, h - r);
    s.lineTo(w, -h + r);
    s.quadraticCurveTo(w, -h, w - r, -h);
    s.lineTo(-w + r, -h);
    s.quadraticCurveTo(-w, -h, -w, -h + r);
    s.lineTo(-w, h - r);
    s.quadraticCurveTo(-w, h, -w + r, h);
    return s;
}

export function initParkingBrake3D(mount, options) {
    const onToggle = options && typeof options.onToggle === 'function' ? options.onToggle : function () { };
    const sourceTag = options && options.sourceTag ? String(options.sourceTag) : 'main';
    let isBrakeOn = options && typeof options.initialOn === 'boolean' ? options.initialOn : true;

    const panelCol = backdropColorFromMount(mount);
    const labelCol = readCssColor('--airbus-label', '#c8cdd8');
    const subCol = readCssColor('--airbus-subpanel', '#2f3f52');
    const arcStroke = labelCol.clone().offsetHSL(0, 0, 0.12);
    const textFill = labelCol.clone();

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, -2, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;

    mount.style.cssText += ';padding:0;margin:0;overflow:hidden;line-height:0;font-size:0;display:block;';
    renderer.domElement.style.cssText =
        'display:block;width:100%;height:100%;outline:none;-webkit-tap-highlight-color:transparent;touch-action:none;';
    mount.appendChild(renderer.domElement);

    const panelMat = new THREE.MeshBasicMaterial({ color: panelCol.clone() });
    const blackMat = new THREE.MeshBasicMaterial({ color: subCol.clone().multiplyScalar(0.35) });
    const fillMat = new THREE.MeshBasicMaterial({ color: panelCol.clone().lerp(new THREE.Color(0xffffff), 0.35) });
    const shaftMat = new THREE.MeshBasicMaterial({ color: panelCol.clone().lerp(new THREE.Color(0xa8b8c8), 0.5) });
    [panelMat, blackMat, fillMat, shaftMat].forEach(function (m) {
        if (m && 'toneMapped' in m) m.toneMapped = false;
    });

    const panelGroup = new THREE.Group();
    const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 1), panelMat);
    panelMesh.position.z = -0.5;
    panelGroup.add(panelMesh);

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = 512;
    const cy = 512;
    const radius = 280;
    const arcRgb = '#' + arcStroke.getHexString();
    const offRgb = '#' + textFill.getHexString();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, 0);
    ctx.strokeStyle = arcRgb;
    ctx.lineWidth = 25;
    ctx.stroke();

    ctx.fillStyle = offRgb;
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OFF', cx, cy - radius - 50);
    ctx.fillRect(cx - 5, cy - radius - 25, 10, 25);
    ctx.fillText('ON', cx + radius + 60, cy);
    ctx.fillRect(cx + radius, cy - 5, 25, 10);
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('PARK BRAKE', cx, 56);

    const decalTex = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in decalTex && THREE.SRGBColorSpace !== undefined) decalTex.colorSpace = THREE.SRGBColorSpace;
    const decalMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, toneMapped: false })
    );
    decalMesh.position.z = 0.01;
    panelGroup.add(decalMesh);
    scene.add(panelGroup);

    const handleGroup = new THREE.Group();
    const baseElevation = 1;
    const baseHandleY = 0;
    const pullOutMax = 1.05;
    handleGroup.position.z = baseElevation;
    handleGroup.position.y = baseHandleY;

    const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 32), shaftMat);
    shaftMesh.rotation.x = Math.PI / 2;
    shaftMesh.position.z = -2.5;
    handleGroup.add(shaftMesh);

    const rectGeo = new THREE.ExtrudeGeometry(createRoundedRect(8.5, 2.2, 0.3), {
        depth: 0.5,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
    });
    const rectMesh = new THREE.Mesh(rectGeo, blackMat);
    rectMesh.position.z = 0;
    handleGroup.add(rectMesh);

    const pointerShape = new THREE.Shape();
    pointerShape.moveTo(-1.5, 1.1);
    pointerShape.bezierCurveTo(-0.8, 1.8, -0.4, 3.0, -0.2, 3.8);
    pointerShape.lineTo(0.2, 3.8);
    pointerShape.bezierCurveTo(0.4, 3.0, 0.8, 1.8, 1.5, 1.1);
    pointerShape.lineTo(-1.5, 1.1);
    const pointerHole = new THREE.Path();
    pointerHole.moveTo(-1.1, 1.2);
    pointerHole.bezierCurveTo(-0.5, 1.8, -0.2, 2.8, -0.1, 3.5);
    pointerHole.lineTo(0.1, 3.5);
    pointerHole.bezierCurveTo(0.2, 2.8, 0.5, 1.8, 1.1, 1.2);
    pointerHole.lineTo(-1.1, 1.2);
    pointerShape.holes.push(pointerHole);
    const pointerMesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(pointerShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 }),
        blackMat
    );
    pointerMesh.position.z = -0.1;
    handleGroup.add(pointerMesh);

    const fillShape = new THREE.Shape();
    fillShape.moveTo(-1.2, 0.5);
    fillShape.bezierCurveTo(-0.5, 1.8, -0.2, 2.8, -0.1, 3.6);
    fillShape.lineTo(0.1, 3.6);
    fillShape.bezierCurveTo(0.2, 2.8, 0.5, 1.8, 1.2, 0.5);
    fillShape.lineTo(-1.2, 0.5);
    const fillMesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(fillShape, { depth: 0.2, bevelEnabled: false }),
        fillMat
    );
    fillMesh.position.z = -0.05;
    handleGroup.add(fillMesh);

    const textCanvas = document.createElement('canvas');
    textCanvas.width = 1024;
    textCanvas.height = 256;
    const tCtx = textCanvas.getContext('2d');
    tCtx.clearRect(0, 0, 1024, 256);
    tCtx.fillStyle = offRgb;
    tCtx.font = "bold 140px Arial, sans-serif";
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText('PARK BRK', 512, 128);
    const textTex = new THREE.CanvasTexture(textCanvas);
    if ('colorSpace' in textTex && THREE.SRGBColorSpace !== undefined) textTex.colorSpace = THREE.SRGBColorSpace;
    const textPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(8.2, 2.05),
        new THREE.MeshBasicMaterial({ map: textTex, transparent: true, toneMapped: false })
    );
    textPlane.position.z = 0.57;
    handleGroup.add(textPlane);

    scene.add(handleGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isAnimating = false;

    function setHandleRotation(on) {
        handleGroup.rotation.z = on ? -Math.PI / 2 : 0;
        handleGroup.position.z = baseElevation;
        handleGroup.position.y = baseHandleY;
    }

    setHandleRotation(isBrakeOn);

    function applyVisualState(on) {
        isBrakeOn = !!on;
        setHandleRotation(isBrakeOn);
    }

    function frameCamera() {
        const merged = new THREE.Box3();
        scene.traverse(function (o) {
            if (o.isMesh) {
                o.updateMatrixWorld(true);
                merged.expandByObject(o);
            }
        });
        if (merged.isEmpty()) return;
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        merged.getCenter(center);
        merged.getSize(size);
        const pad = 1.04;
        const vFovRad = (camera.fov * Math.PI) / 180;
        const aspect = Math.max(0.001, camera.aspect);
        const tanHalfV = Math.tan(vFovRad / 2);
        const tanHalfH = tanHalfV * aspect;
        const needH = size.y * pad;
        const needW = size.x * pad;
        const distY = needH / (2 * tanHalfV);
        const distX = needW / (2 * tanHalfH);
        let dist;
        if (aspect < 1) {
            dist = distY;
            if (2 * tanHalfH * dist < needW) {
                dist = distX;
            }
        } else {
            dist = distX;
            if (2 * tanHalfV * dist < needH) {
                dist = distY;
            }
        }
        dist = Math.max(dist, 5.5);
        camera.position.set(center.x, center.y - 0.6, center.z + dist);
        camera.near = Math.max(0.04, dist * 0.015);
        camera.far = Math.max(160, dist * 8);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
    }

    function syncSize() {
        const w = Math.max(100, Math.floor(mount.clientWidth));
        const h = Math.max(120, Math.floor(mount.clientHeight));
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        frameCamera();
    }
    syncSize();
    requestAnimationFrame(syncSize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSize).observe(mount);
    window.addEventListener('resize', syncSize);

    function pointerHitHandle(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects([handleGroup], true).length > 0;
    }

    function onHandlePointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (isAnimating) return;
        if (!pointerHitHandle(e.clientX, e.clientY)) return;
        e.preventDefault();
        isAnimating = true;
        isBrakeOn = !isBrakeOn;
        const startRot = handleGroup.rotation.z;
        const targetRot = isBrakeOn ? -Math.PI / 2 : 0;
        const startTime = performance.now();
        const duration = 480;
        function animateTransition(time) {
            const t = Math.min((time - startTime) / duration, 1);
            const easeT = 1 - Math.pow(1 - t, 3);
            const pull = Math.sin(t * Math.PI) * pullOutMax;
            handleGroup.rotation.z = startRot + (targetRot - startRot) * easeT;
            handleGroup.position.z = baseElevation + pull;
            handleGroup.position.y = baseHandleY - pull * 0.22;
            if (t < 1) {
                requestAnimationFrame(animateTransition);
            } else {
                handleGroup.position.z = baseElevation;
                handleGroup.position.y = baseHandleY;
                isAnimating = false;
                onToggle(sourceTag, isBrakeOn);
            }
        }
        requestAnimationFrame(animateTransition);
    }

    renderer.domElement.addEventListener('pointerdown', onHandlePointerDown, { passive: false });

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    return {
        applyVisualState: applyVisualState,
        getState: function () { return isBrakeOn; },
    };
}
