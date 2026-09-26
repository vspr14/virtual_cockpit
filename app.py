"""Virtual Cockpit server: iPad cockpit pages for MSFS aircraft.

Run:  python app.py [debug(0|1)] [https(0|1)]
Aircraft are plug-ins under aircraft/<id>/ (see backend/aircraft.py and README.md).
"""
import logging
import os
import sys

from flask import Flask, jsonify, redirect, request, session, url_for

from backend import aircraft, chaseplane, displays, settings
from backend.displays import popout
from backend.paths import STATIC_DIR, TEMPLATES_DIR
from backend.routes import BLUEPRINTS
from backend.sim import vjoy

PUBLIC_ENDPOINTS = {'static', 'pages.index', 'pages.verify_pin', 'pages.site_webmanifest'}


def create_app():
    app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR, static_url_path='/static')
    app.secret_key = settings.SECRET_KEY
    logging.getLogger('werkzeug').setLevel(logging.ERROR)

    aircraft.load()
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)

    @app.before_request
    def require_pin():
        if request.endpoint is None or request.endpoint in PUBLIC_ENDPOINTS:
            return None
        if session.get('authed') is True:
            return None
        if request.path.startswith('/api/'):
            return jsonify({'error': 'not_authenticated'}), 401
        return redirect(url_for('pages.index'))

    @app.after_request
    def no_stale_pages(resp):
        # The iPad home-screen web app has no reload of its own: make sure ↻ always gets the current CSS/JS.
        if request.path.startswith('/static/') or resp.mimetype == 'text/html':
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    return app


app = create_app()


def _is_reloader_child(debug):
    return not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true'


if __name__ == '__main__':
    debug = len(sys.argv) > 1 and sys.argv[1] == '1'
    https = len(sys.argv) > 2 and sys.argv[2] == '1'
    if _is_reloader_child(debug):
        vjoy.init(1)  # MobiFlight/SimConnect connect lazily once MSFS is running
        if settings.CHASEPLANE_AUTOSYNC:
            chaseplane.start_autosync()
        displays.start_watcher()   # moves assigned pop-outs onto the dock monitor as soon as they appear
        popout.start_auto()        # pops the screens out when a flight starts (aircraft with auto mode on)
    app.run(
        host='0.0.0.0',
        port=settings.PORT,
        debug=debug,
        use_reloader=debug,
        ssl_context='adhoc' if https else None,
    )
