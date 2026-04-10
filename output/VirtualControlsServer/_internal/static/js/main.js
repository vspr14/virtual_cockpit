let isReverse = false, throttleBlocked = false, rudderResetting = false, pbState = true, isArmed = false, gearIsDown = false;
let selectedCamId = null;
let apMasterOn = false;

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

const applySimState = (data) => {
    if (!data || typeof data !== 'object') return;
    const idleBtn = document.getElementById('idleBtn');
    const tSlider = document.getElementById('tSlider');
    if (idleBtn && tSlider) {
        const throttleVal = parseFloat(tSlider.value);
        idleBtn.disabled = throttleVal === 0;
    }
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
    const flightStick = document.querySelector('.joy-zone-container.stick-right');
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
        if (flightStick) flightStick.classList.add('hidden');
        if (leftBrakeContainer) leftBrakeContainer.classList.remove('hidden');
        if (leftColumn) leftColumn.classList.add('ofp-mode');
        setNavActive(ofpBtn);
    };

    const showCams = () => {
        if (gridContainer) gridContainer.classList.remove('hidden');
        if (pedestalRow) pedestalRow.classList.remove('hidden');
        if (ofpContainer) ofpContainer.classList.add('hidden');
        if (metarContainer) metarContainer.classList.add('hidden');
        if (ofpCameraButtonsEl) ofpCameraButtonsEl.classList.add('hidden');
        if (flightStick) flightStick.classList.remove('hidden');
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
    const todHourInput = document.getElementById('todHour');
    const todMinuteInput = document.getElementById('todMinute');
    const todSetBtn = document.getElementById('todSetBtn');
    const todStatusEl = document.getElementById('todStatus');
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
    const TOD_KEY = 'virtual_cockpit_tod';
    let todAudioCtx = null;
    let todAudioGain = null;
    const loadTodState = () => {
        try {
            const raw = localStorage.getItem(TOD_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    };
    const saveTodState = (timestamp, fired) => {
        const profileName = window.PROFILE?.name;
        if (!profileName || !timestamp) return;
        const state = { profile: profileName, timestamp, fired: !!fired };
        try {
            localStorage.setItem(TOD_KEY, JSON.stringify(state));
        } catch (e) {
        }
    };
    const triggerTodAlarm = () => {
        if (triggerTodAlarm.active) return;
        triggerTodAlarm.active = true;
        if (todStatusEl) {
            todStatusEl.textContent = 'TD reached';
        }
        if (todAudioCtx) {
            try {
                const osc = todAudioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = 880;
                if (todAudioGain) {
                    osc.connect(todAudioGain);
                } else {
                    osc.connect(todAudioCtx.destination);
                }
                osc.start();
                setTimeout(() => {
                    osc.stop();
                }, 5000);
            } catch (e) {
            }
        }
        alert('TD');
        triggerTodAlarm.active = false;
    };
    const isFenixA320Profile = () => window.PROFILE?.name === 'Fenix A320';
    if (todSetBtn && todHourInput && todMinuteInput && isFenixA320Profile()) {
        bindButtonTouch(todSetBtn);
        todSetBtn.onclick = () => {
            const h = parseInt(todHourInput.value, 10);
            const m = parseInt(todMinuteInput.value, 10);
            if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            if (!todAudioCtx) {
                try {
                    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextCtor) {
                        todAudioCtx = new AudioContextCtor();
                        todAudioGain = todAudioCtx.createGain();
                        todAudioGain.gain.value = 0.2;
                        todAudioGain.connect(todAudioCtx.destination);
                    }
                } catch (e) {
                }
            }
            if (todAudioCtx && todAudioCtx.state === 'suspended') {
                try {
                    todAudioCtx.resume();
                } catch (e) {
                }
            }
            const now = new Date();
            let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
            if (target.getTime() <= now.getTime()) {
                target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
            }
            saveTodState(target.getTime(), false);
            if (todStatusEl) {
                const hhText = String(h).padStart(2, '0');
                const mmText = String(m).padStart(2, '0');
                todStatusEl.textContent = 'TD alarm set for ' + hhText + ':' + mmText + 'Z';
                setTimeout(() => {
                    todStatusEl.textContent = '';
                }, 4000);
            }
        };
        const existing = loadTodState();
        if (existing && existing.timestamp && existing.profile === window.PROFILE.name) {
            const dt = new Date(existing.timestamp);
            todHourInput.value = String(dt.getUTCHours()).padStart(2, '0');
            todMinuteInput.value = String(dt.getUTCMinutes()).padStart(2, '0');
        }
        setInterval(() => {
            const state = loadTodState();
            if (!state || !state.timestamp || state.fired || state.profile !== window.PROFILE.name) return;
            if (Date.now() >= state.timestamp) {
                triggerTodAlarm();
                saveTodState(state.timestamp, true);
            }
        }, 1000);
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

    const apBtn = document.getElementById('apBtn');
    const apIndicator = document.getElementById('apIndicator');
    const isFenixA320 = () => window.PROFILE?.name === 'Fenix A320';
    if (apBtn) {
        bindButtonTouch(apBtn);
        apBtn.onclick = function() {
            if (isFenixA320()) {
                if (!apMasterOn) {
                    stepLvar('ap_engage', 1);
                    apMasterOn = true;
                    if (apIndicator) apIndicator.classList.add('on');
                } else {
                    setLvar('ap_disconnect', 1);
                    setTimeout(() => {
                        setLvar('ap_disconnect', 0);
                        setTimeout(() => setLvar('ap_state_off', 0), 50);
                    }, 50);
                    apMasterOn = false;
                    if (apIndicator) apIndicator.classList.remove('on');
                }
            } else {
                send({ type: 'vjoy_button', button: getVjoyMapping('AUTOPILOT') });
            }
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

    const brakeSliderHandler = function() {
        send({ type: 'brakes', value: parseFloat(this.value) });
    };
    
    document.getElementById('bSlider').oninput = brakeSliderHandler;
    const bSliderLeft = document.getElementById('bSliderLeft');
    if (bSliderLeft) {
        bSliderLeft.oninput = brakeSliderHandler;
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
    const pbBtnLeft = document.getElementById('pbBtnLeft');
    const parkingBrakeHandler = function() {
        pbState = !pbState;
        if (pbBtn) pbBtn.classList.toggle('active', pbState);
        if (pbBtnLeft) pbBtnLeft.classList.toggle('active', pbState);
        send({ type: 'vjoy_button', button: getVjoyMapping('PARKING_BRAKE') });
    };
    bindButtonTouch(pbBtn);
    pbBtn.classList.toggle('active', pbState);
    pbBtn.onclick = parkingBrakeHandler;
    if (pbBtnLeft) {
        bindButtonTouch(pbBtnLeft);
        pbBtnLeft.classList.toggle('active', pbState);
        pbBtnLeft.onclick = parkingBrakeHandler;
    }

    const STATE_KEY = 'virtual_cockpit_state';
    const DEFAULT_STATE = { flaps: 0, throttle: 0, spoilers: 0, brake: 0, rudder: 0.5 };
    const isDefaultState = (s) => s && Math.abs(parseFloat(s.flaps) - DEFAULT_STATE.flaps) < 1e-5 && Math.abs(parseFloat(s.throttle) - DEFAULT_STATE.throttle) < 1e-5 && Math.abs(parseFloat(s.spoilers) - DEFAULT_STATE.spoilers) < 1e-5 && Math.abs(parseFloat(s.brake) - DEFAULT_STATE.brake) < 1e-5 && Math.abs(parseFloat(s.rudder) - DEFAULT_STATE.rudder) < 1e-5;
    const saveState = () => {
        const profileName = window.PROFILE?.name;
        const f = document.getElementById('fSlider');
        const b = document.getElementById('bSlider');
        if (!profileName || !f || !tSlider || !sSlider || !b || !rSlider) return;
        const state = {
            profile: profileName,
            flaps: parseFloat(f.value),
            throttle: parseFloat(tSlider.value),
            spoilers: parseFloat(sSlider.value),
            brake: parseFloat(b.value),
            rudder: parseFloat(rSlider.value)
        };
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
    };
    const restoreState = () => {
        const profileName = window.PROFILE?.name;
        if (!profileName) return;
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (state.profile !== profileName || isDefaultState(state)) return;
            const f = document.getElementById('fSlider');
            const b = document.getElementById('bSlider');
            if (f) { f.value = state.flaps; updateFlapUI(Math.min(4, Math.round(state.flaps * 4))); send({ type: 'flaps_axis', value: state.flaps }); }
            if (tSlider) { tSlider.value = state.throttle; updateThrottleUI(state.throttle, false); send({ type: 'throttle', value: state.throttle, reverse: false }); }
            if (sSlider) { sSlider.value = state.spoilers; send({ type: 'spoilers', value: state.spoilers }); }
            if (b) { b.value = state.brake; send({ type: 'brakes', value: state.brake }); }
            if (bSliderLeft) { bSliderLeft.value = state.brake; }
            if (rSlider) { rSlider.value = state.rudder; send({ type: 'rudder', value: state.rudder }); }
        } catch (e) {}
    };
    setInterval(saveState, 60000);
    restoreState();
});