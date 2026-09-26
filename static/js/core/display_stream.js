/* WebSocket client for /ws/<aircraft>/displays (protocol: backend/routes/displays.py).
   One connection carries every display, so the browser's per-host connection limit is never an issue.
   Connects only while something is subscribed; reconnects with backoff. */

export function createDisplayStream(aircraftId, { onFrame, onStatus, onConnection } = {}) {
    let ws = null;
    let subs = {};
    let opts = { fps: 30, quality: 80 };
    let retryMs = 500;
    let retryTimer = 0;
    const decoder = new TextDecoder();

    const active = () => Object.keys(subs).length > 0;

    function url() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.host}/ws/${encodeURIComponent(aircraftId)}/displays`;
    }

    function sendSubscribe() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribe', displays: subs, ...opts }));
        }
    }

    function handleBinary(buf) {
        const view = new DataView(buf);
        const n = view.getUint8(0);
        const id = decoder.decode(new Uint8Array(buf, 1, n));
        const seq = view.getUint32(1 + n, true);
        const width = view.getUint16(5 + n, true);
        const height = view.getUint16(7 + n, true);
        const blob = new Blob([new Uint8Array(buf, 9 + n)], { type: 'image/jpeg' });
        if (onFrame) onFrame(id, blob, { seq, width, height });
    }

    function connect() {
        clearTimeout(retryTimer);
        if (ws || !active()) return;
        const sock = new WebSocket(url());
        ws = sock;
        sock.binaryType = 'arraybuffer';
        sock.onopen = () => {
            retryMs = 500;
            if (onConnection) onConnection(true);
            sendSubscribe();
        };
        sock.onmessage = (ev) => {
            if (typeof ev.data === 'string') {
                let msg = null;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }
                if (msg && msg.type === 'status' && onStatus) onStatus(msg.displays || {});
            } else {
                handleBinary(ev.data);
            }
        };
        sock.onclose = () => {
            if (ws === sock) ws = null;
            if (onConnection) onConnection(false);
            if (active()) {
                retryTimer = setTimeout(connect, retryMs);
                retryMs = Math.min(5000, retryMs * 2);
            }
        };
        sock.onerror = () => { /* onclose follows */ };
    }

    /* next: { displayId: { width } }; an empty object pauses (and closes after a while). */
    function setSubscriptions(next, options = {}) {
        subs = next || {};
        opts = { ...opts, ...options };
        if (!active()) {
            sendSubscribe();
            return;
        }
        if (!ws) connect();
        else sendSubscribe();
    }

    function close() {
        subs = {};
        clearTimeout(retryTimer);
        if (ws) ws.close();
        ws = null;
    }

    return { setSubscriptions, close };
}
