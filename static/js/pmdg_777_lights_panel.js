const PMDG777_LIGHT_ROWS = [
    [
        { key: 'beacon', label: 'BEACON' },
        { key: 'wing', label: 'WING' },
        { key: 'nav', label: 'NAV' },
        { key: 'logo', label: 'LOGO' }
    ],
    [
        { key: 'rwy_l', label: 'RWY T/O L' },
        { key: 'rwy_r', label: 'RWY T/O R' }
    ],
    [
        { key: 'land_left', label: 'LAND L' },
        { key: 'land_nose', label: 'LAND NOSE' },
        { key: 'land_right', label: 'LAND R' }
    ],
    [
        { key: 'taxi', label: 'TAXI' },
        { key: 'strobe', label: 'STROBE' }
    ]
];

function pmdg777LightOnFromSim(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v >= 0.5;
    const x = parseFloat(v);
    return Number.isFinite(x) && x >= 0.5;
}

export function attachPmdg777LightsPanel(root, options) {
    const opts = options || {};
    const emit = typeof opts.emit === 'function' ? opts.emit : function () {};
    const onUserInteraction = typeof opts.onUserInteraction === 'function' ? opts.onUserInteraction : function () {};
    const buttons = new Map();

    root.innerHTML = '';
    root.classList.add('b777-lt-panel');

    const title = document.createElement('div');
    title.className = 'b777-lt-title';
    title.textContent = 'EXT LIGHTS';
    root.appendChild(title);

    PMDG777_LIGHT_ROWS.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'b777-lt-row';
        row.forEach((spec) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'b777-lt-toggle';
            btn.dataset.lvarKey = spec.key;
            btn.setAttribute('aria-pressed', 'false');
            btn.innerHTML = '<span class="b777-lt-led"></span><span class="b777-lt-label">' + spec.label + '</span>';
            btn.addEventListener('click', function () {
                onUserInteraction();
                emit(spec.key, 1);
            });
            buttons.set(spec.key, btn);
            rowEl.appendChild(btn);
        });
        root.appendChild(rowEl);
    });

    const syncFromSim = (map) => {
        if (!map || typeof map !== 'object') return;
        buttons.forEach((btn, key) => {
            const on = pmdg777LightOnFromSim(map[key]);
            btn.classList.toggle('on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    };

    return { syncFromSim };
}
