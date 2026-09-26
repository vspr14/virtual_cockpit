"""Read / write an aircraft's sim variables. A page can only touch keys in its own aircraft/<id>/lvars.json."""
import math

from flask import Blueprint, abort, jsonify, request

from backend import aircraft
from backend.sim import mobiflight

bp = Blueprint('lvars', __name__, url_prefix='/api')

# aircraft.json "sim" → transport module (read_all(var_map), write(entry, value))
TRANSPORTS = {
    'mobiflight': mobiflight,
}


def _aircraft_or_404(aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None:
        abort(404)
    transport = TRANSPORTS.get(meta.get('sim'))
    if transport is None:
        abort(501, description=f"unknown sim transport {meta.get('sim')!r}")
    return meta, transport


@bp.route('/<aircraft_id>/lvars', methods=['GET'])
def read(aircraft_id):
    meta, transport = _aircraft_or_404(aircraft_id)
    result = transport.read_all(meta['lvars'])
    if 'error' in result:
        return jsonify(result), 503
    # JSON has no NaN; report unreadable values as null.
    clean = {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in result.items()}
    return jsonify(clean)


@bp.route('/<aircraft_id>/lvars', methods=['POST'])
def write(aircraft_id):
    meta, transport = _aircraft_or_404(aircraft_id)
    data = request.get_json(silent=True) or {}
    key = data.get('key')
    entry = meta['lvars'].get(key)
    if entry is None:
        return jsonify({'error': 'unknown_key'}), 400
    try:
        value = float(data.get('value'))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid_value'}), 400
    result = transport.write(entry, value)
    if 'error' in result:
        return jsonify(result), 503
    return jsonify(result)
