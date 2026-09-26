"""ChasePlane profile files on disk: read profiles, write view files atomically, back up and restore.

Layout (one folder per aircraft preset, named after the preset folder in lower case):
  <CHASEPLANE_DIR>/<folder>/metadata.txt           line 1 = path of the preset's aircraft.cfg
  <CHASEPLANE_DIR>/<folder>/onboard/<guid>.json     cockpit/cabin views (mode 0)
  <CHASEPLANE_DIR>/<folder>/outside/<guid>.json     exterior views (mode 1)
Nothing here decides what to change; see sync.py.
"""
import json
import os
import re
import shutil
import time

MODE_DIRS = {0: 'onboard', 1: 'outside'}
_BACKUP_ID = re.compile(r'^\d{8}-\d{6}(-\d+)?$')


def norm_path(path):
    """Compare aircraft.cfg paths case-insensitively with forward slashes."""
    return (path or '').strip().replace('\\', '/').lower()


def read_profile(root, folder):
    pdir = os.path.join(root, folder)
    cfg_path = ''
    meta = os.path.join(pdir, 'metadata.txt')
    if os.path.isfile(meta):
        with open(meta, encoding='utf-8', errors='replace') as fh:
            cfg_path = fh.readline().strip()
    views = []
    for mode, sub in MODE_DIRS.items():
        vdir = os.path.join(pdir, sub)
        if not os.path.isdir(vdir):
            continue
        for name in sorted(os.listdir(vdir)):
            if not name.lower().endswith('.json'):
                continue
            path = os.path.join(vdir, name)
            try:
                with open(path, encoding='utf-8-sig') as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                views.append({'file': path, 'error': 'unreadable'})
                continue
            if not isinstance(data, dict):
                views.append({'file': path, 'error': 'unreadable'})
                continue
            views.append({'file': path, 'dir_mode': mode, 'data': data})
    return {'folder': folder, 'dir': pdir, 'cfg_path': cfg_path, 'views': views}


def read_profiles(root):
    if not os.path.isdir(root):
        return []
    return [read_profile(root, name) for name in sorted(os.listdir(root))
            if os.path.isdir(os.path.join(root, name))]


def dump_view(data):
    """Same format ChasePlane writes today: compact JSON, UTF-8, no trailing newline."""
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


def write_view(path, data):
    """Write through a temp file that ChasePlane ignores (not *.json), then swap it in."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.vc-tmp'
    with open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(dump_view(data))
    os.replace(tmp, path)


# ---------- backups ----------

def backup(backup_root, profile_dir, folder):
    """Copy a whole profile folder to <backup_root>/<timestamp>/<folder>. Returns the backup id."""
    stamp = time.strftime('%Y%m%d-%H%M%S')
    backup_id, n = stamp, 1
    while os.path.exists(os.path.join(backup_root, backup_id, folder)):
        n += 1
        backup_id = f'{stamp}-{n}'
    dest = os.path.join(backup_root, backup_id, folder)
    if os.path.isdir(profile_dir):
        shutil.copytree(profile_dir, dest)
    else:
        os.makedirs(dest)
    return backup_id


def list_backups(backup_root, folders=None):
    """Newest first: [{'id': '20260925-141500', 'folder': 'fnx_320_iae_sl'}, ...]."""
    out = []
    if not os.path.isdir(backup_root):
        return out
    for backup_id in sorted(os.listdir(backup_root), reverse=True):
        bdir = os.path.join(backup_root, backup_id)
        if not _BACKUP_ID.match(backup_id) or not os.path.isdir(bdir):
            continue
        for folder in sorted(os.listdir(bdir)):
            if folders is None or folder in folders:
                out.append({'id': backup_id, 'folder': folder})
    return out


def restore(backup_root, root, backup_id, folder):
    """Put a backed-up profile back: replaces the view files and metadata.txt, nothing else."""
    if not _BACKUP_ID.match(backup_id or '') or os.sep in folder or '/' in folder or folder in ('', '.', '..'):
        raise ValueError('bad_backup')
    src = os.path.join(backup_root, backup_id, folder)
    if not os.path.isdir(src):
        raise FileNotFoundError('backup_not_found')
    dst = os.path.join(root, folder)
    for sub in MODE_DIRS.values():
        ddir = os.path.join(dst, sub)
        if os.path.isdir(ddir):
            for name in os.listdir(ddir):
                if name.lower().endswith('.json'):
                    os.remove(os.path.join(ddir, name))
        sdir = os.path.join(src, sub)
        if os.path.isdir(sdir):
            os.makedirs(ddir, exist_ok=True)
            for name in os.listdir(sdir):
                if name.lower().endswith('.json'):
                    shutil.copy2(os.path.join(sdir, name), os.path.join(ddir, name))
    meta = os.path.join(src, 'metadata.txt')
    if os.path.isfile(meta):
        shutil.copy2(meta, os.path.join(dst, 'metadata.txt'))
