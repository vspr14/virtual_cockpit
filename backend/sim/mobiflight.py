"""MobiFlight WASM transport: read and write LVars in MSFS.

Aircraft-agnostic. Callers pass the aircraft's variable map (see backend/aircraft.py); this module only
knows how to talk to the MobiFlight WASM module over SimConnect client data. It connects lazily (MSFS may
start after this server) and reconnects after a dropped connection.
"""
import logging
import threading
import time

from SimConnect import SimConnect


def _simconnect_dup_filter(record):
    try:
        return 'SIMCONNECT_EXCEPTION_ALREADY_CREATED' not in record.getMessage()
    except Exception:
        return True


for _name in ('SimConnect.SimConnect', 'SimConnect'):
    logging.getLogger(_name).addFilter(_simconnect_dup_filter)


def _patch_simconnect_run_quiet():
    """Stop the SimConnect dispatch thread quietly when MSFS closes instead of spamming OSErrors."""

    def _run(self):
        while self.quit == 0:
            try:
                self.dll.CallDispatch(self.hSimConnect, self.my_dispatch_proc_rd, None)
                time.sleep(0.002)
            except OSError as err:
                logging.getLogger('SimConnect').debug('dispatch OSError %s', err)
                self.quit = 1
                break

    SimConnect._run = _run


_patch_simconnect_run_quiet()

try:
    from backend.sim.simconnect_mobiflight import SimConnectMobiFlight
    from backend.sim.mobiflight_variable_requests import MobiFlightVariableRequests
except Exception:  # SimConnect DLL missing (e.g. not on Windows)
    SimConnectMobiFlight = None
    MobiFlightVariableRequests = None

_CONNECT_COOLDOWN_S = 2.5
_mf = None
_vr = None
_retry_after = 0.0
_io_lock = threading.RLock()  # one MobiFlight conversation at a time (several tabs/iPads poll in parallel)

# Liveness canary. MobiFlight forgets every registered variable when any client on its default channel sends
# MF.SimVars.Clear (another tool, a second server) or the WASM module restarts; reads then freeze at their last
# values while writes still work, so the page silently falls out of sync. We write a counter to our own LVar
# and expect to read it back; if it stops following, re-register everything.
_CANARY_LVAR = 'L:VC_MOBIFLIGHT_CANARY'
_CANARY_EVERY_S = 2.0
_CANARY_TIMEOUT_S = 2.5
_canary = {'value': 0, 'sent_at': 0.0, 'failures': 0}


class _StaleRegistrations(Exception):
    pass


def _release():
    global _mf, _vr
    old = _mf
    _mf = None
    _vr = None
    if old is None:
        return
    try:
        old.quit = 1
    except Exception:
        pass
    try:
        old.exit()
    except Exception:
        pass


def _connect():
    global _mf, _vr, _retry_after
    _release()
    try:
        mf = SimConnectMobiFlight(auto_connect=False)
        mf.connect()
        vr = MobiFlightVariableRequests(mf)
        vr.clear_sim_variables()
        _mf, _vr = mf, vr
        _canary.update(value=0, sent_at=0.0)
        return True
    except Exception:
        _release()
        _retry_after = time.time() + _CONNECT_COOLDOWN_S
        return False


def _client():
    """Return a connected MobiFlightVariableRequests, or None (sim not running / cooling down)."""
    if SimConnectMobiFlight is None:
        return None
    if _vr is not None:
        return _vr
    if time.time() < _retry_after:
        return None
    return _vr if _connect() else None


def _with_retry(fn):
    """Run fn(client); on a dropped connection or lost registrations reconnect once and retry."""
    global _retry_after
    with _io_lock:
        vr = _client()
        if vr is None:
            return {'error': 'sim_not_connected'}
        try:
            return fn(vr)
        except (OSError, _StaleRegistrations) as err:
            if isinstance(err, _StaleRegistrations):
                logging.getLogger(__name__).warning('MobiFlight stopped updating our variables; re-registering')
            _release()
            _retry_after = 0.0
            vr = _client()
            if vr is None:
                return {'error': 'sim_connection_lost'}
            try:
                return fn(vr)
            except (OSError, _StaleRegistrations):
                return {'error': 'sim_io_failed'}


def _check_canary(vr):
    """Raise _StaleRegistrations when the counter we wrote hasn't come back in time."""
    now = time.time()
    seen = vr.get(f'({_CANARY_LVAR})')
    if _canary['value']:
        if seen != _canary['value']:
            # Back off when the sim isn't processing commands at all (e.g. loading), up to 30 s.
            timeout = min(30.0, _CANARY_TIMEOUT_S * (2 ** _canary['failures']))
            if now - _canary['sent_at'] > timeout:
                _canary['failures'] += 1
                raise _StaleRegistrations()
            return
        _canary['failures'] = 0
    if now - _canary['sent_at'] >= _CANARY_EVERY_S:
        _canary['value'] = _canary['value'] % 9999 + 1
        _canary['sent_at'] = now
        vr.set(f"{_canary['value']} (>{_CANARY_LVAR})")


def _expr(lvar):
    return lvar if lvar.startswith('(') else f'({lvar})'


def read_all(var_map):
    """Read every variable in var_map ({key: {"lvar": "L:NAME", ...}}) → {key: float}."""
    if SimConnectMobiFlight is None:
        return {'error': 'mobiflight_unavailable'}
    names = {key: _expr(entry['lvar']) for key, entry in var_map.items()}

    def _read(vr):
        vr.register(list(names.values()) + [f'({_CANARY_LVAR})'])
        _check_canary(vr)
        return {key: vr.get(name) for key, name in names.items()}

    return _with_retry(_read)


def write(entry, value):
    """Write one variable. entry = {"lvar": "L:NAME"} or {"write_rpn": "<RPN code>"}."""
    if SimConnectMobiFlight is None:
        return {'error': 'mobiflight_unavailable'}
    rpn = entry.get('write_rpn')
    if not rpn:
        lvar = entry['lvar']
        target = lvar if lvar.startswith('L:') else f'L:{lvar}'
        rpn = f'{value} (>{target})'

    def _write(vr):
        vr.set(rpn)
        return {'status': 'ok'}

    return _with_retry(_write)
