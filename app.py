import sys
import os
import logging
import socket
import struct
import json as json_lib
import urllib.request
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import pyvjoy
import time
import threading
import math
from SimConnect import SimConnect, AircraftRequests
from profiles import get_profile
from backend.fsuipc_wapi_reader import write_lvar_value, step_lvar_value

if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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
current_wheel_brake = 0
PIN = '1234'
PROFILE_JSON_DATA = {
    'fenix_a320': {
        'name': 'Fenix A320',
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
                'ARM_SPOILERS': 35,
                'GEAR_UP': 4,
                'GEAR_DOWN': 4,
                'AUTOPILOT': 5,
                'CAM_MOVE_MODE': 8,
                'CAM_BASE': 10
            }
        }
    },
    'fenix_a350': {
        'name': 'Fenix A350',
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
                'ARM_SPOILERS': 35,
                'GEAR_UP': 4,
                'GEAR_DOWN': 4,
                'AUTOPILOT': 5,
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
                'AUTOPILOT': 5,
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
                'AUTOPILOT': 5,
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
    allowed = {'index', 'verify_pin', 'set_session'}
    if request.endpoint in allowed:
        return
    if request.endpoint is None:
        return
    if session.get('authed') is True:
        return
    return redirect(url_for('index'))

def init_systems():
    global device_1, device_2, aq
    try:
        device_1 = pyvjoy.VJoyDevice(1)
        device_2 = pyvjoy.VJoyDevice(2)
        sm = SimConnect()
        sm.connect()
        aq = AircraftRequests(sm)
    except Exception as e:
        pass

def should_init_systems(debug_enabled):
    if not debug_enabled:
        return True
    return os.environ.get("WERKZEUG_RUN_MAIN") == "true"

@app.route('/')
def index():
    return render_template('index.html', debug_ui=app.debug)

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

@app.route('/lvars', methods=['POST'])
def set_lvar():
    data = request.json or {}
    key = data.get('key')
    value = data.get('value')
    if key is None or value is None:
        return jsonify({"error": "missing_key_or_value"}), 400
    profile_override = data.get('profile')
    profile_name = profile_override or session.get('active_profile', 'pmdg_777')
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
    profile_name = profile_override or session.get('active_profile', 'pmdg_777')
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

@app.route('/<page>.html')
def serve_page(page):
    allowed = {'index', 'fenix_a320', 'fenix_a350', 'pmdg_737', 'pmdg_777'}
    if page in allowed:
        profile_name = page if page != 'index' else 'pmdg_777'
        session['active_profile'] = profile_name
        return render_template(f"{page}.html", profile_name=profile_name, debug_ui=app.debug)
    return render_template('index.html'), 404

@app.route('/debug/orientation', methods=['POST'])
def debug_orientation():
    data = request.json or {}
    if 'alpha' in data and 'beta' in data and 'gamma' in data:
        alpha = data.get('alpha')
        beta = data.get('beta')
        gamma = data.get('gamma')
        print(f"ORIENTATION DEBUG: alpha={alpha}° beta={beta}° gamma={gamma}°")
    else:
        status = data.get('status', 'unknown')
        message = data.get('message', '')
        print(f"ORIENTATION DEBUG [{status}]: {message}")
    return jsonify({"status": "logged"})

@app.route('/update_sim', methods=['POST'])
def update_sim():
    global device_1, device_2, current_wheel_brake
    if device_1 is None:
        return jsonify({"error": "No vJoy"}), 500
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
            result = handler(data, device_1, device_2, current_wheel_brake, aq)
            if isinstance(result, tuple):
                return result
            if isinstance(result, dict):
                return jsonify(result)
            return jsonify({"status": "success"})

        if t == 'throttle':
            device_1.set_button(2, 1 if rev else 0)
            device_1.set_axis(pyvjoy.HID_USAGE_Z, int(val * 32767))

        elif t == 'rudder':
            device_1.set_axis(pyvjoy.HID_USAGE_RX, int(val * 32767))

        elif t == 'brakes':
            current_wheel_brake = val
            device_1.set_axis(pyvjoy.HID_USAGE_X, int(val * 32767))

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
            btn = 9 + int(data.get('cam_id'))
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
