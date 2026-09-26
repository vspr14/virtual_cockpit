"""The dock: a virtual monitor that holds the sim's pop-out screens out of sight (tools/virtual_display/install.ps1).

Pop-outs assigned to a display are made borderless, sized and moved into that display's slot on the dock. The dock is
captured as one picture (Windows Graphics Capture of the monitor) at the capture rate; each display is a crop of that
picture, and nothing is captured unless someone watches.
"""
import logging
import math
import threading
import time

import numpy as np

from backend import settings
from backend.displays import monitors, winenum
from backend.displays.capture import SESSION_LOCK

try:
    from windows_capture import DxgiDuplicationSession, WindowsCapture
except Exception:  # package missing / not Windows
    DxgiDuplicationSession = WindowsCapture = None

log = logging.getLogger(__name__)
FIND_EVERY_S = 3.0
REGIONS_EVERY_S = 1.0
IDLE_STOP_S = 15.0

_lock = threading.RLock()
_found = (0.0, None)     # (checked_at, dock dict or None)
_arranged = set()        # docks whose size/position this process has set (once: Windows may adjust the layout)
_capture = None


# ---------- the monitor ----------

def find(refresh=False):
    """The dock monitor {'device', 'rect', 'index', ...} or None (driver not installed / monitor switched off)."""
    global _found
    if not settings.DISPLAY_DOCK:
        return None
    with _lock:
        at, dock = _found
        if refresh or time.time() - at > FIND_EVERY_S:
            dock = _locate()
            _found = (time.time(), dock)
        return dock


def _locate():
    try:
        all_displays = monitors.displays()
    except OSError:
        return None
    dock = next((d for d in all_displays if settings.DISPLAY_DOCK_ADAPTER in d['adapter'].lower()), None)
    if dock is None:
        return None
    others = [d['rect'] for d in all_displays if d is not dock]
    w, h = settings.DISPLAY_DOCK_SIZE
    l, t, r, b = dock['rect']
    want_pos = monitors.corner_spot(others, w, h) if others else (l, t)
    if ((r - l, b - t) != (w, h) or (l, t) != want_pos) and dock['device'] not in _arranged:
        _arranged.add(dock['device'])
        offered = {(mw, mh) for mw, mh, _ in monitors.modes(dock['device'])}
        size = (w, h) if (w, h) in offered else None
        if size is None:
            log.warning('displays: dock %s has no %dx%d mode (add it to vdd_settings.xml)', dock['device'], w, h)
        res = monitors.set_mode(dock['device'], size=size, position=want_pos, hz=60 if size else None)
        log.info('displays: dock %s set to %s at %s (result %s)', dock['device'], size, want_pos, res)
        all_displays = monitors.displays()
        dock = next((d for d in all_displays if d['device'] == dock['device']), None)
        if dock is None:
            return None
    try:
        dock['index'] = monitors.monitor_order().index(dock['device']) + 1
        dock['work'] = monitors.work_area(dock['device']) or dock['rect']
    except ValueError:
        return None
    return dock


# ---------- slots ----------

def slots(defs, dock):
    """{display_id: (x, y, w, h)} in screen pixels: the aircraft's displays in a grid on the dock, each as large as
    its cell allows at its aspect ratio."""
    n = len(defs)
    if not n or dock is None:
        return {}
    l, t, r, b = dock.get('work') or dock['rect']   # the taskbar would cover the bottom slots
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    cw, ch = (r - l) // cols, (b - t) // rows
    out = {}
    for i, d in enumerate(defs):
        a = float(d.get('aspect') or 1.0)
        w, h = (cw, round(cw / a)) if cw / a <= ch else (round(ch * a), ch)
        out[d['id']] = (l + (i % cols) * cw, t + (i // cols) * ch, int(w), int(h))
    return out


def on_dock(hwnd, dock):
    if dock is None:
        return False
    cl, ct, cr, cb = winenum.client_bounds(hwnd)
    l, t, r, b = dock['rect']
    return l <= cl < r and t <= ct < b


def place(hwnd, slot):
    """Borderless, out of the taskbar, client area exactly on the slot. Idempotent."""
    x, y, w, h = slot
    if winenum.is_minimized(hwnd):
        winenum.restore(hwnd)
    winenum.make_borderless(hwnd)
    winenum.hide_from_taskbar(hwnd)
    if tuple(winenum.client_bounds(hwnd)) != (x, y, x + w, y + h):
        winenum.set_client_rect(hwnd, x, y, w, h)


def release(hwnd):
    """Give a pop-out back: frame and taskbar button restored, moved to the primary monitor."""
    winenum.restore_frame(hwnd)
    winenum.show_in_taskbar(hwnd)
    primary = next((d for d in monitors.displays() if d['primary']), None)
    x, y = (primary['rect'][0] + 80, primary['rect'][1] + 80) if primary else (80, 80)
    winenum.move(hwnd, x, y)


# ---------- capture ----------

class DockCapture:
    """One capture of the whole dock; crops only the requested windows; runs while frames are asked for.
    method 'wgc' (Windows Graphics Capture of the monitor, frames paced by the OS) or 'dxgi' (desktop duplication;
    measured to stall the sim's pop-out presents badly on the virtual monitor)."""

    def __init__(self, dock, max_fps, on_frame=None, method='wgc'):
        self.device = dock['device']
        self.index = dock['index']
        self.origin = dock['rect'][:2]
        self.max_fps = max_fps
        self.on_frame = on_frame
        self.method = method
        self.closed = False
        self.error = None
        self.frames = 0
        self.alive_at = 0.0
        self._started = time.time()
        self._wanted = {}        # hwnd -> last_used
        self._boxes = {}         # hwnd -> (x0, y0, x1, y1) in dock pixels
        self._boxes_at = 0.0
        self._images = {}        # hwnd -> (seq, image, frame_at)
        self._lock = threading.Lock()
        run = self._run_dxgi if method == 'dxgi' else self._run_wgc
        self._thread = threading.Thread(target=run, name='display-dock-capture', daemon=True)

    def start(self):
        if (DxgiDuplicationSession if self.method == 'dxgi' else WindowsCapture) is None:
            self.error = 'windows-capture not installed'
            self.closed = True
            return self
        self._thread.start()
        return self

    def latest(self, hwnd):
        """(seq, image, frame_at) for a window on the dock; asking keeps it captured."""
        with self._lock:
            self._wanted[hwnd] = time.time()
            return self._images.get(hwnd, (0, None, 0.0))

    def frame_at(self, hwnd):
        with self._lock:
            return self._images.get(hwnd, (0, None, 0.0))[2]

    def stop(self):
        self.closed = True

    def _refresh_boxes(self, width, height):
        ox, oy = self.origin
        boxes = {}
        for hwnd in list(self._wanted):
            if not winenum.is_window(hwnd):
                continue
            cl, ct, cr, cb = winenum.client_bounds(hwnd)
            x0, y0 = max(0, cl - ox), max(0, ct - oy)
            x1, y1 = min(width, cr - ox), min(height, cb - oy)
            if x1 - x0 >= 8 and y1 - y0 >= 8:
                boxes[hwnd] = (x0, y0, x1, y1)
        self._boxes = boxes
        self._boxes_at = time.time()

    def _idle_check(self):
        """Forget windows nobody asked for lately. True when the capture should end."""
        now = time.time()
        with self._lock:
            for hwnd, used in list(self._wanted.items()):
                if now - used > IDLE_STOP_S:
                    self._wanted.pop(hwnd, None)
                    self._images.pop(hwnd, None)
            return not self._wanted and now - self._started > IDLE_STOP_S

    def _take(self, arr, rgba):
        """Crop the wanted windows out of one dock picture (BGRA/RGBA) and publish them."""
        h, w = arr.shape[:2]
        if time.time() - self._boxes_at > REGIONS_EVERY_S or any(k not in self._boxes for k in self._wanted):
            self._refresh_boxes(w, h)
        crops = {}
        for hwnd, (x0, y0, x1, y1) in self._boxes.items():
            part = arr[y0:y1, x0:x1]
            crops[hwnd] = np.ascontiguousarray(part[..., 2::-1] if rgba else part[..., :3])
        stamp = time.time()
        with self._lock:
            for hwnd, img in crops.items():
                seq = self._images.get(hwnd, (0,))[0] + 1
                self._images[hwnd] = (seq, img, stamp)
            self.frames += 1
        self.alive_at = stamp
        if crops and self.on_frame:
            self.on_frame()

    def _run_wgc(self):
        control = None
        try:
            cap = WindowsCapture(cursor_capture=False, draw_border=False, monitor_index=self.index,
                                 minimum_update_interval=max(1, int(1000 / max(1, self.max_fps))))

            @cap.event
            def on_frame_arrived(frame, ctl):
                if self.closed:          # the stop below is on its way (never stop from a frame callback)
                    return
                self._take(frame.frame_buffer, rgba=False)

            @cap.event
            def on_closed():
                self.closed = True

            with SESSION_LOCK:
                control = cap.start_free_threaded()
            while not self.closed and not self._idle_check():
                if not control.is_finished():
                    self.alive_at = max(self.alive_at, time.time() - 1.0)   # an unchanged dock sends no frames
                time.sleep(0.5)
        except Exception as err:  # monitor gone, capture refused, ...
            self.error = str(err)
        finally:
            self.closed = True
            if control is not None:
                with SESSION_LOCK:
                    try:
                        control.stop()
                    except Exception:
                        pass

    def _run_dxgi(self):
        session = None
        period = 1.0 / max(1, self.max_fps)
        try:
            while not self.closed and not self._idle_check():
                t0 = time.perf_counter()
                if not self._wanted:
                    time.sleep(0.1)
                    continue
                try:
                    if session is None:
                        session = DxgiDuplicationSession(self.index)
                    frame = session.acquire_frame(100)
                except Exception as err:   # mode change / access lost / monitor gone
                    self.error = str(err)
                    session = None
                    time.sleep(0.5)
                    continue
                self.error = None
                self.alive_at = time.time()
                if frame is None:          # nothing on the dock changed
                    continue
                self._take(frame.to_numpy(), rgba=frame.color_format == 'rgba8')
                del frame
                spare = period - (time.perf_counter() - t0)
                if spare > 0:
                    time.sleep(spare)
        finally:
            self.closed = True


def capture(dock, max_fps, on_frame):
    """The running dock capture (started on demand; a new one if the dock moved or changed)."""
    global _capture
    with _lock:
        c = _capture
        if c is None or c.closed or c.device != dock['device'] or c.index != dock['index'] \
                or c.origin != tuple(dock['rect'][:2]):
            if c is not None:
                c.stop()
            c = _capture = DockCapture(dock, max_fps, on_frame, settings.DISPLAY_DOCK_CAPTURE).start()
        return c


def current_capture():
    return _capture
