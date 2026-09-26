"""Sim system states (loaded aircraft, flight running) over a plain SimConnect connection.

Separate from the MobiFlight transport on purpose: opening a MobiFlight client clears the variable list every
MobiFlight client shares, so this must also work from the command line without disturbing a running server.
"""
import threading

try:
    from SimConnect import SimConnect
except Exception:  # SimConnect DLL missing (e.g. not on Windows)
    SimConnect = None

_REQUEST_BASE = 0x5CA1
_lock = threading.Lock()


def _system_states(names, timeout_s, simvars=()):
    """{name: (int, str)} for SimConnect system states (plus {name: value} for `simvars`, (name, unit) pairs of the
    user aircraft),
    or {'error': ...} when the sim cannot be asked."""
    if SimConnect is None:
        return {'error': 'simconnect_unavailable'}
    ids = {_REQUEST_BASE + i: n for i, n in enumerate(names)}
    got = {}
    done = threading.Event()

    class _Client(SimConnect):
        def handle_state_event(self, state):
            name = ids.get(state.dwRequestID)
            if name:
                got[name] = (int(state.dwInteger), state.szString.decode('utf-8', errors='replace'))
                if len(got) == len(ids):
                    done.set()

    with _lock:
        try:
            sc = _Client()
        except Exception:
            return {'error': 'sim_not_connected'}
        try:
            for rid, name in ids.items():
                sc.dll.RequestSystemState(sc.hSimConnect, rid, name.encode())
            done.wait(timeout_s)
            if simvars and len(got) == len(ids):
                from SimConnect.RequestList import Request
                for var, unit in simvars:
                    got[var] = Request((var.encode(), unit.encode()), sc, _time=0).value
        except OSError:
            return {'error': 'sim_connection_lost'}
        finally:
            try:
                sc.exit()
            except Exception:
                pass
    if len(got) < len(ids):
        return {'error': 'sim_no_reply'}
    return got


def loaded_aircraft_cfg(timeout_s=2.0):
    """Path of the loaded aircraft's aircraft.cfg (system state "AircraftLoaded"), e.g.
    SimObjects\\Airplanes\\FNX_32X\\presets\\fnx\\FNX_320_IAE_SL\\config\\aircraft.CFG.
    Returns {'path': str} or {'error': ...} when the sim cannot be asked."""
    got = _system_states(['AircraftLoaded'], timeout_s)
    if 'error' in got:
        return got
    return {'path': got['AircraftLoaded'][1]}


# CAMERA STATE values (as MSFS Pop Out Panel Manager reads them): the flight has started when the camera goes from
# a loading / Ready to Fly screen to the cockpit.
CAMERA_COCKPIT = 2
CAMERA_LOADING = {16, 30, 31}      # Ready to Fly, load screen, preload screen
CAMERA_MENUS = {35, 36}            # restart screen, home screen


def sim_status(timeout_s=2.0):
    """{'path': loaded aircraft.cfg, 'in_flight': bool, 'camera': CAMERA STATE (int, 0 if unknown)} (system state
    "Sim" is 1 while a flight runs), or {'error': ...}."""
    got = _system_states(['AircraftLoaded', 'Sim'], timeout_s, simvars=(('CAMERA STATE', 'Enum'),))
    if 'error' in got:
        return got
    cam = got.get('CAMERA STATE')
    return {'path': got['AircraftLoaded'][1], 'in_flight': got['Sim'][0] == 1,
            'camera': int(cam) if cam is not None else 0}
