import json
import os
import sys
import time

try:
    from backend.simconnect_mobiflight import SimConnectMobiFlight
    from backend.mobiflight_variable_requests import MobiFlightVariableRequests
except Exception:
    SimConnectMobiFlight = None
    MobiFlightVariableRequests = None

if getattr(sys, 'frozen', False):
    _BASE_DIR = sys._MEIPASS
else:
    _BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAPPING_PATH = os.path.join(_BASE_DIR, "data", "lvars.json")
_mf = None
_vr = None
_mf_retry_after = 0.0
_MF_CONNECT_COOLDOWN_S = 2.5

def _load_mapping(profile_name):
    if not os.path.exists(MAPPING_PATH):
        return []
    with open(MAPPING_PATH, "r") as handle:
        data = json.load(handle)
    profiles = data.get("profiles", {})
    profile = profiles.get(profile_name, {})
    return profile.get("vars", [])

def _release_mf():
    global _mf, _vr
    old = _mf
    _vr = None
    _mf = None
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


def _reset_mf():
    """Drop SimConnect/MobiFlight; allow an immediate reconnect attempt."""
    global _mf_retry_after
    _release_mf()
    _mf_retry_after = 0.0


def _connect_mf():
    global _mf, _vr, _mf_retry_after
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return False
    _release_mf()
    try:
        mf = SimConnectMobiFlight(auto_connect=False)
        mf.connect()
        vr = MobiFlightVariableRequests(mf)
        vr.clear_sim_variables()
        _mf = mf
        _vr = vr
        return True
    except Exception:
        _release_mf()
        _mf_retry_after = time.time() + _MF_CONNECT_COOLDOWN_S
        return False


def _get_mf():
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return None, None
    if _mf is not None and _vr is not None:
        return _mf, _vr
    if time.time() < _mf_retry_after:
        return None, None
    if not _connect_mf():
        return None, None
    return _mf, _vr


def _read_lvars_into(vr, vars_list):
    result = {}
    for item in vars_list:
        key = item.get("key")
        lvar = item.get("lvar")
        if not key or not lvar:
            continue
        if not (lvar.startswith("L:") or lvar.startswith("A:") or lvar.startswith("(")):
            continue
        expr = _normalize_expr(lvar)
        result[key] = vr.get(expr)
    return result

def _normalize_expr(lvar):
    if lvar.startswith("(") and lvar.endswith(")"):
        return lvar
    return f"({lvar})"

def _find_entry(vars_list, key):
    for item in vars_list:
        if item.get("key") == key:
            return item
    return None


def _find_lvar(vars_list, key):
    entry = _find_entry(vars_list, key)
    if not entry:
        return None
    return entry.get("lvar")

def read_lvars_payload(profile_name):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    if not vars_list:
        return {"error": "no_vars_configured"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    try:
        result = _read_lvars_into(vr, vars_list)
    except OSError:
        _reset_mf()
        _, vr2 = _get_mf()
        if vr2 is None:
            return {"error": "mobiflight_lost"}
        try:
            result = _read_lvars_into(vr2, vars_list)
        except OSError:
            return {"error": "mobiflight_read_failed"}
    if not result:
        return {"error": "no_vars_configured"}
    return result

def write_lvar_value(profile_name, key, value):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    entry = _find_entry(vars_list, key)
    if not entry:
        return {"error": "unknown_key"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    rpn = entry.get("write_rpn")
    if rpn:
        try:
            vr.set(rpn)
        except OSError:
            _reset_mf()
            _, vr2 = _get_mf()
            if vr2 is None:
                return {"error": "mobiflight_lost"}
            try:
                vr2.set(rpn)
            except OSError:
                return {"error": "mobiflight_setclientdata_failed"}
        return {"status": "ok"}
    lvar = entry.get("lvar")
    if not lvar:
        return {"error": "unknown_key"}
    target = lvar if lvar.startswith("L:") else f"L:{lvar}"
    cmd = f"{value} (>{target})"
    try:
        vr.set(cmd)
    except OSError:
        _reset_mf()
        _, vr2 = _get_mf()
        if vr2 is None:
            return {"error": "mobiflight_lost"}
        try:
            vr2.set(cmd)
        except OSError:
            return {"error": "mobiflight_setclientdata_failed"}
    return {"status": "ok"}

def read_lvar_value(profile_name, key):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    lvar = _find_lvar(vars_list, key)
    if not lvar:
        return {"error": "unknown_key"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    if not (lvar.startswith("L:") or lvar.startswith("A:")):
        return {"error": "not_readable"}
    expr = _normalize_expr(lvar)
    try:
        val = vr.get(expr)
    except OSError:
        _reset_mf()
        _, vr2 = _get_mf()
        if vr2 is None:
            return {"error": "mobiflight_lost"}
        try:
            val = vr2.get(expr)
        except OSError:
            return {"error": "mobiflight_read_failed"}
    return {"value": val}

def step_lvar_value(profile_name, key, delta):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    entry = _find_entry(vars_list, key)
    if not entry:
        return {"error": "unknown_key"}
    lvar = entry.get("lvar")
    if not lvar:
        return {"error": "unknown_key"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    if lvar.startswith("("):
        try:
            vr.set(lvar)
        except OSError:
            _reset_mf()
            _, vr2 = _get_mf()
            if vr2 is None:
                return {"error": "mobiflight_lost"}
            try:
                vr2.set(lvar)
            except OSError:
                return {"error": "mobiflight_setclientdata_failed"}
        return {"status": "ok"}
    expr = _normalize_expr(lvar)
    vr_work = vr
    try:
        current = vr_work.get(expr)
    except OSError:
        _reset_mf()
        _, vr2 = _get_mf()
        if vr2 is None:
            return {"error": "mobiflight_lost"}
        try:
            current = vr2.get(expr)
            vr_work = vr2
        except OSError:
            return {"error": "mobiflight_read_failed"}
    try:
        cur = float(current)
    except Exception:
        cur = 0.0
    try:
        d = float(delta)
    except Exception:
        return {"error": "invalid_delta"}
    next_val = cur + d
    target = lvar if lvar.startswith("L:") else f"L:{lvar}"
    cmd = f"{next_val} (>{target})"
    try:
        vr_work.set(cmd)
    except OSError:
        _reset_mf()
        _, vr2 = _get_mf()
        if vr2 is None:
            return {"error": "mobiflight_lost"}
        try:
            vr2.set(cmd)
        except OSError:
            return {"error": "mobiflight_setclientdata_failed"}
    return {"status": "ok"}
