export function initPedestalClock(host) {
    if (!host) return;
    function q(name) {
        return host.querySelector('[data-pc="' + name + '"]');
    }
    let tdH = null;
    let tdM = null;
    let pickerOpen = false;
    const pickerDrop = q('picker-drop');
    const pickerWrap = q('picker-wrap');
    const setBtn = q('set-btn');
    const confirmBtn = q('confirm-btn');
    const tdInput = q('td-input');
    const tdDisplay = q('td-display');
    if (!pickerDrop || !pickerWrap || !setBtn || !confirmBtn || !tdInput || !tdDisplay) return;
    function pad2(n) {
        return String(n).padStart(2, '0');
    }
    function togglePicker(e) {
        e.stopPropagation();
        pickerOpen = !pickerOpen;
        if (pickerOpen) {
            if (tdH !== null && tdM !== null) {
                tdInput.value = pad2(tdH) + ':' + pad2(tdM);
            } else {
                const now = new Date();
                tdInput.value = pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes());
            }
        }
        pickerDrop.classList.toggle('pedestal-clock-picker-open', pickerOpen);
    }
    function confirmTD() {
        const v = tdInput.value;
        if (!v) return;
        const parts = v.split(':');
        const h = Math.floor(Number(parts[0]));
        const m = Math.floor(Number(parts[1]));
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        tdH = Math.max(0, Math.min(23, h));
        tdM = Math.max(0, Math.min(59, m));
        tdDisplay.textContent = pad2(tdH) + ':' + pad2(tdM);
        pickerOpen = false;
        pickerDrop.classList.remove('pedestal-clock-picker-open');
    }
    function setD(id, val) {
        const el = q(id);
        if (el) el.textContent = val;
    }
    function tick() {
        const now = new Date();
        const h = now.getUTCHours();
        const m = now.getUTCMinutes();
        const s = now.getUTCSeconds();
        setD('uh1', String(Math.floor(h / 10)));
        setD('uh2', String(h % 10));
        setD('um1', String(Math.floor(m / 10)));
        setD('um2', String(m % 10));
        setD('us1', String(Math.floor(s / 10)));
        setD('us2', String(s % 10));
        if (tdH === null) {
            ['eh1', 'eh2', 'em1', 'em2'].forEach(function (id) {
                setD(id, '-');
                const el = q(id);
                if (el) el.className = 'pedestal-clock-d';
            });
            setD('es', '\u2009');
            const es = q('es');
            if (es) es.className = 'pedestal-clock-d';
            return;
        }
        const diff = tdH * 60 + tdM - (h * 60 + m);
        const neg = diff < 0;
        const abs = Math.abs(diff);
        const dh = Math.floor(abs / 60);
        const dm = abs % 60;
        const cls = 'pedestal-clock-d' + (neg ? ' pedestal-clock-neg' : '');
        setD('es', neg ? '-' : '\u2009');
        setD('eh1', String(Math.floor(dh / 10)));
        setD('eh2', String(dh % 10));
        setD('em1', String(Math.floor(dm / 10)));
        setD('em2', String(dm % 10));
        ['es', 'eh1', 'eh2', 'em1', 'em2'].forEach(function (id) {
            const el = q(id);
            if (el) el.className = cls;
        });
    }
    setBtn.addEventListener('click', togglePicker);
    confirmBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        confirmTD();
    });
    tick();
    setInterval(tick, 1000);
    document.addEventListener('click', function (e) {
        if (pickerOpen && pickerWrap && !pickerWrap.contains(e.target)) {
            pickerOpen = false;
            pickerDrop.classList.remove('pedestal-clock-picker-open');
        }
    });
}
