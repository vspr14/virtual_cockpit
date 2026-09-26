"""SimBrief OFP and METARs. Aircraft-independent."""
import json
import urllib.parse
import urllib.request

from flask import Blueprint, jsonify, request

from backend import settings

bp = Blueprint('ofp', __name__, url_prefix='/api')


def _fetch_json(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _metar(icao):
    if not icao:
        return ''
    try:
        url = 'https://aviationweather.gov/api/data/metar?' + urllib.parse.urlencode({'ids': icao, 'format': 'json'})
        data = _fetch_json(url, timeout=5)
        return data[0].get('rawOb', '') if data else ''
    except Exception:
        return ''


def _metars(origin, destination):
    metars = {}
    if origin:
        metars['origin'] = _metar(origin)
    if destination:
        metars['destination'] = _metar(destination)
    return metars


@bp.route('/ofp')
def ofp():
    url = 'https://www.simbrief.com/api/xml.fetcher.php?' + urllib.parse.urlencode(
        {'userid': settings.SIMBRIEF_USERID, 'json': 1})
    try:
        data = _fetch_json(url, timeout=10)
    except Exception:
        return jsonify({'error': 'ofp_fetch_failed'}), 502
    files = data.get('files') or {}
    directory = files.get('directory') or ''
    link = (files.get('pdf') or {}).get('link') or ''
    if not directory or not link:
        return jsonify({'error': 'missing_ofp_link'}), 502
    origin = (data.get('origin') or {}).get('icao_code', '')
    destination = (data.get('destination') or {}).get('icao_code', '')
    return jsonify({
        'pdf_url': directory.rstrip('/') + '/' + link.lstrip('/'),
        'metars': _metars(origin, destination),
        'origin_icao': origin,
        'destination_icao': destination,
    })


@bp.route('/metar')
def metar():
    return jsonify({'metars': _metars(request.args.get('origin', ''), request.args.get('destination', ''))})
