(function () {
    const CLR_LONG_MS = 500;

    function normAngle(deg) {
        let a = deg % 360;
        if (a > 180) a -= 360;
        if (a < -180) a += 360;
        return a;
    }

    function nearestDetent(deg, detents, preferDeg) {
        let best = detents[0];
        let bestDist = Infinity;
        for (let i = 0; i < detents.length; i++) {
            let d = Math.abs(normAngle(deg - detents[i]));
            if (preferDeg != null && Math.abs(normAngle(preferDeg - detents[i])) < 0.01) {
                d -= 22;
            }
            if (d < bestDist) {
                bestDist = d;
                best = detents[i];
            }
        }
        return best;
    }

    /* Rotary selector, touch-first:
       - tap a position label (e.g. "TA/RA") to jump straight to it
       - tap the left / right half of the knob to step one position
       - or swipe sideways across the knob (one position per ~36px)
       Positions only ever land on detents, and onSnap fires once per change. */
    function initKnob(mount, onSnap, onInteract) {
        const detents = mount.getAttribute('data-knob-detents').split(',').map(Number);
        const initial = Number(mount.getAttribute('data-knob-initial') || '0');
        const knob = mount.querySelector('.knob');
        if (!knob || !detents.length) return null;
        const group = mount.closest('.knob-group') || mount.parentElement;

        let idx = detents.indexOf(nearestDetent(initial, detents, null));
        if (idx < 0) idx = 0;
        let lastSnapIdx = idx;
        const SWIPE_PX_PER_STEP = 36;
        const TAP_SLOP_PX = 8;

        function center() {
            const r = mount.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        }

        /* Map a label to the detent whose pointer direction is closest to where the label sits. */
        function labelIndex(lbl) {
            const c = center();
            const r = lbl.getBoundingClientRect();
            if (!r.width) return -1;
            const dx = r.left + r.width / 2 - c.cx;
            const dy = r.top + r.height / 2 - c.cy;
            const ang = Math.atan2(dx, -dy) * (180 / Math.PI); /* 0 = up, clockwise positive */
            return detents.indexOf(nearestDetent(ang, detents, null));
        }

        function show(i) {
            knob.style.transform = 'rotate(' + detents[i] + 'deg)';
            if (group) {
                group.querySelectorAll('.knob-lbl').forEach(function (lbl) {
                    lbl.classList.toggle('knob-lbl--active', labelIndex(lbl) === i);
                });
            }
        }

        function commit(i) {
            i = Math.max(0, Math.min(detents.length - 1, i));
            idx = i;
            show(i);
            if (i !== lastSnapIdx) {
                lastSnapIdx = i;
                if (typeof onSnap === 'function') onSnap(i);
            }
        }

        if (group) {
            group.querySelectorAll('.knob-lbl').forEach(function (lbl) {
                lbl.addEventListener('pointerdown', function (e) {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onInteract === 'function') onInteract();
                    const i = labelIndex(lbl);
                    if (i >= 0) commit(i);
                });
            });
        }

        let active = false;
        let startX = 0;
        let startY = 0;
        let startIdx = idx;
        let swiped = false;

        mount.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            if (typeof onInteract === 'function') onInteract();
            active = true;
            swiped = false;
            startX = e.clientX;
            startY = e.clientY;
            startIdx = idx;
            mount.classList.add('is-dragging');
            try { mount.setPointerCapture(e.pointerId); } catch (err) { }
        });

        mount.addEventListener('pointermove', function (e) {
            if (!active) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            if (!swiped && Math.abs(dx) < TAP_SLOP_PX && Math.abs(e.clientY - startY) < TAP_SLOP_PX) return;
            swiped = true;
            if (typeof onInteract === 'function') onInteract();
            const i = Math.max(0, Math.min(detents.length - 1, startIdx + Math.round(dx / SWIPE_PX_PER_STEP)));
            idx = i;
            show(i);
        });

        mount.addEventListener('pointerup', function (e) {
            if (!active) return;
            active = false;
            mount.classList.remove('is-dragging');
            if (swiped) {
                commit(idx);
                return;
            }
            const c = center();
            commit(startIdx + (e.clientX < c.cx ? -1 : 1));
        });

        mount.addEventListener('pointercancel', function () {
            if (!active) return;
            active = false;
            mount.classList.remove('is-dragging');
            idx = startIdx;
            show(idx);
        });

        requestAnimationFrame(function () { show(idx); });

        return {
            setIndex: function (i) {
                if (active || i < 0 || i >= detents.length) return;
                idx = i;
                lastSnapIdx = i;
                show(i);
            },
            getIndex: function () { return idx; }
        };
    }

    /* ATC keypad, matching the Fenix A320 panel (verified against the live aircraft):
       - digits append to the entry; with a full 4-digit code shown, digits are ignored
       - CLR removes the last digit; a long CLR press clears the whole entry
       - an unfinished entry stays until completed or cleared
       The display updates instantly on touch, then follows the sim's own entry (setEntry). */
    function initXpdrKeypad(root, keypadOpt) {
        const digitsWrap = root.querySelector('.xpdr-digits');
        if (!digitsWrap) return null;

        const spans = digitsWrap.querySelectorAll('.xpdr-d');
        if (spans.length !== 4) return null;

        const ko = keypadOpt || {};
        let buf = String(ko.defaultBuffer != null ? ko.defaultBuffer : '2000').replace(/\D/g, '').slice(0, 4);

        function render() {
            for (let i = 0; i < 4; i++) {
                const ch = buf[i];
                spans[i].textContent = ch !== undefined ? ch : '\u00a0';
                spans[i].classList.toggle('xpdr-d--empty', ch === undefined);
            }
            digitsWrap.setAttribute('aria-label', buf.length ? buf : 'empty');
        }

        function flash(btn) {
            btn.classList.add('num-btn--pressed');
            setTimeout(function () { btn.classList.remove('num-btn--pressed'); }, 140);
        }

        render();

        function onDigit(btn) {
            if (typeof ko.onUserInteraction === 'function') ko.onUserInteraction();
            const d = btn.getAttribute('data-xpdr-digit');
            if (buf.length < 4) flash(btn);
            /* Full code entered: digits do nothing (real panel and Fenix both ignore them). */
            if (buf.length >= 4) return;
            buf += d;
            render();
            if (typeof ko.pulseAtcDigit === 'function') ko.pulseAtcDigit(d);
        }

        root.querySelectorAll('[data-xpdr-digit]').forEach(function (btn) {
            btn.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                onDigit(btn);
            });
            /* Keyboard activation only; pointer taps are handled on pointerdown above. */
            btn.addEventListener('click', function (e) {
                if (e.detail === 0) onDigit(btn);
            });
        });

        const clrBtn = root.querySelector('[data-xpdr-clr]');
        let clrTimer = null;
        let clrLongDone = false;
        let clrDown = false;

        if (clrBtn) {
            clrBtn.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                if (typeof ko.onUserInteraction === 'function') ko.onUserInteraction();
                clrDown = true;
                clrLongDone = false;
                flash(clrBtn);
                try { clrBtn.setPointerCapture(e.pointerId); } catch (err) { }
                if (clrTimer) clearTimeout(clrTimer);
                clrTimer = setTimeout(function () {
                    clrLongDone = true;
                    clrTimer = null;
                    const n = Math.max(1, buf.length);
                    buf = '';
                    render();
                    if (typeof ko.pulseAtcClr === 'function') {
                        for (let i = 0; i < n; i++) ko.pulseAtcClr();
                    }
                }, CLR_LONG_MS);
            });

            const clrEnd = function () {
                if (!clrDown) return;
                clrDown = false;
                if (clrTimer) {
                    clearTimeout(clrTimer);
                    clrTimer = null;
                }
                if (!clrLongDone) {
                    if (buf.length > 0) buf = buf.slice(0, -1);
                    render();
                    if (typeof ko.pulseAtcClr === 'function') ko.pulseAtcClr();
                }
                clrLongDone = false;
            };
            clrBtn.addEventListener('pointerup', clrEnd);
            clrBtn.addEventListener('pointercancel', clrEnd);
        }

        return {
            /* Fenix entry: value = N_FREQ_STANDBY_XPDR_SELECTED, chars = N_PED_XPDR_CHAR_DISPLAYED. */
            setEntry: function (value, chars) {
                const n = Math.round(Number(value));
                const c = Math.round(Number(chars));
                if (!Number.isFinite(n) || !Number.isFinite(c) || c < 0 || c > 4) return;
                const next = (c === 0 || n < 0) ? '' : String(n).padStart(c, '0').slice(-c);
                if (!/^[0-7]{0,4}$/.test(next)) return;
                if (next !== buf) {
                    buf = next;
                    render();
                }
            }
        };
    }

    function bindTcasEmbedFit(wrap) {
        const scaleEl = wrap.querySelector('.tcas-xpdr-scale');
        if (!scaleEl) return;
        const W = 780;
        const H = 340;
        function apply() {
            let rw = wrap.getBoundingClientRect().width;
            if (rw < 24) {
                const stack = wrap.closest('.pedestal-middle-stack');
                if (stack) rw = stack.getBoundingClientRect().width;
            }
            if (rw < 24) {
                rw = Math.min(W, Math.max(280, Math.floor(((window.innerWidth || document.documentElement.clientWidth || 960) - 120) * 0.55)));
            }
            const s = Math.min(1.12, Math.max(0.4, rw / W));
            scaleEl.style.transform = 'translateX(-50%) translateZ(0) scale(' + s + ')';
            wrap.style.height = Math.ceil(H * s) + 'px';
        }
        apply();
        window.addEventListener('resize', apply);
        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(apply);
            ro.observe(wrap);
        }
    }

    function initTcasXpdrPanel(root, options) {
        if (!root) return {};
        const opt = options || {};
        const out = {};
        const bump = opt.onUserInteraction;
        const k1 = root.querySelector('.knob-g-k1 .knob-mount[data-knob-detents]');
        const api1 = k1 ? initKnob(k1, function (idx) { if (opt.onXpdrOperation) opt.onXpdrOperation(idx); }, bump) : null;
        if (api1) out.setXpdrOperationIndex = function (idx) { api1.setIndex(idx); };
        const k4 = root.querySelector('.knob-g-k4 .knob-mount[data-knob-detents]');
        const api4 = k4 ? initKnob(k4, function (idx) { if (opt.onTcasRange) opt.onTcasRange(idx); }, bump) : null;
        if (api4) out.setTcasRangeIndex = function (idx) { api4.setIndex(idx); };
        const k5 = root.querySelector('.knob-g-k5 .knob-mount[data-knob-detents]');
        const api5 = k5 ? initKnob(k5, function (idx) { if (opt.onXpdrMode) opt.onXpdrMode(idx); }, bump) : null;
        if (api5) out.setXpdrModeIndex = function (idx) { api5.setIndex(idx); };
        const keypad = initXpdrKeypad(root, {
            defaultBuffer: opt.defaultXpdrBuffer,
            onUserInteraction: bump,
            pulseAtcDigit: opt.pulseAtcDigit,
            pulseAtcClr: opt.pulseAtcClr
        });
        if (keypad) out.setXpdrEntry = keypad.setEntry;
        if (root.classList.contains('tcas-xpdr-embed-wrap')) {
            bindTcasEmbedFit(root);
        }
        return out;
    }

    window.initTcasXpdrPanel = initTcasXpdrPanel;
})();

