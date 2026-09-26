/* Exclusive camera-view buttons.
   Markup: buttons with data-cam-id="<id>"; optional one button with data-cam-cycle (steps to the next view).
   onSelect(camId) fires when the user picks a different view (debounced). */
import { fastTap, pressFeedback } from '../core/touch.js';

export function initCameraGrid(root, { onSelect, selectFirst = false, debounceMs = 280, pressedClass = 'is-pressing' } = {}) {
    if (!root) return null;
    const buttons = Array.from(root.querySelectorAll('[data-cam-id]'));
    const cycleBtn = root.querySelector('[data-cam-cycle]');
    let lastSentAt = 0;

    function send(camId) {
        const now = Date.now();
        if (now - lastSentAt < debounceMs) return;
        lastSentAt = now;
        if (typeof onSelect === 'function') onSelect(camId);
    }

    function activate(btn) {
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        send(Number(btn.dataset.camId));
    }

    buttons.forEach((btn) => {
        fastTap(btn);
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            activate(btn);
        });
    });

    if (cycleBtn) {
        fastTap(cycleBtn);
        pressFeedback(cycleBtn, pressedClass);
        cycleBtn.addEventListener('click', () => {
            const idx = buttons.findIndex((b) => b.classList.contains('active'));
            activate(buttons[(idx + 1) % buttons.length]);
        });
    }

    if (selectFirst && buttons.length && !buttons.some((b) => b.classList.contains('active'))) {
        activate(buttons[0]);
    }

    return {
        /* Highlight a view without sending (e.g. keep two grids in step). */
        highlight(camId) {
            buttons.forEach((b) => b.classList.toggle('active', Number(b.dataset.camId) === camId));
        },
    };
}
