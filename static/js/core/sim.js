/* Connection to one aircraft's sim variables: writes, momentary pulses, polling and write holds.
   Aircraft-agnostic: variable keys are whatever aircraft/<id>/lvars.json defines. */
import { readLvars, writeLvar } from './api.js';

/* Momentary pushbuttons (1 → 0). Tested on the live Fenix A320: with < ~100 ms between a release and the
   next press the sim misses the release and drops the key; ~220 ms registers every key. All pulses share
   one queue so fast taps can never overlap or reorder press/release writes. */
const PULSE_HOLD_MS = 120;
const PULSE_GAP_MS = 220;
const POLL_MS = 450;
const POLL_AFTER_WRITE_MS = 120;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSim(aircraftId) {
    let snapshot = null;
    const subscribers = [];
    let pulseChain = Promise.resolve();
    let pulsesPending = 0;
    let soonTimer = 0;
    let started = false;
    let pollInFlight = false;
    let dispatchStartedAt = 0;
    /* tag → { pending, releaseAfter }: a control ignores sim values until its own write has landed. */
    const holds = new Map();

    async function poll() {
        if (pollInFlight) return;
        pollInFlight = true;
        const startedAt = Date.now();
        try {
            const data = await readLvars(aircraftId);
            if (data && !data.error) {
                snapshot = data;
                dispatch(data, startedAt);
            }
        } catch (e) {
            /* network hiccup: keep the last snapshot */
        } finally {
            pollInFlight = false;
        }
    }

    function dispatch(data, startedAt) {
        dispatchStartedAt = startedAt;
        subscribers.forEach((fn) => {
            try { fn(data); } catch (e) { console.error('[sim] subscriber failed', e); }
        });
    }

    function pollSoon(delay = POLL_AFTER_WRITE_MS) {
        if (!started) return;
        clearTimeout(soonTimer);
        soonTimer = setTimeout(poll, delay);
    }

    function set(key, value) {
        return writeLvar(aircraftId, key, value).finally(() => pollSoon());
    }

    function pulse(key) {
        pulsesPending++;
        const done = pulseChain
            .then(() => writeLvar(aircraftId, key, 1).catch(() => {}))
            .then(() => wait(PULSE_HOLD_MS))
            .then(() => writeLvar(aircraftId, key, 0).catch(() => {}))
            .finally(() => { pulsesPending--; pollSoon(); });
        pulseChain = done.then(() => wait(PULSE_GAP_MS));
        return done;
    }

    /* Ignore sim values for `tag` until `promise` settles plus settleMs (sim logic can lag a frame or two). */
    function hold(tag, promise, settleMs = 300) {
        const h = holds.get(tag) || { pending: 0, releaseAfter: 0 };
        h.pending++;
        holds.set(tag, h);
        Promise.resolve(promise).catch(() => {}).then(() => {
            h.pending--;
            h.releaseAfter = Math.max(h.releaseAfter, Date.now() + settleMs);
            pollSoon(settleMs + 20);
        });
        return promise;
    }

    /* True while the snapshot being dispatched may predate this control's latest write. */
    function isHeld(tag) {
        const h = holds.get(tag);
        return !!h && (h.pending > 0 || dispatchStartedAt < h.releaseAfter);
    }

    /* fn(snapshot) on every successful poll; called at once with the cached snapshot if there is one. */
    function subscribe(fn) {
        subscribers.push(fn);
        if (snapshot) {
            try { fn(snapshot); } catch (e) { console.error('[sim] subscriber failed', e); }
        }
    }

    function start() {
        if (started) return;
        started = true;
        poll();
        setInterval(poll, POLL_MS);
    }

    return {
        aircraftId,
        set,
        pulse,
        hold,
        isHeld,
        subscribe,
        start,
        pulsesPending: () => pulsesPending,
        snapshot: () => snapshot,
    };
}

/* Coerce a sim value to a finite number, or NaN. */
export function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : NaN;
}
