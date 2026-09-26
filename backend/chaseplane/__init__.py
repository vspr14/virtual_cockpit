"""ChasePlane camera-view sync: one view set per aircraft family, bound to the website's vJoy buttons.

ChasePlane keeps a separate profile per aircraft preset (Fenix CFM/IAE x SL/WF are four profiles), so camera
buttons would otherwise have to be mapped again for every variant. This package writes the website's views and
vJoy bindings into every matching profile (rules in sync.py, file handling in store.py).

Safety:
  - the profile of the aircraft loaded in MSFS is never written (ChasePlane holds it in memory);
    if the sim is running but cannot be asked, nothing is written at all
  - every profile folder is backed up before it is changed; restore() puts a backup back
  - profiles in a view format this code doesn't know are skipped
"""
import json
import logging
import os
import subprocess
import threading

from backend import aircraft, settings
from backend.chaseplane import store, sync
from backend.paths import AIRCRAFT_DIR

log = logging.getLogger(__name__)
_lock = threading.Lock()
SIM_PROCESSES = ('flightsimulator2024.exe', 'flightsimulator.exe')


def configured_aircraft():
    return [a for a in aircraft.all_aircraft() if a.get('chaseplane')]


def _sim_running():
    try:
        out = subprocess.run(['tasklist', '/FO', 'CSV', '/NH'], capture_output=True, text=True, timeout=5,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.lower()
    except (OSError, subprocess.SubprocessError):
        return None
    return any(f'"{name}"' in out for name in SIM_PROCESSES)


def sim_state():
    """{'writable': bool, 'loaded_cfg': str|None, 'message': str}"""
    from backend.sim import simstate
    res = simstate.loaded_aircraft_cfg()
    if 'path' in res:
        return {'writable': True, 'loaded_cfg': res['path'], 'message': 'MSFS connected'}
    running = _sim_running()
    if running is False:
        return {'writable': True, 'loaded_cfg': None, 'message': 'MSFS not running'}
    return {'writable': False, 'loaded_cfg': None,
            'message': 'MSFS is running but not answering yet; try again in a moment'}


def _is_loaded(profile, state):
    loaded = store.norm_path(state.get('loaded_cfg'))
    if not loaded:
        return False
    if profile['cfg_path']:
        return store.norm_path(profile['cfg_path']) == loaded
    parts = loaded.split('/')
    if len(parts) >= 3 and parts[-2] == 'config':
        return parts[-3] == profile['folder'].lower()
    return len(parts) >= 2 and parts[-2] == profile['folder'].lower()


def _context(root=None):
    root = root or settings.CHASEPLANE_DIR
    profiles = store.read_profiles(root)
    device = sync.detect_vjoy_device(profiles, settings.CHASEPLANE_VJOY)
    return root, profiles, device


def _global_bindings(root, cfg, meta, device):
    """Read-only check of buttons bound to ChasePlane actions (e.g. EXT = toggle inside/outside)."""
    out = []
    path = os.path.join(os.path.dirname(root), 'user_settings.json')
    try:
        with open(path, encoding='utf-8-sig') as fh:
            mappings = json.load(fh).get('control_mappings', '')
    except (OSError, ValueError):
        mappings = None
    cams = meta['cameras_by_id']
    for cam_id, action in (cfg.get('global_cameras') or {}).items():
        cam = cams.get(int(cam_id))
        if cam is None:
            continue
        button = int(cam['vjoy_button'])
        status = 'unknown' if mappings is None else 'unbound'
        for line in (mappings or '').splitlines():
            name, _, binds = line.partition('&')
            if name != action or sync.vjoy_button(binds) != button:
                continue
            b = sync.parse_binding(binds)
            if device and b['device_id'] == device['id']:
                status = 'ok'
                break
            status = 'old_device'
        out.append({'label': cam['label'], 'button': button, 'action': action, 'status': status})
    return out


def status(aircraft_id, state=None):
    meta = aircraft.get(aircraft_id)
    cfg = (meta or {}).get('chaseplane')
    if not cfg:
        return {'error': 'no_chaseplane_config'}
    root, profiles, device = _context()
    state = state or sim_state()
    result = {
        'aircraft': aircraft_id, 'name': meta['name'], 'root': root, 'root_exists': os.path.isdir(root),
        'device': device, 'sim': state, 'autosync': settings.CHASEPLANE_AUTOSYNC,
        'cameras': [{'id': c['id'], 'label': c['label'], 'button': c['vjoy_button'],
                     'managed': str(c['id']) in (cfg.get('views') or {})
                     and str(c['id']) not in {str(k) for k in cfg.get('global_cameras') or {}},
                     'source': ((cfg.get('views') or {}).get(str(c['id'])) or {}).get('source')}
                    for c in meta['cameras']],
        'global': _global_bindings(root, cfg, meta, device),
        'profiles': [],
    }
    if device is None:
        result['error'] = 'no_vjoy_device'
    for p in profiles:
        if not sync.matches(cfg, p):
            continue
        entry = {'folder': p['folder'], 'readable': sync.readable_name(p), 'loaded': _is_loaded(p, state),
                 'views': len(p['views'])}
        if device is not None:
            plan = sync.plan_profile(aircraft_id, meta, cfg, p, device)
            entry.update(cameras=plan['cameras'], problems=plan['problems'],
                         changes=[{k: c[k] for k in ('action', 'view', 'camera')} for c in plan['changes']])
            entry['in_sync'] = not plan['changes'] and not plan['problems']
        result['profiles'].append(entry)
    result['backups'] = store.list_backups(settings.CHASEPLANE_BACKUP_DIR,
                                           {p['folder'] for p in result['profiles']})[:20]
    return result


def apply(aircraft_id, folders=None, state=None):
    """Write pending changes to the matching profiles (all, or only `folders`) that are not loaded."""
    meta = aircraft.get(aircraft_id)
    cfg = (meta or {}).get('chaseplane')
    if not cfg:
        return {'error': 'no_chaseplane_config'}
    with _lock:
        root, profiles, device = _context()
        if device is None:
            return {'error': 'no_vjoy_device'}
        state = state or sim_state()
        if not state['writable']:
            return {'error': 'sim_state_unknown', 'message': state['message']}
        done = []
        for p in profiles:
            if not sync.matches(cfg, p) or (folders is not None and p['folder'] not in folders):
                continue
            entry = {'folder': p['folder']}
            done.append(entry)
            if _is_loaded(p, state):
                entry['skipped'] = 'loaded in MSFS; apply after switching aircraft or returning to the menu'
                continue
            plan = sync.plan_profile(aircraft_id, meta, cfg, p, device)
            if plan['problems']:
                entry['skipped'] = '; '.join(plan['problems'])
                continue
            if not plan['changes']:
                entry['result'] = 'in sync'
                continue
            entry['backup'] = store.backup(settings.CHASEPLANE_BACKUP_DIR, p['dir'], p['folder'])
            for change in plan['changes']:
                store.write_view(change['file'], change['data'])
            entry['result'] = f"{len(plan['changes'])} file(s) written"
            entry['changes'] = [{k: c[k] for k in ('action', 'view', 'camera')} for c in plan['changes']]
            log.info('chaseplane: %s %s (backup %s)', p['folder'], entry['result'], entry['backup'])
        return {'status': 'ok', 'device': device, 'profiles': done}


def capture(aircraft_id, folder):
    """Make the views bound to the website's buttons in one profile the reference for the whole family
    (edit aircraft/<id>/chaseplane.json). Only reads ChasePlane files."""
    meta = aircraft.get(aircraft_id)
    cfg = (meta or {}).get('chaseplane')
    if not cfg:
        return {'error': 'no_chaseplane_config'}
    root = settings.CHASEPLANE_DIR
    if not os.path.isdir(os.path.join(root, folder)) or folder != os.path.basename(folder):
        return {'error': 'unknown_profile'}
    profile = store.read_profile(root, folder)
    if not sync.matches(cfg, profile):
        return {'error': 'profile_not_in_family'}
    views, captured = sync.capture_reference(meta, cfg, profile)
    if not captured:
        return {'error': 'no_bound_views', 'message': f'No view in {folder} is bound to a website button'}
    cfg['views'] = views
    path = os.path.join(AIRCRAFT_DIR, aircraft_id, 'chaseplane.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    return {'status': 'ok', 'captured': captured, 'from': folder}


def restore(aircraft_id, backup_id, folder, state=None):
    meta = aircraft.get(aircraft_id)
    cfg = (meta or {}).get('chaseplane')
    if not cfg:
        return {'error': 'no_chaseplane_config'}
    with _lock:
        root = settings.CHASEPLANE_DIR
        if not os.path.isdir(os.path.join(root, folder)):
            return {'error': 'unknown_profile'}
        profile = store.read_profile(root, folder)
        if not sync.matches(cfg, profile):
            return {'error': 'profile_not_in_family'}
        state = state or sim_state()
        if not state['writable']:
            return {'error': 'sim_state_unknown', 'message': state['message']}
        if _is_loaded(profile, state):
            return {'error': 'profile_loaded', 'message': 'Switch aircraft or return to the menu first'}
        try:
            safety = store.backup(settings.CHASEPLANE_BACKUP_DIR, profile['dir'], folder)
            store.restore(settings.CHASEPLANE_BACKUP_DIR, root, backup_id, folder)
        except (ValueError, FileNotFoundError) as err:
            return {'error': str(err)}
        return {'status': 'ok', 'restored': backup_id, 'folder': folder, 'backup_of_previous': safety}


def start_autosync(interval_s=30):
    """Background loop: apply pending changes to profiles that are not loaded (VC_CHASEPLANE_AUTOSYNC=1)."""
    def loop():
        import time
        while True:
            try:
                state = sim_state()
                if state['writable']:
                    for meta in configured_aircraft():
                        apply(meta['id'], state=state)
            except Exception:
                log.exception('chaseplane autosync failed')
            time.sleep(interval_s)

    threading.Thread(target=loop, name='chaseplane-autosync', daemon=True).start()
