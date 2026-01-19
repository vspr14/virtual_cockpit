let isReverse = false, throttleBlocked = false, rudderResetting = false, pbState = true, isArmed = false, gearIsDown = false, camMoveActive = false;
let selectedCamId = null;
let apMasterOn = false;
const LVAR_UI_DELAY_MS = 1500;
const lastLocalUpdate = {};

let headTrackingActive = false;
let webcamActive = false;
let webcamStream = null;
let webcamPc = null;
const WEBCAM_STREAM_WIDTH = 1920;
const WEBCAM_STREAM_HEIGHT = 1080;
const WEBCAM_STREAM_FPS = 60;
let socket = null;
let videoElement = null;
let tracker = null;
let lastFace = null;
let baseFace = null;
let smoothedPose = { pitch: 0, roll: 0, yaw: 0, x: 0, y: 0, z: 0 };
let lastTrackTime = 0;
let lastPose = { pitch: 0, roll: 0, yaw: 0, x: 0, y: 0, z: 0 };
const MIN_FACE_SIZE = 40;
const DEADZONE = { pitch: 0.03, yaw: 0.03, x: 0.02, y: 0.02, z: 0.02 };
const HEADTRACK_LIMITS = { pitch: 30, roll: 30, yaw: 45, x: 10, y: 10, z: 10 };
let headtrackConfig = {
    host: 'localhost',
    port: 5001,
    sensitivity: { pitch: 50.0, roll: 50.0, yaw: 50.0, x: 50.0, y: 50.0, z: 50.0 },
    smoothing: 0.3,
    invert: { pitch: false, roll: false, yaw: false, x: false, y: false, z: false }
};

function loadHeadtrackConfig() {
    const saved = localStorage.getItem('headtrackConfig');
    if (saved) {
        headtrackConfig = { ...headtrackConfig, ...JSON.parse(saved) };
        const maxSens = Math.max(
            headtrackConfig.sensitivity.pitch,
            headtrackConfig.sensitivity.roll,
            headtrackConfig.sensitivity.yaw,
            headtrackConfig.sensitivity.x,
            headtrackConfig.sensitivity.y,
            headtrackConfig.sensitivity.z
        );
        if (maxSens <= 3) {
            headtrackConfig.sensitivity = {
                pitch: headtrackConfig.sensitivity.pitch * 50,
                roll: headtrackConfig.sensitivity.roll * 50,
                yaw: headtrackConfig.sensitivity.yaw * 50,
                x: headtrackConfig.sensitivity.x * 50,
                y: headtrackConfig.sensitivity.y * 50,
                z: headtrackConfig.sensitivity.z * 50
            };
            localStorage.setItem('headtrackConfig', JSON.stringify(headtrackConfig));
        }
    }
}

function saveHeadtrackConfig() {
    localStorage.setItem('headtrackConfig', JSON.stringify(headtrackConfig));
    fetch('/headtrack/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(headtrackConfig)
    });
}

function calculateHeadPose(face) {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return null;
    }
    if (face.width < MIN_FACE_SIZE || face.height < MIN_FACE_SIZE) {
        return null;
    }
    if (!baseFace) {
        baseFace = { x: face.x, y: face.y, width: face.width, height: face.height };
        return { pitch: 0, roll: 0, yaw: 0, x: 0, y: 0, z: 0 };
    }
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;
    const baseCenterX = baseFace.x + baseFace.width / 2;
    const baseCenterY = baseFace.y + baseFace.height / 2;
    const scaleX = videoElement.videoWidth / 4;
    const scaleY = videoElement.videoHeight / 4;
    const yaw = (centerX - baseCenterX) / scaleX;
    const pitch = (centerY - baseCenterY) / scaleY;
    const z = (face.width - baseFace.width) / baseFace.width;
    return {
        pitch: Math.max(-1, Math.min(1, -pitch)),
        roll: 0,
        yaw: Math.max(-1, Math.min(1, yaw)),
        x: Math.max(-1, Math.min(1, yaw * 0.5)),
        y: Math.max(-1, Math.min(1, -pitch * 0.5)),
        z: Math.max(-1, Math.min(1, z))
    };
}

function applySmoothing(newPose, smoothing) {
    if (smoothing <= 0) {
        return newPose;
    }
    smoothedPose.pitch = smoothedPose.pitch * smoothing + newPose.pitch * (1 - smoothing);
    smoothedPose.roll = smoothedPose.roll * smoothing + newPose.roll * (1 - smoothing);
    smoothedPose.yaw = smoothedPose.yaw * smoothing + newPose.yaw * (1 - smoothing);
    smoothedPose.x = smoothedPose.x * smoothing + newPose.x * (1 - smoothing);
    smoothedPose.y = smoothedPose.y * smoothing + newPose.y * (1 - smoothing);
    smoothedPose.z = smoothedPose.z * smoothing + newPose.z * (1 - smoothing);
    return smoothedPose;
}

function clampVal(value, limit) {
    if (value > limit) return limit;
    if (value < -limit) return -limit;
    return value;
}

function applyDeadzone(value, deadzone) {
    if (Math.abs(value) < deadzone) return 0;
    return value;
}

let processCount = 0;
function processHeadTracking(face) {
    if (!headTrackingActive) return;
    const now = performance.now();
    if (now - lastTrackTime < 33) return;
    lastTrackTime = now;
    
    processCount++;
    if (processCount === 1) {
        console.log('First face detected! Face data:', face);
    }
    
    lastFace = face;
    const rawPose = calculateHeadPose(face);
    if (!rawPose) return;
    const smoothed = applySmoothing(rawPose, headtrackConfig.smoothing);
    const finalPose = {
        pitch: clampVal(applyDeadzone((headtrackConfig.invert.pitch ? -1 : 1) * smoothed.pitch, DEADZONE.pitch) * headtrackConfig.sensitivity.pitch, HEADTRACK_LIMITS.pitch),
        roll: clampVal((headtrackConfig.invert.roll ? -1 : 1) * smoothed.roll * headtrackConfig.sensitivity.roll, HEADTRACK_LIMITS.roll),
        yaw: clampVal(applyDeadzone((headtrackConfig.invert.yaw ? -1 : 1) * smoothed.yaw, DEADZONE.yaw) * headtrackConfig.sensitivity.yaw, HEADTRACK_LIMITS.yaw),
        x: clampVal(applyDeadzone((headtrackConfig.invert.x ? -1 : 1) * smoothed.x, DEADZONE.x) * headtrackConfig.sensitivity.x, HEADTRACK_LIMITS.x),
        y: clampVal(applyDeadzone((headtrackConfig.invert.y ? -1 : 1) * smoothed.y, DEADZONE.y) * headtrackConfig.sensitivity.y, HEADTRACK_LIMITS.y),
        z: clampVal(applyDeadzone((headtrackConfig.invert.z ? -1 : 1) * smoothed.z, DEADZONE.z) * headtrackConfig.sensitivity.z, HEADTRACK_LIMITS.z)
    };
    lastPose = finalPose;
    
    if (socket && socket.connected) {
        if (processCount % 30 === 1) {
            console.log('Sending headtrack data:', finalPose);
        }
        socket.emit('headtrack_data', finalPose);
    } else if (processCount === 1) {
        console.log('Socket not connected!');
    }
}

async function startHeadTracking() {
    if (headTrackingActive) return;
    
    try {
        console.log('Starting camera-based head tracking...');
        
        videoElement = document.createElement('video');
        videoElement.width = 320;
        videoElement.height = 240;
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('autoplay', '');
        
        const canvasElement = document.createElement('canvas');
        canvasElement.width = 320;
        canvasElement.height = 240;
        const canvasContext = canvasElement.getContext('2d');
        
        videoElement.style.position = 'fixed';
        videoElement.style.top = '10px';
        videoElement.style.right = '10px';
        videoElement.style.width = '160px';
        videoElement.style.height = '120px';
        videoElement.style.zIndex = '9999';
        videoElement.style.border = '2px solid green';
        document.body.appendChild(videoElement);
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 320, 
                height: 240,
                facingMode: 'user'
            } 
        });
        videoElement.srcObject = stream;
        
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                console.log('Video metadata loaded, dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                resolve();
            };
        });
        
        await videoElement.play();
        console.log('Video playing, waiting for frames...');
        
        await new Promise((resolve) => {
            const checkReady = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    console.log('Video frames ready:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                    resolve();
                } else {
                    requestAnimationFrame(checkReady);
                }
            };
            checkReady();
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Camera ready, initializing face tracker...');
        
        headTrackingActive = true;
        
        tracker = new tracking.ObjectTracker('face');
        tracker.setInitialScale(4);
        tracker.setStepSize(2);
        tracker.setEdgesDensity(0.1);
        
        let trackEventCount = 0;
        tracker.on('track', (event) => {
            trackEventCount++;
            if (trackEventCount % 30 === 1) {
                console.log('Track event fired, faces detected:', event.data.length);
            }
            
            if (!headTrackingActive) return;
            
            if (event.data.length > 0) {
                const face = event.data[0];
                processHeadTracking(face);
            }
        });
        
        console.log('Starting tracking.track() with canvas...');
        
        function processFrame() {
            if (!headTrackingActive) return;
            
            canvasContext.drawImage(videoElement, 0, 0, 320, 240);
            tracking.track(canvasElement, tracker);
            
            requestAnimationFrame(processFrame);
        }
        
        processFrame();
        console.log('Face tracking active with manual frame processing');
        baseFace = null;
        
        if (!socket) {
            console.log('Creating Socket.IO connection...');
            socket = io();
            socket.on('connect', () => {
                console.log('Socket.IO connected, emitting headtrack_start');
                socket.emit('headtrack_start');
            });
            socket.on('connect_error', (err) => {
                console.error('Socket.IO connection error:', err);
            });
            socket.on('headtrack_status', (data) => {
                console.log('headtrack_status received:', data);
                if (!data.active) {
                    stopHeadTracking();
                }
            });
        } else {
            if (socket.connected) {
                console.log('Socket already connected, emitting headtrack_start');
                socket.emit('headtrack_start');
            } else {
                console.log('Socket exists but not connected, waiting for connect event');
                socket.once('connect', () => {
                    console.log('Socket connected, emitting headtrack_start');
                    socket.emit('headtrack_start');
                });
            }
        }
    } catch (err) {
        console.error('startHeadTracking error:', err);
        alert('Failed to start camera: ' + (err.message || 'Unknown error'));
        const headTrackBtn = document.getElementById('headTrackBtn');
        if (headTrackBtn) headTrackBtn.classList.remove('on');
    }
}

function stopHeadTracking() {
    if (!headTrackingActive) return;
    
    headTrackingActive = false;
    console.log('Stopping head tracking');
    
    if (tracker) {
        tracking.stopTracking(videoElement, tracker);
        tracker = null;
    }
    
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.remove();
        videoElement = null;
    }
    
    if (socket && socket.connected) {
        socket.emit('headtrack_stop');
    }
    
    smoothedPose = { pitch: 0, roll: 0, yaw: 0, x: 0, y: 0, z: 0 };
    baseFace = null;
    lastFace = null;
}

function waitForIce(pc) {
    if (pc.iceGatheringState === 'complete') {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const check = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', check);
    });
}

async function startWebcamStream() {
    if (webcamActive) return;
    try {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            throw new Error('HTTPS is required for camera access on this device');
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not available in this browser context');
        }
        if (!window.RTCPeerConnection) {
            throw new Error('WebRTC not available in this browser');
        }
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: WEBCAM_STREAM_WIDTH },
                height: { ideal: WEBCAM_STREAM_HEIGHT },
                frameRate: { ideal: WEBCAM_STREAM_FPS, max: WEBCAM_STREAM_FPS },
                facingMode: 'user'
            }
        });
        webcamPc = new RTCPeerConnection();
        webcamStream.getTracks().forEach((track) => webcamPc.addTrack(track, webcamStream));
        const offer = await webcamPc.createOffer();
        await webcamPc.setLocalDescription(offer);
        await waitForIce(webcamPc);
        const res = await fetch('/webrtc/offer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp: webcamPc.localDescription.sdp, type: webcamPc.localDescription.type })
        });
        if (!res.ok) {
            throw new Error('WebRTC offer failed');
        }
        const answer = await res.json();
        await webcamPc.setRemoteDescription(answer);
        webcamActive = true;
    } catch (err) {
        console.error('startWebcamStream error:', err);
        stopWebcamStream();
        alert('Failed to start webcam stream: ' + (err.message || 'Unknown error'));
    }
}

function stopWebcamStream() {
    webcamActive = false;
    if (webcamPc) {
        webcamPc.getSenders().forEach((sender) => {
            if (sender.track) sender.track.stop();
        });
        webcamPc.close();
        webcamPc = null;
    }
    if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
        webcamStream = null;
    }
    fetch('/webrtc/stop', { method: 'POST' }).catch(() => {});
}
const markLocal = (key) => {
    lastLocalUpdate[key] = Date.now();
};
const shouldApplyLvar = (key) => {
    const ts = lastLocalUpdate[key];
    if (!ts) return true;
    return (Date.now() - ts) >= LVAR_UI_DELAY_MS;
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

const applyLvarState = (data) => {
    if (!data || typeof data !== 'object') return;
    const apIndicator = document.getElementById('apIndicator');
    if (apIndicator) {
        if (isFenixA320()) {
            if (data.ap_state !== undefined && shouldApplyLvar('ap_state')) {
                apMasterOn = Number(data.ap_state) >= 0.5;
                apIndicator.classList.toggle('on', apMasterOn);
            }
        } else if (data.ap_master !== undefined && shouldApplyLvar('ap_master')) {
            apMasterOn = Number(data.ap_master) >= 0.5;
            apIndicator.classList.toggle('on', apMasterOn);
        }
    }
    const gearLever = document.getElementById('gearHandle');
    if (gearLever && data.gear_handle !== undefined && shouldApplyLvar('gear_handle')) {
        const down = Number(data.gear_handle) >= 0.5;
        gearIsDown = down;
        gearLever.classList.toggle('gear-down', down);
        gearLever.classList.toggle('gear-up', !down);
    }
    const pbBtn = document.getElementById('pbBtn');
    if (pbBtn && data.parking_brake !== undefined && shouldApplyLvar('parking_brake')) {
        pbState = Number(data.parking_brake) >= 0.5;
        pbBtn.classList.toggle('active', pbState);
    }
    const bSlider = document.getElementById('bSlider');
    if (bSlider && data.brake_left !== undefined && shouldApplyLvar('brake_left')) {
        const val = Math.max(0, Math.min(1, Number(data.brake_left)));
        bSlider.value = val;
    }
    const sSlider = document.getElementById('sSlider');
    const armBtn = document.getElementById('armBtn');
    if (sSlider && data.spoilers_handle !== undefined && shouldApplyLvar('spoilers_handle')) {
        const raw = Number(data.spoilers_handle);
        const armed = raw === 0;
        isArmed = armed;
        if (armBtn) armBtn.classList.toggle('active', armed);
        const val = Math.max(0, Math.min(1, raw <= 0 ? 0 : (raw - 1) / 2));
        sSlider.value = val;
    }
    const fSlider = document.getElementById('fSlider');
    if (fSlider && data.flaps_handle !== undefined && shouldApplyLvar('flaps_handle')) {
        const raw = Number(data.flaps_handle);
        const val = Math.max(0, Math.min(1, raw / 4));
        fSlider.value = val;
        updateFlapUI(Math.round(raw));
    }
    const tSlider = document.getElementById('tSlider');
    const revBtn = document.getElementById('revBtn');
    if (tSlider && data.throttle_left !== undefined && shouldApplyLvar('throttle_left')) {
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

    loadHeadtrackConfig();
    
    const headTrackBtn = document.getElementById('headTrackBtn');
    if (headTrackBtn) {
        bindButtonTouch(headTrackBtn);
        headTrackBtn.onclick = function() {
            if (headTrackBtn.classList.contains('on')) {
                stopHeadTracking();
                headTrackBtn.classList.remove('on');
                return;
            }
            const ok = window.confirm('Enable head tracking?');
            if (ok) {
                headTrackBtn.classList.add('on');
                startHeadTracking();
            }
        };
    }

    const webcamStreamBtn = document.getElementById('webcamStreamBtn');
    if (webcamStreamBtn) {
        bindButtonTouch(webcamStreamBtn);
        webcamStreamBtn.onclick = function() {
            if (webcamStreamBtn.classList.contains('on')) {
                stopWebcamStream();
                webcamStreamBtn.classList.remove('on');
                return;
            }
            startWebcamStream();
            webcamStreamBtn.classList.add('on');
        };
    }
    
    const headtrackSettingsBtn = document.getElementById('headtrackSettingsBtn');
    const headtrackSettingsModal = document.getElementById('headtrackSettingsModal');
    const headtrackSettingsClose = document.getElementById('headtrackSettingsClose');
    const headtrackSettingsSave = document.getElementById('headtrackSettingsSave');
    
    if (headtrackSettingsBtn && headtrackSettingsModal) {
        bindButtonTouch(headtrackSettingsBtn);
        headtrackSettingsBtn.onclick = function() {
            headtrackSettingsModal.style.display = 'block';
            document.getElementById('headtrackHost').value = headtrackConfig.host;
            document.getElementById('headtrackPort').value = headtrackConfig.port;
            document.getElementById('pitchSens').value = headtrackConfig.sensitivity.pitch;
            document.getElementById('rollSens').value = headtrackConfig.sensitivity.roll;
            document.getElementById('yawSens').value = headtrackConfig.sensitivity.yaw;
            document.getElementById('xSens').value = headtrackConfig.sensitivity.x;
            document.getElementById('ySens').value = headtrackConfig.sensitivity.y;
            document.getElementById('zSens').value = headtrackConfig.sensitivity.z;
            document.getElementById('smoothing').value = headtrackConfig.smoothing;
            document.getElementById('invertPitch').checked = headtrackConfig.invert.pitch;
            document.getElementById('invertRoll').checked = headtrackConfig.invert.roll;
            document.getElementById('invertYaw').checked = headtrackConfig.invert.yaw;
            document.getElementById('invertX').checked = headtrackConfig.invert.x;
            document.getElementById('invertY').checked = headtrackConfig.invert.y;
            document.getElementById('invertZ').checked = headtrackConfig.invert.z;
            updateSensitivityLabels();
        };
    }
    
    if (headtrackSettingsClose) {
        headtrackSettingsClose.onclick = function() {
            headtrackSettingsModal.style.display = 'none';
        };
    }
    
    if (headtrackSettingsSave) {
        headtrackSettingsSave.onclick = function() {
            headtrackConfig.host = document.getElementById('headtrackHost').value;
            headtrackConfig.port = parseInt(document.getElementById('headtrackPort').value);
            headtrackConfig.sensitivity.pitch = parseFloat(document.getElementById('pitchSens').value);
            headtrackConfig.sensitivity.roll = parseFloat(document.getElementById('rollSens').value);
            headtrackConfig.sensitivity.yaw = parseFloat(document.getElementById('yawSens').value);
            headtrackConfig.sensitivity.x = parseFloat(document.getElementById('xSens').value);
            headtrackConfig.sensitivity.y = parseFloat(document.getElementById('ySens').value);
            headtrackConfig.sensitivity.z = parseFloat(document.getElementById('zSens').value);
            headtrackConfig.smoothing = parseFloat(document.getElementById('smoothing').value);
            headtrackConfig.invert.pitch = document.getElementById('invertPitch').checked;
            headtrackConfig.invert.roll = document.getElementById('invertRoll').checked;
            headtrackConfig.invert.yaw = document.getElementById('invertYaw').checked;
            headtrackConfig.invert.x = document.getElementById('invertX').checked;
            headtrackConfig.invert.y = document.getElementById('invertY').checked;
            headtrackConfig.invert.z = document.getElementById('invertZ').checked;
            saveHeadtrackConfig();
            headtrackSettingsModal.style.display = 'none';
        };
    }
    
    function updateSensitivityLabels() {
        document.getElementById('pitchSensVal').textContent = document.getElementById('pitchSens').value;
        document.getElementById('rollSensVal').textContent = document.getElementById('rollSens').value;
        document.getElementById('yawSensVal').textContent = document.getElementById('yawSens').value;
        document.getElementById('xSensVal').textContent = document.getElementById('xSens').value;
        document.getElementById('ySensVal').textContent = document.getElementById('ySens').value;
        document.getElementById('zSensVal').textContent = document.getElementById('zSens').value;
        document.getElementById('smoothingVal').textContent = document.getElementById('smoothing').value;
    }
    
    ['pitchSens', 'rollSens', 'yawSens', 'xSens', 'ySens', 'zSens', 'smoothing'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateSensitivityLabels);
        }
    });
    
    window.addEventListener('click', function(event) {
        if (headtrackSettingsModal && event.target === headtrackSettingsModal) {
            headtrackSettingsModal.style.display = 'none';
        }
    });

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

const setViewportVars = () => {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vh = height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
};

const hideAddressBar = () => {
    if (window.innerHeight < window.outerHeight) {
        window.scrollTo(0, 1);
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 0);
    }
    
    if (window.visualViewport) {
        const updateViewport = () => {
            setViewportVars();
        };
        updateViewport();
        window.visualViewport.addEventListener('resize', updateViewport);
    } else {
        setViewportVars();
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

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

document.addEventListener('DOMContentLoaded', () => {
    setViewportVars();
    hideAddressBar();
    
    initUI();

    const pollLvars = () => {
        fetch('/lvars')
            .then((res) => res.json())
            .then((data) => {
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
        }, { once: true });
        
        document.addEventListener('click', () => {
            hideAddressBar();
        }, { once: true });
        
        window.addEventListener('orientationchange', () => {
            setTimeout(hideAddressBar, 100);
        });
        
        window.addEventListener('resize', () => {
            setTimeout(hideAddressBar, 100);
        });
    }
    
    const camBtn = document.getElementById('showCams');
    bindButtonTouch(camBtn);
    const ofpBtn = document.getElementById('showOfp');
    bindButtonTouch(ofpBtn);

    const apBtn = document.getElementById('apBtn');
    const apIndicator = document.getElementById('apIndicator');
    if (apBtn) {
        bindButtonTouch(apBtn);
        apBtn.onclick = function() {
            apMasterOn = !apMasterOn;
            if (apIndicator) apIndicator.classList.toggle('on', apMasterOn);
            if (isFenixA320()) {
                markLocal('ap_state');
                if (apMasterOn) {
                    stepLvar('ap_engage', 1);
                    return;
                }
                setLvar('ap_state_off', 0);
                const pressOnce = () => {
                    stepLvar('ap_disconnect', 1);
                    setTimeout(() => {
                        setLvar('ap_disconnect', 0);
                    }, 50);
                };
                pressOnce();
                setTimeout(pressOnce, 500);
                setTimeout(pressOnce, 1000);
                return;
            }
            markLocal('ap_master');
            setLvar('ap_master', apMasterOn ? 1 : 0);
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
        markLocal('flaps_handle');
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
                markLocal('spoilers_handle');
                send({ type: 'arm_spoilers', value: 0 });
            } else {
                markLocal('spoilers_handle');
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
        markLocal('spoilers_handle');
        send({ type: 'spoilers', value: parseFloat(this.value) });
    };

    document.getElementById('bSlider').oninput = function() {
        markLocal('brake_left');
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
        markLocal('throttle_left');
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
                markLocal('throttle_left');
                send({ type: 'throttle', value: bumpDown, reverse: true });
                setTimeout(() => {
                    markLocal('throttle_left');
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
                markLocal('throttle_left');
                send({ type: 'throttle', value: bumpUp, reverse: false });
                setTimeout(() => {
                    tSlider.value = idleFloor;
                    updateIdleButtonState();
                    markLocal('throttle_left');
                    send({ type: 'throttle', value: idleFloor, reverse: false });
                }, bumpMs);
                return;
            }
            throttleBlocked = true; this.innerText = "SPOOL DOWN";
            setTimeout(() => { throttleBlocked = false; this.innerText = "REVERSE"; }, 2000);
        }
        tSlider.value = 0;
        updateIdleButtonState();
        markLocal('throttle_left');
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
            
            markLocal('gear_handle');
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
                    markLocal('throttle_left');
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
                markLocal('throttle_left');
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
        markLocal('parking_brake');
        send({ type: 'parking_brake', state: pbState ? 1 : 0 });
    };
});