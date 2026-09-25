import * as THREE from 'three';

const EXT_LT_LABEL_FONT_PX = 34;
const EXT_LT_LABEL_TARGET_PH_SINGLE = 0.68;
const EXT_LT_LABEL_TARGET_PH_MULTI = 0.92;
const EXT_LT_LABEL_MAX_PW = 2.62;
const EXT_LT_OFF_BELOW_PLATE = 0.24;

function readPanelBgCss() {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--airbus-panel').trim();
        if (v) return v;
    } catch (e) {}
    return '#384a5f';
}

function resolveExtLtPanelColor(viewportEl) {
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
    const fb = readPanelBgCss().trim() || '#384a5f';
    try {
        c.setStyle(fb);
    } catch (e2) {
        c.setStyle('#384a5f');
    }
    return { color: c, css: fb };
}

function legendPlaneFromCanvas(cw, ch, targetPh, maxPw) {
    const ar = cw / Math.max(ch, 1e-6);
    let ph = targetPh;
    let pw = ph * ar;
    if (pw > maxPw) {
        const s = maxPw / pw;
        pw *= s;
        ph *= s;
    }
    return { pw, ph };
}

function makeLegendTexture(lines, fontPx, cwMin, chMin) {
    const isc = 4;
    const fam = 'Lato, "Helvetica Neue", Arial, sans-serif';
    const padX = fontPx * 0.65;
    const padY = fontPx * 0.55;
    const lh = lines.length > 1 ? fontPx * 1.58 : fontPx * 1.48;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `700 ${fontPx}px ${fam}`;
    let textW = cwMin;
    for (let i = 0; i < lines.length; i++) {
        textW = Math.max(textW, measure.measureText(lines[i]).width + padX * 2);
    }
    const cw = Math.ceil(Math.min(900, Math.max(cwMin, textW)));
    const minCh = (lines.length - 1) * lh + fontPx + padY * 2;
    const chUse = Math.ceil(Math.max(chMin, minCh));
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw * isc);
    c.height = Math.ceil(chUse * isc);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.scale(isc, isc);
    g.clearRect(0, 0, cw, chUse);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(12, 18, 28, 0.45)';
    g.lineWidth = 1;
    g.font = `700 ${fontPx}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ty = chUse / 2 - ((lines.length - 1) * lh) / 2;
    for (let i = 0; i < lines.length; i++) {
        const lx = cw / 2;
        const ly = ty + i * lh;
        g.strokeText(lines[i], lx, ly);
        g.fillText(lines[i], lx, ly);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, cw, ch: chUse };
}

function extLtAddLegendPlane(panelRoot, lines, fontPx, worldX, worldY, targetPh, maxPw) {
    const chM = Math.max(70, (lines.length - 1) * Math.round(fontPx * 1.58) + Math.round(fontPx * 1.2));
    const { tex, cw, ch } = makeLegendTexture(lines, fontPx, 200, chM);
    const { pw, ph } = legendPlaneFromCanvas(cw, ch, targetPh, maxPw);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false,
        })
    );
    mesh.renderOrder = 15;
    mesh.userData.skipPick = true;
    mesh.position.set(worldX, worldY, 0.16);
    panelRoot.add(mesh);
}

function extLtPlaceSwitchCaptions(panelRoot, x, y, swScale, plateW, plateH, recipe) {
    const hp = plateH * 0.5 * swScale;
    const wp = plateW * 0.5 * swScale;
    const fp = EXT_LT_LABEL_FONT_PX;
    const abovePlateY = y + hp + 0.2;
    const offBelowY = y - hp - EXT_LT_OFF_BELOW_PLATE;
    if (recipe === 'strobe') {
        extLtAddLegendPlane(panelRoot, ['ON'], fp, x, abovePlateY, 0.2, 0.52);
        extLtAddLegendPlane(panelRoot, ['OFF'], fp, x, offBelowY, 0.2, 0.52);
        extLtAddLegendPlane(panelRoot, [...'AUTO'], fp, x + wp + 0.11, y + 0.02, 0.52, 0.36);
    } else if (recipe === 'onOff') {
        extLtAddLegendPlane(panelRoot, ['ON'], fp, x, abovePlateY, 0.2, 0.52);
        extLtAddLegendPlane(panelRoot, ['OFF'], fp, x, offBelowY, 0.2, 0.52);
    } else if (recipe === 'nav') {
        extLtAddLegendPlane(panelRoot, ['2'], fp, x, abovePlateY, 0.2, 0.42);
        extLtAddLegendPlane(panelRoot, ['1'], fp, x + wp + 0.1, y, 0.22, 0.38);
        extLtAddLegendPlane(panelRoot, ['OFF'], fp, x, offBelowY, 0.2, 0.52);
    } else if (recipe === 'nose') {
        const lx = x + wp + 0.16;
        const step = 0.34;
        extLtAddLegendPlane(panelRoot, ['T.O'], fp, lx, y + step, 0.2, 0.44);
        extLtAddLegendPlane(panelRoot, ['TAXI'], fp, lx, y, 0.2, 0.52);
        extLtAddLegendPlane(panelRoot, ['OFF'], fp, lx, offBelowY, 0.2, 0.52);
    }
}

function extLtAddLandPairCenterLabels(panelRoot, xc, rowY, swScale) {
    const hp = 1.48 * 0.5 * swScale;
    const fp = EXT_LT_LABEL_FONT_PX;
    const offBetweenY = rowY + 0.04;
    extLtAddLegendPlane(panelRoot, ['ON'], fp, xc, rowY + hp + 0.14, 0.2, 0.52);
    extLtAddLegendPlane(panelRoot, ['OFF'], fp, xc, offBetweenY, 0.22, 0.55);
    extLtAddLegendPlane(panelRoot, ['RETRACT'], fp, xc, offBetweenY - 0.36, 0.2, 1.35);
}

function addLandBracketLegend(panelRoot, xc, rowY) {
    const isc = 4;
    const cw = 480;
    const ch = 140;
    const c = document.createElement('canvas');
    c.width = cw * isc;
    c.height = ch * isc;
    const g = c.getContext('2d');
    g.scale(isc, isc);
    g.clearRect(0, 0, cw, ch);
    const fam = 'Lato, "Helvetica Neue", Arial, sans-serif';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.font = `700 ${EXT_LT_LABEL_FONT_PX}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(18, 24, 34, 0.4)';
    g.lineWidth = 0.9;
    g.strokeText('LAND', cw / 2, ch * 0.38);
    g.fillStyle = '#ffffff';
    g.fillText('LAND', cw / 2, ch * 0.38);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    const yb = ch * 0.72;
    const half = cw * 0.26;
    g.beginPath();
    g.moveTo(cw / 2 - half, yb - 14);
    g.lineTo(cw / 2 - half, yb);
    g.lineTo(cw / 2 + half, yb);
    g.lineTo(cw / 2 + half, yb - 14);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    const landCh = ch;
    const landCw = cw;
    const { pw: landPw, ph: landPh } = legendPlaneFromCanvas(
        landCw,
        landCh,
        EXT_LT_LABEL_TARGET_PH_SINGLE,
        EXT_LT_LABEL_MAX_PW
    );
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(landPw, landPh),
        new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false,
        })
    );
    mesh.renderOrder = 20;
    mesh.position.set(xc, rowY + 0.52, 0.12);
    mesh.userData.skipPick = true;
    panelRoot.add(mesh);
}

function lvarOut(lvarKey, stateIdx, positions) {
    if (positions >= 3) return stateIdx;
    if (lvarKey === 'rwy_turnoff') return stateIdx === 1 ? 0 : 1;
    return stateIdx === 1 ? 0 : 1;
}

function lvarIn(lvarKey, raw, positions) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (positions >= 3) {
        return Math.max(0, Math.min(2, Math.round(n)));
    }
    if (lvarKey === 'rwy_turnoff') return n >= 0.5 ? 0 : 1;
    return n >= 0.5 ? 0 : 1;
}

export async function attachExtLtLightsPanel(viewportEl, { emit, onUserInteraction } = {}) {
    if (!viewportEl || typeof emit !== 'function') return null;
    const bumpHold =
        onUserInteraction && typeof onUserInteraction === 'function' ? onUserInteraction : null;
    try {
        if (document.fonts?.ready) await document.fonts.ready;
        if (document.fonts?.load) {
            await document.fonts.load(`700 ${EXT_LT_LABEL_FONT_PX}px Lato`);
        }
    } catch (e) {}

    let w = 260;
    let h = 320;
    let resizeDoneOnce = false;

    viewportEl.innerHTML = '';
    const bgResolved = resolveExtLtPanelColor(viewportEl);
    const bgColor = bgResolved.color;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 120);

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    if ('SRGBColorSpace' in THREE) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.background = 'transparent';
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;

    viewportEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(0.4, 0.35, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa8c0d8, 0.42);
    rim.position.set(-1.4, 0.9, 1.4);
    scene.add(rim);

    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xf0f4f8,
        metalness: 0.95,
        roughness: 0.16,
        side: THREE.DoubleSide,
    });
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 512;
    canvasTex.height = 512;
    const ctx = canvasTex.getContext('2d');
    const lg = ctx.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#555');
    lg.addColorStop(0.5, '#aaa');
    lg.addColorStop(1, '#555');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 36;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 120 + 40);
        ctx.lineTo(512, i * 120 + 40);
        ctx.stroke();
    }
    const stripedMat = new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(canvasTex),
        metalness: 0.88,
        roughness: 0.32,
        side: THREE.DoubleSide,
    });
    if ('SRGBColorSpace' in THREE) stripedMat.map.colorSpace = THREE.SRGBColorSpace;

    const recessMatBlack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    if ('toneMapped' in recessMatBlack) recessMatBlack.toneMapped = false;

    const panelRoot = new THREE.Group();
    panelRoot.rotation.set(0, 0, 0);
    scene.add(panelRoot);

    const backMat = new THREE.MeshBasicMaterial({ color: bgColor.clone() });
    if ('toneMapped' in backMat) backMat.toneMapped = false;

    const swScale = 0.38;
    const col4 = [-1.46, -0.485, 0.485, 1.46];
    const rowT = 0.9;
    const rowB = -0.9;

    const switches = [];

    const buildOne = (cfg) => {
        const { sid, lvarKey, positions, x, y, initState } = cfg;
        const maxIdx = Math.max(1, positions - 1);
        const initS = Math.min(maxIdx, Math.max(0, initState | 0));
        const angles =
            positions >= 3 ? [0.72, 0, -0.72] : [-0.66, 0.66];
        const stemLen = positions >= 3 ? 1.48 : 1.38;
        const cylR = 0.82;
        const cylRBot = 0.76;
        const plateW = 1.74;
        const plateH = 1.48;
        const plateD = 0.065;

        const g = new THREE.Group();
        g.position.set(x, y, 0);
        g.scale.setScalar(swScale);
        g.userData.sid = sid;

        const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), backMat);
        plate.name = 'sw_plate';
        plate.userData.sid = sid;
        g.add(plate);

        const baseGroup = new THREE.Group();
        baseGroup.position.z = 0.04;
        baseGroup.userData.sid = sid;
        g.add(baseGroup);

        const recess = new THREE.Mesh(new THREE.CylinderGeometry(cylR, cylRBot, 0.16, 36), recessMatBlack);
        recess.rotation.x = Math.PI / 2;
        recess.userData.sid = sid;
        baseGroup.add(recess);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(cylR, 0.032, 16, 48),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        ring.position.z = 0.09;
        ring.userData.sid = sid;
        baseGroup.add(ring);

        const pivot = new THREE.Group();
        pivot.position.z = 0.04;
        pivot.userData.sid = sid;
        g.add(pivot);

        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.34, stemLen, 22),
            chromeMat
        );
        stem.rotation.x = Math.PI / 2;
        stem.position.z = 0.42 + (stemLen - 1.38) * 0.22;
        stem.userData.sid = sid;
        pivot.add(stem);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.19, 0.86), stripedMat);
        head.position.z = 0.88 + (stemLen - 1.38) * 0.48;
        head.userData.sid = sid;
        pivot.add(head);

        if (!cfg.skipTitle) {
            const lines = cfg.titleLines || (cfg.title ? [cfg.title] : []);
            if (lines.length) {
                const fp = cfg.titleFontPx ?? EXT_LT_LABEL_FONT_PX;
                const cw = cfg.legendCw ?? 640;
                const ch0 = cfg.legendCh ?? (lines.length > 1 ? 120 : 72);
                const { tex: nameTex, cw: cwTex, ch: chTex } = makeLegendTexture(lines, fp, cw, ch0);
                const targetPh =
                    cfg.legendTargetPh ?? (lines.length > 1 ? EXT_LT_LABEL_TARGET_PH_MULTI : EXT_LT_LABEL_TARGET_PH_SINGLE);
                const maxPw = cfg.legendMaxPw ?? EXT_LT_LABEL_MAX_PW;
                const { pw, ph } =
                    cfg.legendPw != null && cfg.legendPh != null
                        ? { pw: cfg.legendPw, ph: cfg.legendPh }
                        : legendPlaneFromCanvas(cwTex, chTex, targetPh, maxPw);
                const namePlane = new THREE.Mesh(
                    new THREE.PlaneGeometry(pw, ph),
                    new THREE.MeshBasicMaterial({
                        map: nameTex,
                        transparent: true,
                        depthWrite: false,
                        depthTest: false,
                    })
                );
                namePlane.renderOrder = 15;
                namePlane.userData.skipPick = true;
                const gapW = 0.3;
                namePlane.position.set(
                    x,
                    y + plateH * 0.5 * swScale + gapW + ph * 0.5,
                    0.16
                );
                panelRoot.add(namePlane);
            }
        }
        if (cfg.sideMark) {
            const mx = cfg.sideMark === 'L' ? -0.24 : 0.24;
            const { tex: mTex, cw: mCw, ch: mCh } = makeLegendTexture(
                [cfg.sideMark],
                EXT_LT_LABEL_FONT_PX,
                100,
                80
            );
            const { pw: mpw, ph: mph } = legendPlaneFromCanvas(mCw, mCh, 0.35, 0.48);
            const markPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(mpw, mph),
                new THREE.MeshBasicMaterial({
                    map: mTex,
                    transparent: true,
                    depthWrite: false,
                    depthTest: false,
                })
            );
            markPlane.renderOrder = 15;
            markPlane.userData.skipPick = true;
            const gapWm = cfg.sideMarkAbove ? 0.26 : 0.1;
            const hp = plateH * 0.5 * swScale;
            const markY = cfg.sideMarkAbove
                ? y + hp + gapWm + mph * 0.5
                : y - hp - gapWm - mph * 0.5;
            markPlane.position.set(x + mx * swScale, markY, 0.16);
            panelRoot.add(markPlane);
        }

        if (cfg.extLtRecipe) {
            extLtPlaceSwitchCaptions(panelRoot, x, y, swScale, plateW, plateH, cfg.extLtRecipe);
        }

        const sw = {
            sid,
            lvarKey,
            positions,
            maxIdx,
            angles,
            pivot,
            state: initS,
            setState(next) {
                const n = Math.min(maxIdx, Math.max(0, next));
                if (n === sw.state) return;
                sw.state = n;
                if (bumpHold) bumpHold();
                emit(lvarKey, lvarOut(lvarKey, sw.state, positions));
            },
        };
        pivot.rotation.x = angles[sw.state];
        switches.push(sw);
        panelRoot.add(g);
    };

    const cfgs = [
        {
            sid: 'swStrobe',
            lvarKey: 'strobe',
            positions: 3,
            col: 0,
            row: 0,
            init: 1,
            titleLines: ['STROBE'],
            extLtRecipe: 'strobe',
        },
        {
            sid: 'swBeacon',
            lvarKey: 'beacon',
            positions: 2,
            col: 1,
            row: 0,
            init: 0,
            titleLines: ['BEACON'],
            extLtRecipe: 'onOff',
        },
        {
            sid: 'swWingScan',
            lvarKey: 'wing_scan',
            positions: 2,
            col: 2,
            row: 0,
            init: 0,
            titleLines: ['WING'],
            extLtRecipe: 'onOff',
        },
        {
            sid: 'swNavLogo',
            lvarKey: 'nav_logo',
            positions: 3,
            col: 3,
            row: 0,
            init: 2,
            titleLines: ['NAV & LOGO'],
            extLtRecipe: 'nav',
        },
        {
            sid: 'swRwyTo',
            lvarKey: 'rwy_turnoff',
            positions: 2,
            col: 0,
            row: 1,
            init: 0,
            titleLines: ['RWY', 'TURN OFF'],
            extLtRecipe: 'onOff',
        },
        {
            sid: 'swLandL',
            lvarKey: 'land_left',
            positions: 3,
            col: 1,
            row: 1,
            init: 1,
            skipTitle: true,
            sideMark: 'L',
            sideMarkAbove: true,
        },
        {
            sid: 'swLandR',
            lvarKey: 'land_right',
            positions: 3,
            col: 2,
            row: 1,
            init: 1,
            skipTitle: true,
            sideMark: 'R',
            sideMarkAbove: true,
        },
        {
            sid: 'swNose',
            lvarKey: 'nose_light',
            positions: 3,
            col: 3,
            row: 1,
            init: 2,
            titleLines: ['NOSE'],
            extLtRecipe: 'nose',
        },
    ];

    cfgs.forEach((c) => {
        const x = col4[c.col];
        const y = c.row === 0 ? rowT : rowB;
        buildOne({ ...c, x, y, initState: c.init });
    });

    const colStep = col4[1] - col4[0];
    const signsRowY = rowT;
    const xSeatBelts = col4[3] + colStep;
    const xNoSmoking = xSeatBelts + colStep;
    buildOne({
        sid: 'swSeatBelts',
        lvarKey: 'seat_belts',
        positions: 2,
        x: xSeatBelts,
        y: signsRowY,
        initState: 0,
        titleLines: ['SEAT', 'BELTS'],
        extLtRecipe: 'onOff',
    });
    buildOne({
        sid: 'swNoSmoking',
        lvarKey: 'no_smoking',
        positions: 3,
        x: xNoSmoking,
        y: signsRowY,
        initState: 1,
        titleLines: ['NO', 'SMOKING'],
        extLtRecipe: 'strobe',
    });

    extLtAddLandPairCenterLabels(panelRoot, (col4[1] + col4[2]) * 0.5, rowB, swScale);
    addLandBracketLegend(panelRoot, (col4[1] + col4[2]) / 2, rowB);

    panelRoot.updateMatrixWorld(true);

    const syncViewportAspect = () => {
        panelRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(panelRoot);
        const size = new THREE.Vector3();
        box.getSize(size);
        const pct = (size.y / Math.max(size.x, 1e-4)) * 100;
        viewportEl.style.paddingBottom = pct.toFixed(4) + '%';
    };

    const setupCamera = () => {
        panelRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(panelRoot);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const fovRad = (camera.fov * Math.PI) / 180;
        const tanHalf = Math.tan(fovRad / 2);
        const aspect = Math.max(0.001, camera.aspect);
        const margin = 1.055;
        const halfY = Math.max(size.y * 0.5, 0.01) * margin;
        const halfX = Math.max(size.x * 0.5, 0.01) * margin;
        const distV = halfY / tanHalf;
        const distW = halfX / (tanHalf * aspect);
        const dist = Math.max(distV, distW);
        camera.position.copy(center).add(new THREE.Vector3(0, 0, dist));
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
    };
    setupCamera();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let active = null;
    let isDragging = false;
    let dragOk = false;
    let startY = 0;
    let startX = 0;
    let movedPx = 0;
    const threshold = 30;

    const hitSwitch = (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        const rw = Math.max(1, r.width);
        const rh = Math.max(1, r.height);
        mouse.x = ((e.clientX - r.left) / rw) * 2 - 1;
        mouse.y = -((e.clientY - r.top) / rh) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(panelRoot, true);
        for (let i = 0; i < hits.length; i++) {
            const o = hits[i].object;
            if (o.userData.skipPick) continue;
            const sid = o.userData.sid;
            if (!sid) continue;
            return switches.find((s) => s.sid === sid) || null;
        }
        return null;
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        active = hitSwitch(e);
        if (!active) return;
        if (bumpHold) bumpHold();
        dragOk = true;
        isDragging = true;
        startY = e.clientY;
        startX = e.clientX;
        movedPx = 0;
        viewportEl.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    };

    const onPointerMove = (e) => {
        if (!isDragging || !dragOk || !active) return;
        e.stopPropagation();
        movedPx = Math.max(movedPx, Math.hypot(e.clientX - startX, e.clientY - startY));
        const diff = e.clientY - startY;
        if (Math.abs(diff) > threshold) {
            const two = active.positions === 2;
            if (two) {
                if (diff > 0 && active.state < active.maxIdx) {
                    active.setState(active.state + 1);
                    startY = e.clientY;
                    startX = e.clientX;
                } else if (diff < 0 && active.state > 0) {
                    active.setState(active.state - 1);
                    startY = e.clientY;
                    startX = e.clientX;
                }
            } else {
                if (diff > 0 && active.state > 0) {
                    active.setState(active.state - 1);
                    startY = e.clientY;
                    startX = e.clientX;
                } else if (diff < 0 && active.state < active.maxIdx) {
                    active.setState(active.state + 1);
                    startY = e.clientY;
                    startX = e.clientX;
                }
            }
        }
    };

    const onPointerUp = (e) => {
        e.stopPropagation();
        const sw = active;
        if (dragOk && isDragging && viewportEl.hasPointerCapture(e.pointerId)) {
            viewportEl.releasePointerCapture(e.pointerId);
            if (sw && movedPx < 12) {
                if (sw.positions === 2) {
                    sw.setState(sw.state === 0 ? 1 : 0);
                } else {
                    sw.setState((sw.state + 1) % 3);
                }
            }
        }
        isDragging = false;
        dragOk = false;
        active = null;
    };

    viewportEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    viewportEl.addEventListener('pointermove', onPointerMove, { passive: false });
    viewportEl.addEventListener('pointerup', onPointerUp);
    viewportEl.addEventListener('pointercancel', onPointerUp);

    let raf = 0;
    const resize = () => {
        syncViewportAspect();
        const r = viewportEl.getBoundingClientRect();
        const nw = Math.max(160, Math.round(r.width));
        const nh = Math.max(220, Math.round(r.height));
        if (resizeDoneOnce && nw === w && nh === h) return;
        resizeDoneOnce = true;
        w = nw || 260;
        h = nh || 320;
        camera.aspect = w / h;
        setupCamera();
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(viewportEl);
    if (viewportEl.parentElement) {
        ro.observe(viewportEl.parentElement);
    }
    resize();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            resizeDoneOnce = false;
            resize();
        });
    });
    const onWinResize = () => {
        resizeDoneOnce = false;
        resize();
    };
    window.addEventListener('resize', onWinResize);

    const animClock = new THREE.Clock();
    animClock.getDelta();
    const pivotSmooth = 16;
    const tick = () => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(animClock.getDelta(), 0.05);
        switches.forEach((sw) => {
            sw.pivot.rotation.x = THREE.MathUtils.damp(
                sw.pivot.rotation.x,
                sw.angles[sw.state],
                pivotSmooth,
                dt
            );
        });
        renderer.render(scene, camera);
    };
    tick();

    const syncFromSim = (map) => {
        if (!map || typeof map !== 'object') return;
        switches.forEach((sw) => {
            let raw = map[sw.lvarKey];
            if (typeof raw !== 'number' || !Number.isFinite(raw)) {
                const p = parseFloat(raw);
                if (!Number.isFinite(p)) return;
                raw = p;
            }
            const next = lvarIn(sw.lvarKey, raw, sw.positions);
            if (next === null || next === sw.state) return;
            sw.state = next;
            sw.pivot.rotation.x = sw.angles[next];
        });
    };

    return {
        syncFromSim,
        dispose() {
            cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener('resize', onWinResize);
            viewportEl.removeEventListener('pointerdown', onPointerDown);
            viewportEl.removeEventListener('pointermove', onPointerMove);
            viewportEl.removeEventListener('pointerup', onPointerUp);
            viewportEl.removeEventListener('pointercancel', onPointerUp);
            renderer.dispose();
            stripedMat.map?.dispose?.();
            backMat.dispose?.();
            recessMatBlack.dispose?.();
            renderer.domElement.remove();
        },
    };
}
