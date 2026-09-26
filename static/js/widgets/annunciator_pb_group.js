/* Row of momentary annunciator pushbuttons (e.g. Airbus AUTO BRK LO / MED / MAX).
   Buttons never latch; state is shown only by their lights. Each light is a child element with
   data-light="<name>" and is lit with the .lit class.
   onPress(index) fires on every tap; the page decides what the press means. */
import { fastTap } from '../core/touch.js';

export function initPbGroup(buttons, { onPress, pressAnimClass = 'pb-anim-press' } = {}) {
    const btns = buttons.filter(Boolean);

    btns.forEach((btn, idx) => {
        fastTap(btn);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.classList.remove(pressAnimClass);
            void btn.offsetWidth; /* restart the animation */
            btn.classList.add(pressAnimClass);
            setTimeout(() => btn.classList.remove(pressAnimClass), 320);
            if (typeof onPress === 'function') onPress(idx);
        });
    });

    const light = (idx, name) => btns[idx] && btns[idx].querySelector(`[data-light="${name}"]`);

    return {
        count: btns.length,
        isLit(idx, name) {
            const el = light(idx, name);
            return !!el && el.classList.contains('lit');
        },
        setLit(idx, name, on) {
            const el = light(idx, name);
            if (el) el.classList.toggle('lit', !!on);
        },
    };
}
