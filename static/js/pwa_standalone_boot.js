/**
 * iPad/iPhone: “Add to Home Screen” runs in standalone display mode (no Safari URL bar).
 * Optional scroll nudge: some Safari builds briefly shrink chrome after a tiny scroll.
 */
(function () {
    try {
        var standalone = false;
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) standalone = true;
        if (window.navigator.standalone === true) standalone = true;
        if (!standalone) return;
        document.documentElement.classList.add('vc-pwa-standalone');
        requestAnimationFrame(function () {
            window.scrollTo(0, 1);
            setTimeout(function () {
                window.scrollTo(0, 0);
            }, 400);
        });
    } catch (e) { /* ignore */ }
})();
