"""Top-level windows and their geometry (Win32 via ctypes). MSFS pop-out windows are display sources."""
import ctypes
import os
from ctypes import wintypes

_user32 = ctypes.WinDLL('user32', use_last_error=True)
_kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
_dwmapi = ctypes.WinDLL('dwmapi')

_user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
_user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
_user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
_user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
_dwmapi.DwmGetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
_kernel32.OpenProcess.restype = wintypes.HANDLE
_kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR,
                                                  ctypes.POINTER(wintypes.DWORD)]

_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_DWMWA_EXTENDED_FRAME_BOUNDS = 9
_DWMWA_CLOAKED = 14
_exe_cache = {}

# Physical pixels everywhere (DWM frame bounds are always physical; without this, GetClientRect & co. would be
# scaled on monitors with Windows display scaling and the crop would drift).
try:
    _user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
except (AttributeError, OSError):
    pass


def process_exe(pid):
    """Lower-case exe file name of a process, '' if it can't be read."""
    if pid in _exe_cache:
        return _exe_cache[pid]
    name = ''
    handle = _kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if handle:
        try:
            size = wintypes.DWORD(1024)
            buf = ctypes.create_unicode_buffer(size.value)
            if _kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
                name = os.path.basename(buf.value).lower()
        finally:
            _kernel32.CloseHandle(handle)
    if len(_exe_cache) > 512:
        _exe_cache.clear()
    _exe_cache[pid] = name
    return name


def is_window(hwnd):
    return bool(hwnd) and bool(_user32.IsWindow(wintypes.HWND(hwnd)))


def window_pid(hwnd):
    pid = wintypes.DWORD()
    _user32.GetWindowThreadProcessId(wintypes.HWND(hwnd), ctypes.byref(pid))
    return pid.value


def title(hwnd):
    n = _user32.GetWindowTextLengthW(wintypes.HWND(hwnd))
    buf = ctypes.create_unicode_buffer(n + 1)
    _user32.GetWindowTextW(wintypes.HWND(hwnd), buf, n + 1)
    return buf.value


def class_name(hwnd):
    buf = ctypes.create_unicode_buffer(256)
    _user32.GetClassNameW(wintypes.HWND(hwnd), buf, 256)
    return buf.value


def frame_bounds(hwnd):
    """Visible window bounds (no drop shadow) in screen pixels: what Windows Graphics Capture captures."""
    r = wintypes.RECT()
    if _dwmapi.DwmGetWindowAttribute(wintypes.HWND(hwnd), _DWMWA_EXTENDED_FRAME_BOUNDS, ctypes.byref(r),
                                     ctypes.sizeof(r)) != 0:
        _user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def client_bounds(hwnd):
    """Client area (the content, no title bar/borders) in screen pixels."""
    r = wintypes.RECT()
    _user32.GetClientRect(wintypes.HWND(hwnd), ctypes.byref(r))
    p = wintypes.POINT(0, 0)
    _user32.ClientToScreen(wintypes.HWND(hwnd), ctypes.byref(p))
    return (p.x, p.y, p.x + r.right, p.y + r.bottom)


def is_minimized(hwnd):
    return bool(_user32.IsIconic(wintypes.HWND(hwnd)))


def _cloaked(hwnd):
    v = wintypes.DWORD()
    _dwmapi.DwmGetWindowAttribute(wintypes.HWND(hwnd), _DWMWA_CLOAKED, ctypes.byref(v), ctypes.sizeof(v))
    return v.value != 0


def info(hwnd):
    fb = frame_bounds(hwnd)
    return {
        'hwnd': int(hwnd), 'title': title(hwnd), 'class': class_name(hwnd), 'pid': window_pid(hwnd),
        'exe': process_exe(window_pid(hwnd)), 'bounds': list(fb), 'client': list(client_bounds(hwnd)),
        'width': fb[2] - fb[0], 'height': fb[3] - fb[1], 'minimized': is_minimized(hwnd),
    }


def list_windows(process_names):
    """Visible, uncloaked top-level windows owned by any of `process_names` (lower-case exe names)."""
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _cb(hwnd, _):
        if _user32.IsWindowVisible(hwnd) and not _cloaked(hwnd):
            if process_exe(window_pid(hwnd)) in process_names:
                found.append(int(hwnd))
        return True

    _user32.EnumWindows(_cb, 0)
    return [info(h) for h in found]


MAIN_TITLE = 'microsoft flight simulator'


def main_window(process_names, wins=None):
    """The sim's main window: the one titled "Microsoft Flight Simulator ...", else the largest when there are
    several (pop-outs are instrument-sized and titled after the instrument)."""
    wins = list_windows(process_names) if wins is None else wins
    titled = [w for w in wins if w['title'].lower().startswith(MAIN_TITLE)]
    if titled:
        return max(titled, key=lambda w: w['width'] * w['height'])
    shown = [w for w in wins if not w['minimized']]
    return max(shown, key=lambda w: w['width'] * w['height']) if len(shown) > 1 else None


# ---------- window placement ----------

_GWL_STYLE = -16
_GWL_EXSTYLE = -20
_WS_FRAME = 0x00CF0000          # WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX
_WS_EX_TOOLWINDOW = 0x00000080
_WS_EX_APPWINDOW = 0x00040000
_SWP_NOSIZE, _SWP_NOMOVE, _SWP_NOZORDER, _SWP_NOACTIVATE, _SWP_FRAMECHANGED = 0x1, 0x2, 0x4, 0x10, 0x20
_SW_SHOWNOACTIVATE, _SW_RESTORE = 4, 9
_user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                 ctypes.c_int, wintypes.UINT]
_user32.GetWindowLongPtrW.restype = ctypes.c_ssize_t
_user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
_user32.SetWindowLongPtrW.restype = ctypes.c_ssize_t
_user32.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]


def win_rect(hwnd):
    r = wintypes.RECT()
    _user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def set_client_rect(hwnd, x, y, client_w, client_h):
    """Move/resize a window so its client area is client_w x client_h at (x, y). Doesn't activate it."""
    fl, ft, fr, fb = win_rect(hwnd)
    cl, ct, cr, cb = client_bounds(hwnd)
    extra_w = (fr - fl) - (cr - cl)
    extra_h = (fb - ft) - (cb - ct)
    _user32.SetWindowPos(wintypes.HWND(hwnd), None, int(x - (cl - fl)), int(y - (ct - ft)),
                         int(client_w + extra_w), int(client_h + extra_h), _SWP_NOACTIVATE | _SWP_NOZORDER)


def move(hwnd, x, y):
    _user32.SetWindowPos(wintypes.HWND(hwnd), None, int(x), int(y), 0, 0,
                         _SWP_NOSIZE | _SWP_NOACTIVATE | _SWP_NOZORDER)


def restore(hwnd):
    _user32.ShowWindow(wintypes.HWND(hwnd), _SW_RESTORE)


def _set_style(hwnd, index, new):
    h = wintypes.HWND(hwnd)
    _user32.SetWindowLongPtrW(h, index, new)
    _user32.SetWindowPos(h, None, 0, 0, 0, 0,
                         _SWP_NOMOVE | _SWP_NOSIZE | _SWP_NOACTIVATE | _SWP_NOZORDER | _SWP_FRAMECHANGED)


def make_borderless(hwnd):
    """No title bar or borders: the client area is the whole window (what pop-out managers do)."""
    style = _user32.GetWindowLongPtrW(wintypes.HWND(hwnd), _GWL_STYLE)
    if style & _WS_FRAME:
        _set_style(hwnd, _GWL_STYLE, style & ~_WS_FRAME)


def restore_frame(hwnd):
    style = _user32.GetWindowLongPtrW(wintypes.HWND(hwnd), _GWL_STYLE)
    if style & _WS_FRAME != _WS_FRAME:
        _set_style(hwnd, _GWL_STYLE, style | _WS_FRAME)


def _set_taskbar(hwnd, show):
    h = wintypes.HWND(hwnd)
    style = _user32.GetWindowLongPtrW(h, _GWL_EXSTYLE)
    new = (style & ~_WS_EX_TOOLWINDOW) if show else ((style | _WS_EX_TOOLWINDOW) & ~_WS_EX_APPWINDOW)
    if new != style:
        _user32.ShowWindow(h, 0)                       # the taskbar only notices the change on show
        _user32.SetWindowLongPtrW(h, _GWL_EXSTYLE, new)
        _user32.ShowWindow(h, _SW_SHOWNOACTIVATE)
        _user32.SetWindowPos(h, None, 0, 0, 0, 0,
                             _SWP_NOMOVE | _SWP_NOSIZE | _SWP_NOACTIVATE | _SWP_NOZORDER | _SWP_FRAMECHANGED)


def hide_from_taskbar(hwnd):
    """Tool-window style: no taskbar button, not in Alt-Tab. The window keeps rendering."""
    _set_taskbar(hwnd, False)


def show_in_taskbar(hwnd):
    _set_taskbar(hwnd, True)


# ---------- focus + synthetic input (pop-out automation) ----------

_user32.GetForegroundWindow.restype = wintypes.HWND
_user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
_user32.GetWindowThreadProcessId.restype = wintypes.DWORD


def foreground():
    return int(_user32.GetForegroundWindow() or 0)


def bring_to_front(hwnd):
    """SetForegroundWindow from a background process: borrow the foreground thread's input queue first."""
    h = wintypes.HWND(hwnd)
    fg = _user32.GetForegroundWindow()
    if fg and int(fg) == int(hwnd):
        return True
    me = _kernel32.GetCurrentThreadId()
    fg_thread = _user32.GetWindowThreadProcessId(fg, None) if fg else 0
    attached = bool(fg_thread and fg_thread != me and _user32.AttachThreadInput(me, fg_thread, True))
    try:
        _user32.BringWindowToTop(h)
        ok = bool(_user32.SetForegroundWindow(h))
    finally:
        if attached:
            _user32.AttachThreadInput(me, fg_thread, False)
    return ok


class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG), ('mouseData', wintypes.DWORD),
                ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]


class _KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', wintypes.WORD), ('wScan', wintypes.WORD), ('dwFlags', wintypes.DWORD),
                ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]


class _INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [('mi', _MOUSEINPUT), ('ki', _KEYBDINPUT), ('pad', ctypes.c_byte * 32)]
    _anonymous_ = ('u',)
    _fields_ = [('type', wintypes.DWORD), ('u', _U)]


_user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(_INPUT), ctypes.c_int]
_user32.GetSystemMetrics.argtypes = [ctypes.c_int]
_user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]


def _send(*inputs):
    arr = (_INPUT * len(inputs))(*inputs)
    return _user32.SendInput(len(inputs), arr, ctypes.sizeof(_INPUT))


def cursor_pos():
    p = wintypes.POINT()
    _user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def mouse_move(x, y):
    """Absolute move anywhere on the virtual desktop (all monitors)."""
    vx, vy = _user32.GetSystemMetrics(76), _user32.GetSystemMetrics(77)
    vw, vh = _user32.GetSystemMetrics(78), _user32.GetSystemMetrics(79)
    i = _INPUT(type=0)
    i.mi = _MOUSEINPUT(int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0,
                       0x0001 | 0x8000 | 0x4000, 0, 0)   # MOVE | ABSOLUTE | VIRTUALDESK
    _send(i)


def mouse_button(down):
    i = _INPUT(type=0)
    i.mi = _MOUSEINPUT(0, 0, 0, 0x0002 if down else 0x0004, 0, 0)
    _send(i)


def right_alt(down):
    """Right Alt as MSFS's pop-out modifier: virtual key + extended scan code (games often read scan codes)."""
    i = _INPUT(type=1)
    scan = _user32.MapVirtualKeyW(0xA5, 0)  # VK_RMENU -> scan code
    i.ki = _KEYBDINPUT(0xA5, scan, 0x0001 | (0 if down else 0x0002), 0, 0)  # EXTENDEDKEY [| KEYUP]
    _send(i)


_user32.WindowFromPoint.argtypes = [wintypes.POINT]
_user32.WindowFromPoint.restype = wintypes.HWND
_user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
_user32.GetAncestor.restype = wintypes.HWND


def root_at(x, y):
    """Top-level window under a screen point (0 if none): the window a click there would land in."""
    child = _user32.WindowFromPoint(wintypes.POINT(int(x), int(y)))
    if not child:
        return 0
    return int(_user32.GetAncestor(child, 2) or 0)   # GA_ROOT


def set_cursor(x, y):
    _user32.SetCursorPos(int(x), int(y))
