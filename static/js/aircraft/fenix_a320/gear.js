/* Landing gear lever (Fenix L:S_MIP_GEAR: 1 = down, 0 = up). Follows the sim when moved in the cockpit. */
import { num } from '../../core/sim.js';

const KEY = 'gear_handle';

export async function initGear(mount, sim) {
    if (!mount) return;
    const { initGearLever3D } = await import('../../widgets/gear_lever_3d.js');
    const lever = initGearLever3D(mount, {
        onCommit(isDown) {
            sim.hold(KEY, sim.set(KEY, isDown ? 1 : 0));
        },
    });
    if (!lever) return;

    sim.subscribe((d) => {
        if (sim.isHeld(KEY)) return;
        const v = num(d[KEY]);
        if (!Number.isNaN(v)) lever.applySimGearDown(v >= 0.5);
    });
}
