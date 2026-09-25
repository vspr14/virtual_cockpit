let isReverse = false, throttleBlocked = false, pbState = true, isArmed = false, gearIsDown = false;
let spoilerArmBandAtTop = false;
let flapLeverApplyAxis = null;
let pendingFlapRestore = null;
let spoilerLeverApplyAxis = null;
let pendingSpoilerRestore = null;
let parkingBrake3dMain = null;
let parkingBrake3dLeft = null;
let brakePedalsMain = null;
let radarPwsSwitches3d = null;
let extLtLightsApi = null;
let selectedCamId = null;
let gearLever3dApi = null;
let engModeOhApplyRef = null;
let tcasKnobSyncRef = null;
let _lvarPollDebounceT = 0;
const SIM_SYNC_HOLD_MS = 500;
const RADAR_PWS_USER_HOLD_MS = 900;
/** After local input, ignore sim-driven UI sync until this time (stops poll from fighting the user). */
const bumpSimSyncHold = function () {
    window.__simSyncHoldUntil = Date.now() + SIM_SYNC_HOLD_MS;
};
const bumpRadarPwsUserHold = function () {
    window.__radarPwsUserHoldUntil = Date.now() + RADAR_PWS_USER_HOLD_MS;
};
const schedulePollLvarsAfterWrite = function () {
    if (typeof window.__pollLvarsNow !== 'function') return;
    if (_lvarPollDebounceT) clearTimeout(_lvarPollDebounceT);
    _lvarPollDebounceT = setTimeout(function () {
        _lvarPollDebounceT = 0;
        window.__pollLvarsNow();
    }, 120);
};

const setLvar = (key, value) => {
    const ui = window.PROFILE?.ui || {};
    const sk = ui.mobiflight_skip_lvar_keys;
    if (Array.isArray(sk) && sk.indexOf(key) >= 0) return;
    if (ui.mobiflight_skip_ped_atc && typeof key === 'string' && key.indexOf('ped_atc_') === 0) return;
    bumpSimSyncHold();
    const payload = { key, value };
    if (window.__lvarProfile) payload.profile = window.__lvarProfile;
    fetch('/lvars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    }).then(function () {
        schedulePollLvarsAfterWrite();
    }).catch(function () {});
};

const stepLvar = (key, delta) => {
    const ui = window.PROFILE?.ui || {};
    const sk = ui.mobiflight_skip_lvar_keys;
    if (Array.isArray(sk) && sk.indexOf(key) >= 0) return;
    if (ui.mobiflight_skip_ped_atc && typeof key === 'string' && key.indexOf('ped_atc_') === 0) return;
    bumpSimSyncHold();
    const payload = { key, delta };
    if (window.__lvarProfile) payload.profile = window.__lvarProfile;
    fetch('/lvars/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    }).then(function () {
        schedulePollLvarsAfterWrite();
    }).catch(function () {});
};

const baseSend = (payload) => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (payload && payload.type === 'brakes') {
        try {
            window.__vcLastBrakeFrontend = Number(payload.value);
        } catch (e) {}
    }
    if (window.__lvarProfile && typeof window.__lvarProfile === 'string') {
        const p = window.__lvarProfile.replace(/\.js$/i, '').trim();
        if (p) body.profile = p;
    }
    fetch('/update_sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
    }).then(function (res) {
        if (res.ok || !payload || payload.type !== 'brakes') return null;
        return res.json().catch(function () { return {}; });
    }).then(function (errBody) {
        if (errBody == null || !payload || payload.type !== 'brakes') return;
        console.warn('update_sim brakes', errBody.error != null ? errBody.error : errBody);
    }).catch(function () {});
};

const useMfMip = () => window.PROFILE?.ui?.mobiflight_mip_controls === true;

const spoilerUiAxisToSim = (axis01) => {
    const a = Math.max(0, Math.min(1, Number(axis01) || 0));
    return 1 + a * 2;
};

const send = (payload) => {
    const profile = window.PROFILE || {};
    const ui = profile.ui || {};
    const mipSkipType = (t) => Array.isArray(ui.mobiflight_skip_lvar_types) && ui.mobiflight_skip_lvar_types.indexOf(t) >= 0;

    if (payload && payload.type === 'brakes') {
        if (useMfMip() && !mipSkipType('brakes')) {
            const v = Math.max(0, Math.min(1, Number(payload.value) || 0));
            setLvar('brake_pedal_left', v);
            setLvar('brake_pedal_right', v);
        }
        baseSend(payload);
        return;
    }
    if (ui.mobiflight_mip_controls) {
        if (payload.type === 'gear_command' && mipSkipType('gear_command')) {
            baseSend(payload);
            return;
        }
        if (payload.type === 'gear_command') {
            const down = payload.state === 'DOWN';
            setLvar('gear_handle', down ? 1 : 0);
            return;
        }
        if (payload.type === 'spoilers' && mipSkipType('spoilers')) {
            baseSend(payload);
            return;
        }
        if (payload.type === 'spoilers') {
            if (isArmed || spoilerArmBandAtTop) {
                setLvar('spoilers_handle', 0);
                return;
            }
            const b = profile.backend || {};
            const fn = b.spoiler_formula;
            const raw = Number(payload.value ?? 0);
            const v = fn ? fn(raw) : raw;
            let out = spoilerUiAxisToSim(v);
            if (!isArmed && raw <= 0.05) {
                out = 1;
            }
            if (window.__VC_DEBUG_SPOILER__) {
                console.log('[spoilers->sim]', { raw, afterFormula: v, out });
            }
            setLvar('spoilers_handle', out);
            return;
        }
        if (payload.type === 'arm_spoilers' && mipSkipType('arm_spoilers')) {
            baseSend(payload);
            return;
        }
        if (payload.type === 'arm_spoilers') {
            setLvar('speedbrake_lock', 1);
            setLvar('spoilers_handle', 0);
            return;
        }
        if (payload.type === 'vjoy_button') {
            const m = (profile.mappings && profile.mappings.vjoy) || {};
            const b = payload.button;
            /* Suppress vJoy only when MIP handles the same action via LVar; if skip list uses vJoy, allow through. */
            if (m.PARKING_BRAKE != null && b === m.PARKING_BRAKE && !mipSkipType('parking_brake')) return;
            if (m.ARM_SPOILERS != null && b === m.ARM_SPOILERS && !mipSkipType('arm_spoilers')) return;
        }
    }
    const commands = profile.commands || {};
    const handler = commands[payload.type];
    if (handler) {
        const result = handler(payload);
        if (!result) return;
        if (Array.isArray(result)) {
            result.forEach((item) => {
                if (item) baseSend(item);
            });
            return;
        }
        baseSend(result);
        return;
    }
    baseSend(payload);
};

const getControlSensitivity = () => {
    const profile = window.PROFILE || {};
    const sensitivity = profile.ui?.control_sensitivity;
    if (typeof sensitivity === 'number') return sensitivity;
    return 1;
};

const bumpTcasUserHold = function () {
    window.__tcasUserHoldUntil = Date.now() + SIM_SYNC_HOLD_MS;
    bumpSimSyncHold();
};

const bumpEngModeUserHold = function () {
    window.__engModeUserHoldUntil = Date.now() + SIM_SYNC_HOLD_MS;
    bumpSimSyncHold();
};

const bumpExtLtUserHold = function () {
    window.__extLtUserHoldUntil = Date.now() + SIM_SYNC_HOLD_MS;
    bumpSimSyncHold();
};

const getControlResponse = () => {
    const profile = window.PROFILE || {};
    const response = profile.ui?.control_response;
    if (typeof response === 'number') return response;
    return 1;
};

const applyControlResponse = (val) => {
    const response = getControlResponse();
    if (response === 1) return val;
    const delta = val - 0.5;
    const sign = delta >= 0 ? 1 : -1;
    const magnitude = Math.pow(Math.abs(delta) * 2, response) / 2;
    return 0.5 + sign * magnitude;
};

/** Map L:S_WR_SYS to UI index 0=1, 1=OFF, 2=2 (left SYS switch on radar panel). */
const normWrSysFromSim = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    if (window.PROFILE?.ui?.wxr_sys_ini_value_map) {
        const r = Math.round(v);
        if (r === 1) return 0;
        if (r === -1) return 1;
        if (r === 2) return 2;
        return undefined;
    }
    const r = Math.round(v);
    const nearInt = Math.abs(v - r) < 0.02;
    /* Fenix FNX32X_Interact_Switch_3Position: 0=1, 1=OFF, 2=2 — must run before 1-based branch or 1/2 map one step left */
    if (nearInt && r >= 0 && r <= 2) return r;
    if (nearInt && r >= 1 && r <= 3) return r - 1;
    if (v >= 0 && v <= 2.25) return Math.max(0, Math.min(2, Math.round(v)));
    if (v <= 100) return Math.max(0, Math.min(2, Math.round(v / 50)));
    return Math.max(0, Math.min(2, Math.round(v / 100)));
};

/** Map L:S_WR_PRED_WS to 0=OFF / 1=AUTO (handles 0–1 and 0–100). */
const normWrPwsFromSim = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    if (v > 1.5) return v >= 50 ? 1 : 0;
    return Math.max(0, Math.min(1, Math.round(v)));
};

const applySimRadarPws = (data) => {
    if (!data || typeof data !== 'object' || data.error) return;
    if (!radarPwsSwitches3d || typeof radarPwsSwitches3d.applySimState !== 'function') return;
    if (Date.now() < (window.__radarPwsUserHoldUntil || 0)) return;
    const patch = {};
    const sys = normWrSysFromSim(data.wr_sys);
    const pws = normWrPwsFromSim(data.wr_pws);
    if (sys !== undefined) patch.sys = sys;
    if (pws !== undefined) patch.pws = pws;
    if (patch.sys !== undefined || patch.pws !== undefined) radarPwsSwitches3d.applySimState(patch);
};

const applySimState = (data) => {
    if (!data || typeof data !== 'object' || data.error) return;
    applySimRadarPws(data);
    if (
        typeof data.eng_mode === 'number' &&
        typeof engModeOhApplyRef === 'function' &&
        Date.now() >= (window.__engModeUserHoldUntil || 0)
    ) {
        engModeOhApplyRef(data.eng_mode);
    }
    if (tcasKnobSyncRef && Date.now() >= (window.__tcasUserHoldUntil || 0)) {
        const tcasNum = function (v) {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            const x = parseFloat(v);
            return Number.isFinite(x) ? x : NaN;
        };
        const op = tcasNum(data.xpdr_operation);
        if (typeof tcasKnobSyncRef.setXpdrOperationIndex === 'function' && !Number.isNaN(op)) {
            tcasKnobSyncRef.setXpdrOperationIndex(Math.max(0, Math.min(2, Math.round(op))));
        }
        const tr = tcasNum(data.tcas_range);
        if (typeof tcasKnobSyncRef.setTcasRangeIndex === 'function' && !Number.isNaN(tr)) {
            tcasKnobSyncRef.setTcasRangeIndex(Math.max(0, Math.min(3, Math.round(tr))));
        }
        const xm = tcasNum(data.xpdr_mode);
        if (typeof tcasKnobSyncRef.setXpdrModeIndex === 'function' && !Number.isNaN(xm)) {
            tcasKnobSyncRef.setXpdrModeIndex(Math.max(0, Math.min(2, Math.round(xm))));
        }
    }
    if (
        extLtLightsApi &&
        typeof extLtLightsApi.syncFromSim === 'function' &&
        Date.now() >= (window.__extLtUserHoldUntil || 0)
    ) {
        extLtLightsApi.syncFromSim(data);
    }
    /* Do not gate the whole poll on __simSyncHoldUntil — that left packs/OH on HTML defaults after refresh.
       Spoiler / speedbrake: UI → sim only (no poll sync). Per-control holds (EXT LT, TCAS, eng mode, radar/PWS). */
    const idleBtn = document.getElementById('idleBtn');
    const tSlider = document.getElementById('tSlider');
    if (idleBtn && tSlider) {
        const throttleVal = parseFloat(tSlider.value);
        idleBtn.disabled = throttleVal === 0;
    }
    const indOn = function () {
        for (let i = 0; i < arguments.length; i++) {
            const k = arguments[i];
            if (typeof data[k] === 'number' && data[k] >= 0.5) return true;
        }
        return false;
    };
    const setPackOff = function (id, on) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('off', !on);
    };
    const syncFuelPumpBtn = function (btnId, swKey, lowKey, upKey) {
        const el = document.getElementById(btnId);
        if (!el) return;
        if (typeof data[lowKey] === 'number') {
            setPackOff(btnId, data[lowKey] < 0.15);
        } else if (typeof data[swKey] === 'number') {
            setPackOff(btnId, data[swKey] >= 0.5);
        }
        if (typeof data[upKey] === 'number') {
            el.classList.toggle('pack-fault-lit', data[upKey] >= 0.15);
        }
    };
    syncFuelPumpBtn('btnFuelCtr1', 'fuel_ctr1', 'i_fuel_ctr1_l', 'i_fuel_ctr1_u');
    syncFuelPumpBtn('btnFuelCtr2', 'fuel_ctr2', 'i_fuel_ctr2_l', 'i_fuel_ctr2_u');
    syncFuelPumpBtn('btnFuelLt1', 'fuel_lt1', 'i_fuel_lt1_l', 'i_fuel_lt1_u');
    syncFuelPumpBtn('btnFuelLt2', 'fuel_lt2', 'i_fuel_lt2_l', 'i_fuel_lt2_u');
    syncFuelPumpBtn('btnFuelRt1', 'fuel_rt1', 'i_fuel_rt1_l', 'i_fuel_rt1_u');
    syncFuelPumpBtn('btnFuelRt2', 'fuel_rt2', 'i_fuel_rt2_l', 'i_fuel_rt2_u');
    const bat1Btn = document.getElementById('btnBat1');
    if (bat1Btn) {
        if (typeof data.bat1 === 'number') {
            setPackOff('btnBat1', data.bat1 >= 0.5);
        } else if (typeof data.i_bat1_l === 'number') {
            setPackOff('btnBat1', data.i_bat1_l < 0.15);
        }
        if (typeof data.i_bat1_u === 'number') {
            bat1Btn.classList.toggle('pack-fault-lit', data.i_bat1_u >= 0.15);
        }
    }
    const bat2Btn = document.getElementById('btnBat2');
    if (bat2Btn) {
        if (typeof data.bat2 === 'number') {
            setPackOff('btnBat2', data.bat2 >= 0.5);
        } else if (typeof data.i_bat2_l === 'number') {
            setPackOff('btnBat2', data.i_bat2_l < 0.15);
        }
        if (typeof data.i_bat2_u === 'number') {
            bat2Btn.classList.toggle('pack-fault-lit', data.i_bat2_u >= 0.15);
        }
    }
    if (typeof data.i_apu_bleed_l === 'number' || typeof data.i_apu_bleed_u === 'number') {
        setPackOff('btnApuBleed', indOn('i_apu_bleed_l', 'i_apu_bleed_u'));
    }
    if (typeof data.i_apu_master_l === 'number' || typeof data.i_apu_master_u === 'number') {
        setPackOff('btnApuMasterOh', indOn('i_apu_master_l', 'i_apu_master_u'));
    }
    const apuStartBtn = document.getElementById('btnApuStartOh');
    if (apuStartBtn) {
        const apuAvailEl = apuStartBtn.querySelector('.apu-start-avail');
        const apuOnEl = apuStartBtn.querySelector('.pack-apu-start-on');
        if (apuAvailEl && typeof data.i_apu_start_u === 'number') {
            apuAvailEl.classList.toggle('lit', data.i_apu_start_u >= 0.5);
        }
        if (apuOnEl && typeof data.i_apu_start_l === 'number') {
            apuOnEl.classList.toggle('lit', data.i_apu_start_l >= 0.5);
        }
    }
    const p1b = document.getElementById('btnPack1');
    if (p1b && typeof data.i_pack1_l === 'number') {
        p1b.classList.toggle('off', data.i_pack1_l >= 0.15);
    }
    if (p1b && typeof data.i_pack1_u === 'number') {
        p1b.classList.toggle('pack-fault-lit', data.i_pack1_u >= 0.15);
    }
    const p2b = document.getElementById('btnPack2');
    if (p2b && typeof data.i_pack2_l === 'number') {
        p2b.classList.toggle('off', data.i_pack2_l >= 0.15);
    }
    if (p2b && typeof data.i_pack2_u === 'number') {
        p2b.classList.toggle('pack-fault-lit', data.i_pack2_u >= 0.15);
    }
    const extPwrBtn = document.getElementById('btnExtPwrOh');
    if (extPwrBtn) {
        /* Fenix: S_OH_ELEC_EXT_PWR is momentary; latched appearance from ON annunciator. */
        if (typeof data.i_ext_pwr_l === 'number') {
            extPwrBtn.classList.toggle('off', data.i_ext_pwr_l < 0.15);
        }
        const extAv = extPwrBtn.querySelector('.ext-pwr-avail');
        const extOn = extPwrBtn.querySelector('.ext-pwr-on');
        if (extAv) {
            if (typeof data.i_ext_pwr_u === 'number') {
                extAv.classList.toggle('lit', data.i_ext_pwr_u >= 0.15);
            } else {
                extAv.classList.remove('lit');
            }
        }
        if (extOn) {
            if (typeof data.i_ext_pwr_l === 'number') {
                extOn.classList.toggle('lit', data.i_ext_pwr_l >= 0.15);
            } else {
                extOn.classList.remove('lit');
            }
        }
    }
    /* Fenix autobrake: same read order as syncFuelPumpBtn — lower annunc (*_L) first, then switch LVar; upper (*_U) = DECEL line. */
    const syncAutobrkPb = function (btnId, swKey, upperAnnuncKey, lowerAnnuncKey) {
        const el = document.getElementById(btnId);
        if (!el) return;
        const upperEl = el.querySelector('.autobrake-annunc-upper') || el.querySelector('.apu-start-avail');
        const lowerEl = el.querySelector('.autobrake-annunc-lower') || el.querySelector('.pack-apu-start-on');
        if (typeof data[lowerAnnuncKey] === 'number') {
            setPackOff(btnId, data[lowerAnnuncKey] < 0.15);
            if (lowerEl) lowerEl.classList.toggle('lit', data[lowerAnnuncKey] >= 0.15);
        } else if (typeof data[swKey] === 'number') {
            setPackOff(btnId, data[swKey] >= 0.5);
            if (lowerEl) lowerEl.classList.remove('lit');
        } else {
            if (lowerEl) lowerEl.classList.remove('lit');
        }
        if (typeof data[upperAnnuncKey] === 'number') {
            if (upperEl) upperEl.classList.toggle('lit', data[upperAnnuncKey] >= 0.15);
        } else if (upperEl) {
            upperEl.classList.remove('lit');
        }
    };
    syncAutobrkPb('gearPb1', 'autobrake_lo', 'i_mip_autobrake_lo_u', 'i_mip_autobrake_lo_l');
    syncAutobrkPb('gearPb2', 'autobrake_med', 'i_mip_autobrake_med_u', 'i_mip_autobrake_med_l');
    syncAutobrkPb('gearPb3', 'autobrake_max', 'i_mip_autobrake_max_u', 'i_mip_autobrake_max_l');
};

const applyCachedLvarPollIfAny = function () {
    const d = window.__lastLvarPoll;
    if (d && typeof d === 'object' && !d.error) applySimState(d);
};

const bindButtonTouch = (btn) => {
    if (!btn) return;
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.click();
    }, { passive: false });
};

const getVjoyMapping = (key) => {
    const profile = window.PROFILE || {};
    const mapping = profile.mappings && profile.mappings.vjoy;
    if (mapping && Object.prototype.hasOwnProperty.call(mapping, key)) return mapping[key];
    return VJOY_MAP[key];
};

const initUI = () => {
    const camGrid = document.getElementById('camGrid');
    let selectedCamBtn = null;
    const cameraConfig = window.PROFILE?.ui?.camera_config || window.PROFILE?.camera_config || [];
    const debugUi = window.DEBUG_UI === true;
    if (camGrid) {
        if (camGrid.classList.contains('ecam-cp')) {
            const pageButtons = Array.from(camGrid.querySelectorAll('.ecam-page'));
            const toBtn = camGrid.querySelector('.ecam-toconfig');
            const allBtn = camGrid.querySelector('.ecam-all');
            const ecamPageCamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 10];
            const wireMomentary = (btn) => {
                if (!btn) return;
                bindButtonTouch(btn);
                const down = () => btn.classList.add('ecam-pressing');
                const up = () => btn.classList.remove('ecam-pressing');
                btn.addEventListener('pointerdown', (e) => {
                    if (e.isPrimary) down();
                });
                btn.addEventListener('pointerup', up);
                btn.addEventListener('pointercancel', up);
                btn.addEventListener('pointerleave', (e) => {
                    if (e.buttons === 0) up();
                });
            };
            wireMomentary(toBtn);
            wireMomentary(allBtn);
            if (toBtn) {
                toBtn.addEventListener('click', () => {
                    if (useMfMip()) {
                        setLvar('ecam_to', 1);
                        setTimeout(() => { setLvar('ecam_to', 0); }, 85);
                    }
                });
            }
            pageButtons.forEach((button, pageIdx) => {
                bindButtonTouch(button);
                button.addEventListener('click', () => {
                    const camId = ecamPageCamIds[Math.min(pageIdx, ecamPageCamIds.length - 1)];
                    const currentActive = camGrid.querySelector('.ecam-page.active');
                    if (button === currentActive) {
                        if (camId != null) {
                            selectedCamId = camId;
                            send({ type: 'camera', cam_id: camId });
                        }
                        return;
                    }
                    if (currentActive) {
                        currentActive.classList.remove('active');
                    }
                    button.classList.add('active');
                    if (camId != null) {
                        selectedCamId = camId;
                        send({ type: 'camera', cam_id: camId });
                    }
                });
            });
            if (allBtn) {
                allBtn.addEventListener('click', () => {
                    const active = pageButtons.find((b) => b.classList.contains('active'));
                    const idx = active ? pageButtons.indexOf(active) : -1;
                    const nextIdx = idx >= pageButtons.length - 1 ? 0 : idx + 1;
                    if (active) {
                        active.classList.remove('active');
                    }
                    const nextBtn = pageButtons[nextIdx];
                    if (nextBtn) nextBtn.classList.add('active');
                    const camId = ecamPageCamIds[Math.min(nextIdx, ecamPageCamIds.length - 1)];
                    if (camId != null) {
                        selectedCamId = camId;
                        send({ type: 'camera', cam_id: camId });
                    }
                });
            }
            if (pageButtons.length && !camGrid.querySelector('.ecam-page.active')) {
                const first = pageButtons[0];
                first.classList.add('active');
                const camId0 = ecamPageCamIds[0];
                if (camId0 != null) {
                    selectedCamId = camId0;
                    send({ type: 'camera', cam_id: camId0 });
                }
            }
        } else {
            cameraConfig.forEach((cam, index) => {
                const btn = document.createElement('button');
                btn.className = 'cam-btn';
                btn.innerText = cam.name;
                bindButtonTouch(btn);
                btn.onclick = () => {
                    if (selectedCamBtn === btn && btn.classList.contains('active')) {
                        btn.classList.remove('active');
                        selectedCamBtn = null;
                        selectedCamId = null;
                        return;
                    }
                    if (selectedCamBtn && selectedCamBtn !== btn) {
                        selectedCamBtn.classList.remove('active');
                    }
                    btn.classList.add('active');
                    selectedCamBtn = btn;
                    selectedCamId = cam.id;
                    btn.classList.add('clicking');
                    setTimeout(() => btn.classList.remove('clicking'), 200);
                    send({ type: 'camera', cam_id: cam.id });
                };
                camGrid.appendChild(btn);
                if (index === 0 && !debugUi) {
                    btn.click();
                }
            });
        }
    }

    const ofpCameraButtons = document.getElementById('ofpCameraButtons');
    let selectedOfpCamBtn = null;
    if (ofpCameraButtons) {
        const ofpCamIds = [1, 6, 7, 8, 9];
        ofpCamIds.forEach((camId) => {
            const cam = cameraConfig.find((c) => c.id === camId);
            if (cam) {
                const btn = document.createElement('button');
                btn.className = 'cam-btn';
                btn.innerText = cam.name;
                bindButtonTouch(btn);
                btn.onclick = () => {
                    if (selectedOfpCamBtn === btn && btn.classList.contains('active')) {
                        btn.classList.remove('active');
                        selectedOfpCamBtn = null;
                        selectedCamId = null;
                        return;
                    }
                    if (selectedOfpCamBtn && selectedOfpCamBtn !== btn) {
                        selectedOfpCamBtn.classList.remove('active');
                    }
                    btn.classList.add('active');
                    selectedOfpCamBtn = btn;
                    selectedCamId = cam.id;
                    btn.classList.add('clicking');
                    setTimeout(() => btn.classList.remove('clicking'), 200);
                    send({ type: 'camera', cam_id: cam.id });
                };
                ofpCameraButtons.appendChild(btn);
            }
        });
    }

    const fLabels = document.getElementById('flapLabels');
    if (fLabels && !document.getElementById('flap-3d-mount')) {
        fLabels.innerHTML = '';
        (window.PROFILE?.ui?.flap_detents || window.PROFILE?.flap_detents || []).forEach((d, i) => {
            const row = document.createElement('div');
            row.className = 'flap-detent-row';
            if (i === 0) row.classList.add('active');
            row.style.top = (d.val * 100) + '%';
            row.innerHTML = `<span>${d.label}</span><div class="indicator-dot"></div>`;
            fLabels.appendChild(row);
        });
    }
};

const updateFlapUI = (index) => {
    const rows = document.querySelectorAll('.flap-detent-row');
    rows.forEach((row, i) => row.classList.toggle('active', i === index));
};

const updateThrottleUI = (val, reverse) => {
    const throttleDetents = window.PROFILE?.ui?.throttle_detents || [];
    if (throttleDetents.length === 0) return;
    const rows = document.querySelectorAll('.throttle-detent-row');
    let activeIndex = -1;
    if (!reverse) {
        const minDetent = throttleDetents.reduce((min, curr) => curr.val < min ? curr.val : min, throttleDetents[0].val);
        if (val >= minDetent) {
            let bestIndex = 0;
            let bestDiff = Math.abs(throttleDetents[0].val - val);
            for (let i = 1; i < throttleDetents.length; i++) {
                const diff = Math.abs(throttleDetents[i].val - val);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIndex = i;
                }
            }
            activeIndex = bestIndex;
        }
    }
    rows.forEach((row, i) => row.classList.toggle('active', i === activeIndex));
};

const animateSliderToZero = (slider) => {
    const startVal = parseFloat(slider.value);
    const duration = 400; // Animation time in milliseconds
    const startTime = performance.now();

    const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function: easeOutCubic for a smooth stop
        const ease = 1 - Math.pow(1 - progress, 3);
        
        // Calculate new value and update slider
        slider.value = startVal * (1 - ease);
        
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(step);
};

const createJoystick = (zoneId, puckId, type) => {
    const zone = document.getElementById(zoneId);
    const puck = document.getElementById(puckId);
    let isTouching = false;
    let activeTouchId = null;
    let lastUpdateTime = 0;
    let animationFrameId = null;

    const getTouchInZone = (e) => {
        if (!e.touches) return e;
        const rect = zone.getBoundingClientRect();
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (activeTouchId !== null && touch.identifier === activeTouchId) {
                return touch;
            }
            if (activeTouchId === null) {
                const x = touch.clientX;
                const y = touch.clientY;
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return touch;
                }
            }
        }
        return null;
    };

    const sendUpdate = (payload) => {
        send(payload);
    };

    const updateJoystick = (e) => {
        if (!isTouching) return;
        const rect = zone.getBoundingClientRect();
        const touch = e.touches ? getTouchInZone(e) : e;
        
        if (!touch) {
            resetJoystick();
            return;
        }
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        
        const deltaX = touchX - centerX;
        const deltaY = touchY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxRadius = Math.min(rect.width, rect.height) / 2;
        
        let constrainedX = deltaX;
        let constrainedY = deltaY;
        
        if (distance > maxRadius) {
            constrainedX = (deltaX / distance) * maxRadius;
            constrainedY = (deltaY / distance) * maxRadius;
        }
        
        const normalizedX = (constrainedX / maxRadius) * 0.5 + 0.5;
        const normalizedY = (constrainedY / maxRadius) * 0.5 + 0.5;
        
        const puckX = 50 + (constrainedX / maxRadius) * 50;
        const puckY = 50 + (constrainedY / maxRadius) * 50;
        
        puck.style.left = puckX + '%';
        puck.style.top = puckY + '%';

        let valX = normalizedX;
        let valY = normalizedY;
        if (type === 'flight_controls') {
            const response = getControlResponse();
            if (response !== 1) {
                valX = applyControlResponse(normalizedX);
                valY = applyControlResponse(normalizedY);
            } else {
                const sensitivity = getControlSensitivity();
                valX = 0.5 + (normalizedX - 0.5) * sensitivity;
                valY = 0.5 + (normalizedY - 0.5) * sensitivity;
            }
        }
        const payload = { type: type, val_x: valX, val_y: valY };
        const now = performance.now();
        if (now - lastUpdateTime >= 16) {
            sendUpdate(payload);
            lastUpdateTime = now;
        }
    };

    const handleStart = (e) => {
        const rect = zone.getBoundingClientRect();
        let touch = null;
        
        if (e.touches) {
            for (let i = 0; i < e.touches.length; i++) {
                const t = e.touches[i];
                const x = t.clientX;
                const y = t.clientY;
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    touch = t;
                    activeTouchId = t.identifier;
                    break;
                }
            }
        } else {
            touch = e;
        }
        
        if (touch) {
            isTouching = true;
            updateJoystick(e);
        }
    };

    const resetJoystick = (e) => {
        if (e && e.touches && activeTouchId !== null) {
            let touchStillActive = false;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === activeTouchId) {
                    touchStillActive = true;
                    break;
                }
            }
            if (touchStillActive) return;
        }
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        const wasTouching = isTouching;
        isTouching = false;
        activeTouchId = null;
        lastUpdateTime = 0;
        
        puck.style.transition = '0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        puck.style.left = '50%'; 
        puck.style.top = '50%';
        
        if (wasTouching) {
            send({ type: type, val_x: 0.5, val_y: 0.5 });
        }
        
        setTimeout(() => puck.style.transition = 'none', 250);
    };

    zone.addEventListener('touchstart', handleStart, { passive: true });
    zone.addEventListener('touchmove', (e) => { 
        if (isTouching && activeTouchId !== null) {
            const touch = getTouchInZone(e);
            if (touch) {
                updateJoystick(e);
            }
        }
    }, { passive: true });
    zone.addEventListener('touchend', resetJoystick, { passive: true });
    zone.addEventListener('touchcancel', resetJoystick, { passive: true });
    zone.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', (e) => { if (isTouching) updateJoystick(e); });
    window.addEventListener('mouseup', resetJoystick);
};

const setViewportVars = () => {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vh = height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
};

const nudgeAddressBar = () => {
    window.scrollTo(0, 1);
    setTimeout(() => window.scrollTo(0, 0), 0);
};

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

document.addEventListener('DOMContentLoaded', () => {
    window.__simSyncHoldUntil = 0;
    window.__radarPwsUserHoldUntil = 0;
    window.__tcasUserHoldUntil = 0;
    window.__engModeUserHoldUntil = 0;
    window.__extLtUserHoldUntil = 0;
    let _vcLvarPollErrStreak = 0;
    const vcDebugLvars = (function () {
        try {
            const q = new URLSearchParams(window.location.search || '');
            if (q.get('vc_debug_lvars') === '1') window.localStorage.setItem('vc_debug_lvars', '1');
            if (q.get('vc_debug_lvars') === '0') window.localStorage.removeItem('vc_debug_lvars');
            return window.localStorage.getItem('vc_debug_lvars') === '1';
        } catch (e) {
            return false;
        }
    }());
    if (vcDebugLvars) {
        console.warn('[vc lvar] Debug ON: logs every ~2s. Turn off: localStorage.removeItem("vc_debug_lvars") or ?vc_debug_lvars=0');
    }
    try {
        const q = new URLSearchParams(window.location.search || '');
        window.__VC_DEBUG_SPOILER__ = q.get('vc_debug') === 'spoiler' || q.get('vc_debug') === 'all' || window.localStorage.getItem('vc_debug') === 'spoiler';
    } catch (e) {
        window.__VC_DEBUG_SPOILER__ = false;
    }
    setViewportVars();
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setViewportVars);
    } else {
        window.addEventListener('resize', setViewportVars);
    }
    if (isIOS) {
        setTimeout(nudgeAddressBar, 50);
        window.addEventListener('orientationchange', () => setTimeout(nudgeAddressBar, 200));
    }
    
    
    initUI();

    const camBtn = document.getElementById('showCams');
    bindButtonTouch(camBtn);
    const ofpBtn = document.getElementById('showOfp');
    bindButtonTouch(ofpBtn);
    const gridContainer = document.querySelector('.grid-container');
    const pedestalRow = document.querySelector('.pedestal-row');
    const ofpContainer = document.getElementById('ofpContainer');
    const metarContainer = document.getElementById('metarContainer');
    const metarContent = document.getElementById('metarContent');
    const metarRefreshBtn = document.getElementById('metarRefreshBtn');
    const ofpCameraButtonsEl = document.getElementById('ofpCameraButtons');
    const leftColumn = document.querySelector('.left-column');
    const leftBrakeContainer = document.getElementById('leftBrakeContainer');
    let ofpFrame = null;
    let ofpLoading = false;
    let ofpCache = null;
    let metarCache = null;
    let originIcao = null;
    let destinationIcao = null;

    const setNavActive = (activeBtn) => {
        [camBtn, ofpBtn].forEach((btn) => {
            if (!btn) return;
            btn.classList.toggle('active', btn === activeBtn);
        });
    };

    const renderMetars = (metars) => {
        if (!metarContent) return;
        metarContent.innerHTML = '';
        if (metars.origin) {
            const originDiv = document.createElement('div');
            originDiv.textContent = metars.origin;
            metarContent.appendChild(originDiv);
        }
        if (metars.destination) {
            const destDiv = document.createElement('div');
            destDiv.textContent = metars.destination;
            metarContent.appendChild(destDiv);
        }
    };

    const fetchMetars = async () => {
        if (!originIcao && !destinationIcao) return null;
        try {
            const params = new URLSearchParams();
            if (originIcao) params.append('origin', originIcao);
            if (destinationIcao) params.append('destination', destinationIcao);
            const res = await fetch(`/metar?${params.toString()}`);
            const data = await res.json();
            return data.metars || {};
        } catch {
            return null;
        }
    };

    const renderOfp = (pdfUrl, metars) => {
        if (!pdfUrl) {
            if (ofpContainer) ofpContainer.textContent = 'OFP not available';
            return;
        }
        if (ofpContainer) {
            ofpContainer.innerHTML = '';
            const pdfObj = document.createElement('object');
            pdfObj.className = 'ofp-frame';
            pdfObj.type = 'application/pdf';
            pdfObj.data = pdfUrl;
            pdfObj.setAttribute('data', pdfUrl);
            ofpContainer.appendChild(pdfObj);
            ofpFrame = pdfObj;
        }
        if (metars) {
            renderMetars(metars);
            if (metarContainer) metarContainer.classList.remove('hidden');
        }
        if (gridContainer) gridContainer.classList.add('hidden');
        if (pedestalRow) pedestalRow.classList.add('hidden');
        if (ofpContainer) ofpContainer.classList.remove('hidden');
        if (ofpCameraButtonsEl) ofpCameraButtonsEl.classList.remove('hidden');
        if (leftBrakeContainer) leftBrakeContainer.classList.remove('hidden');
        if (leftColumn) leftColumn.classList.add('ofp-mode');
        setNavActive(ofpBtn);
    };

    const showCams = () => {
        if (gridContainer) gridContainer.classList.remove('hidden');
        if (pedestalRow) pedestalRow.classList.remove('hidden');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                window.dispatchEvent(new Event('resize'));
            });
        });
        if (ofpContainer) ofpContainer.classList.add('hidden');
        if (metarContainer) metarContainer.classList.add('hidden');
        if (ofpCameraButtonsEl) ofpCameraButtonsEl.classList.add('hidden');
        if (leftBrakeContainer) leftBrakeContainer.classList.add('hidden');
        if (leftColumn) leftColumn.classList.remove('ofp-mode');
        setNavActive(camBtn);
    };

    const showOfp = async () => {
        if (ofpLoading) return;
        
        if (ofpCache) {
            renderOfp(ofpCache, metarCache || null);
            if (!metarCache && (originIcao || destinationIcao)) {
                const metars = await fetchMetars();
                if (metars) {
                    metarCache = metars;
                    renderMetars(metars);
                }
            }
            return;
        }
        
        ofpLoading = true;
        try {
            const res = await fetch('/ofp');
            const data = await res.json();
            if (data.pdf_url) {
                ofpCache = data.pdf_url;
            }
            if (data.metars) {
                metarCache = data.metars;
            }
            if (data.origin_icao) {
                originIcao = data.origin_icao;
            }
            if (data.destination_icao) {
                destinationIcao = data.destination_icao;
            }
            renderOfp(data.pdf_url, data.metars);
        } catch {
            if (ofpContainer) ofpContainer.textContent = 'OFP not available';
        } finally {
            ofpLoading = false;
        }
    };

    if (metarRefreshBtn) {
        bindButtonTouch(metarRefreshBtn);
        metarRefreshBtn.onclick = async () => {
            if (!originIcao && !destinationIcao) return;
            metarRefreshBtn.disabled = true;
            const metars = await fetchMetars();
            if (metars) {
                metarCache = metars;
                renderMetars(metars);
            }
            metarRefreshBtn.disabled = false;
        };
    }
    const ofpRefreshBtn = document.getElementById('ofpRefreshBtn');
    if (ofpRefreshBtn) {
        bindButtonTouch(ofpRefreshBtn);
        ofpRefreshBtn.onclick = async () => {
            ofpCache = null;
            metarCache = null;
            ofpLoading = false;
            ofpRefreshBtn.disabled = true;
            try {
                const res = await fetch('/ofp');
                const data = await res.json();
                if (data.pdf_url) ofpCache = data.pdf_url;
                if (data.metars) metarCache = data.metars;
                if (data.origin_icao) originIcao = data.origin_icao;
                if (data.destination_icao) destinationIcao = data.destination_icao;
                renderOfp(ofpCache, metarCache);
            } catch {
                if (ofpContainer) ofpContainer.textContent = 'OFP not available';
            }
            ofpRefreshBtn.disabled = false;
        };
    }

    const utcClockEl = document.getElementById('utcClock');
    if (utcClockEl) {
        const updateUtcClock = () => {
            const now = new Date();
            const hh = String(now.getUTCHours()).padStart(2, '0');
            const mm = String(now.getUTCMinutes()).padStart(2, '0');
            utcClockEl.textContent = hh + ':' + mm + 'Z';
        };
        updateUtcClock();
        setInterval(updateUtcClock, 1000);
    }

    if (camBtn) camBtn.onclick = showCams;
    if (ofpBtn) ofpBtn.onclick = showOfp;
    
    (async () => {
        try {
            const res = await fetch('/ofp');
            const data = await res.json();
            if (data.pdf_url) {
                ofpCache = data.pdf_url;
            }
            if (data.metars) {
                metarCache = data.metars;
            }
            if (data.origin_icao) {
                originIcao = data.origin_icao;
            }
            if (data.destination_icao) {
                destinationIcao = data.destination_icao;
            }
        } catch {
        }
        showCams();
    })();

    const refreshPageBtn = document.getElementById('refreshPageBtn');
    if (refreshPageBtn) {
        bindButtonTouch(refreshPageBtn);
        refreshPageBtn.onclick = () => location.reload();
    }

    const fSliderEl = document.getElementById('fSlider');
    const flap3dMount = document.getElementById('flap-3d-mount');
    const flapPosEl = document.getElementById('flap-pos');
    if (flap3dMount && fSliderEl) {
        const flapDetents = window.PROFILE?.ui?.flap_detents || window.PROFILE?.flap_detents || [];
        if (flapDetents.length >= 2) {
            import('/static/js/flap_lever_3d.js')
                .then(function (mod) {
                    if (typeof mod.initFlapLever3D !== 'function') return;
                    return mod.initFlapLever3D(flap3dMount, {
                        posEl: flapPosEl || null,
                        detents: flapDetents,
                        hiddenInput: fSliderEl,
                        onCommit: function (idx, val) {
                            updateFlapUI(idx);
                            send({ type: 'flaps_axis', value: val });
                        },
                    });
                })
                .then(function (api) {
                    if (!api || typeof api.applyAxisValue !== 'function') return;
                    flapLeverApplyAxis = api.applyAxisValue;
                    if (pendingFlapRestore !== null) {
                        flapLeverApplyAxis(pendingFlapRestore);
                        pendingFlapRestore = null;
                    }
                })
                .catch(function () {});
        }
    } else if (fSliderEl && fSliderEl.type === 'range') {
        fSliderEl.oninput = function () {
            const visualVal = parseFloat(this.value);
            let closestIndex = 0;
            const flapDetents = window.PROFILE?.ui?.flap_detents || window.PROFILE?.flap_detents || [];
            if (!flapDetents.length) return;
            flapDetents.reduce((prev, curr, index) => {
                const isCloser = Math.abs(curr.val - visualVal) < Math.abs(prev.val - visualVal);
                if (isCloser) closestIndex = index;
                return isCloser ? curr : prev;
            });
            this.value = flapDetents[closestIndex].val;
            updateFlapUI(closestIndex);
            send({ type: 'flaps_axis', value: flapDetents[closestIndex].val });
        };
    }

    const radarPwsMount = document.getElementById('radar-pws-3d-mount');
    if (radarPwsMount) {
        import('/static/js/radar_pws_switches_3d.js')
            .then(function (mod) {
                if (typeof mod.initRadarPwsSwitches3D !== 'function') return;
                radarPwsSwitches3d = mod.initRadarPwsSwitches3D(radarPwsMount, {
                    compact: true,
                    onUserInteraction: bumpRadarPwsUserHold,
                    onChange: function (s) {
                        bumpRadarPwsUserHold();
                        if (!useMfMip()) return;
                        let sysVal = s.sys;
                        if (window.PROFILE?.ui?.wxr_sys_ini_value_map) {
                            const m = [1, -1, 2];
                            sysVal = m[s.sys] != null ? m[s.sys] : s.sys;
                        }
                        setLvar('wr_sys', sysVal);
                        setLvar('wr_pws', s.pws);
                    }
                });
                applyCachedLvarPollIfAny();
            })
            .catch(function () { });
    }

    const sSlider = document.getElementById('sSlider');
    const spoil3dMount = document.getElementById('spoiler-3d-mount');
    const armBtn = document.getElementById('armBtn');

    if (spoil3dMount && sSlider) {
        import('/static/js/spoiler_lever_3d.js')
            .then(function (mod) {
                if (typeof mod.initSpoilerLever3D !== 'function') return;
                return mod.initSpoilerLever3D(spoil3dMount, {
                    hiddenInput: sSlider,
                    onAxis: function (val, meta) {
                        spoilerArmBandAtTop = !!(meta && meta.armBandAtTop);
                        const fromPoll = meta && meta.fromExternal === true;
                        /* Sim poll drives the lever with fromExternal; do not treat as pilot override. */
                        if (isArmed && val > 0.05 && !fromPoll) {
                            isArmed = false;
                            if (armBtn) armBtn.classList.remove('active');
                            if (useMfMip()) {
                                setLvar('speedbrake_lock', 0);
                                setLvar('spoilers_handle', 1);
                            }
                        }
                        if (!fromPoll) {
                            send({ type: 'spoilers', value: val });
                        }
                    },
                    onArmChange: function (armed) {
                        isArmed = armed;
                        if (armBtn) armBtn.classList.toggle('active', armed);
                        const armButtonOnly = window.PROFILE?.ui?.arm_spoilers_button;
                        if (armed) {
                            sSlider.value = '0';
                            if (!spoil3dMount) {
                                if (typeof spoilerLeverApplyAxis === 'function') spoilerLeverApplyAxis(0);
                                else if (sSlider.type === 'range') animateSliderToZero(sSlider);
                            }
                            if (armButtonOnly) {
                                const sliderVal = parseFloat(sSlider.value);
                                if (sliderVal > 0) {
                                    sSlider.value = 0;
                                    if (typeof spoilerLeverApplyAxis === 'function') spoilerLeverApplyAxis(0);
                                    send({ type: 'spoilers', value: 0 });
                                    setTimeout(function () {
                                        if (useMfMip()) {
                                            setLvar('spoilers_handle', 0);
                                            setLvar('speedbrake_lock', 1);
                                        } else {
                                            send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                                        }
                                    }, 300);
                                } else {
                                    sSlider.value = 0;
                                    if (useMfMip()) {
                                        setLvar('spoilers_handle', 0);
                                        setLvar('speedbrake_lock', 1);
                                    } else {
                                        send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                                    }
                                }
                            } else {
                                send({ type: 'arm_spoilers', value: 0 });
                            }
                        } else {
                            if (armButtonOnly) {
                                if (useMfMip()) {
                                    setLvar('speedbrake_lock', 0);
                                    setLvar('spoilers_handle', spoilerUiAxisToSim(parseFloat(sSlider.value)));
                                } else {
                                    send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                                }
                            } else {
                                const sv = parseFloat(sSlider.value);
                                if (sv <= 0.05) {
                                    send({ type: 'spoilers', value: 0 });
                                }
                            }
                        }
                    },
                });
            })
            .then(function (api) {
                if (!api || typeof api.applyAxisValue !== 'function') return;
                spoilerLeverApplyAxis = api.applyAxisValue;
                if (pendingSpoilerRestore !== null) {
                    spoilerLeverApplyAxis(pendingSpoilerRestore);
                    pendingSpoilerRestore = null;
                } else if (useMfMip()) {
                    applyCachedLvarPollIfAny();
                }
            })
            .catch(function () {});
    }

    if (armBtn && sSlider) {
        bindButtonTouch(armBtn);
        armBtn.onclick = function() {
            const armButtonOnly = window.PROFILE?.ui?.arm_spoilers_button;
            const sliderVal = parseFloat(sSlider.value);
            isArmed = !isArmed;
            this.classList.toggle('active', isArmed);

            if (armButtonOnly) {
                if (isArmed) {
                    if (sliderVal > 0) {
                        sSlider.value = 0;
                        if (typeof spoilerLeverApplyAxis === 'function') spoilerLeverApplyAxis(0);
                        send({ type: 'spoilers', value: 0 });
                        setTimeout(() => {
                            if (useMfMip()) {
                                setLvar('spoilers_handle', 0);
                                setLvar('speedbrake_lock', 1);
                            } else {
                                send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                            }
                        }, 300);
                    } else {
                        sSlider.value = 0;
                        if (useMfMip()) {
                            setLvar('spoilers_handle', 0);
                            setLvar('speedbrake_lock', 1);
                        } else {
                            send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                        }
                    }
                } else {
                    if (useMfMip()) {
                        setLvar('speedbrake_lock', 0);
                        setLvar('spoilers_handle', spoilerUiAxisToSim(parseFloat(sSlider.value)));
                    } else {
                        send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                    }
                }
                return;
            }
            if (isArmed) {
                sSlider.value = 0;
                if (typeof spoilerLeverApplyAxis === 'function') {
                    spoilerLeverApplyAxis(0, { simArmed: true });
                } else if (sSlider.type === 'range') {
                    animateSliderToZero(sSlider);
                }
                send({ type: 'arm_spoilers', value: 0 });
            } else {
                send({ type: 'spoilers', value: 0 });
            }
        };
    }

    if (sSlider && sSlider.type === 'range') {
        sSlider.oninput = function () {
            spoilerArmBandAtTop = false;
            if (isArmed && parseFloat(this.value) > 0.05) {
                isArmed = false;
                if (armBtn) armBtn.classList.remove('active');
                if (useMfMip()) setLvar('speedbrake_lock', 0);
            }
            send({ type: 'spoilers', value: parseFloat(this.value) });
        };
    }

    const tSlider = document.getElementById('tSlider');
    const throttleLabels = document.getElementById('throttleLabels');
    const throttleDetents = window.PROFILE?.ui?.throttle_detents || [];
    if (throttleLabels && tSlider) {
        throttleLabels.innerHTML = '';
        const sliderRect = tSlider.getBoundingClientRect();
        const trackLength = sliderRect.height || 1;
        const thumbSize = 85;
        const offsetPct = (thumbSize / 2) / trackLength * 100 - 1.5;
        throttleDetents.forEach((d) => {
            const row = document.createElement('div');
            row.className = 'throttle-detent-row';
            row.style.top = ((1 - d.val) * 100 + offsetPct) + "%";
            row.innerHTML = `<span>${d.label}</span><div class="indicator-dot"></div>`;
            throttleLabels.appendChild(row);
        });
    }
    const idleBtn = document.getElementById('idleBtn');
    
    const updateIdleButtonState = () => {
        if (idleBtn) {
            const throttleVal = parseFloat(tSlider.value);
            idleBtn.disabled = throttleVal === 0;
        }
    };
    
    tSlider.oninput = function() {
        if(throttleBlocked) { this.value = 0; return; }
        let val = parseFloat(this.value);
        const snapThreshold = window.PROFILE?.ui?.throttle_detent_snap ?? 0;
        if (!isReverse && throttleDetents.length > 0) {
            const minDetent = throttleDetents.reduce((min, curr) => curr.val < min ? curr.val : min, throttleDetents[0].val);
            if (val >= minDetent) {
                let closest = throttleDetents[0];
                let closestDiff = Math.abs(closest.val - val);
                for (let i = 1; i < throttleDetents.length; i++) {
                    const diff = Math.abs(throttleDetents[i].val - val);
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        closest = throttleDetents[i];
                    }
                }
                if (closestDiff <= snapThreshold) {
                    val = closest.val;
                    this.value = val;
                }
            }
        }
        updateIdleButtonState();
        updateThrottleUI(val, isReverse);
        send({ type: 'throttle', value: val, reverse: isReverse });
    };

    const revBtn = document.getElementById('revBtn');
    bindButtonTouch(revBtn);
    revBtn.onclick = function() {
        const reverseBehavior = window.PROFILE?.ui?.reverse_behavior;
        isReverse = !isReverse;
        this.classList.toggle('active', isReverse);
        if (isReverse) {
            if (reverseBehavior && reverseBehavior.spool_down_ms === 0) {
                const bumpDown = reverseBehavior.idle_bump_down ?? 1;
                const bumpMs = reverseBehavior.idle_bump_ms ?? 0;
                tSlider.value = 0;
                updateIdleButtonState();
                send({ type: 'throttle', value: bumpDown, reverse: true });
                setTimeout(() => {
                    send({ type: 'throttle', value: 0, reverse: true });
                }, bumpMs);
                return;
            }
        }
        if(!isReverse) {
            if (reverseBehavior && reverseBehavior.spool_down_ms === 0) {
                throttleBlocked = false;
                this.innerText = "REVERSE";
                const idleFloor = reverseBehavior.idle_floor ?? 0;
                const bumpUp = reverseBehavior.idle_bump_up ?? idleFloor;
                const bumpMs = reverseBehavior.idle_bump_ms ?? 0;
                tSlider.value = bumpUp;
                updateIdleButtonState();
                send({ type: 'throttle', value: bumpUp, reverse: false });
                setTimeout(() => {
                    tSlider.value = idleFloor;
                    updateIdleButtonState();
                    send({ type: 'throttle', value: idleFloor, reverse: false });
                }, bumpMs);
                return;
            }
            throttleBlocked = true; this.innerText = "SPOOL DOWN";
            setTimeout(() => { throttleBlocked = false; this.innerText = "REVERSE"; }, 2000);
        }
        tSlider.value = 0;
        updateIdleButtonState();
        send({ type: 'throttle', value: 0, reverse: isReverse });
    };

    /*
    const gearLever = document.getElementById('gearHandle');
    if (gearLever) {
        gearIsDown = true;
        gearLever.classList.remove('gear-up');
        gearLever.classList.add('gear-down');
        gearLever.addEventListener('pointerdown', function() {
            gearIsDown = !gearIsDown;
            if (gearIsDown) {
                this.classList.remove('gear-up');
                this.classList.add('gear-down');
            } else {
                this.classList.remove('gear-down');
                this.classList.add('gear-up');
            }
            send({ type: 'gear_command', state: gearIsDown ? 'DOWN' : 'UP' });
        });
    }
    */
    const gear3dMount = document.getElementById('gear-3d-mount');
    if (gear3dMount) {
        gearIsDown = true;
        import('/static/js/gear_lever_3d.js')
            .then(function (mod) {
                const api = mod.initGearLever3D(gear3dMount, {
                    onCommit: function (isDown) {
                        gearIsDown = isDown;
                        send({ type: 'gear_command', state: isDown ? 'DOWN' : 'UP' });
                    }
                });
                if (api) gearLever3dApi = api;
            })
            .catch(function () {});
    }

    const pedestalClockHost = document.getElementById('pedestalClockHost');
    if (pedestalClockHost) {
        import('/static/js/pedestal_clock.js')
            .then(function (mod) {
                mod.initPedestalClock(pedestalClockHost);
            })
            .catch(function () {});
    }

    if (idleBtn) {
        updateIdleButtonState();
        updateThrottleUI(parseFloat(tSlider.value), isReverse);
        bindButtonTouch(idleBtn);
        idleBtn.addEventListener('click', function() {
            if (this.disabled) return;
            
            this.classList.add('clicking');
            this.classList.add('pressed');
            
            const reverseBehavior = window.PROFILE?.ui?.reverse_behavior;
            const idleFloor = reverseBehavior?.idle_floor ?? 0;
            const idleRev = reverseBehavior?.idle_rev ?? 0;
            const targetVal = isReverse ? idleRev : idleFloor;
            const startVal = parseFloat(tSlider.value);
            const startTime = performance.now();
            
            const animateIdle = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / 300, 1);
                
                const ease = 1 - Math.pow(1 - progress, 3);
                tSlider.value = startVal + (targetVal - startVal) * ease;
                
                if (progress < 1) {
                    requestAnimationFrame(animateIdle);
                } else {
                    updateIdleButtonState();
                    send({ type: 'throttle', value: targetVal, reverse: isReverse });
                }
            };
            requestAnimationFrame(animateIdle);

            let blinkCount = 1;
            const blinkInterval = setInterval(() => {
                this.classList.toggle('pressed');
                blinkCount++;
                if (blinkCount >= 6) {
                    clearInterval(blinkInterval);
                    this.classList.remove('clicking');
                    this.classList.remove('pressed');
                }
            }, 500);

            if (reverseBehavior) {
                send({ type: 'throttle', value: targetVal, reverse: isReverse });
            } else {
                send({ type: 'idle_command' });
            }
        });
    }

    const pbBtn = document.getElementById('pbBtn');
    const pbBtnLeft = document.getElementById('pbBtnLeft');
    const pbMount = document.getElementById('pb-3d-mount');
    const pbLeftMount = document.getElementById('pb-left-3d-mount');
    function parkingBrakeCommitFrom3d(source, newState) {
        pbState = !!newState;
        const ui = window.PROFILE?.ui || {};
        const skipPb = Array.isArray(ui.mobiflight_skip_lvar_types) && ui.mobiflight_skip_lvar_types.indexOf('parking_brake') >= 0;
        if (useMfMip() && !skipPb) {
            setLvar('parking_brake', pbState ? 1 : 0);
        } else {
            send({ type: 'vjoy_button', button: getVjoyMapping('PARKING_BRAKE') });
        }
        if (source !== 'main' && parkingBrake3dMain && typeof parkingBrake3dMain.applyVisualState === 'function') {
            parkingBrake3dMain.applyVisualState(pbState);
        }
        if (source !== 'left' && parkingBrake3dLeft && typeof parkingBrake3dLeft.applyVisualState === 'function') {
            parkingBrake3dLeft.applyVisualState(pbState);
        }
        if (pbBtn) pbBtn.classList.toggle('active', pbState);
        if (pbBtnLeft) pbBtnLeft.classList.toggle('active', pbState);
    }
    if (pbMount) {
        import('/static/js/parking_brake_3d.js')
            .then(function (mod) {
                if (typeof mod.initParkingBrake3D !== 'function') return;
                parkingBrake3dMain = mod.initParkingBrake3D(pbMount, {
                    sourceTag: 'main',
                    initialOn: pbState,
                    onToggle: function (tag, newState) { parkingBrakeCommitFrom3d(tag, newState); },
                });
            })
            .catch(function () {});
    }
    if (pbLeftMount) {
        import('/static/js/parking_brake_3d.js')
            .then(function (mod) {
                if (typeof mod.initParkingBrake3D !== 'function') return;
                parkingBrake3dLeft = mod.initParkingBrake3D(pbLeftMount, {
                    sourceTag: 'left',
                    initialOn: pbState,
                    onToggle: function (tag, newState) { parkingBrakeCommitFrom3d(tag, newState); },
                });
            })
            .catch(function () {});
    }
    const brakePedalsMount = document.getElementById('brake-pedals-main-mount');
    if (brakePedalsMount) {
        import('/static/js/brake_pedals_test.js')
            .then(function (mod) {
                if (typeof mod.initBrakePedalsTest !== 'function') return;
                brakePedalsMain = mod.initBrakePedalsTest(brakePedalsMount, {
                    initialValue: 0,
                    onBrakeInput: function (v) {
                        send({ type: 'brakes', value: v });
                    },
                });
            })
            .catch(function () {});
    }
    const tcasXpdrRoot = document.getElementById('tcas-xpdr-root');
    if (tcasXpdrRoot && typeof window.initTcasXpdrPanel === 'function') {
        const pulseAtc = function (key) {
            setLvar(key, 1);
            setTimeout(function () { setLvar(key, 0); }, 110);
        };
        tcasKnobSyncRef = window.initTcasXpdrPanel(tcasXpdrRoot, {
            onUserInteraction: bumpTcasUserHold,
            defaultXpdrBuffer: '2000',
            onXpdrOperation: function (idx) {
                if (useMfMip()) setLvar('xpdr_operation', idx);
            },
            onTcasRange: function (idx) {
                if (useMfMip()) setLvar('tcas_range', idx);
            },
            onXpdrMode: function (idx) {
                if (useMfMip()) setLvar('xpdr_mode', idx);
            },
            pulseAtcDigit: function (d) {
                bumpTcasUserHold();
                if (!useMfMip()) return;
                pulseAtc('ped_atc_' + d);
            },
            pulseAtcClr: function () {
                bumpTcasUserHold();
                if (!useMfMip()) return;
                pulseAtc('ped_atc_clr');
            }
        });
    }
    if (!pbMount && pbBtn) {
        const parkingBrakeHandler = function () {
            pbState = !pbState;
            if (pbBtn) pbBtn.classList.toggle('active', pbState);
            if (pbBtnLeft) pbBtnLeft.classList.toggle('active', pbState);
            const ui = window.PROFILE?.ui || {};
            const skipPb = Array.isArray(ui.mobiflight_skip_lvar_types) && ui.mobiflight_skip_lvar_types.indexOf('parking_brake') >= 0;
            if (useMfMip() && !skipPb) {
                setLvar('parking_brake', pbState ? 1 : 0);
            } else {
                send({ type: 'vjoy_button', button: getVjoyMapping('PARKING_BRAKE') });
            }
        };
        bindButtonTouch(pbBtn);
        pbBtn.classList.toggle('active', pbState);
        pbBtn.onclick = parkingBrakeHandler;
        if (pbBtnLeft) {
            bindButtonTouch(pbBtnLeft);
            pbBtnLeft.classList.toggle('active', pbState);
            pbBtnLeft.onclick = parkingBrakeHandler;
        }
    }

    const setOvhdLvar = (key, value) => {
        setLvar(key, value);
    };

    const initFlipDrag = (el, lvarKey, positions) => {
        const is3 = positions === 3;
        const LEVER_H = 18;
        const TRACK_H = is3 ? 78 : 52;
        const PAD = 2;
        const MAX = TRACK_H - LEVER_H - PAD;
        const snaps = is3 ? [PAD, Math.round((TRACK_H - LEVER_H) / 2), MAX] : [PAD, MAX];

        const getPos = () => is3
            ? (parseInt(el.dataset.pos) || 0)
            : (el.classList.contains('on') ? 0 : 1);

        const applyPos = (pos) => {
            if (is3) {
                el.dataset.pos = String(pos);
            } else {
                el.classList.toggle('on', pos === 0);
            }
            const v = !is3 && lvarKey === 'wing_scan' ? (pos === 0 ? 1 : 0) : pos;
            setOvhdLvar(lvarKey, v);
        };

        let active = false;
        let startY = 0;
        let startTop = 0;
        let lever = null;

        el.addEventListener('pointerdown', (e) => {
            lever = el.querySelector(is3 ? '.flip3-lever' : '.flip-lever');
            if (!lever) return;
            active = true;
            startY = e.clientY;
            startTop = snaps[getPos()];
            lever.style.cssText = `transition:none; top:${startTop}px`;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('pointermove', (e) => {
            if (!active || !lever) return;
            const newTop = Math.max(PAD, Math.min(MAX, startTop + (e.clientY - startY)));
            lever.style.top = newTop + 'px';
        });

        const endDrag = () => {
            if (!active || !lever) return;
            active = false;
            const cur = parseFloat(lever.style.top);
            let closest = 0;
            snaps.forEach((s, i) => {
                if (Math.abs(cur - s) < Math.abs(cur - snaps[closest])) closest = i;
            });
            lever.style.transition = 'top 0.18s cubic-bezier(0.4,0,0.2,1)';
            lever.style.top = snaps[closest] + 'px';
            applyPos(closest);
            setTimeout(() => {
                if (lever) {
                    lever.style.removeProperty('top');
                    lever.style.removeProperty('transition');
                }
                lever = null;
            }, 220);
        };

        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
    };

    const extLtVp = document.getElementById('extLtLightsViewport');
    if (extLtVp) {
        import('/static/js/ext_lt_lights_panel.js')
            .then((mod) => {
                return mod.attachExtLtLightsPanel(extLtVp, {
                    emit: (key, val) => setOvhdLvar(key, val),
                    onUserInteraction: bumpExtLtUserHold,
                });
            })
            .then((api) => {
                extLtLightsApi = api;
                applyCachedLvarPollIfAny();
            })
            .catch(() => {});
    } else {
        [
            ['swStrobe',   'strobe',      3],
            ['swBeacon',   'beacon',      2],
            ['swWingScan', 'wing_scan',   2],
            ['swNavLogo',  'nav_logo',    3],
            ['swRwyTo',    'rwy_turnoff', 2],
            ['swLandL',    'land_left',   3],
            ['swLandR',    'land_right',  3],
            ['swNose',     'nose_light',  3],
        ].forEach(([id, lvarKey, positions]) => {
            const el = document.getElementById(id);
            if (el) initFlipDrag(el, lvarKey, positions);
        });
    }

    const toggleOvhdBtn = (id, lvarKey) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            const on = this.classList.toggle('on');
            setOvhdLvar(lvarKey, on ? 1 : 0);
        });
    };

    window.setPackFaultIndicator = (packIndex, lit) => {
        const id = packIndex === 0 ? 'btnPack1' : 'btnPack2';
        const el = document.getElementById(id);
        if (el) el.classList.toggle('pack-fault-lit', !!lit);
    };

    const bindPackStyleToggle = (id, lvarKey) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        let busy = false;
        btn.addEventListener('click', function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (busy) return;
            busy = true;
            const goingOff = !this.classList.contains('off');
            const animClass = goingOff ? 'pack-anim-release' : 'pack-anim-press';
            this.classList.add(animClass);
            this.addEventListener(
                'animationend',
                () => {
                    this.classList.remove(animClass);
                    this.classList.toggle('off', goingOff);
                    if (lvarKey) {
                        setOvhdLvar(lvarKey, goingOff ? 0 : 1);
                    }
                    busy = false;
                },
                { once: true }
            );
        });
    };

    const bindPackRpnToggle = (id, lvarKey) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        let busy = false;
        btn.addEventListener('click', function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (busy) return;
            busy = true;
            const animClass = 'pack-anim-press';
            this.classList.add(animClass);
            this.addEventListener(
                'animationend',
                () => {
                    this.classList.remove(animClass);
                    if (lvarKey && useMfMip()) setLvar(lvarKey, 1);
                    busy = false;
                },
                { once: true }
            );
        });
    };

    const bindMomentaryOhPush = (id, lvarKey, opts) => {
        const alwaysSend = opts && opts.alwaysSend === true;
        const btn = document.getElementById(id);
        if (!btn) return;
        let busy = false;
        btn.addEventListener('click', function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (busy) return;
            busy = true;
            const animClass = 'pack-anim-press';
            this.classList.add(animClass);
            this.addEventListener(
                'animationend',
                () => {
                    this.classList.remove(animClass);
                    if (lvarKey && (alwaysSend || useMfMip())) {
                        setLvar(lvarKey, 1);
                        setTimeout(function () { setLvar(lvarKey, 0); }, 85);
                    }
                    busy = false;
                },
                { once: true }
            );
        });
    };

    const bindBatCycle = (id, lvarKey) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        let busy = false;
        btn.addEventListener('click', function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (busy) return;
            busy = true;
            const goingOff = !this.classList.contains('off');
            const animClass = goingOff ? 'pack-anim-release' : 'pack-anim-press';
            this.classList.add(animClass);
            this.addEventListener(
                'animationend',
                () => {
                    this.classList.remove(animClass);
                    this.classList.toggle('off', goingOff);
                    if (lvarKey) {
                        if (useMfMip()) setLvar(lvarKey, goingOff ? 0 : 1);
                        else setOvhdLvar(lvarKey, goingOff ? 0 : 1);
                    }
                    busy = false;
                },
                { once: true }
            );
        });
    };

    const bindAutobrkExclusiveGroup = (ids) => {
        const buttons = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
        if (buttons.length < 2) return;
        let busy = false;
        buttons.forEach(function (btn) {
            bindButtonTouch(btn);
            btn.addEventListener('click', function (e) {
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                if (busy) return;
                busy = true;
                const target = this;
                const alreadyOn = !target.classList.contains('off');
                const animClass = alreadyOn ? 'pack-anim-release' : 'pack-anim-press';
                target.classList.add(animClass);
                target.addEventListener(
                    'animationend',
                    function () {
                        target.classList.remove(animClass);
                        const keys = ['autobrake_lo', 'autobrake_med', 'autobrake_max'];
                        const idx = buttons.indexOf(target);
                        if (alreadyOn) {
                            target.classList.add('off');
                            if (useMfMip()) {
                                keys.forEach(function (k) { setLvar(k, 0); });
                            }
                        } else {
                            buttons.forEach(function (b) {
                                b.classList.toggle('off', b !== target);
                            });
                            if (useMfMip()) {
                                keys.forEach(function (k, i) {
                                    setLvar(k, i === idx ? 1 : 0);
                                });
                            }
                        }
                        busy = false;
                    },
                    { once: true }
                );
            });
        });
    };

    bindPackRpnToggle('btnPack1', 'pack1');
    bindPackRpnToggle('btnPack2', 'pack2');
    bindPackStyleToggle('btnApuBleed', 'apu_bleed');
    bindBatCycle('btnBat1', 'bat1');
    bindBatCycle('btnBat2', 'bat2');
    bindAutobrkExclusiveGroup(['gearPb1', 'gearPb2', 'gearPb3']);
    bindPackStyleToggle('btnApuMasterOh', 'apu_master');
    bindMomentaryOhPush('btnApuStartOh', 'apu_start');
    bindMomentaryOhPush('btnExtPwrOh', 'ext_pwr', { alwaysSend: true });
    [
        ['btnFuelLt1', 'fuel_lt1'],
        ['btnFuelLt2', 'fuel_lt2'],
        ['btnFuelCtr1', 'fuel_ctr1'],
        ['btnFuelCtr2', 'fuel_ctr2'],
        ['btnFuelRt1', 'fuel_rt1'],
        ['btnFuelRt2', 'fuel_rt2'],
    ].forEach(([id, key]) => bindPackStyleToggle(id, key));

    const attachEngMasterIfPresent = (elementId, opts) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        import('/static/js/eng_master_switch.js')
            .then((mod) => {
                if (typeof mod.attachEngMasterSwitch === 'function') {
                    mod.attachEngMasterSwitch(el, opts);
                }
            })
            .catch(() => {});
    };
    attachEngMasterIfPresent('engMaster3dViewport', {
        labelSecondRow: '1',
        onStateChange: function (s) { setOvhdLvar('eng_master1', s); }
    });
    attachEngMasterIfPresent('engMaster3dViewport2', {
        labelSecondRow: '2',
        onStateChange: function (s) { setOvhdLvar('eng_master2', s); }
    });

    const engModeOhRoot = document.getElementById('engModeOhRoot');
    if (engModeOhRoot) {
        import('/static/js/eng_mode_selector.js')
            .then(async (mod) => {
                const api = await mod.initEngModeSelector(engModeOhRoot, {
                    emit: function (mode) {
                        bumpEngModeUserHold();
                        setOvhdLvar('eng_mode', mode);
                    },
                });
                if (api && typeof api.applyExternal === 'function') {
                    engModeOhApplyRef = api.applyExternal;
                    applyCachedLvarPollIfAny();
                }
            })
            .catch(() => {});
    }

    const STATE_KEY = 'virtual_cockpit_state';
    const DEFAULT_STATE = { flaps: 0, throttle: 0, spoilers: 0 };
    const isDefaultState = (s) => s && Math.abs(parseFloat(s.flaps) - DEFAULT_STATE.flaps) < 1e-5 && Math.abs(parseFloat(s.throttle) - DEFAULT_STATE.throttle) < 1e-5 && Math.abs(parseFloat(s.spoilers) - DEFAULT_STATE.spoilers) < 1e-5;
    const saveState = () => {
        const profileName = window.PROFILE?.name;
        const f = document.getElementById('fSlider');
        if (!profileName || !f || !tSlider || !sSlider) return;
        const state = {
            profile: profileName,
            flaps: parseFloat(f.value),
            throttle: parseFloat(tSlider.value),
            spoilers: parseFloat(sSlider.value)
        };
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
    };
    const restoreState = () => {
        if (useMfMip()) return;
        const profileName = window.PROFILE?.name;
        if (!profileName) return;
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (state.profile !== profileName || isDefaultState(state)) return;
            const f = document.getElementById('fSlider');
            if (f) {
                f.value = state.flaps;
                const fv = parseFloat(state.flaps);
                if (document.getElementById('flap-3d-mount')) {
                    if (typeof flapLeverApplyAxis === 'function') flapLeverApplyAxis(fv);
                    else pendingFlapRestore = fv;
                } else {
                    updateFlapUI(Math.min(4, Math.round(state.flaps * 4)));
                }
                send({ type: 'flaps_axis', value: state.flaps });
            }
            if (tSlider) { tSlider.value = state.throttle; updateThrottleUI(state.throttle, false); send({ type: 'throttle', value: state.throttle, reverse: false }); }
            if (sSlider) {
                sSlider.value = state.spoilers;
                const sv = parseFloat(state.spoilers);
                if (document.getElementById('spoiler-3d-mount')) {
                    if (typeof spoilerLeverApplyAxis === 'function') spoilerLeverApplyAxis(sv);
                    else pendingSpoilerRestore = sv;
                }
                send({ type: 'spoilers', value: sv });
            }
        } catch (e) {}
    };
    setInterval(saveState, 60000);
    restoreState();

    if (useMfMip()) {
        const pollLvars = async function () {
            try {
                const q = window.__lvarProfile ? ('?profile=' + encodeURIComponent(window.__lvarProfile)) : '';
                const res = await fetch('/lvars' + q, { credentials: 'same-origin' });
                const text = await res.text();
                let d;
                try {
                    d = text ? JSON.parse(text) : {};
                } catch (parseErr) {
                    _vcLvarPollErrStreak++;
                    if (vcDebugLvars || _vcLvarPollErrStreak === 1 || _vcLvarPollErrStreak % 20 === 0) {
                        console.warn('[vc lvar] Not JSON from /lvars', res.status, String(text).slice(0, 200), parseErr);
                    }
                    const fb = window.__lastLvarPoll;
                    if (fb && typeof fb === 'object' && !fb.error) applySimState(fb);
                    return;
                }
                window.__vcLastLvarHttpStatus = res.status;
                window.__vcLastLvarPayload = d;
                if (d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, 'error')) {
                    console.warn('[vc lvar] payload.error', d.error, {
                        http: res.status,
                        ok: res.ok,
                        __lvarProfile: window.__lvarProfile,
                    });
                }
                if (!res.ok) {
                    _vcLvarPollErrStreak++;
                    if (vcDebugLvars || _vcLvarPollErrStreak === 1 || _vcLvarPollErrStreak % 20 === 0) {
                        if (!(d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, 'error'))) {
                            console.warn('[vc lvar] GET /lvars HTTP error', res.status, d);
                        }
                    }
                    const fb = window.__lastLvarPoll;
                    if (fb && typeof fb === 'object' && !fb.error) {
                        applySimState(fb);
                    } else {
                        applySimState(d && typeof d === 'object' ? d : { error: 'http_' + res.status });
                    }
                    return;
                }
                _vcLvarPollErrStreak = 0;
                if (d && d.error) {
                    const fb = window.__lastLvarPoll;
                    if (fb && typeof fb === 'object' && !fb.error) {
                        applySimState(fb);
                    }
                    return;
                }
                if (d && typeof d === 'object' && !d.error) window.__lastLvarPoll = d;
                if (vcDebugLvars) {
                    const t = Date.now();
                    if (!window.__vcLvarDbgNext || t >= window.__vcLvarDbgNext) {
                        window.__vcLvarDbgNext = t + 2000;
                        const keys = Object.keys(d).filter(function (k) { return k !== 'error'; });
                        const bad = keys.filter(function (k) {
                            const v = d[k];
                            return v == null || (typeof v === 'number' && !Number.isFinite(v));
                        });
                        console.log('[vc lvar debug]', {
                            http: res.status,
                            __lvarProfile: window.__lvarProfile,
                            keyCount: keys.length,
                            badKeys: bad.slice(0, 20),
                            wr_sys: d.wr_sys,
                            wr_pws: d.wr_pws,
                            bat1: d.bat1,
                            ext_pwr: d.ext_pwr,
                            spoilers_handle: d.spoilers_handle,
                        });
                    }
                }
                applySimState(d);
            } catch (e) {
                _vcLvarPollErrStreak++;
                if (vcDebugLvars || _vcLvarPollErrStreak === 1 || _vcLvarPollErrStreak % 20 === 0) {
                    console.warn('[vc lvar] fetch exception', e);
                }
                const fb = window.__lastLvarPoll;
                if (fb && typeof fb === 'object' && !fb.error) applySimState(fb);
            }
        };
        window.__pollLvarsNow = pollLvars;
        pollLvars();
        setInterval(pollLvars, 450);
        setTimeout(function () { applyCachedLvarPollIfAny(); }, 350);
        setTimeout(function () { applyCachedLvarPollIfAny(); }, 1000);
        setTimeout(function () { applyCachedLvarPollIfAny(); }, 2200);
    }
});