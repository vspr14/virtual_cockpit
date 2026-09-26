/* Fenix A320 cockpit page entry point. Wires shared widgets to Fenix sim variables. */
import { createSim } from '../../core/sim.js';
import { fastTap, initViewport } from '../../core/touch.js';
import { initDisplayView } from '../../widgets/display_view.js';
import { initOfpView } from '../../widgets/ofp_view.js';
import { initPedestalClock } from '../../widgets/pedestal_clock.js';
import { initTabs } from '../../widgets/tabs.js';
import { initAutobrake } from './autobrake.js';
import { initCameras } from './cameras.js';
import { initGear } from './gear.js';
import { initRadar } from './radar.js';
import { initTcas } from './tcas.js';

const $ = (sel) => document.querySelector(sel);

initViewport();
const aircraftId = document.body.dataset.aircraft || 'fenix_a320';
const sim = createSim(aircraftId);

const ofp = initOfpView({
    frameHost: $('#ofpContainer'),
    metarHost: $('#metarContent'),
    metarRefreshBtn: $('#metarRefreshBtn'),
    ofpRefreshBtn: $('#ofpRefreshBtn'),
});
const displays = initDisplayView($('#displayView'), { aircraftId });

const tabList = [
    { button: $('#tabControls'), els: [$('#camGrid'), $('.pedestal')] },
    {
        button: $('#tabOfp'),
        els: [$('#ofpContainer'), $('#metarContainer'), $('#ofpCameraButtons')],
        hostClass: 'ofp-mode',
        onShow: ofp.show,
    },
    {
        button: $('#tabDisplays'),
        els: [$('#displayView')],
        hostClass: 'displays-mode',
        onShow: displays.show,
        onHide: displays.hide,
    },
].filter((t) => t.button);
const tabs = initTabs(tabList, { host: $('.center-zone') });
if ($('#tabDisplays')) $('#tabDisplays').addEventListener('click', () => displays.tabTapped());

/* ↻ in the nav bar: the home-screen web app has no browser reload. Come back on the same tab. */
const TAB_KEY = 'vc.reloadTab';
try {
    const again = tabList.findIndex((t) => t.button.id === sessionStorage.getItem(TAB_KEY));
    sessionStorage.removeItem(TAB_KEY);
    if (again > 0) tabs.select(again);
} catch (e) { /* storage blocked: start on the first tab */ }
const refreshBtn = $('#refreshPageBtn');
if (refreshBtn) {
    fastTap(refreshBtn);
    refreshBtn.addEventListener('click', () => {
        try { sessionStorage.setItem(TAB_KEY, tabs.current().button.id); } catch (e) { /* reload anyway */ }
        location.reload();
    });
}

initCameras({ grid: $('#camGrid'), ofpGrid: $('#ofpCameraButtons'), toConfigBtn: $('#toConfigBtn') }, sim);
initAutobrake($('#autobrake'), sim);
initTcas($('#tcas-xpdr-root'), sim);
initPedestalClock($('#pedestalClockHost'));
initGear($('#gear-3d-mount'), sim);
initRadar($('#radar-pws-3d-mount'), sim);

sim.start();
