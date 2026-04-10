import json
import os
import sys

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

def _load_mapping(profile_name):
    if not os.path.exists(MAPPING_PATH):
        return []
    with open(MAPPING_PATH, "r") as handle:
        data = json.load(handle)
    profiles = data.get("profiles", {})
    profile = profiles.get(profile_name, {})
    return profile.get("vars", [])

def _get_mf():
    global _mf, _vr
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return None, None
    if _mf is None or _vr is None:
        _mf = SimConnectMobiFlight()
        _vr = MobiFlightVariableRequests(_mf)
        _vr.clear_sim_variables()
    return _mf, _vr

def _normalize_expr(lvar):
    if lvar.startswith("(") and lvar.endswith(")"):
        return lvar
    return f"({lvar})"

def _find_lvar(vars_list, key):
    for item in vars_list:
        if item.get("key") == key:
            return item.get("lvar")
    return None

def read_lvars_payload(profile_name):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    if not vars_list:
        return {"error": "no_vars_configured"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    result = {}
    for item in vars_list:
        key = item.get("key")
        lvar = item.get("lvar")
        if not key or not lvar:
            continue
        if not (lvar.startswith("L:") or lvar.startswith("A:")):
            continue
        expr = _normalize_expr(lvar)
        result[key] = vr.get(expr)
    if not result:
        return {"error": "no_vars_configured"}
    return result

def write_lvar_value(profile_name, key, value):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    lvar = _find_lvar(vars_list, key)
    if not lvar:
        return {"error": "unknown_key"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    target = lvar if lvar.startswith("L:") else f"L:{lvar}"
    cmd = f"{value} (>{target})"
    vr.set(cmd)
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
    return {"value": vr.get(expr)}

def step_lvar_value(profile_name, key, delta):
    if SimConnectMobiFlight is None or MobiFlightVariableRequests is None:
        return {"error": "mobiflight_module_not_installed"}
    vars_list = _load_mapping(profile_name)
    lvar = _find_lvar(vars_list, key)
    if not lvar:
        return {"error": "unknown_key"}
    _, vr = _get_mf()
    if vr is None:
        return {"error": "mobiflight_init_failed"}
    if lvar.startswith("("):
        vr.set(lvar)
        vr.send_command(lvar)
        return {"status": "ok"}
    expr = _normalize_expr(lvar)
    current = vr.get(expr)
    try:
        next_val = float(current) + float(delta)
    except Exception:
        return {"error": "invalid_delta"}
    target = lvar if lvar.startswith("L:") else f"L:{lvar}"
    cmd = f"{next_val} (>{target})"
    vr.set(cmd)
    vr.send_command(cmd)
    return {"status": "ok"}
