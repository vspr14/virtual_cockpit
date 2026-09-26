"""Cockpit display streaming: setup API and the WebSocket frame stream (logic in backend/displays/).

WebSocket /ws/<aircraft_id>/displays
  client -> server (JSON text):
    {"type": "subscribe", "displays": {"pfd": {"width": 640}, ...}, "fps": 30, "quality": 80}
    (send again whenever the selection or tile sizes change; {} pauses the stream)
  server -> client:
    text   {"type": "status", "displays": {"pfd": {"state": "live"}, ...}}      when it changes
    binary [u8 id length][id utf-8][u32 seq LE][u16 width LE][u16 height LE][JPEG bytes]
"""
import json
import struct
import time

from flask import Blueprint, Response, abort, jsonify, request
from flask_sock import Sock

from backend import aircraft, displays, settings
from backend.displays import popout

bp = Blueprint('displays', __name__)
sock = Sock()

MAX_FPS = 60
STATUS_EVERY_S = 1.0


def _meta_or_404(aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None or not meta.get('displays'):
        abort(404)
    return meta


@bp.route('/api/<aircraft_id>/displays/windows')
def list_windows(aircraft_id):
    _meta_or_404(aircraft_id)
    return jsonify({'windows': displays.windows(aircraft_id), 'status': displays.status(aircraft_id),
                    'dock': displays.dock_info()})


@bp.route('/api/<aircraft_id>/displays/windows/<int:hwnd>/thumb.jpg')
def window_thumb(aircraft_id, hwnd):
    _meta_or_404(aircraft_id)
    jpg = displays.thumbnail(hwnd)
    if jpg is None:
        abort(404)
    return Response(jpg, mimetype='image/jpeg', headers={'Cache-Control': 'no-store'})


@bp.route('/api/<aircraft_id>/displays/assign', methods=['POST'])
def assign(aircraft_id):
    meta = _meta_or_404(aircraft_id)
    data = request.get_json(silent=True) or {}
    display_id, hwnd = data.get('display'), data.get('hwnd')
    if display_id not in {d['id'] for d in meta['displays']['displays']}:
        return jsonify({'error': 'unknown_display'}), 400
    if hwnd is not None and not isinstance(hwnd, int):
        return jsonify({'error': 'bad_hwnd'}), 400
    try:
        displays.assign(aircraft_id, display_id, hwnd)
    except ValueError as err:
        return jsonify({'error': str(err)}), 400
    return jsonify({'status': 'ok', 'displays': displays.status(aircraft_id)})


@bp.route('/api/<aircraft_id>/displays/stats')
def stats(aircraft_id):
    _meta_or_404(aircraft_id)
    return jsonify(displays.stats())


@bp.route('/api/<aircraft_id>/displays/popout', methods=['GET', 'POST'])
def popout_settings(aircraft_id):
    """GET: calibration + last run. POST {view?, points?, auto?}: store calibration."""
    _meta_or_404(aircraft_id)
    if request.method == 'POST':
        try:
            popout.save(aircraft_id, request.get_json(silent=True) or {})
        except (TypeError, ValueError) as err:
            return jsonify({'error': str(err) or 'bad_request'}), 400
    return jsonify(popout.get(aircraft_id))


@bp.route('/api/<aircraft_id>/displays/popout/views')
def popout_views(aircraft_id):
    """The loaded aircraft's ChasePlane cockpit views (names)."""
    _meta_or_404(aircraft_id)
    try:
        return jsonify(popout.views())
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 503


@bp.route('/api/<aircraft_id>/displays/popout/picture', methods=['POST'])
def popout_picture(aircraft_id):
    """Switch ChasePlane to the view ({view}) and return a JPEG of the sim window to place the screens on."""
    _meta_or_404(aircraft_id)
    try:
        jpg = popout.picture((request.get_json(silent=True) or {}).get('view'))
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 503
    return Response(jpg, mimetype='image/jpeg', headers={'Cache-Control': 'no-store'})


@bp.route('/api/<aircraft_id>/displays/popout/run', methods=['POST'])
def popout_run(aircraft_id):
    _meta_or_404(aircraft_id)
    if not popout.run(aircraft_id):
        return jsonify({'error': 'already_running'}), 409
    return jsonify(popout.get(aircraft_id))


def _header(display_id, seq, w, h):
    raw = display_id.encode()
    return struct.pack('<B', len(raw)) + raw + struct.pack('<IHH', seq & 0xFFFFFFFF, w, h)


@sock.route('/ws/<aircraft_id>/displays', bp=bp)
def stream(ws, aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None or not meta.get('displays'):
        ws.close(reason=1008, message='unknown aircraft')
        return
    known = {d['id'] for d in meta['displays']['displays']}
    subs, fps, quality = {}, 30, 80
    sent = {}       # display -> (seq, width) last sent
    sent_at = {}    # display -> perf_counter of the last send
    last_status, status_at = None, 0.0
    while True:
        # Client messages: block briefly while paused (nothing subscribed), otherwise just drain them.
        msg = ws.receive(timeout=0 if subs else STATUS_EVERY_S)
        while msg is not None:
            try:
                data = json.loads(msg)
            except (TypeError, ValueError):
                data = {}
            if data.get('type') == 'subscribe':
                subs = {k: int((v or {}).get('width') or 0) or None
                        for k, v in (data.get('displays') or {}).items() if k in known}
                fps = min(MAX_FPS, settings.DISPLAY_CAPTURE_FPS, max(1, int(data.get('fps') or 30)))
                quality = min(95, max(30, int(data.get('quality') or 80)))
                sent = {k: v for k, v in sent.items() if k in subs}
                status_at = 0.0
            msg = ws.receive(timeout=0)
        tick = time.perf_counter()
        if tick - status_at >= STATUS_EVERY_S:
            status_at = tick
            st = displays.status(aircraft_id)
            if st != last_status:
                ws.send(json.dumps({'type': 'status', 'displays': st}))
                last_status = st
        if not subs:
            continue
        # Wake when a capture has a new frame (or at least 10x a second to start captures / check status),
        # then send each display's newest frame, at most `fps` per display (20% slack absorbs capture jitter).
        displays.wait_frame(0.1)
        now = time.perf_counter()
        for display_id, width in subs.items():
            if now - sent_at.get(display_id, 0.0) < 0.8 / fps:
                continue
            f = displays.frame(aircraft_id, display_id, width, quality)
            if f is None or sent.get(display_id) == (f[0], width):
                continue
            seq, jpg, w, h = f
            ws.send(_header(display_id, seq, w, h) + jpg)
            sent[display_id] = (seq, width)
            sent_at[display_id] = now
