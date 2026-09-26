/* SimBrief OFP (PDF) + METARs for the OFP tab. Prefetched in the background; never blocks the page.
   Returns { show } for the tab's onShow. */
import { fetchMetars, fetchOfp } from '../core/api.js';
import { fastTap } from '../core/touch.js';

export function initOfpView({ frameHost, metarHost, metarRefreshBtn, ofpRefreshBtn }) {
    let ofp = null;          // { pdf_url, metars, origin_icao, destination_icao }
    let loading = null;

    function renderMetars(metars) {
        if (!metarHost) return;
        metarHost.innerHTML = '';
        ['origin', 'destination'].forEach((k) => {
            if (!metars || !metars[k]) return;
            const div = document.createElement('div');
            div.textContent = metars[k];
            metarHost.appendChild(div);
        });
    }

    function renderOfp() {
        if (!frameHost) return;
        frameHost.innerHTML = '';
        if (!ofp || !ofp.pdf_url) {
            frameHost.textContent = 'OFP not available';
            return;
        }
        const obj = document.createElement('object');
        obj.className = 'ofp-frame';
        obj.type = 'application/pdf';
        obj.setAttribute('data', ofp.pdf_url);
        frameHost.appendChild(obj);
        renderMetars(ofp.metars);
    }

    function load(force = false) {
        if (loading && !force) return loading;
        loading = fetchOfp()
            .then((data) => { ofp = data && !data.error ? data : null; })
            .catch(() => { ofp = null; });
        return loading;
    }

    async function show() {
        await load();
        renderOfp();
    }

    [metarRefreshBtn, ofpRefreshBtn].forEach((b) => b && fastTap(b));
    if (ofpRefreshBtn) {
        ofpRefreshBtn.addEventListener('click', async () => {
            ofpRefreshBtn.disabled = true;
            await load(true);
            renderOfp();
            ofpRefreshBtn.disabled = false;
        });
    }
    if (metarRefreshBtn) {
        metarRefreshBtn.addEventListener('click', async () => {
            if (!ofp || (!ofp.origin_icao && !ofp.destination_icao)) return;
            metarRefreshBtn.disabled = true;
            try {
                const res = await fetchMetars(ofp.origin_icao, ofp.destination_icao);
                if (res && res.metars) {
                    ofp.metars = res.metars;
                    renderMetars(res.metars);
                }
            } finally {
                metarRefreshBtn.disabled = false;
            }
        });
    }

    load();
    return { show };
}
