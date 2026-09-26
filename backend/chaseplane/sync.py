"""Decide what a ChasePlane profile needs so every website camera button opens the same view.

Pure logic on profiles read by store.py; nothing is written here.

An aircraft opts in with aircraft/<id>/chaseplane.json:
  {
    "match":   ["simobjects/airplanes/fnx_32x/*"],     globs against metadata.txt's aircraft.cfg path or the
                                                      profile folder name: every variant/livery preset that
                                                      matches gets the same view set
    "global_cameras": {"11": "CAM_TOGGLE_IN_OUT"},    buttons bound to a ChasePlane action, not a view
    "views": {"1": {<reference view>}, ...}           camera id (aircraft.json) -> view to show
  }
The vJoy button for each camera comes from aircraft.json, so the website's buttons stay the single source of
truth. Cameras without a reference view (e.g. a custom button) are left alone.

For each managed camera, in each matching profile:
  - the view this app created earlier (fixed guid), else a view already bound to that vJoy button, is updated
    to the reference; otherwise a new view is created;
  - it gets exactly one binding for the button, and every other view in the profile loses that button.
Other views, keyboard keys and other devices are never touched; no view is deleted.
"""
import copy
import fnmatch
import hashlib
import os
import time

from backend.chaseplane.store import MODE_DIRS, norm_path

# Order ChasePlane writes keys in; unknown keys keep their place after these.
KEY_ORDER = (
    'version', 'created_on', 'updated_on', 'mode', 'name', 'index', 'guid', 'guid_community', 'aircraft',
    'aircraft_readable', 'profile_preset', 'profile_physics_type', 'profile_theme', 'can_cinematics',
    'can_smart_view', 'is_tracking', 'is_public', 'is_gimbal', 'skip_cycle', 'position', 'position_frame',
    'anchor_at_save', 'cockpit_anchor_migration_version', 'camera_definition_frame_version', 'shortcuts',
    'can_share',
)
# Per-profile bookkeeping; every other key describes the view itself and is copied from the reference.
IDENTITY_KEYS = {
    'version', 'created_on', 'updated_on', 'name', 'index', 'guid', 'guid_community', 'aircraft',
    'aircraft_readable', 'shortcuts', 'is_public', 'can_share',
}
SUPPORTED_VIEW_VERSION = 1
BUTTON_KIND = '2'


# ---------- bindings ----------

def parse_binding(text):
    """'<device id>|<device name>|<code>|<kind>|<flags>;' (one part) -> dict, else None (combos, junk)."""
    parts = [p for p in (text or '').split(';') if p]
    if len(parts) != 1:
        return None
    fields = parts[0].split('|')
    if len(fields) != 5:
        return None
    return {'device_id': fields[0], 'device_name': fields[1], 'code': fields[2], 'kind': fields[3]}


def vjoy_button(text):
    """Button number of a single vJoy button binding, else None."""
    b = parse_binding(text)
    if not b or b['kind'] != BUTTON_KIND or 'vjoy' not in b['device_name'].lower():
        return None
    try:
        return int(b['code'])
    except ValueError:
        return None


def binding(device, button):
    return f"{device['id']}|{device['name']}|{int(button)}|{BUTTON_KIND}|0;"


def detect_vjoy_device(profiles, override=''):
    """The vJoy device as ChasePlane currently names it: the override setting, else the most recently saved
    vJoy binding in any profile (ChasePlane has recorded vJoy under different ids over time)."""
    if override and '|' in override:
        dev_id, dev_name = override.split('|', 1)
        return {'id': dev_id.strip(), 'name': dev_name.strip(), 'source': 'setting'}
    best = None
    for p in profiles:
        for v in p['views']:
            d = v.get('data')
            if not d:
                continue
            for s in d.get('shortcuts') or []:
                if vjoy_button(s) is None:
                    continue
                b = parse_binding(s)
                stamp = d.get('updated_on') or 0
                if best is None or stamp > best[0]:
                    best = (stamp, b, p['folder'], d.get('name'))
    if best is None:
        return None
    _, b, folder, view = best
    return {'id': b['device_id'], 'name': b['device_name'], 'source': f'{folder} / {view}'}


# ---------- matching ----------

def matches(cfg, profile):
    cfg_path = norm_path(profile['cfg_path'])
    folder = profile['folder'].lower()
    for pattern in cfg.get('match') or []:
        pat = norm_path(pattern)
        if (cfg_path and fnmatch.fnmatchcase(cfg_path, pat)) or fnmatch.fnmatchcase(folder, pat):
            return True
    return False


def managed_cameras(meta, cfg):
    """[(camera, reference view)] for cameras that have both a website button and a reference view."""
    refs = cfg.get('views') or {}
    globals_ = {str(k) for k in (cfg.get('global_cameras') or {})}
    out = []
    for cam in meta.get('cameras', []):
        ref = refs.get(str(cam['id']))
        if ref and str(cam['id']) not in globals_:
            out.append((cam, ref))
    return out


def view_guid(aircraft_id, folder, cam_id):
    """Fixed per profile + camera, so re-running finds the view it made; ChasePlane's guid shape."""
    h = hashlib.sha1(f'virtual-cockpit:{aircraft_id}:{folder}:{cam_id}'.encode()).hexdigest()
    return f'{h[:8]}-0000-0000-{h[8:12]}-{h[12:24]}'


def readable_name(profile):
    for v in profile['views']:
        name = (v.get('data') or {}).get('aircraft_readable')
        if name:
            return name
    return profile['folder'].replace('_', ' ').upper()


# ---------- view building ----------

def _ordered(d):
    out = {k: d[k] for k in KEY_ORDER if k in d}
    out.update((k, v) for k, v in d.items() if k not in out)
    return out


def _content(ref):
    return {k: copy.deepcopy(v) for k, v in ref.items() if k not in IDENTITY_KEYS and k != 'source'}


def _apply_reference(view, ref):
    """Keep the view's identity (name, guid, index, bindings ...), take everything else from the reference."""
    merged = {k: v for k, v in view.items() if k in IDENTITY_KEYS}
    merged.update(_content(ref))
    return _ordered(merged)


def _new_view(ref, guid, name, index, profile, now):
    view = {
        'version': SUPPORTED_VIEW_VERSION, 'created_on': now, 'updated_on': now, 'name': name, 'index': index,
        'guid': guid, 'guid_community': '', 'aircraft': profile['folder'],
        'aircraft_readable': readable_name(profile), 'is_public': False, 'shortcuts': [], 'can_share': True,
    }
    view.update(_content(ref))
    return _ordered(view)


# ---------- plan ----------

def plan_profile(aircraft_id, meta, cfg, profile, device, now=None):
    """What this profile needs. Returns {'folder', 'changes': [...], 'cameras': {...}, 'problems': [...]}
    where each change is {'action': create|update|unbind, 'file', 'view', 'camera', 'data'}."""
    now = int(now if now is not None else time.time())
    result = {'folder': profile['folder'], 'changes': [], 'cameras': {}, 'problems': []}
    for v in profile['views']:
        if 'error' in v:
            result['problems'].append(f"unreadable view file {os.path.basename(v['file'])}")
        elif v['data'].get('version') != SUPPORTED_VIEW_VERSION:
            result['problems'].append(
                f"{os.path.basename(v['file'])}: view format version {v['data'].get('version')} is not supported")
    if result['problems']:
        return result  # never write into a format we don't understand

    views = [v for v in profile['views'] if 'data' in v]
    managed = managed_cameras(meta, cfg)
    buttons = {int(cam['vjoy_button']) for cam, _ in managed}
    current = {}  # button -> name of the view it opens today
    for v in sorted(views, key=lambda v: (v['data'].get('mode', 0), v['data'].get('index', 0))):
        for s in v['data'].get('shortcuts') or []:
            b = vjoy_button(s)
            if b in buttons:
                current.setdefault(b, v['data'].get('name', '').replace('\x7f', ''))

    work = {v['file']: copy.deepcopy(v['data']) for v in views}
    original = {v['file']: v['data'] for v in views}
    next_index = {}
    for d in original.values():
        mode = d.get('mode', 0)
        next_index[mode] = max(next_index.get(mode, 0), int(d.get('index', -1)) + 1)

    def clean(name):
        return (name or '').replace('\x7f', '').strip().lower()

    def by_index(files):
        return sorted(files, key=lambda f: original[f].get('index', 0))

    # Which existing view each camera takes over, in order of certainty: the view this app created (fixed
    # guid), the view already bound to the button, an unbound view named like the camera (e.g. "Left Engine").
    # Every camera's first two are resolved before any name match, so a name match can't steal a bound view.
    chosen = {}
    claimed = set()
    for cam, ref in managed:
        guid = view_guid(aircraft_id, profile['folder'], cam['id'])
        f = next((f for f, d in original.items() if d.get('guid') == guid), None)
        if f is not None and original[f].get('mode', 0) == ref.get('mode', 0):
            chosen[cam['id']] = f
            claimed.add(f)
    for cam, ref in managed:
        if cam['id'] in chosen:
            continue
        button = int(cam['vjoy_button'])
        bound = by_index(f for f, d in original.items()
                         if f not in claimed and d.get('mode', 0) == ref.get('mode', 0)
                         and any(vjoy_button(s) == button for s in d.get('shortcuts') or []))
        if bound:
            chosen[cam['id']] = bound[0]
            claimed.add(bound[0])
    for cam, ref in managed:
        if cam['id'] in chosen:
            continue
        named = by_index(f for f, d in original.items()
                         if f not in claimed and d.get('mode', 0) == ref.get('mode', 0)
                         and clean(d.get('name')) == clean(cam['name'])
                         and not any(vjoy_button(s) in buttons for s in d.get('shortcuts') or []))
        if named:
            chosen[cam['id']] = named[0]
            claimed.add(named[0])

    targets = {}  # file -> (camera, button)
    created = set()
    for cam, ref in managed:
        button = int(cam['vjoy_button'])
        mode = ref.get('mode', 0)
        guid = view_guid(aircraft_id, profile['folder'], cam['id'])
        target = chosen.get(cam['id'])
        if target is None:
            target = os.path.join(profile['dir'], MODE_DIRS[mode], guid + '.json')
            index = next_index.get(mode, 0)
            next_index[mode] = index + 1
            work[target] = _new_view(ref, guid, ref.get('name') or cam['name'], index, profile, now)
            created.add(target)
        else:
            work[target] = _apply_reference(work[target], ref)
        targets[target] = (cam, button)
        result['cameras'][str(cam['id'])] = {
            'label': cam['label'], 'button': button, 'now': current.get(button),
            'after': work[target].get('name', '').replace('\x7f', ''), 'file': target, 'new': target in created,
        }

    # Bindings: each managed button on exactly its target view, removed everywhere else.
    for f, d in work.items():
        keep_button = targets[f][1] if f in targets else None
        mine = binding(device, keep_button) if keep_button is not None else None
        out, have = [], False
        for s in d.get('shortcuts') or []:
            b = vjoy_button(s)
            if b is None or b not in buttons:
                out.append(s)
            elif b == keep_button and not have and parse_binding(s)['device_id'] == device['id']:
                out.append(s)
                have = True
        if mine and not have:
            out.append(mine)
        d['shortcuts'] = out

    for f, d in work.items():
        if f in created:
            action = 'create'
        elif d == original[f]:
            continue
        else:
            action = 'update' if f in targets else 'unbind'
            d['updated_on'] = now
        cam = targets[f][0] if f in targets else None
        result['changes'].append({
            'action': action, 'file': f, 'view': d.get('name', '').replace('\x7f', ''),
            'camera': cam['label'] if cam else None, 'data': d,
        })
    result['changes'].sort(key=lambda c: (c['action'], c['camera'] or '', c['view']))
    changed_files = {c['file'] for c in result['changes']}
    for info in result['cameras'].values():
        info['changed'] = info.pop('file') in changed_files
    return result


def capture_reference(meta, cfg, profile):
    """Reference views taken from the views bound to the website's vJoy buttons in one profile.
    Returns (new views dict, [camera labels captured])."""
    views = dict(cfg.get('views') or {})
    globals_ = {str(k) for k in (cfg.get('global_cameras') or {})}
    captured = []
    ordered = sorted((v for v in profile['views'] if 'data' in v),
                     key=lambda v: (v['data'].get('mode', 0), v['data'].get('index', 0)))
    for cam in meta.get('cameras', []):
        if str(cam['id']) in globals_:
            continue
        button = int(cam['vjoy_button'])
        src = next((v['data'] for v in ordered
                    if any(vjoy_button(s) == button for s in v['data'].get('shortcuts') or [])), None)
        if src is None:
            continue
        ref = {'name': cam['name']}
        ref.update(_content(src))
        ref['source'] = {'profile': profile['folder'], 'view': src.get('name', '').replace('\x7f', ''),
                         'guid': src.get('guid')}
        views[str(cam['id'])] = ref
        captured.append(cam['label'])
    return views, captured
