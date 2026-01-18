import sys
import os
from flask import Flask, render_template, request, jsonify, session
import pyvjoy
import time
import threading
import math
from SimConnect import SimConnect, AircraftRequests
from profiles import get_profile
from backend.fsuipc_wapi_reader import read_lvars_payload, write_lvar_value, step_lvar_value

app = Flask(__name__)
app.secret_key = 'ipad_joy_secret_key'
app.config['SESSION_TYPE'] = 'filesystem'
device_1 = None
device_2 = None
aq = None
current_wheel_brake = 0
PIN = '1234'

def init_systems():
    global device_1, device_2, aq
    try:
        device_1 = pyvjoy.VJoyDevice(1)
        device_2 = pyvjoy.VJoyDevice(2)
        sm = SimConnect()
        sm.connect()
        aq = AircraftRequests(sm)
        print("--- vJoy and SimConnect Successfully Acquired ---")
    except Exception as e:
        print(f"System Error: {e}")

def should_init_systems(debug_enabled):
    if not debug_enabled:
        return True
    return os.environ.get("WERKZEUG_RUN_MAIN") == "true"

def pb_release_logic(restore_val):
    global device_1
    device_1.set_button(1, 1)
    time.sleep(0.1)
    device_1.set_button(1, 0)
    device_1.set_axis(pyvjoy.HID_USAGE_X, 32767)
    time.sleep(1.0)
    device_1.set_axis(pyvjoy.HID_USAGE_X, int(restore_val * 32767))

@app.route('/')
def index():
    return render_template('index.html', debug_ui=app.debug)

@app.route('/get_sim', methods=['GET'])
def get_sim():
    if aq is None:
        return jsonify({})
    try:
        return jsonify({
            "flaps": aq.get("FLAPS_HANDLE_INDEX"),
            "spoilers": aq.get("SPOILERS_HANDLE_POSITION"),
            "gear": aq.get("GEAR_HANDLE_POSITION")
        })
    except:
        return jsonify({})

@app.route('/lvars', methods=['GET'])
def get_lvars():
    payload = read_lvars_payload()
    if "error" in payload:
        return jsonify(payload), 503
    return jsonify(payload)

@app.route('/lvars', methods=['POST'])
def set_lvar():
    data = request.json or {}
    key = data.get('key')
    value = data.get('value')
    if key is None or value is None:
        return jsonify({"error": "missing_key_or_value"}), 400
    try:
        val = float(value)
    except Exception:
        return jsonify({"error": "invalid_value"}), 400
    result = write_lvar_value(key, val)
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
    try:
        delta_val = float(delta)
    except Exception:
        return jsonify({"error": "invalid_delta"}), 400
    result = step_lvar_value(key, delta_val)
    if "error" in result:
        return jsonify(result), 503
    return jsonify(result)

@app.route('/verify_pin', methods=['POST'])
def verify_pin():
    data = request.json or {}
    if str(data.get('pin', '')) == PIN:
        return jsonify({'ok': True})
    return jsonify({'ok': False}), 401

@app.route('/profiles/<profile_name>')
def serve_profile(profile_name):
    if not profile_name.endswith('.js'):
        profile_name = f'{profile_name}.js'
    profile_path = os.path.join('profiles', profile_name)
    if os.path.exists(profile_path):
        with open(profile_path, 'r') as f:
            return f.read(), 200, {'Content-Type': 'application/javascript'}
    return '', 404

@app.route('/<page>.html')
def serve_page(page):
    print(f"Serving page: {page}")
    allowed = {'index', 'fenix_a320', 'pmdg_737', 'pmdg_777'}
    if page in allowed:
        profile_name = page if page != 'index' else 'pmdg_777'
        session['active_profile'] = profile_name
        return render_template(f"{page}.html", profile_name=profile_name, debug_ui=app.debug)
    return render_template('index.html'), 404



@app.route('/update_sim', methods=['POST'])
def update_sim():
    global device_1, device_2, current_wheel_brake
    if device_1 is None:
        return jsonify({"error": "No vJoy"}), 500
    data = request.json or {}
    t = data.get('type')
    val = float(data.get('value', 0))
    rev = data.get('reverse', False)
    profile_name = session.get('active_profile', 'pmdg_777')
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

        elif t == 'parking_brake':
            if int(data.get('state', 0)) == 0:
                threading.Thread(
                    target=pb_release_logic,
                    args=(current_wheel_brake,),
                    daemon=True
                ).start()
            else:
                device_1.set_button(1, 1)
                time.sleep(0.1)
                device_1.set_button(1, 0)

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

        elif t == 'cam_control':
            if device_2 is None:
                return jsonify({"error": "No vJoy Device 2"}), 500

            if not data.get("active", False):
                return jsonify({"status": "ignored"})

            val_x = float(data.get('val_x', 0.5))
            val_y = float(data.get('val_y', 0.5))

            device_2.set_axis(pyvjoy.HID_USAGE_X, int(val_x * 32767))
            device_2.set_axis(pyvjoy.HID_USAGE_Y, int((1 - val_y) * 32767))
        
        elif t == 'vjoy_button':
            btn = int(data.get('button', 0))
            if btn > 0:
                device_1.set_button(btn, 1)
                time.sleep(0.05)
                device_1.set_button(btn, 0)

        return jsonify({"status": "success"})

    except Exception as e:
        print(f"Error updating sim: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    debug_enabled = len(sys.argv) > 1 and sys.argv[1] == "1"

    if should_init_systems(debug_enabled):
        init_systems()

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=debug_enabled,
        use_reloader=debug_enabled
    )
