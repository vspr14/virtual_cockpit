"""vJoy virtual joystick: button presses bound in MSFS (e.g. camera views)."""
import threading
import time

try:
    import pyvjoy
except Exception:  # vJoy driver not installed
    pyvjoy = None

_device = None
_lock = threading.Lock()


def init(device_id=1):
    """Open the vJoy device. Safe to call when vJoy is missing (buttons then report an error)."""
    global _device
    if pyvjoy is None:
        return False
    try:
        _device = pyvjoy.VJoyDevice(device_id)
        return True
    except Exception:
        _device = None
        return False


def press(button, hold_s=0.05):
    """Momentary press of one vJoy button."""
    if _device is None:
        return {'error': 'vjoy_unavailable'}
    with _lock:
        _device.set_button(int(button), 1)
        time.sleep(hold_s)
        _device.set_button(int(button), 0)
    return {'status': 'ok'}
