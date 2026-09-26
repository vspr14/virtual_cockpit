/* ChasePlane view sync page (templates/chaseplane.html). Shows, per aircraft family, which view each camera
   button opens in every ChasePlane profile, and applies / captures / restores through /api/chaseplane. */
import { chaseplaneAction, chaseplaneStatus } from '../core/api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const GLOBAL_STATUS = {
    ok: ['ok', 'bound'],
    old_device: ['warn', 'bound to an old vJoy id: rebind it once in ChasePlane (Controls) by pressing the button'],
    unbound: ['warn', 'not bound: bind it once in ChasePlane (Controls) by pressing the button'],
    unknown: ['warn', "couldn't read ChasePlane's settings"],
};

function profileState(p) {
    if (p.problems && p.problems.length) return ['bad', 'Skipped: ' + p.problems.join('; ')];
    if (p.in_sync) return ['ok', 'In sync'];
    const n = (p.changes || []).length;
    if (p.loaded) return ['wait', `${n} change(s) waiting — loaded in MSFS`];
    return ['todo', `${n} change(s) to apply`];
}

function render(section, s) {
    const body = section.querySelector('.cp-body');
    const applyBtn = section.querySelector('[data-action="apply"]');
    if (s.error && !s.profiles) {
        body.innerHTML = `<p class="cp-bad">${esc(s.error)}</p>`;
        applyBtn.disabled = true;
        return;
    }
    const pending = s.profiles.filter((p) => !p.in_sync && !p.loaded && !(p.problems || []).length);
    applyBtn.disabled = !pending.length || !s.sim.writable || !s.device;
    applyBtn.textContent = pending.length ? `Apply to ${pending.length} profile${pending.length > 1 ? 's' : ''}` : 'Apply';

    const facts = [
        `<li><b>MSFS</b> ${esc(s.sim.message)}${s.sim.loaded_cfg ? ' · ' + esc(s.sim.loaded_cfg) : ''}</li>`,
        s.device
            ? `<li><b>vJoy</b> ${esc(s.device.name)} <span class="cp-dim">(${esc(s.device.id.slice(-12))}, from ${esc(s.device.source)})</span></li>`
            : '<li class="cp-bad"><b>vJoy</b> no vJoy binding found in any ChasePlane profile: bind one view to a website button once, then refresh</li>',
        ...s.global.map((g) => {
            const [cls, text] = GLOBAL_STATUS[g.status] || GLOBAL_STATUS.unknown;
            return `<li class="cp-${cls}"><b>${esc(g.label)}</b> (vJoy ${g.button}, ChasePlane action ${esc(g.action)}): ${esc(text)}</li>`;
        }),
    ];
    if (!s.root_exists) facts.push(`<li class="cp-bad">ChasePlane folder not found: ${esc(s.root)}</li>`);

    const managed = s.cameras.filter((c) => c.managed);
    const unmanaged = s.cameras.filter((c) => !c.managed && !s.global.some((g) => g.label === c.label));
    const head = s.profiles.map((p) => {
        const [cls, text] = profileState(p);
        return `<th>
            <div class="cp-profile">${esc(p.readable)}</div>
            <div class="cp-state cp-${cls}">${esc(text)}</div>
            <button type="button" class="cp-link" data-capture="${esc(p.folder)}">Use as reference</button>
        </th>`;
    }).join('');
    const rows = managed.map((c) => {
        const cells = s.profiles.map((p) => {
            const v = (p.cameras || {})[String(c.id)];
            if (!v) return '<td class="cp-dim">–</td>';
            if (!v.changed) return `<td>${esc(v.now || v.after)}</td>`;
            const label = v.new ? `new view “${esc(v.after)}”`
                : !v.now ? `bind your “${esc(v.after)}”`
                : v.now === v.after ? `${esc(v.now)} (updated)` : `${esc(v.now)} <span class="cp-arrow">→</span> ${esc(v.after)}`;
            return `<td class="cp-change">${label}</td>`;
        }).join('');
        const src = c.source ? `<div class="cp-dim">${esc(c.source.view)} · ${esc(c.source.profile)}</div>` : '';
        return `<tr><th scope="row">${esc(c.label)} <span class="cp-dim">vJoy ${c.button}</span>${src}</th>${cells}</tr>`;
    }).join('');

    const backups = s.backups || [];
    body.innerHTML = `
        <ul class="cp-facts">${facts.join('')}</ul>
        ${s.profiles.length ? `
        <div class="cp-table-wrap"><table class="cp-table">
            <thead><tr><th>Button · reference view</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
        </table></div>` : '<p class="cp-dim">No ChasePlane profile matches this aircraft yet. Load it in MSFS once.</p>'}
        ${unmanaged.length ? `<p class="cp-dim">Not synced (no reference view): ${unmanaged.map((c) => esc(c.label)).join(', ')}</p>` : ''}
        ${backups.length ? `
        <div class="cp-restore">
            <select aria-label="Backup to restore">${backups.map((b) =>
                `<option value="${esc(b.id)}|${esc(b.folder)}">${esc(b.id)} · ${esc(b.folder)}</option>`).join('')}</select>
            <button type="button" class="cp-btn" data-action="restore">Restore backup</button>
        </div>` : ''}`;
}

function initSection(section) {
    const id = section.dataset.aircraft;
    const msg = section.querySelector('.cp-message');
    let last = null;
    let busy = false;

    const say = (text, cls = '') => { msg.className = 'cp-message ' + (cls ? 'cp-' + cls : ''); msg.textContent = text; };

    async function refresh() {
        section.querySelector('.cp-body').classList.add('cp-loading');
        try {
            last = await chaseplaneStatus(id);
            render(section, last);
        } finally {
            section.querySelector('.cp-body').classList.remove('cp-loading');
        }
    }

    async function run(label, action, payload, confirmText) {
        if (busy || !window.confirm(confirmText)) return;
        busy = true;
        say(label + '…');
        try {
            const res = await chaseplaneAction(id, action, payload);
            if (res.error) {
                say(`${res.error}${res.message ? ': ' + res.message : ''}`, 'bad');
            } else if (action === 'apply') {
                say(res.profiles.map((p) => `${p.folder}: ${p.result || p.skipped}`).join(' · '), 'ok');
            } else if (action === 'capture') {
                say(`Reference now taken from ${res.from}: ${res.captured.join(', ')}. Apply to copy it to the other profiles.`, 'ok');
            } else {
                say(`Restored ${res.folder} to ${res.restored} (the replaced state is backup ${res.backup_of_previous}).`, 'ok');
            }
        } finally {
            busy = false;
            await refresh();
        }
    }

    section.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !last) return;
        if (btn.dataset.action === 'refresh') { say(''); refresh(); }
        if (btn.dataset.action === 'apply') {
            const n = last.profiles.filter((p) => !p.in_sync && !p.loaded).reduce((t, p) => t + p.changes.length, 0);
            run('Applying', 'apply', {}, `Write ${n} view file(s) into ChasePlane? Every changed profile is backed up first.`);
        }
        if (btn.dataset.capture) {
            run('Capturing', 'capture', { profile: btn.dataset.capture },
                `Use the views bound to the website buttons in ${btn.dataset.capture} as the reference for every ${last.name} profile? (Only reads ChasePlane; nothing is written there until you Apply.)`);
        }
        if (btn.dataset.action === 'restore') {
            const [backup, profile] = section.querySelector('.cp-restore select').value.split('|');
            run('Restoring', 'restore', { backup, profile },
                `Put ${profile} back to backup ${backup}? Its current state is backed up first.`);
        }
    });
    refresh();
}

document.querySelectorAll('.cp-aircraft').forEach(initSection);
