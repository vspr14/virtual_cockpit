"""Command line for the ChasePlane view sync.

  python -m backend.chaseplane status  [aircraft]              what each matching profile would get (no writes)
  python -m backend.chaseplane apply   [aircraft] [profile ...] write it (backs up first, skips the loaded aircraft)
  python -m backend.chaseplane capture <aircraft> <profile>     use that profile's bound views as the reference
  python -m backend.chaseplane restore <aircraft> <backup> <profile>

VC_CHASEPLANE_DIR points at another copy of ChasePlane's aircraft folder (e.g. for testing).
"""
import json
import sys

from backend import aircraft, chaseplane


def _print_status(s):
    if 'error' in s and 'profiles' not in s:
        print('error:', s['error'])
        return
    dev = s['device']
    print(f"{s['name']}  ({s['root']})")
    print(f"  MSFS: {s['sim']['message']}" + (f": {s['sim']['loaded_cfg']}" if s['sim']['loaded_cfg'] else ''))
    print(f"  vJoy as ChasePlane knows it: {dev['id'] + ' | ' + dev['name'] + '  (from ' + dev['source'] + ')' if dev else 'NOT FOUND'}")
    for g in s['global']:
        print(f"  {g['label']} (vJoy {g['button']}) -> ChasePlane action {g['action']}: {g['status']}")
    for p in s['profiles']:
        flag = 'LOADED ' if p['loaded'] else ''
        state = 'in sync' if p.get('in_sync') else f"{len(p.get('changes', []))} change(s)"
        print(f"\n  [{p['folder']}] {flag}{state}")
        for problem in p.get('problems', []):
            print('    problem:', problem)
        for cam_id, c in (p.get('cameras') or {}).items():
            print(f"    {c['label']:<8} vJoy {c['button']}: {c['now'] or '-'}  ->  {c['after']}")
        for ch in p.get('changes', []):
            print(f"      {ch['action']:<7} {ch['view']}" + (f"  [{ch['camera']}]" if ch['camera'] else ''))
    if s.get('backups'):
        print('\n  backups:', ', '.join(f"{b['id']}/{b['folder']}" for b in s['backups'][:6]))


def main(argv):
    aircraft.load()
    cmd = argv[0] if argv else 'status'
    rest = argv[1:]
    ids = [a['id'] for a in chaseplane.configured_aircraft()]
    if cmd == 'status':
        for aid in (rest[:1] or ids):
            _print_status(chaseplane.status(aid))
    elif cmd == 'apply':
        aid = rest[0] if rest else (ids[0] if len(ids) == 1 else None)
        if aid is None:
            print('which aircraft?', ids)
            return 2
        print(json.dumps(chaseplane.apply(aid, rest[1:] or None), indent=2))
    elif cmd == 'capture' and len(rest) == 2:
        print(json.dumps(chaseplane.capture(*rest), indent=2))
    elif cmd == 'restore' and len(rest) == 3:
        print(json.dumps(chaseplane.restore(*rest), indent=2))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
