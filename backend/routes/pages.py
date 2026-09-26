"""HTML pages: PIN + aircraft picker, and one cockpit page per registered aircraft."""
import os

from flask import Blueprint, abort, jsonify, redirect, render_template, request, send_file, session, url_for

from backend import aircraft, settings
from backend.paths import STATIC_DIR

bp = Blueprint('pages', __name__)


@bp.route('/')
def index():
    return render_template(
        'index.html',
        authed=session.get('authed') is True,
        aircraft_list=aircraft.all_aircraft(),
    )


@bp.route('/verify_pin', methods=['POST'])
def verify_pin():
    data = request.get_json(silent=True) or {}
    if str(data.get('pin', '')) == settings.PIN:
        session['authed'] = True
        return jsonify({'ok': True})
    return jsonify({'ok': False}), 401


@bp.route('/a/<aircraft_id>')
def cockpit(aircraft_id):
    meta = aircraft.get(aircraft_id)
    if meta is None:
        abort(404)
    return render_template(f'aircraft/{aircraft_id}.html', aircraft=meta)


@bp.route('/<aircraft_id>.html')
def legacy_cockpit_url(aircraft_id):
    """Old bookmarks / home-screen shortcuts used /fenix_a320.html."""
    if aircraft.get(aircraft_id) is None:
        abort(404)
    return redirect(url_for('pages.cockpit', aircraft_id=aircraft_id))


@bp.route('/site.webmanifest')
def site_webmanifest():
    path = os.path.join(STATIC_DIR, 'site.webmanifest')
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, mimetype='application/manifest+json')
