"""Aircraft registry.

Every aircraft is a folder under aircraft/<id>/ with:
  aircraft.json  metadata: name, vendor, sim transport, cameras (vJoy buttons)
  lvars.json     {key: {"lvar": "L:NAME"} | {"lvar": ..., "write_rpn": "..."}}; the only variables the
                 aircraft's page may read or write
  chaseplane.json  optional: ChasePlane view set for every matching preset (see backend/chaseplane/sync.py)
  displays.json    optional: cockpit displays the Displays tab can stream (see backend/displays/__init__.py)
Its page lives in templates/aircraft/<id>.html and static/js/aircraft/<id>/main.js.
Adding a folder is all it takes for the aircraft to appear in the picker.
"""
import json
import os

from backend.paths import AIRCRAFT_DIR

_registry = {}


def _optional_json(folder, name):
    path = os.path.join(folder, name)
    if not os.path.isfile(path):
        return None
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def load():
    """Scan aircraft/*/aircraft.json. Called once at startup."""
    _registry.clear()
    if not os.path.isdir(AIRCRAFT_DIR):
        return _registry
    for aircraft_id in sorted(os.listdir(AIRCRAFT_DIR)):
        folder = os.path.join(AIRCRAFT_DIR, aircraft_id)
        meta_path = os.path.join(folder, 'aircraft.json')
        if not os.path.isfile(meta_path):
            continue
        with open(meta_path, encoding='utf-8') as fh:
            meta = json.load(fh)
        lvars_path = os.path.join(folder, 'lvars.json')
        lvars = {}
        if os.path.isfile(lvars_path):
            with open(lvars_path, encoding='utf-8') as fh:
                lvars = json.load(fh)
        meta['id'] = aircraft_id
        meta['lvars'] = lvars
        meta['chaseplane'] = _optional_json(folder, 'chaseplane.json')
        meta['displays'] = _optional_json(folder, 'displays.json')
        meta['cameras_by_id'] = {int(c['id']): c for c in meta.get('cameras', [])}
        _registry[aircraft_id] = meta
    return _registry


def get(aircraft_id):
    return _registry.get(aircraft_id)


def all_aircraft():
    return list(_registry.values())
