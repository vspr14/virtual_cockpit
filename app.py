import sys
import os
import csv
import logging
import socket
import struct
import json as json_lib
import urllib.request
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file, abort
import pyvjoy
import time
import threading
import math


def _simconnect_dup_filter(record):
    try:
        if 'SIMCONNECT_EXCEPTION_ALREADY_CREATED' in record.getMessage():
            return False
    except Exception:
        pass
    return True


for _lg in ('SimConnect.SimConnect', 'SimConnect'):
    logging.getLogger(_lg).addFilter(_simconnect_dup_filter)

from SimConnect import SimConnect, AircraftRequests


def _patch_simconnect_run_quiet():
    def _vc_run(self):
        while self.quit == 0:
            try:
                self.dll.CallDispatch(self.hSimConnect, self.my_dispatch_proc_rd, None)
                time.sleep(0.002)
            except OSError as err:
                logging.getLogger('SimConnect').debug('dispatch OSError %s', err)
                try:
                    self.quit = 1
                except Exception:
                    pass
                break

    try:
        SimConnect._run = _vc_run
    except Exception:
        pass


_patch_simconnect_run_quiet()
from profiles import get_profile
from backend.fsuipc_wapi_reader import write_lvar_value, step_lvar_value

if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _app_writable_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return BASE_DIR


BRAKE_MOTION_LOG_PATH = os.path.join(_app_writable_dir(), 'logs', 'brake_motion.csv')

app = Flask(__name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static'),
    static_url_path='/static')
app.secret_key = 'ipad_joy_secret_key'
app.config['SESSION_TYPE'] = 'filesystem'
logging.getLogger('werkzeug').setLevel(logging.ERROR)
device_1 = None
device_2 = None
aq = None
_sm_for_aq = None
PIN = '1234'
_lvar_debug_next_ts = 0.0
_LVAR_DEBUG_INTERVAL_S = 2.0
_brake_motion_log_lock = threading.Lock()


def _log_lvar_read_debug(profile_name, result):
    """Set env VC_DEBUG_LVARS=1 for throttled terminal logs of GET /lvars reads."""
    global _lvar_debug_next_ts
    if os.environ.get('VC_DEBUG_LVARS', '').strip().lower() not in ('1', 'true', 'yes'):
        return
    now = time.time()
    if now < _lvar_debug_next_ts:
        return
    _lvar_debug_next_ts = now + _LVAR_DEBUG_INTERVAL_S
    if 'error' in result:
        print(
            '[VC_DEBUG_LVARS] profile=%r READ ERROR: %s' % (profile_name, result.get('error')),
            flush=True,
        )
        return
    bad = [
        k for k, v in result.items()
        if v is None or (isinstance(v, float) and math.isnan(v))
    ]
    keys = list(result.keys())
    sample = {k: result[k] for k in keys[:6]}
    print(
        '[VC_DEBUG_LVARS] profile=%r keys=%d null_or_nan=%d sample=%s'
        % (profile_name, len(keys), len(bad), sample),
        flush=True,
    )
    if bad:
        print('[VC_DEBUG_LVARS] null/NaN keys (up to 25): %s' % (bad[:25],), flush=True)


def _ensure_aircraft_requests():
    """Lazy SimConnect for optional brake logging — avoids connecting before MSFS is ready."""
    global aq, _sm_for_aq
    if aq is not None:
        return aq
    try:
        sm = SimConnect(auto_connect=False)
        sm.connect()
        _sm_for_aq = sm
        aq = AircraftRequests(sm)
    except Exception:
        _sm_for_aq = None
        aq = None
    return aq


def _try_read_sim_brake_pedal():
    global aq
    if _ensure_aircraft_requests() is None:
        return None
    for name in (
        'BRAKE LEFT POSITION',
        'BRAKE_LEFT_POSITION',
        'LEFT_BRAKE_PEDAL_POSITION',
        'BRAKE_PEDAL_INDICATOR',
    ):
        try:
            v = aq.get(name)
            if v is not None and isinstance(v, (int, float)):
                return float(v)
        except Exception:
            continue
    return None


def _brake_linear_01(fe, profile):
    """UI 0..1 after invert; used for Fenix pedal animation LVars."""
    raw = max(0.0, min(1.0, float(fe)))
    if profile.get('backend', {}).get('brake_invert'):
        raw = 1.0 - raw
    return raw


def _brake_axis_command(linear_01, profile):
    """Map linear pedal position to vJoy axis 0..1 (deadzone, gamma, cap) to avoid touchy braking."""
    b = profile.get('backend', {}) or {}
    r = max(0.0, min(1.0, float(linear_01)))
    dz = float(b.get('brake_deadzone', 0.0))
    if dz > 0.0:
        if r < dz:
            r = 0.0
        else:
            r = (r - dz) / max(1e-6, (1.0 - dz))
    gamma = float(b.get('brake_gamma', 1.0))
    if abs(gamma - 1.0) > 1e-6:
        r = math.pow(max(0.0, r), gamma)
    cap = b.get('brake_axis_max')
    if cap is not None:
        r = min(r, float(cap))
    return max(0.0, min(1.0, r))


def _append_brake_motion_log(fe, raw, vjoy_axis):
    if os.environ.get('VC_BRAKE_MOTION_LOG', '1').strip() in ('0', 'false', 'no'):
        return
    try:
        sim = _try_read_sim_brake_pedal()
        fe100 = round(float(fe) * 100.0, 6)
        raw100 = round(float(raw) * 100.0, 6)
        sim_cell = '' if sim is None else round(float(sim), 6)
        d = os.path.dirname(BRAKE_MOTION_LOG_PATH)
        if d:
            os.makedirs(d, exist_ok=True)
        with _brake_motion_log_lock:
            new_file = (not os.path.exists(BRAKE_MOTION_LOG_PATH)) or os.path.getsize(BRAKE_MOTION_LOG_PATH) == 0
            with open(BRAKE_MOTION_LOG_PATH, 'a', newline='', encoding='utf-8') as fp:
                w = csv.writer(fp)
                if new_file:
                    w.writerow([
                        'unix_time',
                        'frontend_0_100',
                        'sent_0_100',
                        'vjoy_axis',
                        'sim_connect',
                    ])
                vjoy_cell = '' if vjoy_axis is None else int(vjoy_axis)
                w.writerow([
                    f'{time.time():.6f}',
                    fe100,
                    raw100,
                    vjoy_cell,
                    sim_cell,
                ])
    except Exception:
        pass


PROFILE_JSON_DATA = {
    'fenix_a320': {
        'name': 'Fenix A320',
        'ui': {
            'mobiflight_mip_controls': True,
            'camera_config': [
                {'id': 1, 'name': 'Captain'},
                {'id': 2, 'name': 'Left Engine'},
                {'id': 3, 'name': 'Left Wing'},
                {'id': 4, 'name': 'Right Engine'},
                {'id': 5, 'name': 'Right Wing'},
                {'id': 6, 'name': 'EFB'},
                {'id': 7, 'name': 'FMC'},
                {'id': 8, 'name': 'Overhead'},
                {'id': 9, 'name': 'MCP'},
                {'id': 10, 'name': 'Custom'},
                {'id': 11, 'name': 'EXT'}
            ],
            'flap_detents': [
                {'index': 0, 'label': '0', 'val': 0.0},
                {'index': 1, 'label': '1', 'val': 0.25},
                {'index': 2, 'label': '2', 'val': 0.5},
                {'index': 3, 'label': '3', 'val': 0.75},
                {'index': 4, 'label': 'FULL', 'val': 1.0}
            ],
            'throttle_detents': [
                {'label': 'CLB', 'val': 0.70},
                {'label': 'FLX/MCT', 'val': 0.85},
                {'label': 'TO/GA', 'val': 1.0}
            ],
            'control_sensitivity': 1,
            'control_response': 1.6,
            'throttle_detent_snap': 0.05,
            'reverse_behavior': {
                'spool_down_ms': 0,
                'idle_floor': 0.007,
                'idle_rev': 0.0065,
                'idle_bump_up': 0.05,
                'idle_bump_ms': 150,
                'idle_bump_down': 0.0005
            },
            'arm_spoilers_button': True
        },
        'mappings': {
            'vjoy': {
                'REVERSE_TOGGLE': 2,
                'IDLE_BUTTON': 3,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    },
    'fenix_a350': {
        'name': 'Fenix A350',
        'ui': {
            'mobiflight_mip_controls': False,
            'camera_config': [
                {'id': 1, 'name': 'Captain'},
                {'id': 2, 'name': 'Left Engine'},
                {'id': 3, 'name': 'Left Wing'},
                {'id': 4, 'name': 'Right Engine'},
                {'id': 5, 'name': 'Right Wing'},
                {'id': 6, 'name': 'EFB'},
                {'id': 7, 'name': 'FMC'},
                {'id': 8, 'name': 'Overhead'},
                {'id': 9, 'name': 'MCP'},
                {'id': 10, 'name': 'Custom'},
                {'id': 11, 'name': 'EXT'}
            ],
            'flap_detents': [
                {'index': 0, 'label': '0', 'val': 0.0},
                {'index': 1, 'label': '1', 'val': 0.25},
                {'index': 2, 'label': '2', 'val': 0.5},
                {'index': 3, 'label': '3', 'val': 0.75},
                {'index': 4, 'label': 'FULL', 'val': 1.0}
            ],
            'throttle_detents': [
                {'label': 'CLB', 'val': 0.70},
                {'label': 'FLX/MCT', 'val': 0.85},
                {'label': 'TO/GA', 'val': 1.0}
            ],
            'control_sensitivity': 1,
            'control_response': 1.6,
            'throttle_detent_snap': 0.05,
            'reverse_behavior': {
                'spool_down_ms': 0,
                'idle_floor': 0.007,
                'idle_rev': 0.0065,
                'idle_bump_up': 0.05,
                'idle_bump_ms': 150,
                'idle_bump_down': 0.0005
            },
            'arm_spoilers_button': True
        },
        'mappings': {
            'vjoy': {
                'PARKING_BRAKE': 1,
                'REVERSE_TOGGLE': 2,
                'IDLE_BUTTON': 3,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    },
    'ini_a350': {
        'name': 'iniBuilds A350',
        'ui': {
            'mobiflight_mip_controls': True,
            'camera_config': [
                {'id': 1, 'name': 'Captain'},
                {'id': 2, 'name': 'Left Engine'},
                {'id': 3, 'name': 'Left Wing'},
                {'id': 4, 'name': 'Right Engine'},
                {'id': 5, 'name': 'Right Wing'},
                {'id': 6, 'name': 'EFB'},
                {'id': 7, 'name': 'FMC'},
                {'id': 8, 'name': 'Overhead'},
                {'id': 9, 'name': 'MCP'},
                {'id': 10, 'name': 'Custom'},
                {'id': 11, 'name': 'EXT'}
            ],
            'flap_detents': [
                {'index': 0, 'label': '0', 'val': 0.0},
                {'index': 1, 'label': '1', 'val': 0.25},
                {'index': 2, 'label': '2', 'val': 0.5},
                {'index': 3, 'label': '3', 'val': 0.75},
                {'index': 4, 'label': 'FULL', 'val': 1.0}
            ],
            'throttle_detents': [
                {'label': 'CLB', 'val': 0.70},
                {'label': 'FLX/MCT', 'val': 0.85},
                {'label': 'TO/GA', 'val': 1.0}
            ],
            'control_sensitivity': 1,
            'control_response': 1.6,
            'throttle_detent_snap': 0.05,
            'reverse_behavior': {
                'spool_down_ms': 0,
                'idle_floor': 0.007,
                'idle_rev': 0.0065,
                'idle_bump_up': 0.05,
                'idle_bump_ms': 150,
                'idle_bump_down': 0.0005
            },
            'arm_spoilers_button': True
        },
        'mappings': {
            'vjoy': {
                'PARKING_BRAKE': 1,
                'REVERSE_TOGGLE': 2,
                'IDLE_BUTTON': 3,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    },
    'pmdg_737': {
        'name': 'PMDG 737',
        'ui': {
            'camera_config': [
                {'id': 1, 'name': 'Captain'},
                {'id': 2, 'name': 'Left Engine'},
                {'id': 3, 'name': 'Left Wing'},
                {'id': 4, 'name': 'Right Engine'},
                {'id': 5, 'name': 'Right Wing'},
                {'id': 6, 'name': 'EFB'},
                {'id': 7, 'name': 'FMC'},
                {'id': 8, 'name': 'Overhead'},
                {'id': 9, 'name': 'MCP'},
                {'id': 10, 'name': 'Custom'}
            ],
            'flap_detents': [
                {'index': 0, 'label': 'UP', 'val': 0.0},
                {'index': 1, 'label': '1', 'val': 0.16},
                {'index': 2, 'label': '5', 'val': 0.33},
                {'index': 3, 'label': '15', 'val': 0.50},
                {'index': 4, 'label': '20', 'val': 0.66},
                {'index': 5, 'label': '25', 'val': 0.83},
                {'index': 6, 'label': '30', 'val': 1.0}
            ]
        },
        'mappings': {
            'vjoy': {
                'PARKING_BRAKE': 1,
                'REVERSE_TOGGLE': 2,
                'IDLE_BUTTON': 3,
                'GEAR_UP': 4,
                'GEAR_DOWN': 4,
                'CAM_UP': 6,
                'CAM_DOWN': 7,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    },
    'pmdg_777': {
        'name': 'PMDG 777',
        'ui': {
            'camera_config': [
                {'id': 1, 'name': 'Captain'},
                {'id': 2, 'name': 'Left Engine'},
                {'id': 3, 'name': 'Left Wing'},
                {'id': 4, 'name': 'Right Engine'},
                {'id': 5, 'name': 'Right Wing'},
                {'id': 6, 'name': 'EFB'},
                {'id': 7, 'name': 'FMC'},
                {'id': 8, 'name': 'Overhead'},
                {'id': 9, 'name': 'MCP'},
                {'id': 10, 'name': 'Custom'}
            ],
            'flap_detents': [
                {'index': 0, 'label': 'UP', 'val': 0.0},
                {'index': 1, 'label': '1', 'val': 0.16},
                {'index': 2, 'label': '5', 'val': 0.33},
                {'index': 3, 'label': '15', 'val': 0.50},
                {'index': 4, 'label': '20', 'val': 0.66},
                {'index': 5, 'label': '25', 'val': 0.83},
                {'index': 6, 'label': '30', 'val': 1.0}
            ]
        },
        'mappings': {
            'vjoy': {
                'PARKING_BRAKE': 1,
                'REVERSE_TOGGLE': 2,
                'IDLE_BUTTON': 3,
                'GEAR_UP': 4,
                'GEAR_DOWN': 4,
                'CAM_UP': 6,
                'CAM_DOWN': 7,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    }
}

@app.before_request
def require_pin():
    if request.endpoint == 'static':
        return
    if request.path == '/test.html':
        return
    allowed = {'index', 'verify_pin', 'set_session'}
    if request.endpoint in allowed:
        return
    if request.endpoint is None:
        return
    if session.get('authed') is True:
        return
    return redirect(url_for('index'))

def init_systems():
    global device_1, device_2
    device_1 = None
    device_2 = None
    try:
        device_1 = pyvjoy.VJoyDevice(1)
        device_2 = pyvjoy.VJoyDevice(2)
    except Exception:
        pass
    # SimConnect/MobiFlight connect lazily when MSFS is running (see fsuipc_wapi_reader, _ensure_aircraft_requests).

def should_init_systems(debug_enabled):
    if not debug_enabled:
        return True
    return os.environ.get("WERKZEUG_RUN_MAIN") == "true"

@app.route('/')
def index():
    return render_template('index.html', debug_ui=app.debug)

@app.route('/site.webmanifest')
def site_webmanifest():
    path = os.path.join(app.static_folder, 'site.webmanifest')
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, mimetype='application/manifest+json')

@app.route('/ofp', methods=['GET'])
def get_ofp_pdf():
    api_url = 'https://www.simbrief.com/api/xml.fetcher.php?userid=193599&json=1'
    try:
        with urllib.request.urlopen(api_url, timeout=10) as response:
            payload = response.read().decode('utf-8')
        data = json_lib.loads(payload)
        files = data.get('files') or {}
        directory = files.get('directory') or ''
        pdf = files.get('pdf') or {}
        link = pdf.get('link') or ''
        if not directory or not link:
            return jsonify({"error": "missing_ofp_link"}), 502
        pdf_url = directory.rstrip('/') + '/' + link.lstrip('/')
        
        origin = data.get('origin', {})
        destination = data.get('destination', {})
        origin_icao = origin.get('icao_code', '')
        dest_icao = destination.get('icao_code', '')
        
        metars = {}
        if origin_icao:
            try:
                metar_url = f'https://aviationweather.gov/api/data/metar?ids={origin_icao}&format=json'
                with urllib.request.urlopen(metar_url, timeout=5) as metar_resp:
                    metar_data = json_lib.loads(metar_resp.read().decode('utf-8'))
                    if metar_data and len(metar_data) > 0:
                        metars['origin'] = metar_data[0].get('rawOb', '')
            except Exception:
                metars['origin'] = ''
        
        if dest_icao:
            try:
                metar_url = f'https://aviationweather.gov/api/data/metar?ids={dest_icao}&format=json'
                with urllib.request.urlopen(metar_url, timeout=5) as metar_resp:
                    metar_data = json_lib.loads(metar_resp.read().decode('utf-8'))
                    if metar_data and len(metar_data) > 0:
                        metars['destination'] = metar_data[0].get('rawOb', '')
            except Exception:
                metars['destination'] = ''
        
        return jsonify({
            "pdf_url": pdf_url,
            "metars": metars,
            "origin_icao": origin_icao,
            "destination_icao": dest_icao
        })
    except Exception:
        return jsonify({"error": "ofp_fetch_failed"}), 502

@app.route('/metar', methods=['GET'])
def get_metar():
    origin_icao = request.args.get('origin', '')
    dest_icao = request.args.get('destination', '')
    metars = {}
    
    if origin_icao:
        try:
            metar_url = f'https://aviationweather.gov/api/data/metar?ids={origin_icao}&format=json'
            with urllib.request.urlopen(metar_url, timeout=5) as metar_resp:
                metar_data = json_lib.loads(metar_resp.read().decode('utf-8'))
                if metar_data and len(metar_data) > 0:
                    metars['origin'] = metar_data[0].get('rawOb', '')
        except Exception:
            metars['origin'] = ''
    
    if dest_icao:
        try:
            metar_url = f'https://aviationweather.gov/api/data/metar?ids={dest_icao}&format=json'
            with urllib.request.urlopen(metar_url, timeout=5) as metar_resp:
                metar_data = json_lib.loads(metar_resp.read().decode('utf-8'))
                if metar_data and len(metar_data) > 0:
                    metars['destination'] = metar_data[0].get('rawOb', '')
        except Exception:
            metars['destination'] = ''
    
    return jsonify({"metars": metars})

@app.route('/lvars', methods=['GET', 'POST'])
def lvars():
    if request.method == 'GET':
        from backend.fsuipc_wapi_reader import read_lvars_payload
        profile_name = request.args.get('profile') or session.get('active_profile', 'fenix_a320')
        result = read_lvars_payload(profile_name)
        _log_lvar_read_debug(profile_name, result)
        if "error" in result:
            app.logger.warning('[lvars] GET error profile=%s payload.error=%s', profile_name, result.get('error'))
            return jsonify(result), 503
        return jsonify(result)
    data = request.json or {}
    key = data.get('key')
    value = data.get('value')
    if key is None or value is None:
        return jsonify({"error": "missing_key_or_value"}), 400
    profile_override = data.get('profile')
    profile_name = profile_override or session.get('active_profile', 'fenix_a320')
    try:
        val = float(value)
    except Exception:
        return jsonify({"error": "invalid_value"}), 400
    result = write_lvar_value(profile_name, key, val)
    if "error" in result:
        return jsonify(result), 503
    return jsonify(result)

@app.route('/lvars/step', methods=['POST'])
def step_lvar():
    
    data = request.json or {}
    key = data.get('key')
    delta = data.get('delta')
    if key is None or delta is None:
        return jsonify({"error": "missing_key_or_delta"}), 400
    profile_override = data.get('profile')
    profile_name = profile_override or session.get('active_profile', 'fenix_a320')
    try:
        delta_val = float(delta)
    except Exception:
        return jsonify({"error": "invalid_delta"}), 400
    result = step_lvar_value(profile_name, key, delta_val)
    
    if "error" in result:
        return jsonify(result), 503
    return jsonify(result)

@app.route('/verify_pin', methods=['POST'])
def verify_pin():
    data = request.json or {}
    if str(data.get('pin', '')) == PIN:
        session['authed'] = True
        return jsonify({'ok': True})
    return jsonify({'ok': False}), 401

@app.route('/session', methods=['POST'])
def set_session():
    data = request.json or {}
    pin = str(data.get('pin', ''))
    profile_name = data.get('profile')
    if pin != PIN:
        return jsonify({'ok': False}), 401
    if not profile_name:
        return jsonify({"error": "missing_profile"}), 400
    session['authed'] = True
    session['active_profile'] = profile_name
    return jsonify({'ok': True, 'profile': profile_name})

@app.route('/profiles/<profile_name>')
def serve_profile(profile_name):
    if not profile_name.endswith('.js'):
        profile_name = f'{profile_name}.js'
    profile_path = os.path.join(BASE_DIR, 'profiles', profile_name)
    if os.path.exists(profile_path):
        with open(profile_path, 'r') as f:
            return f.read(), 200, {'Content-Type': 'application/javascript'}
    return '', 404

@app.route('/profiles/<profile_name>.json')
def serve_profile_json(profile_name):
    name = profile_name
    if name.endswith('.json'):
        name = name[:-5]
    data = PROFILE_JSON_DATA.get(name)
    if not data:
        return '', 404
    return jsonify(data)

@app.route('/test.html')
def serve_test_html():
    path = os.path.join(BASE_DIR, 'test.html')
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, mimetype='text/html')

@app.route('/<page>.html')
def serve_page(page):
    allowed = {'index', 'fenix_a320', 'fenix_a350', 'ini_a350', 'pmdg_737', 'pmdg_777'}
    if page in allowed:
        profile_name = page if page != 'index' else 'pmdg_777'
        session['active_profile'] = profile_name
        return render_template(f"{page}.html", profile_name=profile_name, debug_ui=app.debug)
    return render_template('index.html'), 404


@app.route('/update_sim', methods=['POST'])
def update_sim():
    global device_1, device_2
    data = request.json or {}
    t = data.get('type')
    val = float(data.get('value', 0))
    rev = data.get('reverse', False)
    profile_override = data.get('profile')
    profile_name = profile_override or session.get('active_profile', 'pmdg_777')
    profile = get_profile(profile_name)

    try:
        handler = profile.get('handlers', {}).get(t)
        if handler:
            if device_1 is None:
                return jsonify({"error": "No vJoy"}), 500
            result = handler(data, device_1, device_2, 0, aq)
            if isinstance(result, tuple):
                return result
            if isinstance(result, dict):
                return jsonify(result)
            return jsonify({"status": "success"})

        if t == 'brakes':
            fe = max(0.0, min(1.0, float(data.get('value', val))))
            linear = _brake_linear_01(fe, profile)
            axis_val = _brake_axis_command(linear, profile)
            brake_lvar_keys = profile.get('backend', {}).get('brake_lvar_keys')
            if brake_lvar_keys:
                for bk in brake_lvar_keys:
                    wres = write_lvar_value(profile_name, bk, linear)
                    if 'error' in wres:
                        return jsonify(wres), 503
                _append_brake_motion_log(fe, axis_val, None)
                # Fenix L:N_FC_BRAKE_* = cockpit animation only; MSFS braking = vJoy axes (see profile brake_axes).
                if device_1 is not None:
                    iv = int(axis_val * 32767)
                    axes = profile.get('backend', {}).get('brake_axes') or ('SL1',)
                    for ax in axes:
                        hid = getattr(pyvjoy, 'HID_USAGE_' + str(ax), None)
                        if hid is not None:
                            device_1.set_axis(hid, iv)
                return jsonify({"status": "success"})
            if device_1 is None:
                return jsonify({"error": "No vJoy"}), 500
            iv = int(axis_val * 32767)
            _append_brake_motion_log(fe, axis_val, iv)
            axes = profile.get('backend', {}).get('brake_axes') or ('SL1',)
            for ax in axes:
                hid = getattr(pyvjoy, 'HID_USAGE_' + str(ax), None)
                if hid is not None:
                    device_1.set_axis(hid, iv)
            return jsonify({"status": "success"})

        if device_1 is None:
            return jsonify({"error": "No vJoy"}), 500

        if t == 'throttle':
            device_1.set_button(2, 1 if rev else 0)
            device_1.set_axis(pyvjoy.HID_USAGE_Z, int(val * 32767))

        elif t == 'rudder':
            device_1.set_axis(pyvjoy.HID_USAGE_RX, int(val * 32767))

        elif t == 'spoilers':
            f = profile['backend']['spoiler_formula'](val)
            device_1.set_axis(pyvjoy.HID_USAGE_Y, int(f * 32767))

        elif t == 'arm_spoilers':
            device_1.set_axis(pyvjoy.HID_USAGE_Y, int(profile['backend']['arm_spoiler_value'] * 32767))

        elif t == 'flaps_axis':
            mapped_val = profile['backend']['flap_axis_mapping'](val)
            device_1.set_axis(pyvjoy.HID_USAGE_SL0, int(mapped_val))

        elif t == 'flap_command':
            btn = 20 if val == 0 else 21
            device_1.set_button(btn, 1)
            time.sleep(0.1)
            device_1.set_button(btn, 0)

        elif t == 'camera':
            cid = int(data.get('cam_id'))
            btn = 22 if cid == 11 else (9 + cid)
            device_1.set_button(btn, 1)
            time.sleep(0.05)
            device_1.set_button(btn, 0)

        elif t == 'flight_controls':
            val_x = float(data.get('val_x', 0.5))
            val_y = float(data.get('val_y', 0.5))
            device_1.set_axis(pyvjoy.HID_USAGE_RZ, int(val_x * 32767))
            device_1.set_axis(pyvjoy.HID_USAGE_RY, int(val_y * 32767))

        elif t == 'gear_command':
            btn = 4
            device_1.set_button(btn, 1)
            time.sleep(0.1)
            device_1.set_button(btn, 0)

        elif t == 'idle_command':
            device_1.set_axis(pyvjoy.HID_USAGE_Z, 0)
            device_1.set_button(3, 1)
            time.sleep(0.1)
            device_1.set_button(3, 0)

        elif t == 'vjoy_button':
            btn = int(data.get('button', 0))
            if btn > 0:
                device_1.set_button(btn, 1)
                time.sleep(0.05)
                device_1.set_button(btn, 0)

        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _debug_sim_print_loop():
    pass

if __name__ == '__main__':
    debug_enabled = len(sys.argv) > 1 and sys.argv[1] == "1"

    if should_init_systems(debug_enabled):
        init_systems()

    use_reloader = debug_enabled
    if debug_enabled and (not use_reloader or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        daemon = threading.Thread(target=_debug_sim_print_loop, daemon=True)
        daemon.start()

    use_https = len(sys.argv) > 2 and sys.argv[2] == "1"
    if use_https:
        app.run(host='0.0.0.0', port=5000, debug=debug_enabled, use_reloader=debug_enabled, ssl_context='adhoc')
    else:
        app.run(host='0.0.0.0', port=5000, debug=debug_enabled, use_reloader=debug_enabled)
