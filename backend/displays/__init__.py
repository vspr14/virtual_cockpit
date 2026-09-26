"""Cockpit display streaming: MSFS pop-out windows -> JPEG frames -> the website's Displays tab.

An aircraft opts in with aircraft/<id>/displays.json:
  {"source": "popout",
   "displays": [{"id": "pfd", "label": "PFD", "name": "Captain PFD", "aspect": 1.0}, ...],
   "default": ["pfd", "nd"],
   "layout": {"cols": 3, "rows": 2, "cells": {"pfd": [0, 0], ...}}}   (optional AUTO layout preset, page side only)
Each display is assigned to one pop-out window of the sim (Displays tab -> Setup). Assignments are kept in
DISPLAY_STATE_FILE so they survive server restarts; if the window handle is gone (new sim session) a window at the
position it first appeared at, or already sitting in the display's dock slot, is picked up again.

With the dock (a virtual monitor, see dock.py) assigned pop-outs are moved onto it, out of sight, and captured
together; without it each window is captured on its own (Windows Graphics Capture, capture.py).
Capture is lazy and shared: nothing is captured unless someone watches, and every viewer of the same display and size
gets the same encoded JPEG.
"""
import json
import logging
import os
import threading
import time

import cv2

from backend import aircraft, settings
from backend.displays import dock, winenum
from backend.displays.capture import WindowCapture

log = logging.getLogger(__name__)
IDLE_STOP_S = 15.0
REMATCH_EVERY_S = 2.0
PLACE_EVERY_S = 2.0
STALE_AFTER_S = 3.0
WATCH_EVERY_S = 2.0

_lock = threading.RLock()
_captures = {}        # hwnd -> WindowCapture (windows not on the dock, and setup thumbnails)
_jpeg_cache = {}      # (hwnd, width, quality) -> (seq, bytes, width, height)
_assignments = None   # {aircraft_id: {display_id: {"hwnd", "bounds", "title"}}}
_rematch_at = {}
_placed_at = {}       # hwnd -> last placement check
_stats = {'encodes': 0, 'encode_s': 0.0, 'bytes': 0}
_reaper = None
_watcher = None
_new_frame = threading.Condition()


def _notify_frame():
    with _new_frame:
        _new_frame.notify_all()


def wait_frame(timeout):
    """Block until any capture has a new frame (or timeout), so streams send as soon as pixels change."""
    with _new_frame:
        _new_frame.wait(timeout)


# ---------- config ----------

def config(aircraft_id):
    meta = aircraft.get(aircraft_id)
    return (meta or {}).get('displays')


def display_def(aircraft_id, display_id):
    cfg = config(aircraft_id) or {}
    return next((d for d in cfg.get('displays', []) if d['id'] == display_id), None)


def _slot(aircraft_id, display_id, the_dock):
    return dock.slots((config(aircraft_id) or {}).get('displays', []), the_dock).get(display_id)


# ---------- assignments ----------

def _load():
    global _assignments
    if _assignments is None:
        try:
            with open(settings.DISPLAY_STATE_FILE, encoding='utf-8') as fh:
                _assignments = json.load(fh)
        except (OSError, ValueError):
            _assignments = {}
    return _assignments


def _save():
    os.makedirs(os.path.dirname(settings.DISPLAY_STATE_FILE), exist_ok=True)
    tmp = settings.DISPLAY_STATE_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(_assignments, fh, indent=2)
    os.replace(tmp, settings.DISPLAY_STATE_FILE)


def _is_source(hwnd):
    return winenum.is_window(hwnd) and winenum.process_exe(winenum.window_pid(hwnd)) in settings.DISPLAY_PROCESSES


def _is_main_window(hwnd):
    main = winenum.main_window(settings.DISPLAY_PROCESSES)
    return bool(main) and main['hwnd'] == hwnd


def assign(aircraft_id, display_id, hwnd):
    """Bind a display to a window (hwnd None = unassign). A window serves one display per aircraft.
    With the dock, the window moves into the display's slot at once; an unassigned one comes back to the desktop."""
    with _lock:
        state = _load().setdefault(aircraft_id, {})
        the_dock = dock.find()
        if hwnd is None:
            old = state.pop(display_id, None)
            if old and _is_source(old['hwnd']) and dock.on_dock(old['hwnd'], the_dock):
                dock.release(old['hwnd'])
        else:
            if not _is_source(hwnd):
                raise ValueError('not_a_sim_window')
            if _is_main_window(hwnd):
                raise ValueError('main_sim_window')
            for other, a in list(state.items()):
                if other != display_id and a.get('hwnd') == hwnd:
                    state.pop(other)
            wi = winenum.info(hwnd)
            prev = state.get(display_id)
            bounds = prev['bounds'] if prev and prev.get('hwnd') == hwnd else wi['bounds']
            if dock.on_dock(hwnd, the_dock) and prev:   # already docked: keep where it first appeared
                bounds = prev.get('bounds', bounds)
            state[display_id] = {'hwnd': int(hwnd), 'bounds': bounds, 'title': wi['title']}
            _placed_at.pop(int(hwnd), None)
        _save()
    if hwnd is not None:
        _ensure_placed(aircraft_id, display_id, hwnd, force=True)


def _ensure_placed(aircraft_id, display_id, hwnd, force=False):
    """Keep an assigned window in its dock slot (MSFS may resize a pop-out, the dock may have moved)."""
    now = time.time()
    if not force and now - _placed_at.get(hwnd, 0) < PLACE_EVERY_S:
        return
    _placed_at[hwnd] = now
    the_dock = dock.find()
    slot = _slot(aircraft_id, display_id, the_dock)
    if slot is None:
        return
    try:
        dock.place(hwnd, slot)
    except OSError as err:
        log.warning('displays: could not dock window %s: %s', hwnd, err)


def resolve(aircraft_id, display_id):
    """Window handle currently serving the display, or None. Docks it when a dock exists."""
    with _lock:
        state = _load().get(aircraft_id, {})
        a = state.get(display_id)
        if not a:
            return None
        if _is_source(a['hwnd']):
            hwnd = a['hwnd']
        else:
            hwnd = _rematch(aircraft_id, display_id, state, a)
    if hwnd is not None:
        _ensure_placed(aircraft_id, display_id, hwnd)
    return hwnd


def _rematch(aircraft_id, display_id, state, a):
    now = time.time()
    if now - _rematch_at.get((aircraft_id, display_id), 0) < REMATCH_EVERY_S:
        return None
    _rematch_at[(aircraft_id, display_id)] = now
    taken = {x['hwnd'] for d, x in state.items() if d != display_id and _is_source(x['hwnd'])}
    found = winenum.list_windows(settings.DISPLAY_PROCESSES)
    main = winenum.main_window(settings.DISPLAY_PROCESSES, found)
    wins = [w for w in found if w['hwnd'] not in taken and w is not main]
    slot = _slot(aircraft_id, display_id, dock.find())
    in_slot = [w for w in wins if slot and tuple(w['client'][:2]) == slot[:2]]
    same = in_slot or [w for w in wins if w['bounds'] == a['bounds']]
    if len(same) != 1:
        return None
    a['hwnd'] = same[0]['hwnd']
    a['title'] = same[0]['title']
    _save()
    log.info('displays: %s/%s re-attached to window %s', aircraft_id, display_id, a['hwnd'])
    return a['hwnd']


def windows(aircraft_id):
    """Sim windows that can be assigned, with the display each one serves for this aircraft."""
    state = _load().get(aircraft_id, {})
    by_hwnd = {a['hwnd']: d for d, a in state.items()}
    the_dock = dock.find()
    out = winenum.list_windows(settings.DISPLAY_PROCESSES)
    main = winenum.main_window(settings.DISPLAY_PROCESSES, out)
    for w in out:
        w['display'] = by_hwnd.get(w['hwnd'])
        w['docked'] = dock.on_dock(w['hwnd'], the_dock)
        w['main'] = w is main
    return out


def dock_info():
    d = dock.find()
    return {'present': d is not None, 'enabled': settings.DISPLAY_DOCK,
            'rect': list(d['rect']) if d else None, 'device': d['device'] if d else None}


# ---------- capture ----------

def _window_capture(hwnd):
    with _lock:
        cap = _captures.get(hwnd)
        if cap is None or cap.closed:
            if cap is not None:
                cap.stop()
            cap = WindowCapture(hwnd, max_fps=settings.DISPLAY_CAPTURE_FPS, on_frame=_notify_frame).start()
            _captures[hwnd] = cap
            _ensure_reaper()
        return cap


def _source(hwnd):
    """(seq, image, frame_at, alive_at, error) of a window: cropped from the dock if it's docked, else captured."""
    the_dock = dock.find()
    if dock.on_dock(hwnd, the_dock):
        cap = dock.capture(the_dock, settings.DISPLAY_CAPTURE_FPS, _notify_frame)
        seq, img, at = cap.latest(hwnd)
        return seq, img, at, cap.alive_at, cap.error
    cap = _window_capture(hwnd)
    seq, img, at = cap.latest()
    return seq, img, at, at, cap.error


def _ensure_reaper():
    global _reaper
    if _reaper is not None:
        return

    def loop():
        while True:
            time.sleep(5)
            now = time.time()
            with _lock:
                for hwnd, cap in list(_captures.items()):
                    if cap.closed or now - cap.last_used > IDLE_STOP_S:
                        cap.stop()
                        _captures.pop(hwnd, None)
                for key in list(_jpeg_cache):
                    if _jpeg_cache[key][4] < now - IDLE_STOP_S or not winenum.is_window(key[0]):
                        _jpeg_cache.pop(key, None)

    _reaper = threading.Thread(target=loop, name='display-capture-reaper', daemon=True)
    _reaper.start()


def encode(img, width, quality):
    h, w = img.shape[:2]
    if width and width < w:
        img = cv2.resize(img, (int(width), max(1, round(h * width / w))), interpolation=cv2.INTER_AREA)
    ok, jpg = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    return jpg.tobytes() if ok else None, img.shape[1], img.shape[0]


def frame(aircraft_id, display_id, width=None, quality=80):
    """Newest frame as (seq, jpeg, w, h), or None when there is no picture. Encoded once per size."""
    d = display_def(aircraft_id, display_id)
    hwnd = resolve(aircraft_id, display_id) if d else None
    if hwnd is None:
        return None
    seq, img, _, _, _ = _source(hwnd)
    if img is None:
        return None
    width = int(width) if width else None
    key = (hwnd, width, int(quality))
    with _lock:
        hit = _jpeg_cache.get(key)
        if hit and hit[0] == seq and hit[5] is img:
            return hit[:4]
    t = time.perf_counter()
    jpg, w, h = encode(img, width, quality)
    if jpg is None:
        return None
    with _lock:
        _stats['encodes'] += 1
        _stats['encode_s'] += time.perf_counter() - t
        _stats['bytes'] += len(jpg)
        _jpeg_cache[key] = (seq, jpg, w, h, time.time(), img)
        _ensure_reaper()
    return seq, jpg, w, h


def status(aircraft_id):
    """{display_id: {'state': unassigned|missing|minimized|idle|starting|stale|live, 'docked': bool}}"""
    cfg = config(aircraft_id) or {}
    now = time.time()
    the_dock = dock.find()
    out = {}
    for d in cfg.get('displays', []):
        assigned = _load().get(aircraft_id, {}).get(d['id'])
        hwnd = resolve(aircraft_id, d['id'])
        if not assigned:
            out[d['id']] = {'state': 'unassigned'}
            continue
        if hwnd is None:
            out[d['id']] = {'state': 'missing'}
            continue
        if winenum.is_minimized(hwnd):
            out[d['id']] = {'state': 'minimized'}
            continue
        docked = dock.on_dock(hwnd, the_dock)
        if docked:
            cap = dock.current_capture()
            at = cap.frame_at(hwnd) if cap and not cap.closed else 0.0
            alive, error = (cap.alive_at, cap.error) if cap and not cap.closed else (0.0, None)
        else:
            cap = _captures.get(hwnd)
            at = alive = cap.frame_at if cap else 0.0
            error = cap.error if cap else None
        if not at:
            state = 'starting' if cap and not error else 'idle'
        elif now - alive > STALE_AFTER_S:   # a docked screen that doesn't change sends no frames: still live
            state = 'stale'
        else:
            state = 'live'
        out[d['id']] = {'state': state, 'docked': docked, 'error': error}
    return out


def thumbnail(hwnd, width=320):
    """Small JPEG of any sim window (for the setup screen)."""
    if not _is_source(hwnd):
        return None
    deadline = time.time() + 1.5
    while time.time() < deadline:
        _, img, _, _, _ = _source(hwnd)
        if img is not None:
            return encode(img, width, 70)[0]
        time.sleep(0.05)
    return None


def stats():
    with _lock:
        n = _stats['encodes']
        dc = dock.current_capture()
        return {
            'pid': os.getpid(), 'cpu_s': time.process_time(), 'captures': len(_captures),
            'capture_frames': sum(c.frames for c in _captures.values()) + (dc.frames if dc else 0),
            'dock': dock_info(), 'dock_frames': dc.frames if dc else 0,
            'encodes': n, 'encode_ms_avg': round(1000 * _stats['encode_s'] / n, 3) if n else None,
            'bytes_encoded': _stats['bytes'],
        }


# ---------- background: dock pop-outs as soon as they're recognised ----------

def start_watcher():
    """Every few seconds, re-attach and dock the assigned pop-outs of every aircraft, so they leave the desktop
    right after being popped out, even with no viewer connected. Cheap: one EnumWindows when something is missing."""
    global _watcher
    if _watcher is not None or not settings.DISPLAY_DOCK:
        return

    def loop():
        while True:
            time.sleep(WATCH_EVERY_S)
            try:
                if dock.find() is None:
                    continue
                for aircraft_id in list(_load()):
                    if config(aircraft_id):
                        for display_id in list(_load().get(aircraft_id, {})):
                            resolve(aircraft_id, display_id)
            except Exception:   # never let the watcher die
                log.exception('displays: watcher')

    _watcher = threading.Thread(target=loop, name='display-dock-watcher', daemon=True)
    _watcher.start()
