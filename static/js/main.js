/**
 * Legacy entry: loads main_core.js from the same directory.
 * Prefer: page_*.js then main_core.js in HTML.
 */
(function () {
    var cur = document.currentScript;
    if (!cur || !cur.src) return;
    var u = new URL(cur.src);
    u.pathname = u.pathname.replace(/\/main\.js$/i, '/main_core.js');
    var s = document.createElement('script');
    s.src = u.href;
    s.async = false;
    cur.parentNode.insertBefore(s, cur.nextSibling);
})();
