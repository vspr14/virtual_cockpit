/* Touch helpers shared by every cockpit page. */

/* Fire click on touchend (no iOS tap delay) and swallow the ghost click that follows. */
export function fastTap(btn) {
    if (!btn || btn.dataset.vcTouchBound === '1') return;
    btn.dataset.vcTouchBound = '1';
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.__vcSuppressGhostClickUntil = Date.now() + 500;
        btn.click();
    }, { passive: false });
    btn.addEventListener('click', (e) => {
        if (btn.__vcSuppressGhostClickUntil && Date.now() < btn.__vcSuppressGhostClickUntil && e.detail > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
}

/* Visual press state while a finger is down (class `pressedClass`). */
export function pressFeedback(btn, pressedClass = 'is-pressing') {
    if (!btn) return;
    const up = () => btn.classList.remove(pressedClass);
    btn.addEventListener('pointerdown', (e) => { if (e.isPrimary) btn.classList.add(pressedClass); });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', (e) => { if (e.buttons === 0) up(); });
}

/* --vh = 1% of the visible viewport (Safari toolbars excluded); iOS address-bar nudge.
   (The home-screen web app's window ends ~32pt above the screen's bottom edge; nothing can be drawn below it.) */
export function initViewport() {
    const setVh = () => {
        const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
    };
    setVh();
    (window.visualViewport || window).addEventListener('resize', setVh);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
        const nudge = () => { window.scrollTo(0, 1); setTimeout(() => window.scrollTo(0, 0), 0); };
        setTimeout(nudge, 50);
        window.addEventListener('orientationchange', () => setTimeout(nudge, 200));
    }
}
