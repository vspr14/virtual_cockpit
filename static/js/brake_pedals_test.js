import * as THREE from 'three';

function backdropColorForMount(mount) {
    let el = mount;
    while (el) {
        try {
            const bc = getComputedStyle(el).backgroundColor;
            if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent') {
                return new THREE.Color().setStyle(bc);
            }
        } catch (e) {}
        el = el.parentElement;
    }
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--airbus-subpanel').trim();
        if (v) return new THREE.Color().setStyle(v);
    } catch (e) {}
    return new THREE.Color(0x2f3f52);
}

function makeKnurlTex(renderer, size) {
    const s = size || 512;
    const cv = document.createElement('canvas');
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#3d4f62';
    ctx.fillRect(0, 0, s, s);
    const spacing = s / 32;
    ctx.strokeStyle = 'rgba(20,35,48,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = -s; i < s * 2; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
    }
    for (let i = -s; i < s * 2; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, s);
        ctx.lineTo(i + s, 0);
        ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(130,155,175,0.28)';
    ctx.lineWidth = 0.6;
    for (let i = -s; i < s * 2; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i - 0.8, 0);
        ctx.lineTo(i + s - 0.8, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i - 0.8, s);
        ctx.lineTo(i + s - 0.8, 0);
        ctx.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 4);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function makeFloorTex(renderer, size) {
    const s = size || 512;
    const cv = document.createElement('canvas');
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1e2428';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 1) {
        const brightness = Math.random() * 12 - 6;
        const c = Math.max(0, Math.min(255, 30 + brightness));
        ctx.fillStyle = `rgb(${c},${c + 2},${c + 4})`;
        ctx.fillRect(0, y, s, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let x = 16; x < s; x += 24) {
        for (let y = 16; y < s; y += 24) {
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function makeKnurlNormal(renderer, size) {
    const s = size || 512;
    const cv = document.createElement('canvas');
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, s, s);
    const spacing = s / 32;
    ctx.strokeStyle = 'rgb(180,128,255)';
    ctx.lineWidth = 2;
    for (let i = -s; i < s * 2; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, s);
        ctx.lineTo(i + s, 0);
        ctx.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 4);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
}

function buildPedal(scene, xPos, PW, PH, PD, matPedal, matFace, matMetal, matAxle, matRod, chamferMat, REST_ANGLE) {
    const pivot = new THREE.Group();
    pivot.position.set(xPos, 0, -15);
    scene.add(pivot);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PD), matPedal);
    plate.position.set(0, PH / 2, 0);
    plate.castShadow = true;
    plate.receiveShadow = true;
    pivot.add(plate);
    const face = new THREE.Mesh(new THREE.BoxGeometry(PW - 4, PH - 6, 1.8), matFace);
    face.position.set(0, PH / 2, PD / 2 + 0.8);
    face.castShadow = true;
    pivot.add(face);
    [-1, 1].forEach(function (sgn) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(3.5, PH + 2, PD + 2), matMetal);
        e.position.set(sgn * (PW / 2 + 1.75), PH / 2, 0);
        e.castShadow = true;
        pivot.add(e);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(1, PH + 2, 1), chamferMat);
        ch.position.set(sgn * (PW / 2 + 0.5), PH / 2, PD / 2 + 0.5);
        pivot.add(ch);
    });
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(PW + 5, 4, PD + 3), matMetal);
    topBar.position.set(0, PH + 2, 0);
    topBar.castShadow = true;
    pivot.add(topBar);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, PW + 16, 32), matAxle);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0, 0);
    axle.castShadow = true;
    pivot.add(axle);
    [-1, 1].forEach(function (sgn) {
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 24), matMetal);
        collar.rotation.z = Math.PI / 2;
        collar.position.set(sgn * (PW / 2 + 6), 0, 0);
        pivot.add(collar);
    });
    const rodGrp = new THREE.Group();
    rodGrp.position.set(0, PH * 0.28, -PD / 2 - 1);
    pivot.add(rodGrp);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 38, 16), matRod);
    rod.rotation.x = 0.38;
    rod.position.set(0, -10, -14);
    rod.castShadow = true;
    rodGrp.add(rod);
    const clevis = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 10), matAxle);
    clevis.position.set(0, -19, -24);
    rodGrp.add(clevis);
    const rodHi = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 10, 16), matAxle);
    rodHi.rotation.x = 0.38;
    rodHi.position.set(0, -4, -6);
    rodGrp.add(rodHi);
    [-1, 1].forEach(function (sgn) {
        const va = new THREE.Mesh(new THREE.BoxGeometry(5, 20, 5), matMetal);
        va.position.set(xPos + sgn * (PW / 2 + 10), 10, -20);
        va.castShadow = true;
        scene.add(va);
        const ha = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 14), matMetal);
        ha.position.set(xPos + sgn * (PW / 2 + 10), 1, -13);
        ha.castShadow = true;
        scene.add(ha);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.5, 10), matAxle);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(xPos + sgn * (PW / 2 + 10), 3, -20);
        scene.add(bolt);
    });
    pivot.rotation.x = REST_ANGLE;
    return pivot;
}

export function initBrakePedalsTest(mount, options) {
    const onBrakeInput =
        options && typeof options.onBrakeInput === 'function' ? options.onBrakeInput : function () {};
    const initialValue =
        options && typeof options.initialValue === 'number'
            ? Math.max(0, Math.min(1, options.initialValue))
            : 0;

    mount.style.cssText += ';padding:0;margin:0;overflow:hidden;line-height:0;font-size:0;display:block;';

    const scene = new THREE.Scene();
    scene.background = backdropColorForMount(mount);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText =
        'display:block;width:100%;height:100%;outline:none;-webkit-tap-highlight-color:transparent;touch-action:none;';
    mount.appendChild(renderer.domElement);

    const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
    cam.position.set(0, 58, 392);
    const lookAt = new THREE.Vector3(0, 12, 0);
    cam.lookAt(lookAt);
    const sph = new THREE.Spherical().setFromVector3(cam.position.clone().sub(lookAt));

    scene.add(new THREE.AmbientLight(0xb8c8d8, 0.85));
    scene.add(new THREE.HemisphereLight(0xd8e4f0, 0x4a5f78, 0.65));

    const sun = new THREE.DirectionalLight(0xfff6ed, 1.35);
    sun.position.set(0, 118, 92);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 450;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    sun.target.position.set(0, 0, 5);
    scene.add(sun.target);

    const key = new THREE.SpotLight(0xf8fbff, 2.1, 900, Math.PI / 5, 0.35, 1.15);
    key.position.set(0, 162, 138);
    key.castShadow = false;
    scene.add(key);
    key.target.position.set(0, -2, 5);
    scene.add(key.target);

    const fillL = new THREE.DirectionalLight(0xa8bcd4, 0.34);
    fillL.position.set(-72, 58, 62);
    scene.add(fillL);
    const fillR = new THREE.DirectionalLight(0xa8bcd4, 0.34);
    fillR.position.set(72, 58, 62);
    scene.add(fillR);
    const back = new THREE.DirectionalLight(0x5a6e86, 0.4);
    back.position.set(0, 28, -92);
    scene.add(back);
    const underRim = new THREE.DirectionalLight(0x6a7e94, 0.35);
    underRim.position.set(0, -80, 40);
    scene.add(underRim);
    const pedalFill = new THREE.PointLight(0xd0dce8, 0.62, 480, 1.85);
    pedalFill.position.set(0, 58, 98);
    scene.add(pedalFill);

    const knurlTex = makeKnurlTex(renderer);
    const knurlNorm = makeKnurlNormal(renderer);
    const floorTex = makeFloorTex(renderer);

    const matFloor = new THREE.MeshStandardMaterial({
        map: floorTex,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.06,
        emissive: 0x2a3d52,
        emissiveIntensity: 0.22,
    });
    const matPedal = new THREE.MeshStandardMaterial({
        color: 0x5a6f86,
        roughness: 0.48,
        metalness: 0.22,
        emissive: 0x3a4f64,
        emissiveIntensity: 0.14,
    });
    const matFace = new THREE.MeshStandardMaterial({
        map: knurlTex,
        normalMap: knurlNorm,
        normalScale: new THREE.Vector2(0.6, 0.6),
        color: 0x556a80,
        roughness: 0.72,
        metalness: 0.08,
        emissive: 0x2f4256,
        emissiveIntensity: 0.1,
    });
    const matMetal = new THREE.MeshStandardMaterial({
        color: 0x7a8fa5,
        roughness: 0.26,
        metalness: 0.88,
    });
    const matAxle = new THREE.MeshStandardMaterial({
        color: 0x8a9eb4,
        roughness: 0.2,
        metalness: 0.92,
    });
    const matRod = new THREE.MeshStandardMaterial({
        color: 0x5a6e82,
        roughness: 0.24,
        metalness: 0.88,
    });
    const chamferMat = new THREE.MeshStandardMaterial({ color: 0x4d6176, roughness: 0.48, metalness: 0.55 });

    const FW = 160;
    const FD = 100;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(FW, 4, FD), matFloor);
    floor.position.set(0, -2, 5);
    floor.receiveShadow = true;
    scene.add(floor);
    [
        [0, FD / 2 + 1, new THREE.BoxGeometry(FW + 4, 2, 2)],
        [0, -FD / 2 - 1, new THREE.BoxGeometry(FW + 4, 2, 2)],
        [FW / 2 + 1, 0, new THREE.BoxGeometry(2, 2, FD + 4)],
        [-FW / 2 - 1, 0, new THREE.BoxGeometry(2, 2, FD + 4)],
    ].forEach(function (row) {
        const m = new THREE.Mesh(row[2], chamferMat);
        m.position.set(row[0], 0, row[1]);
        scene.add(m);
    });

    const PW = 46;
    const PH = 80;
    const PD = 11;
    const REST_ANGLE = -0.48;
    const MAX_PRESS = -0.38;

    const lPedal = buildPedal(scene, -52, PW, PH, PD, matPedal, matFace, matMetal, matAxle, matRod, chamferMat, REST_ANGLE);
    const rPedal = buildPedal(scene, 52, PW, PH, PD, matPedal, matFace, matMetal, matAxle, matRod, chamferMat, REST_ANGLE);

    let brakeVal = initialValue;
    let targetBrake = initialValue;
    let swipeDrag = false;
    let orbitDrag = false;
    let swipeStartY = 0;
    let swipeStartBrake = 0;
    let px = 0;
    let py = 0;
    const SWIPE_SENS = 1 / 160;
    let lastSent = -1;
    let rafId = 0;
    let disposed = false;

    function syncSize() {
        const w = Math.max(80, Math.floor(mount.clientWidth));
        const h = Math.max(80, Math.floor(mount.clientHeight));
        renderer.setSize(w, h, false);
        cam.aspect = w / Math.max(1, h);
        cam.updateProjectionMatrix();
    }

    function onPointerDown(e) {
        renderer.domElement.setPointerCapture(e.pointerId);
        if (e.button === 2 || e.button === 1 || e.shiftKey) {
            orbitDrag = true;
            px = e.clientX;
            py = e.clientY;
        } else {
            swipeDrag = true;
            swipeStartY = e.clientY;
            swipeStartBrake = targetBrake;
        }
    }

    function onPointerUp() {
        swipeDrag = false;
        orbitDrag = false;
    }

    function onPointerMove(e) {
        if (swipeDrag) {
            const dy = e.clientY - swipeStartY;
            targetBrake = Math.max(0, Math.min(1, swipeStartBrake - dy * SWIPE_SENS));
        }
        if (orbitDrag) {
            sph.theta -= (e.clientX - px) * 0.009;
            sph.phi = Math.max(0.15, Math.min(1.85, sph.phi + (e.clientY - py) * 0.007));
            cam.position.copy(new THREE.Vector3().setFromSpherical(sph).add(lookAt));
            cam.lookAt(lookAt);
            px = e.clientX;
            py = e.clientY;
        }
    }

    function onWheel(e) {
        e.preventDefault();
        sph.radius = Math.max(245, Math.min(680, sph.radius + e.deltaY * 0.32));
        cam.position.copy(new THREE.Vector3().setFromSpherical(sph).add(lookAt));
        cam.lookAt(lookAt);
    }

    const domEl = renderer.domElement;
    domEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(syncSize);
        ro.observe(mount);
    }
    window.addEventListener('resize', syncSize);
    syncSize();
    requestAnimationFrame(syncSize);

    function animate() {
        if (disposed) return;
        rafId = requestAnimationFrame(animate);
        brakeVal += (targetBrake - brakeVal) * 0.12;
        if (Math.abs(brakeVal - targetBrake) < 0.001) brakeVal = targetBrake;
        const angle = REST_ANGLE + brakeVal * MAX_PRESS;
        lPedal.rotation.x = angle;
        rPedal.rotation.x = angle;
        if (Math.abs(brakeVal - lastSent) > 0.008 || (brakeVal < 1e-4 && lastSent > 1e-4)) {
            lastSent = brakeVal;
            onBrakeInput(brakeVal);
        }
        renderer.render(scene, cam);
    }
    animate();

    function setBrakeAxis(v) {
        const x = Math.max(0, Math.min(1, Number(v) || 0));
        targetBrake = x;
        brakeVal = x;
        lastSent = -1;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(rafId);
        domEl.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', syncSize);
        if (ro) ro.disconnect();
        renderer.dispose();
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    }

    return {
        setBrakeAxis: setBrakeAxis,
        dispose: dispose,
    };
}
