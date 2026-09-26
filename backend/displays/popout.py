"""Automatic pop-out, done the way MSFS Pop Out Panel Manager does it (hawkeye-stan/msfs-2024-popout-panel-manager,
Orchestration/PanelPopOutOrchestrator.cs + WindowsAgent/InputEmulationManager.cs), then each new pop-out window is
assigned to its display, which moves it onto the dock and streams it to the iPad.

Per screen: ChasePlane jumps to the calibrated view (its camera API, no transition); the sim is brought to the front;
the cursor is put on the screen and clicked once (the sim only takes cockpit input after a click); then Right-Alt +
click, up to 5 tries, until a new pop-out window appears. At the end ChasePlane goes back to its default view.

Calibration per aircraft (DISPLAYS -> SETUP -> Automatic pop-out), kept in DISPLAY_POPOUT_FILE:
  {"view": <ChasePlane view name>, "points": {"pfd": [fx, fy, view?], ...}, "auto": bool}
fx, fy are fractions of the sim window's client area in that view; a point may name its own view.
Auto mode: like PPM, when the camera goes from a loading / Ready to Fly screen to the cockpit (CAMERA STATE) with a
matching aircraft (displays.json "match": aircraft.cfg path globs), after READY_DELAY_S.

Safety: nothing is clicked unless the sim window is in front and the exact point belongs to it; Right-Alt is always
released; the cursor and the previously focused window are put back afterwards.
"""
import fnmatch
import json
import logging
import os
import threading
import time

from backend import aircraft, displays, settings
from backend.displays import winenum
from backend.displays.capture import WindowCapture
from backend.sim import chaseplane_api, simstate

log = logging.getLogger(__name__)
READY_DELAY_S = 4.0       # after the cockpit appears (PPM: 1 s, plus 3 s when ChasePlane is used)
AUTO_POLL_S = 2.0
POPOUT_TRIES = 5          # PPM: 5 tries, 0.5 s apart
NEW_WINDOW_WAIT_S = 0.5

_lock = threading.RLock()
_run_lock = threading.Lock()
_state = None
_status = {}              # aircraft_id -> {'running', 'at', 'reason', 'message', 'results'}
_auto = None


# ---------- calibration ----------

def _load():
    global _state
    if _state is None:
        try:
            with open(settings.DISPLAY_POPOUT_FILE, encoding='utf-8') as fh:
                _state = json.load(fh)
        except (OSError, ValueError):
            _state = {}
    return _state


def _save():
    os.makedirs(os.path.dirname(settings.DISPLAY_POPOUT_FILE), exist_ok=True)
    tmp = settings.DISPLAY_POPOUT_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(_state, fh, indent=2)
    os.replace(tmp, settings.DISPLAY_POPOUT_FILE)


def get(aircraft_id):
    with _lock:
        cal = dict(_load().get(aircraft_id) or {})
        return {'calibration': cal, 'status': dict(_status.get(aircraft_id) or {})}


def save(aircraft_id, data):
    """Store {view, points, auto} (any subset). Points are validated against the aircraft's displays."""
    meta = aircraft.get(aircraft_id) or {}
    known = {d['id'] for d in (meta.get('displays') or {}).get('displays', [])}
    with _lock:
        cal = dict(_load().get(aircraft_id) or {})
        cal.pop('camera', None)            # older calibrations (vJoy camera ids)
        if 'view' in data:
            cal['view'] = str(data['view'] or '') or None
        if 'points' in data:
            pts = {}
            for k, v in (data['points'] or {}).items():
                if k not in known:
                    raise ValueError('unknown_display')
                if v is None:
                    continue
                fx, fy = float(v[0]), float(v[1])
                if not (0 <= fx <= 1 and 0 <= fy <= 1):
                    raise ValueError('bad_point')
                pts[k] = [round(fx, 5), round(fy, 5)]
                if len(v) > 2 and v[2]:
                    pts[k].append(str(v[2]))
            cal['points'] = pts
        if 'auto' in data:
            cal['auto'] = bool(data['auto'])
        _load()[aircraft_id] = cal
        _save()
        return cal


def views():
    """The loaded aircraft's ChasePlane cockpit views."""
    return chaseplane_api.view_names()


# ---------- sim window ----------

def _main():
    return winenum.main_window(settings.DISPLAY_PROCESSES)


def picture(view_name=None, width=1280):
    """JPEG of the sim window's client area in that ChasePlane view, to place the screens on."""
    main = _main()
    if main is None:
        raise RuntimeError('sim_window_not_found')
    if view_name:
        with chaseplane_api.Session() as cp:
            view = cp.view(view_name)
            if view is None:
                raise RuntimeError('view_not_found')
            cp.set_view(view)
        time.sleep(0.5)
    cap = WindowCapture(main['hwnd'], max_fps=5).start()
    try:
        deadline = time.time() + 3.0
        while time.time() < deadline:
            _, img, _ = cap.latest()
            if img is not None:
                return displays.encode(img, width, 75)[0]
            time.sleep(0.05)
    finally:
        cap.stop()
    raise RuntimeError('no_picture')


# ---------- the pop-out sequence (PPM's InputEmulationManager) ----------

def _missing(aircraft_id, points):
    return [d for d in points if displays.resolve(aircraft_id, d) is None]


def _prepare(x, y):
    """PPM PrepareToPopOutPanel: a plain left click on the spot focuses the cockpit, then the cursor is set again."""
    winenum.set_cursor(x, y)
    time.sleep(0.3)
    winenum.mouse_button(True)
    time.sleep(0.2)
    winenum.mouse_button(False)
    time.sleep(0.2)
    winenum.set_cursor(x, y)
    time.sleep(0.5)


def _popout_click(x, y):
    """PPM PopOutPanel: Right-Alt down, 0.5 s, click, Right-Alt up (twice, so it can't stay down)."""
    winenum.set_cursor(x, y)
    winenum.right_alt(True)
    try:
        time.sleep(0.5)
        winenum.mouse_button(True)
        time.sleep(0.2)
        winenum.mouse_button(False)
    finally:
        winenum.right_alt(False)
        time.sleep(0.1)
        winenum.right_alt(False)


def _set(aircraft_id, **kw):
    with _lock:
        st = _status.setdefault(aircraft_id, {})
        st.update(kw)
        st['at'] = time.time()


def run(aircraft_id, reason='manual'):
    """Start the pop-out sequence in the background. Returns False if one is already running."""
    if not _run_lock.acquire(blocking=False):
        return False
    _set(aircraft_id, running=True, reason=reason, message='starting', results={})

    def work():
        try:
            _sequence(aircraft_id)
        except chaseplane_api.ChasePlaneError as err:
            _set(aircraft_id, message=f'ChasePlane: {err}')
        except Exception as err:  # never leave the lock held or the modifier key down
            log.exception('displays: pop-out failed')
            _set(aircraft_id, message=f'error: {err}')
        finally:
            winenum.right_alt(False)
            _set(aircraft_id, running=False)
            _run_lock.release()

    threading.Thread(target=work, name='display-popout', daemon=True).start()
    return True


def _sequence(aircraft_id):
    cal = (_load().get(aircraft_id) or {})
    points = cal.get('points') or {}
    if not points:
        _set(aircraft_id, message='not set up: place the screens in SETUP first')
        return
    todo = _missing(aircraft_id, points)
    if not todo:
        _set(aircraft_id, message='all screens already popped out')
        return
    main = _main()
    if main is None:
        _set(aircraft_id, message='sim window not found')
        return
    hwnd = main['hwnd']
    view_of = lambda d: (points[d][2] if len(points[d]) > 2 else None) or cal.get('view')   # noqa: E731
    todo.sort(key=lambda d: view_of(d) or '')       # one view change per view
    results = {}
    cursor = winenum.cursor_pos()
    previous = winenum.foreground()
    _set(aircraft_id, message='connecting to ChasePlane')
    with chaseplane_api.Session() as cp:
        current = None
        try:
            for display_id in todo:
                name = view_of(display_id)
                if name and name != current:
                    view = cp.view(name)
                    if view is None:
                        results[display_id] = 'view_not_found'
                        continue
                    _set(aircraft_id, message=f'view {name}', results=dict(results))
                    cp.set_view(view)
                    current = name
                if not winenum.bring_to_front(hwnd) and winenum.foreground() != hwnd:
                    _set(aircraft_id, message='could not bring the sim to the front; nothing clicked')
                    return
                time.sleep(0.25)
                cl, ct, cr, cb = winenum.client_bounds(hwnd)
                fx, fy = points[display_id][:2]
                x, y = round(cl + fx * (cr - cl)), round(ct + fy * (cb - ct))
                if winenum.root_at(x, y) != hwnd:
                    results[display_id] = 'covered'      # another window is on top of the sim there
                    continue
                before = {w['hwnd'] for w in winenum.list_windows(settings.DISPLAY_PROCESSES)}
                _set(aircraft_id, message=f'popping out {display_id}', results=dict(results))
                _prepare(x, y)
                new = None
                for _ in range(POPOUT_TRIES):
                    _popout_click(x, y)
                    deadline = time.time() + NEW_WINDOW_WAIT_S
                    while new is None:
                        fresh = [w for w in winenum.list_windows(settings.DISPLAY_PROCESSES)
                                 if w['hwnd'] not in before and w['hwnd'] != hwnd]
                        new = fresh[0]['hwnd'] if fresh else None
                        if time.time() >= deadline:
                            break
                        time.sleep(0.1)
                    if new is not None:
                        break
                if new is None:
                    results[display_id] = 'no_window'
                    continue
                displays.assign(aircraft_id, display_id, new)
                results[display_id] = 'ok'
                log.info('displays: popped out %s/%s -> window %s', aircraft_id, display_id, new)
        finally:
            winenum.right_alt(False)
            try:
                cp.load_default()
            except Exception:
                pass
            if previous and previous != hwnd and winenum.is_window(previous):
                winenum.bring_to_front(previous)
            winenum.set_cursor(*cursor)
    ok = sum(1 for r in results.values() if r == 'ok')
    _set(aircraft_id, results=results, message=f'{ok} of {len(todo)} popped out')


# ---------- automatic, when a flight starts (PPM: camera goes from loading / Ready to Fly to the cockpit) ----------

def _matches(cfg, cfg_path):
    path = (cfg_path or '').replace('\\', '/').lower()
    return any(fnmatch.fnmatchcase(path, p.replace('\\', '/').lower()) for p in (cfg.get('match') or []))


def start_auto():
    """Background loop: pop the screens out once per flight for aircraft with auto mode on."""
    global _auto
    if _auto is not None:
        return

    def loop():
        was_loading = False
        while True:
            time.sleep(AUTO_POLL_S)
            try:
                wanted = [a for a, c in _load().items() if c.get('auto') and c.get('points')]
                if not wanted:
                    continue
                st = simstate.sim_status(1.5)
                if 'error' in st:
                    continue
                cam = st['camera']
                if cam in simstate.CAMERA_LOADING or cam in simstate.CAMERA_MENUS:
                    was_loading = True
                    continue
                if cam != simstate.CAMERA_COCKPIT or not was_loading:
                    continue
                was_loading = False                  # once per flight
                time.sleep(READY_DELAY_S)
                for aircraft_id in wanted:
                    cfg = displays.config(aircraft_id) or {}
                    if _matches(cfg, st['path']) and _missing(aircraft_id, _load()[aircraft_id]['points']):
                        log.info('displays: flight started with %s, popping out screens', aircraft_id)
                        run(aircraft_id, reason='auto')
            except Exception:   # never let the loop die
                log.exception('displays: auto pop-out')

    _auto = threading.Thread(target=loop, name='display-popout-auto', daemon=True)
    _auto.start()
