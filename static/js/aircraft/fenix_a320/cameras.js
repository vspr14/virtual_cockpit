/* ECAM-style control panel: camera views (vJoy buttons mapped in aircraft/fenix_a320/aircraft.json)
   and the T.O. CONFIG momentary button (L:S_ECAM_TO). */
import { selectCamera } from '../../core/api.js';
import { fastTap, pressFeedback } from '../../core/touch.js';
import { initCameraGrid } from '../../widgets/camera_grid.js';

export function initCameras({ grid, ofpGrid, toConfigBtn }, sim) {
    let main = null;
    let ofp = null;
    const select = (source) => (camId) => {
        selectCamera(sim.aircraftId, camId).catch(() => { /* network hiccup: the next tap retries */ });
        if (source !== main && main) main.highlight(camId);
        if (source !== ofp && ofp) ofp.highlight(camId);
    };
    main = initCameraGrid(grid, { selectFirst: true, pressedClass: 'ecam-pressing', onSelect: (id) => select(main)(id) });
    ofp = initCameraGrid(ofpGrid, { onSelect: (id) => select(ofp)(id) });

    if (toConfigBtn) {
        fastTap(toConfigBtn);
        pressFeedback(toConfigBtn, 'ecam-pressing');
        toConfigBtn.addEventListener('click', () => sim.pulse('ecam_to'));
    }
}
