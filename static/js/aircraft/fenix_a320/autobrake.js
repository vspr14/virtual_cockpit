/* AUTO BRK LO / MED / MAX (Fenix).
   S_MIP_AUTOBRAKE_* are momentary pushbuttons (HubHop: Press = 1, Release = 0); Fenix does the arming.
   Blue ON light  = I_MIP_AUTOBRAKE_*_L (armed), green DECEL light = I_MIP_AUTOBRAKE_*_U.
   A press lights ON immediately using Airbus logic (arm this mode / disarm if already armed), then the
   lights follow Fenix (e.g. it won't arm without hydraulic pressure). */
import { num } from '../../core/sim.js';
import { initPbGroup } from '../../widgets/annunciator_pb_group.js';

const MODES = [
    { key: 'autobrake_lo', on: 'i_mip_autobrake_lo_l', decel: 'i_mip_autobrake_lo_u' },
    { key: 'autobrake_med', on: 'i_mip_autobrake_med_l', decel: 'i_mip_autobrake_med_u' },
    { key: 'autobrake_max', on: 'i_mip_autobrake_max_l', decel: 'i_mip_autobrake_max_u' },
];
const HOLD = 'autobrake';

export function initAutobrake(root, sim) {
    if (!root) return;
    const group = initPbGroup(Array.from(root.querySelectorAll('[data-autobrake]')), {
        onPress(idx) {
            const wasArmed = group.isLit(idx, 'lower');
            MODES.forEach((_, i) => group.setLit(i, 'lower', !wasArmed && i === idx));
            sim.hold(HOLD, sim.pulse(MODES[idx].key), 700);
        },
    });

    sim.subscribe((d) => {
        MODES.forEach((m, i) => {
            const on = num(d[m.on]);
            const decel = num(d[m.decel]);
            if (!sim.isHeld(HOLD) && !Number.isNaN(on)) group.setLit(i, 'lower', on >= 0.15);
            if (!Number.isNaN(decel)) group.setLit(i, 'upper', decel >= 0.15);
        });
    });
}
