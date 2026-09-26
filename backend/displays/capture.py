"""One capture session per window (Windows Graphics Capture via the windows-capture package): the fallback when
there is no dock monitor (dock.py), and setup thumbnails.

WGC copies the window's pixels as DWM composes them, so the window may sit behind the sim or on another monitor
(not minimized). Only the newest frame is kept; encoding happens on demand (displays.frame).
"""
import logging
import threading
import time

import numpy as np

from backend.displays import winenum

try:
    from windows_capture import WindowsCapture
except Exception:  # package missing / not Windows
    WindowsCapture = None

log = logging.getLogger(__name__)
GEOMETRY_REFRESH_S = 1.0
# windows-capture has crashed the whole server (access violation in its stop/teardown) when sessions start and stop
# at the same time: every start and stop in this process goes through this lock, and a stop happens exactly once,
# never from inside a frame callback.
SESSION_LOCK = threading.Lock()


def _content_box(frame_w, frame_h, hwnd):
    """Crop box (x0, y0, x1, y1) in frame pixels: the client area (no title bar or borders). The instrument fills
    the client area, so nothing more is cut (an aspect crop used to clip the ND's top line)."""
    fl, ft, fr, fb = winenum.frame_bounds(hwnd)
    cl, ct, cr, cb = winenum.client_bounds(hwnd)
    bw, bh = max(1, fr - fl), max(1, fb - ft)
    sx, sy = frame_w / bw, frame_h / bh
    x0, y0 = max(0, round((cl - fl) * sx)), max(0, round((ct - ft) * sy))
    x1, y1 = min(frame_w, round((cr - fl) * sx)), min(frame_h, round((cb - ft) * sy))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return 0, 0, frame_w, frame_h
    return x0, y0, x1, y1


class WindowCapture:
    def __init__(self, hwnd, max_fps=30, on_frame=None):
        self.hwnd = int(hwnd)
        self.max_fps = max_fps
        self.on_frame = on_frame      # called (no args) after each new frame is stored
        self.seq = 0
        self.image = None           # BGR uint8, cropped to the content
        self.frame_at = 0.0
        self.last_used = time.time()
        self.closed = False
        self.error = None
        self.frames = 0
        self._lock = threading.Lock()
        self._box = None
        self._box_at = 0.0
        self._box_for = None
        self._control = None

    def start(self):
        if WindowsCapture is None:
            self.error = 'windows-capture not installed'
            self.closed = True
            return self
        cap = WindowsCapture(cursor_capture=False, draw_border=False,
                             minimum_update_interval=max(1, int(1000 / self.max_fps)), window_hwnd=self.hwnd)

        @cap.event
        def on_frame_arrived(frame, control):
            if self.closed:          # stop() is on its way; stopping from here too is what crashes
                return
            buf = frame.frame_buffer
            h, w = buf.shape[:2]
            now = time.time()
            if self._box is None or self._box_for != (w, h) or now - self._box_at > GEOMETRY_REFRESH_S:
                try:
                    self._box = _content_box(w, h, self.hwnd)
                except OSError:
                    self._box = (0, 0, w, h)
                self._box_for, self._box_at = (w, h), now
            x0, y0, x1, y1 = self._box
            img = np.ascontiguousarray(buf[y0:y1, x0:x1, :3])  # copy out of the mapped GPU buffer
            with self._lock:
                self.image = img
                self.seq += 1
                self.frames += 1
                self.frame_at = now
            if self.on_frame:
                self.on_frame()

        @cap.event
        def on_closed():
            self.closed = True

        with SESSION_LOCK:
            try:
                self._control = cap.start_free_threaded()
            except Exception as err:  # window gone, capture not allowed, ...
                self.error = str(err)
                self.closed = True
        return self

    def latest(self):
        """(seq, image, frame_at) of the newest frame, or (0, None, 0)."""
        self.last_used = time.time()
        with self._lock:
            return self.seq, self.image, self.frame_at

    def stop(self):
        self.closed = True
        with SESSION_LOCK:
            control, self._control = self._control, None
            if control is not None:
                try:
                    control.stop()
                except Exception:
                    pass
