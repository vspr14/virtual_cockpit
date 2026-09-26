"""Monitors and display modes (Win32 via ctypes): find the dock monitor, set its size and position."""
import ctypes
from ctypes import wintypes

from backend.displays import winenum  # noqa: F401  (sets per-monitor DPI awareness: physical pixels)

_user32 = ctypes.WinDLL('user32', use_last_error=True)

_ENUM_CURRENT_SETTINGS = -1
_DISPLAY_DEVICE_ATTACHED = 0x1
_DISPLAY_DEVICE_PRIMARY = 0x4
_DM_POSITION, _DM_PELSWIDTH, _DM_PELSHEIGHT, _DM_DISPLAYFREQUENCY = 0x20, 0x80000, 0x100000, 0x400000
_CDS_UPDATEREGISTRY, _CDS_NORESET = 0x1, 0x10000000


class _DISPLAY_DEVICEW(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('DeviceName', wintypes.WCHAR * 32), ('DeviceString', wintypes.WCHAR * 128),
                ('StateFlags', wintypes.DWORD), ('DeviceID', wintypes.WCHAR * 128),
                ('DeviceKey', wintypes.WCHAR * 128)]


class _DEVMODEW(ctypes.Structure):
    _fields_ = [('dmDeviceName', wintypes.WCHAR * 32), ('dmSpecVersion', wintypes.WORD),
                ('dmDriverVersion', wintypes.WORD), ('dmSize', wintypes.WORD), ('dmDriverExtra', wintypes.WORD),
                ('dmFields', wintypes.DWORD), ('dmPositionX', wintypes.LONG), ('dmPositionY', wintypes.LONG),
                ('dmDisplayOrientation', wintypes.DWORD), ('dmDisplayFixedOutput', wintypes.DWORD),
                ('dmColor', ctypes.c_short), ('dmDuplex', ctypes.c_short), ('dmYResolution', ctypes.c_short),
                ('dmTTOption', ctypes.c_short), ('dmCollate', ctypes.c_short), ('dmFormName', wintypes.WCHAR * 32),
                ('dmLogPixels', wintypes.WORD), ('dmBitsPerPel', wintypes.DWORD), ('dmPelsWidth', wintypes.DWORD),
                ('dmPelsHeight', wintypes.DWORD), ('dmDisplayFlags', wintypes.DWORD),
                ('dmDisplayFrequency', wintypes.DWORD), ('dmICMMethod', wintypes.DWORD),
                ('dmICMIntent', wintypes.DWORD), ('dmMediaType', wintypes.DWORD), ('dmDitherType', wintypes.DWORD),
                ('dmReserved1', wintypes.DWORD), ('dmReserved2', wintypes.DWORD), ('dmPanningWidth', wintypes.DWORD),
                ('dmPanningHeight', wintypes.DWORD)]


class _MONITORINFOEXW(ctypes.Structure):
    _fields_ = [('cbSize', wintypes.DWORD), ('rcMonitor', wintypes.RECT), ('rcWork', wintypes.RECT),
                ('dwFlags', wintypes.DWORD), ('szDevice', wintypes.WCHAR * 32)]


_user32.EnumDisplayDevicesW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(_DISPLAY_DEVICEW),
                                        wintypes.DWORD]
_user32.EnumDisplaySettingsExW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(_DEVMODEW),
                                           wintypes.DWORD]
_user32.ChangeDisplaySettingsExW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(_DEVMODEW), wintypes.HWND,
                                             wintypes.DWORD, ctypes.c_void_p]
_user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(_MONITORINFOEXW)]
_MONITORENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HMONITOR, wintypes.HDC, ctypes.POINTER(wintypes.RECT),
                                      wintypes.LPARAM)
_user32.EnumDisplayMonitors.argtypes = [wintypes.HDC, ctypes.POINTER(wintypes.RECT), _MONITORENUMPROC,
                                        wintypes.LPARAM]


def _devmode(device, mode=_ENUM_CURRENT_SETTINGS):
    dm = _DEVMODEW()
    dm.dmSize = ctypes.sizeof(_DEVMODEW)
    if not _user32.EnumDisplaySettingsExW(device, mode & 0xFFFFFFFF, ctypes.byref(dm), 0):
        return None
    return dm


def displays():
    """Attached displays: [{'device': '\\\\.\\DISPLAY3', 'adapter': 'AMD Radeon ...', 'primary': bool,
    'rect': (l, t, r, b), 'hz': int}] in physical pixels."""
    out = []
    i = 0
    while True:
        dd = _DISPLAY_DEVICEW()
        dd.cb = ctypes.sizeof(dd)
        if not _user32.EnumDisplayDevicesW(None, i, ctypes.byref(dd), 0):
            break
        i += 1
        if not dd.StateFlags & _DISPLAY_DEVICE_ATTACHED:
            continue
        dm = _devmode(dd.DeviceName)
        if dm is None or not dm.dmPelsWidth:
            continue
        x, y = dm.dmPositionX, dm.dmPositionY
        out.append({'device': dd.DeviceName, 'adapter': dd.DeviceString, 'id': dd.DeviceID,
                    'primary': bool(dd.StateFlags & _DISPLAY_DEVICE_PRIMARY),
                    'rect': (x, y, x + dm.dmPelsWidth, y + dm.dmPelsHeight), 'hz': dm.dmDisplayFrequency})
    return out


def modes(device):
    """Every (width, height, hz) the display offers."""
    out = set()
    i = 0
    while True:
        dm = _devmode(device, i)
        if dm is None:
            break
        out.add((dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency))
        i += 1
    return sorted(out)


def _monitors():
    """[(device name, monitor rect, work rect)] in EnumDisplayMonitors order. The work rect leaves out the taskbar."""
    out = []

    @_MONITORENUMPROC
    def _cb(hmon, _hdc, _rect, _):
        mi = _MONITORINFOEXW()
        mi.cbSize = ctypes.sizeof(mi)
        if _user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
            m, w = mi.rcMonitor, mi.rcWork
            out.append((mi.szDevice, (m.left, m.top, m.right, m.bottom), (w.left, w.top, w.right, w.bottom)))
        return True

    _user32.EnumDisplayMonitors(None, None, _cb, 0)
    return out


def monitor_order():
    """Device names in EnumDisplayMonitors order (windows-capture's monitor_index is 1 + position here)."""
    return [m[0] for m in _monitors()]


def work_area(device):
    """The display's desktop area without the taskbar (Windows shows one on every display), or None."""
    return next((m[2] for m in _monitors() if m[0] == device), None)


def set_mode(device, size=None, position=None, hz=None):
    """Change a display's resolution and/or desktop position (stored in the registry, applied at once).
    Returns the ChangeDisplaySettingsEx result (0 = ok)."""
    dm = _devmode(device)
    if dm is None:
        return -1
    dm.dmFields = 0
    if size:
        dm.dmPelsWidth, dm.dmPelsHeight = size
        dm.dmFields |= _DM_PELSWIDTH | _DM_PELSHEIGHT
    if hz:
        dm.dmDisplayFrequency = hz
        dm.dmFields |= _DM_DISPLAYFREQUENCY
    if position:
        dm.dmPositionX, dm.dmPositionY = position
        dm.dmFields |= _DM_POSITION
    res = _user32.ChangeDisplaySettingsExW(device, ctypes.byref(dm), None, _CDS_UPDATEREGISTRY | _CDS_NORESET, None)
    if res == 0:
        res = _user32.ChangeDisplaySettingsExW(None, None, None, 0, None)
    return res


def _overlap(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def corner_spot(others, w, h):
    """Top-left for a w x h display tucked diagonally under a corner of the others. Windows won't accept displays that
    touch only at a corner (it snaps them to a full shared edge), so it shares one pixel of edge: the mouse (which
    crosses between displays only along shared edges) can't practically reach it. Prefers the bottom-right corner of
    the right-most display."""
    for m in sorted(others, key=lambda r: (-r[2], -r[3])):
        for x, y in ((m[2] - 1, m[3]), (m[2] - 1, m[1] - h), (m[0] - w + 1, m[3]), (m[0] - w + 1, m[1] - h)):
            cand = (x, y, x + w, y + h)
            if not any(_overlap(cand, o) for o in others) and all(_shared_edge(cand, o) <= 1 for o in others):
                return x, y
    right = max(r[2] for r in others)
    bottom = max(r[3] for r in others)
    return right - 1, bottom


def _shared_edge(a, b):
    """Length of the border two display rectangles share (0 if they don't touch)."""
    if a[2] == b[0] or b[2] == a[0]:
        return max(0, min(a[3], b[3]) - max(a[1], b[1]))
    if a[3] == b[1] or b[3] == a[1]:
        return max(0, min(a[2], b[2]) - max(a[0], b[0]))
    return 0
