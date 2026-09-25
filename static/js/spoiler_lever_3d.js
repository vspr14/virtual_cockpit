import * as THREE from 'three';
import { SPOILER_KNOB_GEOM_B64, SPOILER_KNOB_VCOUNT } from './spoiler_knob_geom_b64.js';

const CAMERA_BASE_FOV = 36;
const CAMERA_VIEW_PAD_Y = 0;
const CAMERA_VIEW_PAD_X = 0;
const CAMERA_MARGIN = 1.08;
const CAMERA_VERT_PAD = 1.02;
const CAMERA_HOR_PAD = 1.02;
const DRAG_PIXELS_PER_FULL_RANGE = 400;
const LERP = 0.12;
const VALS = [0, 0.5, 1];
const LABEL_TEX_W = 256;
const LABEL_TEX_H = 80;
const LABEL_PLANE_W = 24;
const LABEL_PLANE_H = 8;
const DETENT_TICK_LEN = 5.2;
const DETENT_TICK_THK = 0.9;
const DETENT_TICK_GAP = 1.1;
const SPOILER_TILT_MAX = 0.14;
const SLOT_Y_PAD = 20;
const ARM_EXT_MAX_Z = 24;
const PROG_AT_TOP = 0.028;
const ARM_SNAP_UP_MIN = 0.055;
const ARM_SNAP_ACCUM = 0.1;
const ARM_EXT_GATE_EPS = 0.03;
const ARM_START_MAX_PROGRESS = 0.012;
const ARM_CALLBACK_ON = 0.9;
const ARM_CALLBACK_OFF = 0.12;

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

async function decodeGz(b64, vc) {
    const pakoMod = await import('pako');
    const inflate = (pakoMod.default && pakoMod.default.inflate) || pakoMod.inflate;
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const inf = inflate(u);
    const half = vc * 3 * 4;
    return {
        pos: new Float32Array(inf.buffer.slice(0, half)),
        nor: new Float32Array(inf.buffer.slice(half)),
    };
}

function makeGeo(d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    return g;
}

export async function initSpoilerLever3D(mount, options) {
    const onAxis = options && typeof options.onAxis === 'function' ? options.onAxis : () => { };
    const onArmChange = options && typeof options.onArmChange === 'function' ? options.onArmChange : () => { };
    const hiddenInput = options && options.hiddenInput
        ? typeof options.hiddenInput === 'string' ? document.getElementById(options.hiddenInput) : options.hiddenInput
        : null;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    mount.style.cssText += ';padding:0;margin:0;overflow:hidden;line-height:0;font-size:0;display:block;';
    renderer.domElement.style.cssText =
        'display:block;width:100%;height:100%;outline:none;-webkit-tap-highlight-color:transparent;touch-action:none;';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x2c3c50, 1.05));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.15);
    key.position.set(80, 120, 200);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x405878, 0.5);
    fill.position.set(-80, 60, 100);
    scene.add(fill);
    const back = new THREE.DirectionalLight(0x101820, 0.22);
    back.position.set(0, -80, -60);
    scene.add(back);

    const colPanel = backdropColorFromMount(mount);
    const colStem = colPanel.clone().multiplyScalar(0.9);
    const matPanel = new THREE.MeshBasicMaterial({ color: colPanel });
    if ('toneMapped' in matPanel) matPanel.toneMapped = false;
    const matSlot = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    matSlot.polygonOffset = true;
    matSlot.polygonOffsetFactor = 2;
    matSlot.polygonOffsetUnits = 2;
    const matMark = new THREE.MeshBasicMaterial({ color: 0xf2f6fa, toneMapped: false, depthWrite: true });
    const matKnob = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    if ('toneMapped' in matKnob) matKnob.toneMapped = false;
    const matStem = new THREE.MeshBasicMaterial({ color: colStem });
    if ('toneMapped' in matStem) matStem.toneMapped = false;
    const matArmBand = new THREE.MeshBasicMaterial({ color: 0xf2f6fa });
    if ('toneMapped' in matArmBand) matArmBand.toneMapped = false;

    const content = new THREE.Group();
    scene.add(content);

    const SW = 16, SH = 220, PD = 12, PW = 100;
    const TH = SH + 12;
    content.add(new THREE.Mesh(new THREE.BoxGeometry(PW, TH, PD), matPanel));

    const SD = PD + 6;
    const slotTop = SH / 2, slotBot = -SH / 2;
    const yTravelTop = slotTop - SLOT_Y_PAD;
    const yTravelBot = slotBot + SLOT_Y_PAD;
    const slotMesh = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, SD), matSlot);
    slotMesh.renderOrder = 2;
    content.add(slotMesh);

    const DL = ['RET', '1/2', 'FULL'];
    const DY = [slotTop, 0, slotBot];
    const tickD = Math.max(PD * 0.35, 0.55);
    const tz = PD * 0.5 + 0.48;
    const labelZ = PD * 0.5 + 1.55;
    const tickHalf = DETENT_TICK_LEN * 0.5;
    const labelCenterX = SW / 2 + DETENT_TICK_GAP + tickHalf + DETENT_TICK_GAP * 0.5 + LABEL_PLANE_W * 0.5;

    function makeLabelTex(txt) {
        const cv = document.createElement('canvas');
        cv.width = LABEL_TEX_W;
        cv.height = LABEL_TEX_H;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, LABEL_TEX_W, LABEL_TEX_H);
        ctx.font = 'bold 44px "Helvetica Neue",Helvetica,Arial,sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, 10, LABEL_TEX_H / 2);
        const t = new THREE.CanvasTexture(cv);
        if ('colorSpace' in t && THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        return t;
    }

    DY.forEach((ny, i) => {
        const tickL = new THREE.Mesh(new THREE.BoxGeometry(DETENT_TICK_LEN, DETENT_TICK_THK, tickD), matMark);
        tickL.position.set(-SW / 2 - DETENT_TICK_GAP - tickHalf, ny, tz);
        tickL.renderOrder = 4;
        content.add(tickL);
        const tickR = new THREE.Mesh(new THREE.BoxGeometry(DETENT_TICK_LEN, DETENT_TICK_THK, tickD), matMark);
        tickR.position.set(SW / 2 + DETENT_TICK_GAP + tickHalf, ny, tz);
        tickR.renderOrder = 4;
        content.add(tickR);
        const tex = makeLabelTex(DL[i]);
        const lMat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
            depthTest: true, toneMapped: false, side: THREE.DoubleSide, opacity: 1,
        });
        const lMesh = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_PLANE_W, LABEL_PLANE_H), lMat);
        lMesh.position.set(labelCenterX, ny, labelZ);
        lMesh.renderOrder = 8;
        content.add(lMesh);
    });

    const pivotZ = -SD * 0.5 + 1;
    const stemLen = 40;
    const collarZ = PD * 0.5 - pivotZ;

    const leverPivot = new THREE.Group();
    leverPivot.position.z = pivotZ;
    content.add(leverPivot);

    const leverArm = new THREE.Group();
    leverPivot.add(leverArm);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, stemLen, 22), matStem);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0, 0, stemLen * 0.5);
    stem.renderOrder = 12;
    leverArm.add(stem);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 2.4, 24), matStem);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0, collarZ);
    collar.renderOrder = 12;
    leverArm.add(collar);

    const armExtGeom = new THREE.CylinderGeometry(3.15, 3.15, 1, 22);
    const armExtMesh = new THREE.Mesh(armExtGeom, matArmBand);
    armExtMesh.rotation.x = Math.PI / 2;
    armExtMesh.renderOrder = 13;
    leverArm.add(armExtMesh);

    const knobHolder = new THREE.Group();
    knobHolder.position.set(0, 0, stemLen);
    leverArm.add(knobHolder);

    const d = await decodeGz(SPOILER_KNOB_GEOM_B64, SPOILER_KNOB_VCOUNT);
    const knobMesh = new THREE.Mesh(makeGeo(d), matKnob);
    knobMesh.position.set(0, 0, 24);
    knobMesh.renderOrder = 15;
    knobHolder.add(knobMesh);

    function yForProgress(p) {
        const t = Math.max(0, Math.min(1, p));
        return yTravelTop + (yTravelBot - yTravelTop) * t;
    }

    function tiltForProgress(p) {
        const x = Math.max(0, Math.min(1, p));
        return SPOILER_TILT_MAX * Math.sin((x - 0.5) * Math.PI);
    }

    function updateLeverVisuals(progress, armExt) {
        const t = Math.max(0, Math.min(1, progress));
        const a = Math.max(0, Math.min(1, armExt));
        leverPivot.position.y = yForProgress(t);
        leverArm.rotation.x = tiltForProgress(t);
        const extLen = a * ARM_EXT_MAX_Z;
        armExtMesh.visible = a >= 0.02;
        armExtMesh.scale.set(1, Math.max(0.08, extLen), 1);
        armExtMesh.position.set(0, 0, stemLen + extLen * 0.5);
        knobHolder.position.set(0, 0, stemLen + extLen);
    }

    let targetProgress = 0;
    let currentProgress = 0;
    let targetArmExt = 0;
    let currentArmExt = 0;
    let armCallbackLatched = false;
    let armSnapAccum = 0;
    let armClearForNextTouch = true;
    let armGestureAllowed = false;
    let isDragging = false;
    let dragLastY = 0;
    let activePointerId = null;
    let lastEmittedAxis = 0;
    let lastArmBandAtTop = false;
    /** One-shot meta merged into the next onAxis (e.g. fromExternal after applyAxisValue from sim poll). */
    let pendingOnAxisMeta = null;

    function syncHidden(v) {
        const x = Math.max(0, Math.min(1, v));
        if (hiddenInput) hiddenInput.value = String(x);
    }

    function emitAxis(v) {
        const x = Math.max(0, Math.min(1, v));
        const armBandAtTop = currentArmExt >= 0.02 && x <= PROG_AT_TOP + 0.05;
        if (Math.abs(x - lastEmittedAxis) > 0.002 || armBandAtTop !== lastArmBandAtTop) {
            lastEmittedAxis = x;
            lastArmBandAtTop = armBandAtTop;
            syncHidden(x);
            const meta = { armBandAtTop };
            if (pendingOnAxisMeta) {
                Object.assign(meta, pendingOnAxisMeta);
                pendingOnAxisMeta = null;
            }
            onAxis(x, meta);
        }
    }

    function frameCameraToScene() {
        const merged = new THREE.Box3();
        for (let pi = 0; pi < VALS.length; pi++) {
            updateLeverVisuals(VALS[pi], 0);
            content.updateMatrixWorld(true);
            merged.union(new THREE.Box3().setFromObject(content));
        }
        updateLeverVisuals(0, 1);
        content.updateMatrixWorld(true);
        merged.union(new THREE.Box3().setFromObject(content));
        updateLeverVisuals(currentProgress, currentArmExt);
        content.updateMatrixWorld(true);
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
        const camDist = Math.max(distX, distY, 12);

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

    renderer.domElement.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        activePointerId = e.pointerId;
        armSnapAccum = 0;
        armGestureAllowed = armClearForNextTouch && targetProgress <= ARM_START_MAX_PROGRESS;
        dragLastY = e.clientY;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault();
    }, { passive: false });

    renderer.domElement.addEventListener('pointermove', function (e) {
        if (!isDragging || e.pointerId !== activePointerId) return;
        const diff = (e.clientY - dragLastY) / DRAG_PIXELS_PER_FULL_RANGE;
        dragLastY = e.clientY;
        const pIn = targetProgress;
        if (pIn > ARM_START_MAX_PROGRESS) armGestureAllowed = false;
        let p = targetProgress;
        let a = targetArmExt;
        const axisLockedByArm = currentArmExt > ARM_EXT_GATE_EPS || a > ARM_EXT_GATE_EPS;
        if (diff < 0) {
            if (armGestureAllowed && !axisLockedByArm && a < 1 - 1e-5 && p <= PROG_AT_TOP + 0.02) {
                armSnapAccum += -diff;
                if (diff <= -ARM_SNAP_UP_MIN || armSnapAccum >= ARM_SNAP_ACCUM) {
                    a = 1;
                    p = 0;
                    armSnapAccum = 0;
                }
            } else if (!axisLockedByArm) {
                p = Math.max(0, Math.min(1, p + diff));
            }
        } else {
            if (axisLockedByArm) {
                a = 0;
                p = 0;
                armSnapAccum = 0;
            } else {
                if (p <= PROG_AT_TOP + 0.02) armSnapAccum = 0;
                p = Math.max(0, Math.min(1, p + diff));
            }
        }
        if (a > ARM_EXT_GATE_EPS) {
            p = 0;
        }
        targetProgress = p;
        targetArmExt = a;
        e.preventDefault();
    }, { passive: false });

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        activePointerId = null;
        lastEmittedAxis = currentProgress - 10;
        armClearForNextTouch = targetProgress <= ARM_START_MAX_PROGRESS;
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

    function syncArmGate() {
        if (currentProgress > 0.06) {
            targetArmExt = 0;
            armCallbackLatched = false;
            return;
        }
        if (currentArmExt >= ARM_CALLBACK_ON && !armCallbackLatched) {
            armCallbackLatched = true;
            lastEmittedAxis = currentProgress - 10;
            onArmChange(true);
        } else if (currentArmExt <= ARM_CALLBACK_OFF && armCallbackLatched && currentProgress <= PROG_AT_TOP) {
            armCallbackLatched = false;
            lastEmittedAxis = currentProgress - 10;
            onArmChange(false);
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        if (currentProgress > 0.06) {
            targetArmExt = 0;
        }
        if (targetArmExt > ARM_EXT_GATE_EPS || currentArmExt > ARM_EXT_GATE_EPS) {
            if (targetProgress > PROG_AT_TOP + 1e-5) {
                targetProgress = 0;
            }
        }
        if (isDragging) {
            currentProgress = targetProgress;
            currentArmExt = targetArmExt;
        } else {
            currentProgress = THREE.MathUtils.lerp(currentProgress, targetProgress, LERP);
            if (Math.abs(currentProgress - targetProgress) < 0.0004) currentProgress = targetProgress;
            currentArmExt = THREE.MathUtils.lerp(currentArmExt, targetArmExt, LERP);
            if (Math.abs(currentArmExt - targetArmExt) < 0.0004) currentArmExt = targetArmExt;
        }
        if (targetArmExt > ARM_EXT_GATE_EPS || currentArmExt > ARM_EXT_GATE_EPS) {
            if (currentProgress > PROG_AT_TOP + 1e-5) {
                currentProgress = 0;
            }
        }
        updateLeverVisuals(currentProgress, currentArmExt);
        syncHidden(currentProgress);
        syncArmGate();
        emitAxis(currentProgress);
        renderer.render(scene, camera);
    }
    animate();

    targetProgress = 0;
    currentProgress = 0;
    targetArmExt = 0;
    currentArmExt = 0;
    updateLeverVisuals(currentProgress, currentArmExt);
    syncHidden(0);

    return {
        applyAxisValue(axis, opts) {
            const v = Math.max(0, Math.min(1, axis));
            const simArmed = opts && opts.simArmed === true;
            const fromExternal = opts && opts.fromExternal === true;
            if (fromExternal) {
                pendingOnAxisMeta = { fromExternal: true };
            }
            targetProgress = currentProgress = v;
            if (v > 0.05) {
                targetArmExt = currentArmExt = 0;
                armCallbackLatched = false;
            } else if (simArmed) {
                targetArmExt = currentArmExt = 1;
                armCallbackLatched = true;
            } else {
                targetArmExt = currentArmExt = 0;
                armCallbackLatched = false;
            }
            armClearForNextTouch = v <= ARM_START_MAX_PROGRESS;
            updateLeverVisuals(currentProgress, currentArmExt);
            syncHidden(v);
            lastEmittedAxis = v - 10;
            lastArmBandAtTop = currentArmExt >= 0.02 && v <= PROG_AT_TOP + 0.05;
        },
        getDetentIndex() {
            return Math.max(0, Math.min(2, Math.round(currentProgress * 2)));
        },
    };
}
