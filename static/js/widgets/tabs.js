/* Nav-bar tabs: each tab shows its own elements, hides the others', and can put a class on a host element.
   tabs: [{ button, els: [...], hostClass?, onShow?(), onHide?() }]; the first tab is shown at start. */
import { fastTap } from '../core/touch.js';

export function initTabs(tabs, { host = null } = {}) {
    tabs = tabs.filter((t) => t && t.button);
    let current = null;

    const toggle = (els, on) => (els || []).forEach((el) => el && el.classList.toggle('hidden', !on));

    function select(tab) {
        if (!tab || tab === current) return;
        if (current) {
            toggle(current.els, false);
            if (host && current.hostClass) host.classList.remove(current.hostClass);
            if (current.onHide) current.onHide();
        }
        current = tab;
        tabs.forEach((t) => t.button.classList.toggle('active', t === tab));
        toggle(tab.els, true);
        if (host && tab.hostClass) host.classList.add(tab.hostClass);
        if (tab.onShow) tab.onShow();
        /* Let canvases and layouts re-measure after being unhidden. */
        requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))));
    }

    tabs.forEach((t) => {
        toggle(t.els, false);
        fastTap(t.button);
        t.button.addEventListener('click', () => select(t));
    });
    select(tabs[0]);
    return { select: (i) => select(tabs[i]), current: () => current };
}
