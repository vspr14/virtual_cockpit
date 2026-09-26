"""Camera views: each aircraft maps its camera ids to vJoy buttons in aircraft.json."""
from flask import Blueprint, abort, jsonify, request

from backend import aircraft
from backend.sim import vjoy

bp = Blueprint('camera', __name__, url_prefix='/api')


@bp.route('/<aircraft_id>/camera', methods=['POST'])
def select_camera(aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None:
        abort(404)
    data = request.get_json(silent=True) or {}
    try:
        cam = meta['cameras_by_id'].get(int(data.get('cam_id')))
    except (TypeError, ValueError):
        cam = None
    if cam is None:
        return jsonify({'error': 'unknown_camera'}), 400
    result = vjoy.press(cam['vjoy_button'])
    if 'error' in result:
        return jsonify(result), 503
    return jsonify(result)
