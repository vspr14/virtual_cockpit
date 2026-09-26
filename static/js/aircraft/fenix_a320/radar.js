/* Weather radar SYS and PWS switches (Fenix).
   Values from Fenix Cockpit_Behavior.xml / HubHop:
     L:S_WR_SYS       3-position: 0 = "1", 1 = OFF, 2 = "2"   (same order as the widget's indices)
     L:S_WR_PRED_WS   toggle:     0 = OFF, 1 = AUTO
   Only the switch the user moved is written, and each switch ignores the sim until its own write lands. */
import { num } from '../../core/sim.js';

const SWITCHES = {
    sys: { key: 'wr_sys', max: 2 },
    pws: { key: 'wr_pws', max: 1 },
};

function toIndex(value, max) {
    const v = num(value);
    if (Number.isNaN(v)) return undefined;
    const r = Math.round(v);
    return r >= 0 && r <= max && Math.abs(v - r) < 0.05 ? r : undefined;
}

export async function initRadar(mount, sim) {
    if (!mount) return;
    const { initRadarPwsSwitches3D } = await import('../../widgets/radar_pws_switches_3d.js');
    const widget = initRadarPwsSwitches3D(mount, {
        compact: true,
        onChange({ which, value }) {
            const sw = SWITCHES[which];
            if (sw) sim.hold(sw.key, sim.set(sw.key, value));
        },
    });

    sim.subscribe((d) => {
        const patch = {};
        Object.entries(SWITCHES).forEach(([which, sw]) => {
            if (sim.isHeld(sw.key)) return;
            const idx = toIndex(d[sw.key], sw.max);
            if (idx !== undefined) patch[which] = idx;
        });
        widget.applySimState(patch);
    });
}
