let isReverse = false, throttleBlocked = false, rudderResetting = false, pbState = true, isArmed = false, gearIsDown = false, camMoveActive = false;
let selectedCamId = null;

const baseSend = (payload) => {
    fetch('/update_sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
};

const send = (payload) => {
    const profile = window.PROFILE || {};
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

const setLvar = (key, value) => {
    fetch('/lvars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
    });
};

const stepLvar = (key, delta) => {
    fetch('/lvars/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, delta })
    });
};

const isFenixA320 = () => window.PROFILE?.name === 'Fenix A320';

const getControlSensitivity = () => {
    const profile = window.PROFILE || {};
    const sensitivity = profile.ui?.control_sensitivity;
    if (typeof sensitivity === 'number') return sensitivity;
    return 1;
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

const apValues = { spd: 250, hdg: 0, alt: 10000, vs: 0 };
const knobRotations = { spd: 0, hdg: 0, alt: 0, vs: 0 };

const setApDisplay = (type, value) => {
    const display = document.getElementById(type + 'Val');
    if (!display || value === null || value === undefined || Number.isNaN(value)) return;
    if (type === 'hdg') {
        const newVal = ((Math.round(value) % 360) + 360) % 360;
        apValues[type] = newVal;
        display.innerText = newVal.toString().padStart(3, '0');
        return;
    }
    const newVal = Math.round(value);
    apValues[type] = newVal;
    display.innerText = newVal;
};

const applyLvarState = (data) => {
    if (!data || typeof data !== 'object') return;
    if (data.fcu_spd !== undefined) setApDisplay('spd', Number(data.fcu_spd));
    if (data.fcu_hdg !== undefined) setApDisplay('hdg', Number(data.fcu_hdg));
    if (data.fcu_alt !== undefined) setApDisplay('alt', Number(data.fcu_alt));
    if (data.fcu_vs !== undefined) setApDisplay('vs', Number(data.fcu_vs));
    const gearLever = document.getElementById('gearHandle');
    if (gearLever && data.gear_handle !== undefined) {
        const down = Number(data.gear_handle) >= 0.5;
        gearIsDown = down;
        gearLever.classList.toggle('gear-down', down);
        gearLever.classList.toggle('gear-up', !down);
    }
    const pbBtn = document.getElementById('pbBtn');
    if (pbBtn && data.parking_brake !== undefined) {
        pbState = Number(data.parking_brake) >= 0.5;
        pbBtn.classList.toggle('active', pbState);
    }
    const bSlider = document.getElementById('bSlider');
    if (bSlider && data.brake_left !== undefined) {
        const val = Math.max(0, Math.min(1, Number(data.brake_left)));
        bSlider.value = val;
    }
    const sSlider = document.getElementById('sSlider');
    const armBtn = document.getElementById('armBtn');
    if (sSlider && data.spoilers_handle !== undefined) {
        const raw = Number(data.spoilers_handle);
        const armed = raw === 0;
        isArmed = armed;
        if (armBtn) armBtn.classList.toggle('active', armed);
        const val = Math.max(0, Math.min(1, raw <= 0 ? 0 : (raw - 1) / 2));
        sSlider.value = val;
    }
    const fSlider = document.getElementById('fSlider');
    if (fSlider && data.flaps_handle !== undefined) {
        const raw = Number(data.flaps_handle);
        const val = Math.max(0, Math.min(1, raw / 4));
        fSlider.value = val;
        updateFlapUI(Math.round(raw));
    }
    const tSlider = document.getElementById('tSlider');
    const revBtn = document.getElementById('revBtn');
    if (tSlider && data.throttle_left !== undefined) {
        const raw = Number(data.throttle_left);
        if (!Number.isNaN(raw)) {
            if (raw <= 1) {
                isReverse = true;
                if (revBtn) revBtn.classList.add('active');
                const val = Math.max(0, Math.min(1, 1 - raw));
                tSlider.value = val;
                updateThrottleUI(val, true);
            } else if (raw >= 2) {
                isReverse = false;
                if (revBtn) revBtn.classList.remove('active');
                let val = 0;
                if (raw <= 3) {
                    val = (raw - 2) * 0.7;
                } else if (raw <= 4) {
                    val = 0.7 + (raw - 3) * 0.15;
                } else {
                    val = 0.85 + (raw - 4) * 0.15;
                }
                val = Math.max(0, Math.min(1, val));
                tSlider.value = val;
                updateThrottleUI(val, false);
            }
        }
    }
    const idleBtn = document.getElementById('idleBtn');
    if (idleBtn && tSlider) {
        const throttleVal = parseFloat(tSlider.value);
        idleBtn.disabled = throttleVal === 0;
    }
};

const handleKnob = (id, type, step, min, max) => {
    const knob = document.getElementById(id);
    const display = document.getElementById(type + 'Val');
    if (!knob || !display) return;

    let lastAngle = null;
    const stepAngle = 18;

    const moveHandler = (e) => {
        const point = e.touches ? e.touches[0] : e;
        const rect = knob.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = Math.atan2(point.clientY - centerY, point.clientX - centerX) * (180 / Math.PI);
        if (lastAngle === null) {
            lastAngle = angle;
            return;
        }
        let delta = angle - lastAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const steps = Math.floor(Math.abs(delta) / stepAngle);
        if (steps > 0) {
            const direction = delta > 0 ? 1 : -1;
            
            if (type === 'hdg') {
                let newVal = apValues[type] + (direction * step * steps);
                newVal = ((newVal % 360) + 360) % 360;
                apValues[type] = newVal;
            } else {
                apValues[type] = Math.max(min, Math.min(max, apValues[type] + (direction * step * steps)));
            }
            
            display.innerText = (type === 'hdg') ? 
                apValues[type].toString().padStart(3, '0') : apValues[type];

            knobRotations[type] += direction * stepAngle * steps;
            knob.style.transform = `rotate(${knobRotations[type]}deg)`;

            lastAngle = lastAngle + (direction * stepAngle * steps);
            send({ type: 'ap_update', mode: type, value: apValues[type] });
            if (type === 'spd' && isFenixA320()) {
                const key = direction > 0 ? 'fcu_spd_inc' : 'fcu_spd_dec';
                for (let i = 0; i < steps; i += 1) {
                    stepLvar(key, 0);
                }
            }
        }
    };

    const stopHandler = () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('touchmove', moveHandler);
        window.removeEventListener('mouseup', stopHandler);
        window.removeEventListener('touchend', stopHandler);
        lastAngle = null;
    };

    knob.addEventListener('mousedown', (e) => {
        const rect = knob.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        lastAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', stopHandler);
    });

    knob.addEventListener('touchstart', (e) => {
        const point = e.touches[0];
        const rect = knob.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        lastAngle = Math.atan2(point.clientY - centerY, point.clientX - centerX) * (180 / Math.PI);
        window.addEventListener('touchmove', moveHandler);
        window.addEventListener('touchend', stopHandler);
    });

    const wheelHandler = (e) => {
        e.preventDefault();
        const delta = e.deltaY;
        const direction = delta < 0 ? 1 : -1; // scroll up -> increase
        const magnitude = Math.min(10, Math.max(1, Math.round(Math.abs(delta) / 30)));

        if (type === 'hdg') {
            let newVal = apValues[type] + (direction * step * magnitude);
            newVal = ((newVal % 360) + 360) % 360;
            apValues[type] = newVal;
        } else {
            apValues[type] = Math.max(min, Math.min(max, apValues[type] + (direction * step * magnitude)));
        }

        display.innerText = (type === 'hdg') ? apValues[type].toString().padStart(3, '0') : apValues[type];
        knobRotations[type] += direction * 15 * magnitude;
        knob.style.transform = `rotate(${knobRotations[type]}deg)`;

        send({ type: 'ap_update', mode: type, value: apValues[type] });
        if (type === 'spd' && isFenixA320()) {
            const key = direction > 0 ? 'fcu_spd_inc' : 'fcu_spd_dec';
            for (let i = 0; i < magnitude; i += 1) {
                stepLvar(key, 0);
            }
        }
    };

    knob.addEventListener('wheel', wheelHandler, { passive: false });
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
    createJoystick('joyZone', 'joyPuck', 'flight_controls');
    createJoystick('camJoy', 'camPuck', 'cam_control');

    const moveModeBtn = document.getElementById('moveMode');
    bindButtonTouch(moveModeBtn);
    moveModeBtn.onclick = function() {
        camMoveActive = !camMoveActive;
        this.classList.toggle('active', camMoveActive);
    };

    const resetCamBtn = document.getElementById('resetCam');
    bindButtonTouch(resetCamBtn);
    resetCamBtn.onclick = function() {
        if (selectedCamId !== null) {
            this.classList.add('clicking');
            setTimeout(() => this.classList.remove('clicking'), 200);
            send({ type: 'camera', cam_id: selectedCamId });
        }
    };

    const camGrid = document.getElementById('camGrid');
    let selectedCamBtn = null;
    const cameraConfig = window.PROFILE?.ui?.camera_config || window.PROFILE?.camera_config || [];
    const debugUi = window.DEBUG_UI === true;
    cameraConfig.forEach((cam, index) => {
        const btn = document.createElement('button');
        btn.className = 'cam-btn';
        btn.innerText = cam.name;
        bindButtonTouch(btn);
        btn.onclick = () => {
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

    const fLabels = document.getElementById('flapLabels');
    fLabels.innerHTML = '';
    (window.PROFILE?.ui?.flap_detents || window.PROFILE?.flap_detents || []).forEach((d, i) => {
        const row = document.createElement('div');
        row.className = 'flap-detent-row';
        if (i === 0) row.classList.add('active');
        
        row.style.top = (d.val * 100) + "%"; 
        
        row.innerHTML = `<span>${d.label}</span><div class="indicator-dot"></div>`;
        fLabels.appendChild(row);
    });
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
        if (type === 'cam_control') {
            payload.is_move = camMoveActive;
            payload.active = true;
        }
        
        if (type === 'cam_control') {
            sendUpdate(payload);
        } else {
            const now = performance.now();
            if (now - lastUpdateTime >= 16) {
                sendUpdate(payload);
                lastUpdateTime = now;
            }
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
            const payload = { type: type, val_x: 0.5, val_y: 0.5 };
            if (type === 'cam_control') {
                payload.is_move = camMoveActive;
                payload.active = false;
            }
            send(payload);
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

const hideAddressBar = () => {
    if (window.innerHeight < window.outerHeight) {
        window.scrollTo(0, 1);
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 0);
    }
    
    if (window.visualViewport) {
        const setViewportHeight = () => {
            const vh = window.visualViewport.height * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setViewportHeight();
        window.visualViewport.addEventListener('resize', setViewportHeight);
    }
    
    setTimeout(() => {
        window.scrollTo(0, 1);
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 10);
    }, 100);
    
    setTimeout(() => {
        window.scrollTo(0, 1);
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 10);
    }, 500);
};

const requestFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.webkitEnterFullscreen) {
        elem.webkitEnterFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
    
    hideAddressBar();
};

let fullscreenRequested = false;
const tryFullscreen = () => {
    if (!fullscreenRequested) {
        fullscreenRequested = true;
        requestFullscreen();
        hideAddressBar();
    }
};

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

document.addEventListener('DOMContentLoaded', () => {
    hideAddressBar();
    
    if (!isIOS) {
        requestFullscreen();
    }
    
    initUI();

    const pollLvars = () => {
        fetch('/lvars')
            .then((res) => res.json())
            .then((data) => {
                console.log('lvars', data);
                applyLvarState(data);
            })
            .catch(() => {});
    };
    setInterval(pollLvars, 1000);
    
    if (isIOS) {
        const attemptFullscreen = () => {
            hideAddressBar();
            setTimeout(() => {
                window.scrollTo(0, 1);
                setTimeout(() => {
                    window.scrollTo(0, 0);
                    hideAddressBar();
                }, 50);
            }, 50);
        };
        
        document.addEventListener('touchstart', attemptFullscreen, { once: true });
        document.addEventListener('click', attemptFullscreen, { once: true });
        
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                hideAddressBar();
                attemptFullscreen();
            }, 200);
        });
        
        window.addEventListener('resize', () => {
            setTimeout(() => {
                hideAddressBar();
                attemptFullscreen();
            }, 100);
        });
        
        setInterval(hideAddressBar, 1000);
    } else {
        document.addEventListener('touchstart', () => {
            hideAddressBar();
            if (!fullscreenRequested) {
                tryFullscreen();
            }
        }, { once: true });
        
        document.addEventListener('click', () => {
            hideAddressBar();
            if (!fullscreenRequested) {
                tryFullscreen();
            }
        }, { once: true });
        
        window.addEventListener('orientationchange', () => {
            setTimeout(hideAddressBar, 100);
        });
        
        window.addEventListener('resize', () => {
            setTimeout(hideAddressBar, 100);
        });
    }
    
    handleKnob('spdKnob', 'spd', 1, 100, 400);
    handleKnob('hdgKnob', 'hdg', 1, 0, 359);
    handleKnob('altKnob', 'alt', 100, 0, 45000);
    handleKnob('vsKnob', 'vs', 100, -5000, 5000);

    // Tab logic
    const camBtn = document.getElementById('showCams');
    const conBtn = document.getElementById('showControls');
    const camLayer = document.getElementById('camGrid');
    const conLayer = document.getElementById('controlGrid');

    bindButtonTouch(conBtn);
    conBtn.onclick = () => {
        conBtn.classList.add('active');
        camBtn.classList.remove('active');
        conLayer.classList.add('active');
        camLayer.classList.remove('active');
    };

    bindButtonTouch(camBtn);
    camBtn.onclick = () => {
        camBtn.classList.add('active');
        conBtn.classList.remove('active');
        camLayer.classList.add('active');
        conLayer.classList.remove('active');
    };

    const camUpBtn = document.getElementById('camUp');
    const camDownBtn = document.getElementById('camDown');
    
    if (camUpBtn) {
        bindButtonTouch(camUpBtn);
        camUpBtn.onclick = function() {
            console.log('cam up clicked');
            this.classList.add('clicking');
            setTimeout(() => this.classList.remove('clicking'), 200);
            const pressOnce = () => {
                console.log('ap disconnect press');
                setLvar('ap_disc_capt', 1);
                setTimeout(() => {
                    console.log('ap disconnect release');
                    setLvar('ap_disc_capt', 0);
                }, 50);
            };
            if (isFenixA320()) {
                pressOnce();
                setTimeout(pressOnce, 500);
                setTimeout(pressOnce, 1000);
            } else {
                send({ type: 'vjoy_button', button: getVjoyMapping('CAM_UP') });
            }
        };
    }
    
    if (camDownBtn) {
        bindButtonTouch(camDownBtn);
        camDownBtn.onclick = function() {
            this.classList.add('clicking');
            setTimeout(() => this.classList.remove('clicking'), 200);
            send({ type: 'vjoy_button', button: getVjoyMapping('CAM_DOWN') });
        };
    }
    
    document.getElementById('fSlider').oninput = function() {
        const visualVal = parseFloat(this.value); 
        let closestIndex = 0;
        const flapDetents = window.PROFILE?.ui?.flap_detents || window.PROFILE?.flap_detents || [];
        const closest = flapDetents.reduce((prev, curr, index) => {
            const isCloser = Math.abs(curr.val - visualVal) < Math.abs(prev.val - visualVal);
            if (isCloser) closestIndex = index;
            return isCloser ? curr : prev;
        });
        this.value = closest.val;
        updateFlapUI(closestIndex);
        send({ type: 'flaps_axis', value: closest.val });
    };

    const sSlider = document.getElementById('sSlider');
    const armBtn = document.getElementById('armBtn');
    if (armBtn) {
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
                        send({ type: 'spoilers', value: 0 });
                        setTimeout(() => {
                            send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                        }, 300);
                    } else {
                        sSlider.value = 0;
                        send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                    }
                } else {
                    send({ type: 'vjoy_button', button: getVjoyMapping('ARM_SPOILERS') });
                }
                return;
            }
            if (isArmed) {
                sSlider.value = 0;
                animateSliderToZero(sSlider);
                send({ type: 'arm_spoilers', value: 0 });
            } else {
                send({ type: 'spoilers', value: 0 });
            }
        };
    }

    // Ensure moving the slider manually disarms the spoilers
    sSlider.oninput = function() {
        if (isArmed && parseFloat(this.value) > 0.05) {
            isArmed = false;
            if (armBtn) armBtn.classList.remove('active');
        }
        send({ type: 'spoilers', value: parseFloat(this.value) });
    };

    document.getElementById('bSlider').oninput = function() {
        send({ type: 'brakes', value: parseFloat(this.value) });
    };

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

    const rSlider = document.getElementById('rSlider');
    rSlider.oninput = function() {
        if (!rudderResetting) {
            const response = getControlResponse();
            let val = parseFloat(this.value);
            if (response !== 1) {
                val = applyControlResponse(val);
            } else {
                const sensitivity = getControlSensitivity();
                val = 0.5 + (val - 0.5) * sensitivity;
            }
            send({ type: 'rudder', value: val });
        }
    };
    const resetRudder = () => {
        rudderResetting = true;
        const start = parseFloat(rSlider.value), startTime = performance.now();
        const anim = (t) => {
            const prog = Math.min((t - startTime) / 250, 1);
            const cur = start + (0.5 - start) * (1 - Math.pow(1 - prog, 3));
            rSlider.value = cur; 
            const response = getControlResponse();
            let val = cur;
            if (response !== 1) {
                val = applyControlResponse(val);
            } else {
                const sensitivity = getControlSensitivity();
                val = 0.5 + (val - 0.5) * sensitivity;
            }
            send({ type: 'rudder', value: val });
            if (prog < 1) requestAnimationFrame(anim);
            else rudderResetting = false;
        };
        requestAnimationFrame(anim);
    };
    rSlider.onmouseup = rSlider.ontouchend = resetRudder;

    const joyZone = document.getElementById('joyZone');
    const puck = document.getElementById('joyPuck');
    let isTouchingJoy = false;

    const gearLever = document.getElementById('gearHandle');
    if (gearLever) {
        gearIsDown = true;
        gearLever.classList.remove('gear-up');
        gearLever.classList.add('gear-down');
        gearLever.addEventListener('pointerdown', function() {
            gearIsDown = !gearIsDown;
            
            // Forced class update
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
    bindButtonTouch(pbBtn);
    pbBtn.classList.toggle('active', pbState);
    pbBtn.onclick = function() {
        pbState = !pbState; this.classList.toggle('active', pbState);
        send({ type: 'parking_brake', state: pbState ? 1 : 0 });
    };
});