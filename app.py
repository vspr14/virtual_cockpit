import sys
import os
import logging
import socket
import struct
import json as json_lib
import asyncio
import io
import av
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from aiortc import RTCPeerConnection, RTCSessionDescription
from PIL import Image
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
logging.getLogger('werkzeug').setLevel(logging.ERROR)
av.logging.set_level(av.logging.ERROR)
socketio = SocketIO(app, cors_allowed_origins="*")
device_1 = None
device_2 = None
aq = None
current_wheel_brake = 0
PIN = '1234'

headtrack_config = {
    'host': 'localhost',
    'port': 5001,
    'sensitivity': {'pitch': 50.0, 'roll': 50.0, 'yaw': 50.0, 'x': 50.0, 'y': 50.0, 'z': 50.0},
    'smoothing': 0.0,
    'invert': {'pitch': False, 'roll': False, 'yaw': False, 'x': False, 'y': False, 'z': False}
}

udp_socket = None
headtrack_active = False
webrtc_loop = None
webrtc_thread = None
webrtc_pc = None
latest_jpeg = None
latest_jpeg_ts = 0.0
WEBRTC_STREAM_FPS = 60
frame_lock = threading.Lock()
frame_event = threading.Event()

@app.before_request
def require_pin():
    allowed = {'index', 'verify_pin'}
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

def _webrtc_loop_worker(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()

def ensure_webrtc_loop():
    global webrtc_loop, webrtc_thread
    if webrtc_loop is None:
        loop = asyncio.new_event_loop()
        webrtc_loop = loop
        thread = threading.Thread(target=_webrtc_loop_worker, args=(loop,), daemon=True)
        webrtc_thread = thread
        thread.start()

async def _close_webrtc_pc():
    global webrtc_pc
    if webrtc_pc is not None:
        await webrtc_pc.close()
        webrtc_pc = None

async def _consume_track(track):
    global latest_jpeg, latest_jpeg_ts
    while True:
        frame = await track.recv()
        now = time.time()
        if now - latest_jpeg_ts < 1.0 / WEBRTC_STREAM_FPS:
            continue
        latest_jpeg_ts = now
        arr = frame.to_ndarray(format="rgb24")
        img = Image.fromarray(arr)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=80)
        data = buf.getvalue()
        with frame_lock:
            latest_jpeg = data
        frame_event.set()

async def _handle_offer(offer_sdp, offer_type):
    global webrtc_pc
    await _close_webrtc_pc()
    pc = RTCPeerConnection()
    webrtc_pc = pc

    @pc.on("track")
    def on_track(track):
        if track.kind == "video":
            asyncio.create_task(_consume_track(track))

    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type=offer_type))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return pc.localDescription

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

def build_freetrack_packet(pitch, yaw, roll, x, y, z):
    packet = bytearray(32)
    struct.pack_into('<I', packet, 0, 0x12345678)
    struct.pack_into('<i', packet, 4, int(pitch * 100))
    struct.pack_into('<i', packet, 8, int(yaw * 100))
    struct.pack_into('<i', packet, 12, int(roll * 100))
    struct.pack_into('<i', packet, 16, int(x * 100))
    struct.pack_into('<i', packet, 20, int(y * 100))
    struct.pack_into('<i', packet, 24, int(z * 100))
    return bytes(packet)

def build_opentrack_udp_packet(pitch, yaw, roll, x, y, z):
    packet = bytearray(48)
    struct.pack_into('<d', packet, 0, float(x))
    struct.pack_into('<d', packet, 8, float(y))
    struct.pack_into('<d', packet, 16, float(z))
    struct.pack_into('<d', packet, 24, float(yaw))
    struct.pack_into('<d', packet, 32, float(pitch))
    struct.pack_into('<d', packet, 40, float(roll))
    return bytes(packet)

def send_udp_packet(data):
    global udp_socket, headtrack_config
    try:
        if udp_socket is None:
            udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            host = headtrack_config['host']
            if host == 'localhost':
                host = '127.0.0.1'
            print(f"UDP socket created, sending to {host}:{headtrack_config['port']}")
        pitch = data.get('pitch', 0.0)
        yaw = data.get('yaw', 0.0)
        roll = data.get('roll', 0.0)
        x = data.get('x', 0.0)
        y = data.get('y', 0.0)
        z = data.get('z', 0.0)
        print(f"UDP -> OpenTrack: pitch={pitch:.3f}, yaw={yaw:.3f}, roll={roll:.3f}, x={x:.3f}, y={y:.3f}, z={z:.3f}")
        packet = build_opentrack_udp_packet(pitch, yaw, roll, x, y, z)
        host = headtrack_config['host']
        if host == 'localhost':
            host = '127.0.0.1'
        bytes_sent = udp_socket.sendto(packet, (host, headtrack_config['port']))
        print(f"Sent {bytes_sent} bytes to {host}:{headtrack_config['port']}")
    except Exception as e:
        print(f"UDP send error: {e}")

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
    profile_name = session.get('active_profile', 'pmdg_777')
    payload = read_lvars_payload(profile_name)
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
    profile_name = session.get('active_profile', 'pmdg_777')
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
    try:
        delta_val = float(delta)
    except Exception:
        return jsonify({"error": "invalid_delta"}), 400
    profile_name = session.get('active_profile', 'pmdg_777')
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
        return jsonify({"error": str(e)}), 500

@app.route('/headtrack/config', methods=['GET'])
def get_headtrack_config():
    return jsonify(headtrack_config)

@app.route('/headtrack/config', methods=['POST'])
def set_headtrack_config():
    global headtrack_config
    data = request.json or {}
    if 'host' in data:
        headtrack_config['host'] = str(data['host'])
    if 'port' in data:
        headtrack_config['port'] = int(data['port'])
    if 'sensitivity' in data:
        headtrack_config['sensitivity'].update(data['sensitivity'])
    if 'smoothing' in data:
        headtrack_config['smoothing'] = float(data['smoothing'])
    if 'invert' in data:
        headtrack_config['invert'].update(data['invert'])
    return jsonify({"status": "ok", "config": headtrack_config})

@app.route('/webrtc/offer', methods=['POST'])
def webrtc_offer():
    data = request.json or {}
    sdp = data.get('sdp')
    type_ = data.get('type')
    if not sdp or not type_:
        return jsonify({"error": "Missing sdp/type"}), 400
    ensure_webrtc_loop()
    fut = asyncio.run_coroutine_threadsafe(_handle_offer(sdp, type_), webrtc_loop)
    desc = fut.result()
    return jsonify({"sdp": desc.sdp, "type": desc.type})

@app.route('/webrtc/stop', methods=['POST'])
def webrtc_stop():
    if webrtc_loop is not None:
        asyncio.run_coroutine_threadsafe(_close_webrtc_pc(), webrtc_loop)
    return jsonify({"status": "ok"})

@app.route('/stream_mjpeg')
def stream_mjpeg(): 
    def generate():
        while True:
            frame_event.wait(1.0)
            frame_event.clear()
            with frame_lock:
                frame = latest_jpeg
            if frame is None:
                continue
            yield b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + str(len(frame)).encode() + b'\r\n\r\n' + frame + b'\r\n'
    return app.response_class(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@socketio.on('headtrack_data')
def handle_headtrack_data(data):
    global headtrack_active
    print(f"headtrack_data received, headtrack_active={headtrack_active}")
    if headtrack_active:
        print("Calling send_udp_packet")
        send_udp_packet(data)
    else:
        print("headtrack_active is False, not sending UDP")

@socketio.on('headtrack_start')
def handle_headtrack_start():
    global headtrack_active
    print("headtrack_start event received")
    headtrack_active = True
    print(f"headtrack_active set to {headtrack_active}")
    emit('headtrack_status', {'active': True})

@socketio.on('headtrack_stop')
def handle_headtrack_stop():
    global headtrack_active
    headtrack_active = False
    emit('headtrack_status', {'active': False})

if __name__ == '__main__':
    debug_enabled = len(sys.argv) > 1 and sys.argv[1] == "1"

    if should_init_systems(debug_enabled):
        init_systems()

    use_https = sys.argv[2] == "1"
    if use_https:
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=debug_enabled,
            use_reloader=debug_enabled,
            ssl_context='adhoc'
        )
    else:
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=debug_enabled,
            use_reloader=debug_enabled
        )
