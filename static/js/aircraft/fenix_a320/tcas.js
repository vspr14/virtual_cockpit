/* ATC / TCAS panel (Fenix).
   Knobs write their position directly: S_XPDR_OPERATION (STBY/AUTO/ON = 0/1/2),
   S_TCAS_RANGE (THRT/ALL/ABV/BLW = 0..3), S_XPDR_MODE (STBY/TA/TA-RA = 0/1/2).
   Keypad keys S_PED_ATC_0..7 / _CLR are momentary pulses. The display mirrors Fenix's own entry:
   N_FREQ_STANDBY_XPDR_SELECTED (digits) + N_PED_XPDR_CHAR_DISPLAYED (how many are shown). */
import { num } from '../../core/sim.js';
import { initTcasXpdrPanel } from '../../widgets/tcas_xpdr_panel.js';

const KNOBS = [
    { key: 'xpdr_operation', max: 2, setter: 'setXpdrOperationIndex' },
    { key: 'tcas_range', max: 3, setter: 'setTcasRangeIndex' },
    { key: 'xpdr_mode', max: 2, setter: 'setXpdrModeIndex' },
];
const ENTRY = 'xpdr_entry';

export function initTcas(root, sim) {
    if (!root) return;
    const knobWrite = (key) => (idx) => sim.hold(key, sim.set(key, idx));
    const panel = initTcasXpdrPanel(root, {
        defaultXpdrBuffer: '2000',
        onXpdrOperation: knobWrite('xpdr_operation'),
        onTcasRange: knobWrite('tcas_range'),
        onXpdrMode: knobWrite('xpdr_mode'),
        pulseAtcDigit: (d) => sim.hold(ENTRY, sim.pulse('ped_atc_' + d)),
        pulseAtcClr: () => sim.hold(ENTRY, sim.pulse('ped_atc_clr')),
    });

    sim.subscribe((d) => {
        KNOBS.forEach((k) => {
            if (sim.isHeld(k.key)) return;
            const v = num(d[k.key]);
            if (!Number.isNaN(v)) panel[k.setter](Math.max(0, Math.min(k.max, Math.round(v))));
        });
        if (!sim.isHeld(ENTRY) && sim.pulsesPending() === 0) {
            const entry = num(d.xpdr_entry);
            const chars = num(d.xpdr_entry_chars);
            if (!Number.isNaN(entry) && !Number.isNaN(chars)) panel.setXpdrEntry(entry, chars);
        }
    });
}
