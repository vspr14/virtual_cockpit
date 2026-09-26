/* HTTP calls to the server. Aircraft-scoped endpoints take the aircraft id. */

async function json(res) {
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { error: 'bad_json' }; }
    if (!res.ok && !body.error) body.error = 'http_' + res.status;
    return body;
}

function post(url, payload) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    }).then(json);
}

export function readLvars(aircraftId) {
    return fetch(`/api/${encodeURIComponent(aircraftId)}/lvars`, { credentials: 'same-origin' }).then(json);
}

export function writeLvar(aircraftId, key, value) {
    return post(`/api/${encodeURIComponent(aircraftId)}/lvars`, { key, value });
}

export function selectCamera(aircraftId, camId) {
    return post(`/api/${encodeURIComponent(aircraftId)}/camera`, { cam_id: camId });
}

export function displayWindows(aircraftId) {
    return fetch(`/api/${encodeURIComponent(aircraftId)}/displays/windows`, { credentials: 'same-origin' }).then(json);
}

export function assignDisplay(aircraftId, display, hwnd) {
    return post(`/api/${encodeURIComponent(aircraftId)}/displays/assign`, { display, hwnd });
}

export function displayWindowThumbUrl(aircraftId, hwnd) {
    return `/api/${encodeURIComponent(aircraftId)}/displays/windows/${hwnd}/thumb.jpg?t=${Date.now()}`;
}

/* Automatic pop-out: calibration { view, points: { id: [fx, fy, view?] }, auto } and the last run's status. */
export function popoutSettings(aircraftId, changes = null) {
    const url = `/api/${encodeURIComponent(aircraftId)}/displays/popout`;
    return changes ? post(url, changes) : fetch(url, { credentials: 'same-origin' }).then(json);
}

/* The loaded aircraft's ChasePlane cockpit views: { aircraft, views: [name] } or { error }. */
export function popoutViews(aircraftId) {
    return fetch(`/api/${encodeURIComponent(aircraftId)}/displays/popout/views`, { credentials: 'same-origin' }).then(json);
}

/* Switches ChasePlane to the view and resolves to a JPEG Blob of the sim window (or { error }). */
export async function popoutPicture(aircraftId, view) {
    const res = await fetch(`/api/${encodeURIComponent(aircraftId)}/displays/popout/picture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ view }),
    });
    return res.ok ? res.blob() : json(res);
}

export function runPopout(aircraftId) {
    return post(`/api/${encodeURIComponent(aircraftId)}/displays/popout/run`, {});
}

export function chaseplaneStatus(aircraftId) {
    return fetch(`/api/chaseplane/${encodeURIComponent(aircraftId)}`, { credentials: 'same-origin' }).then(json);
}

export function chaseplaneAction(aircraftId, action, payload = {}) {
    return post(`/api/chaseplane/${encodeURIComponent(aircraftId)}/${action}`, payload);
}

export function fetchOfp() {
    return fetch('/api/ofp', { credentials: 'same-origin' }).then(json);
}

export function fetchMetars(origin, destination) {
    const q = new URLSearchParams();
    if (origin) q.append('origin', origin);
    if (destination) q.append('destination', destination);
    return fetch('/api/metar?' + q.toString(), { credentials: 'same-origin' }).then(json);
}
