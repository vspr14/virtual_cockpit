"""ChasePlane view sync: setup page and API (logic in backend/chaseplane/)."""
from flask import Blueprint, abort, jsonify, render_template, request

from backend import aircraft, chaseplane

bp = Blueprint('chaseplane', __name__)


def _meta_or_404(aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None or not meta.get('chaseplane'):
        abort(404)
    return meta


@bp.route('/chaseplane')
def page():
    return render_template('chaseplane.html', aircraft_list=chaseplane.configured_aircraft())


@bp.route('/api/chaseplane/<aircraft_id>')
def status(aircraft_id):
    _meta_or_404(aircraft_id)
    return jsonify(chaseplane.status(aircraft_id))


def _result(res):
    return jsonify(res), (409 if 'error' in res else 200)


@bp.route('/api/chaseplane/<aircraft_id>/apply', methods=['POST'])
def apply(aircraft_id):
    _meta_or_404(aircraft_id)
    folders = (request.get_json(silent=True) or {}).get('profiles')
    if folders is not None and not (isinstance(folders, list) and all(isinstance(f, str) for f in folders)):
        return jsonify({'error': 'bad_profiles'}), 400
    return _result(chaseplane.apply(aircraft_id, folders))


@bp.route('/api/chaseplane/<aircraft_id>/capture', methods=['POST'])
def capture(aircraft_id):
    _meta_or_404(aircraft_id)
    folder = (request.get_json(silent=True) or {}).get('profile')
    if not isinstance(folder, str) or not folder:
        return jsonify({'error': 'bad_profile'}), 400
    return _result(chaseplane.capture(aircraft_id, folder))


@bp.route('/api/chaseplane/<aircraft_id>/restore', methods=['POST'])
def restore(aircraft_id):
    _meta_or_404(aircraft_id)
    data = request.get_json(silent=True) or {}
    backup_id, folder = data.get('backup'), data.get('profile')
    if not isinstance(backup_id, str) or not isinstance(folder, str):
        return jsonify({'error': 'bad_request'}), 400
    return _result(chaseplane.restore(aircraft_id, backup_id, folder))
