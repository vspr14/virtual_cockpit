"""Server settings. Override any of these with environment variables."""
import os

PIN = os.environ.get('VC_PIN', '1234')
SECRET_KEY = os.environ.get('VC_SECRET_KEY', 'ipad_joy_secret_key')
SIMBRIEF_USERID = os.environ.get('VC_SIMBRIEF_USERID', '193599')
PORT = int(os.environ.get('VC_PORT', '5000'))

# ChasePlane camera-view sync (backend/chaseplane/)
_APPDATA = os.environ.get('APPDATA', os.path.expanduser('~'))
_LOCALAPPDATA = os.environ.get('LOCALAPPDATA', _APPDATA)
CHASEPLANE_DIR = os.environ.get('VC_CHASEPLANE_DIR', os.path.join(
    _APPDATA, 'Microsoft Flight Simulator 2024', 'WASM', 'MSFS2024', 'p42-util-chaseplane', 'work', 'aircraft'))
CHASEPLANE_BACKUP_DIR = os.environ.get('VC_CHASEPLANE_BACKUP_DIR', os.path.join(
    _LOCALAPPDATA, 'VirtualCockpit', 'chaseplane_backups'))
# "<device id>|<device name>" as ChasePlane records it; empty = use the newest vJoy binding found in the profiles
CHASEPLANE_VJOY = os.environ.get('VC_CHASEPLANE_VJOY', '')
# 1 = the server applies pending view changes by itself whenever the aircraft is not loaded
CHASEPLANE_AUTOSYNC = os.environ.get('VC_CHASEPLANE_AUTOSYNC', '0') == '1'

# Cockpit display streaming (backend/displays/): windows of these processes are offered as display sources
DISPLAY_PROCESSES = tuple(p.strip().lower() for p in os.environ.get(
    'VC_DISPLAY_PROCESSES', 'FlightSimulator2024.exe,FlightSimulator.exe').split(',') if p.strip())
DISPLAY_STATE_FILE = os.environ.get('VC_DISPLAY_STATE_FILE', os.path.join(
    _LOCALAPPDATA, 'VirtualCockpit', 'displays.json'))
# Most frames per second taken from each pop-out window (and so the highest stream rate)
DISPLAY_CAPTURE_FPS = int(os.environ.get('VC_DISPLAY_CAPTURE_FPS', '30'))
# The dock: a virtual monitor (tools/virtual_display/install.ps1) that holds the pop-outs out of sight. Found by
# its adapter name; captured as one picture (Windows Graphics Capture of the monitor; 'dxgi' = desktop duplication,
# which stalls the pop-outs on the virtual monitor). VC_DISPLAY_DOCK=0 captures windows one by one instead.
DISPLAY_DOCK = os.environ.get('VC_DISPLAY_DOCK', '1') == '1'
DISPLAY_DOCK_ADAPTER = os.environ.get('VC_DISPLAY_DOCK_ADAPTER', 'Virtual Display Driver').lower()
DISPLAY_DOCK_SIZE = tuple(int(v) for v in os.environ.get('VC_DISPLAY_DOCK_SIZE', '1600x1600').lower().split('x'))
DISPLAY_DOCK_CAPTURE = os.environ.get('VC_DISPLAY_DOCK_CAPTURE', 'wgc').lower()   # wgc | dxgi
# ChasePlane's local camera API (the automatic pop-out switches views through it, like Pop Out Panel Manager)
CHASEPLANE_API_URL = os.environ.get('VC_CHASEPLANE_API_URL', 'ws://127.0.0.1:8652/')
# Automatic pop-out calibration (camera view + where each screen is in the sim window) and auto mode, per aircraft
DISPLAY_POPOUT_FILE = os.environ.get('VC_DISPLAY_POPOUT_FILE', os.path.join(
    _LOCALAPPDATA, 'VirtualCockpit', 'popout.json'))
