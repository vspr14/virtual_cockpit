"""ChasePlane's local camera API (WebSocket, API version 2), driven the way MSFS Pop Out Panel Manager does
(hawkeye-stan/msfs-2024-popout-panel-manager, WindowsAgent/ChasePlaneManager.cs):
  -> {"message": "api_connect", "payload": {"client_name": ...}}
  <- "cam_mode_set" with payload.views_loaded once the aircraft's views are ready
  -> {"message": "api_request", "request_id": "get_views_<ms>", "command": "get_views"}
  <- "api_reply": {metadata: {aircraft_readable}, views: [...]} (possibly nested in a {"message": "get_views"} payload)
  -> {"message": "cam_set_position", "payload": <view, no transition>}   jump straight to a view
  -> {"message": "cam_load_default"}                                      back to the default view
"""
import json
import time

from backend import settings

try:
    from simple_websocket import Client
except Exception:  # flask-sock's dependency missing
    Client = None

API_VERSION = 2
COCKPIT_THEMES = ('ONBOARD_PIC', 'ONBOARD_SYSTEMS')   # the views PPM offers for pop-outs
_VIEW_KEYS = ('version', 'name', 'guid', 'mode', 'index', 'aircraft_readable', 'profile_physics_type', 'profile_theme')
_POSITION_KEYS = ('x', 'y', 'z', 'pitch', 'yaw', 'roll', 'zoom')


class ChasePlaneError(RuntimeError):
    pass


class Session:
    """One API connection: `with Session() as cp: cp.set_view(cp.view('FMC'))`."""

    def __init__(self, timeout_s=10.0):
        if Client is None:
            raise ChasePlaneError('websocket_client_missing')
        try:
            self._ws = Client.connect(settings.CHASEPLANE_API_URL)
        except Exception as err:
            raise ChasePlaneError(f'chaseplane_not_reachable: {err}') from err
        self._timeout = timeout_s
        self._views_loaded = False
        self._send({'message': 'api_connect', 'payload': {'client_name': 'VirtualCockpit'}})
        self.aircraft = None
        self.views = []
        self._load_views()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        try:
            self._ws.close()
        except Exception:
            pass

    def _send(self, msg):
        self._ws.send(json.dumps(msg))

    def _receive(self, until):
        while time.time() < until:
            raw = self._ws.receive(timeout=max(0.05, min(1.0, until - time.time())))
            if raw is None:
                continue
            try:
                msg = json.loads(raw)
            except (TypeError, ValueError):
                continue
            kind = (msg.get('message') or '').lower()
            payload = msg.get('payload') or {}
            if kind == 'api_version' and isinstance(payload, dict) and payload.get('version') != API_VERSION:
                raise ChasePlaneError(f"chaseplane_api_version_{payload.get('version')}")
            if kind == 'cam_mode_set' and isinstance(payload, dict) and payload.get('views_loaded'):
                self._views_loaded = True
            yield kind, msg, payload
        return

    def _load_views(self):
        deadline = time.time() + self._timeout
        for _ in self._receive(min(deadline, time.time() + 5.0)):   # wait for "views loaded" (PPM does too)
            if self._views_loaded:
                break
        for _attempt in range(3):
            request_id = f'get_views_{int(time.time() * 1000)}'
            self._send({'message': 'api_request', 'request_id': request_id, 'command': 'get_views'})
            for kind, msg, payload in self._receive(min(deadline, time.time() + 4.0)):
                if kind != 'api_reply' or not isinstance(payload, dict):
                    continue
                if (payload.get('message') or '').lower() == 'get_views':
                    reply = payload.get('payload') or {}
                elif (msg.get('request_id') or '').startswith('get_views_'):
                    reply = payload
                else:
                    continue
                self.aircraft = (reply.get('metadata') or {}).get('aircraft_readable')
                self.views = [v for v in reply.get('views') or []
                              if v.get('profile_theme') in COCKPIT_THEMES and v.get('aircraft_readable') == self.aircraft]
                if self.views:
                    return
                break
            time.sleep(2.0)
        raise ChasePlaneError('chaseplane_no_views')

    def view(self, name):
        """The loaded aircraft's cockpit view with that name (case-insensitive), or None."""
        name = (name or '').strip().lower()
        return next((v for v in self.views if (v.get('name') or '').strip().lower() == name), None)

    def set_view(self, view):
        """Jump to the view (no transition, so the picture is final right away)."""
        payload = {k: view[k] for k in _VIEW_KEYS if k in view}
        payload['position'] = {k: (view.get('position') or {}).get(k, 0.0) for k in _POSITION_KEYS}
        payload.update(can_transition=False, transition_time=0, transition_easing='LINEAR')
        self._send({'message': 'cam_set_position', 'payload': payload})
        time.sleep(0.25)

    def load_default(self):
        self._send({'message': 'cam_load_default'})
        time.sleep(0.5)


def view_names(timeout_s=10.0):
    """Names of the loaded aircraft's cockpit views, in ChasePlane's order."""
    with Session(timeout_s) as cp:
        seen, out = set(), []
        for v in cp.views:
            if v.get('name') not in seen:
                seen.add(v.get('name'))
                out.append(v.get('name'))
        return {'aircraft': cp.aircraft, 'views': out}
