# virtual_cockpit (current snapshot)

Touch-first “virtual cockpit” web app for Microsoft Flight Simulator on Windows. Browser UI sends discrete control events to a Python Flask backend, which drives **vJoy** (axes/buttons). For the **Fenix A320** profile it can also read/write **L:Vars** via the MobiFlight SimConnect client-data interface.

This repository currently contains:

- A Flask server (`app.py`) that:
  - serves the UI (Jinja templates + static assets)
  - enforces a PIN gate using Flask sessions
  - exposes a small HTTP API for control events and OFP/METAR fetching
  - outputs to vJoy device(s) (Device 1 required; Device 2 is initialized when available)
  - optionally reads/writes L:Vars (MobiFlight) for “MIP/overhead/pedestal” controls and Fenix A320-specific interactions
- A browser UI (templates + JS + CSS) optimized for iPad-like touch interaction, including multiple 3D controls rendered with Three.js modules loaded at runtime.

## What it does (runtime behavior)

### Main interaction model

- The UI runs entirely in the browser and sends events to the backend as JSON payloads.
- Core endpoint: `POST /update_sim`
  - payload has a `type` plus type-specific fields
  - backend maps event to vJoy axis/button updates
  - some aircraft-specific behavior is implemented by “profile handlers” or “profile commands”

### vJoy output

`app.py` translates UI events into vJoy updates on device 1:

- **Throttle**: `HID_USAGE_Z`, plus vJoy button 2 used as a “reverse flag” (`reverse: true` sets it).
- **Rudder**: `HID_USAGE_RX`
- **Flight controls joystick**: `HID_USAGE_RZ` (x), `HID_USAGE_RY` (y)
- **Spoilers**: `HID_USAGE_Y` using the active profile’s `backend.spoiler_formula`
- **Flaps axis**: `HID_USAGE_SL0` using `backend.flap_axis_mapping` (in profiles shown: `(1 - val) * 32767`)
- **Brakes**: writes to one or more axes defined by the active profile (`backend.brake_axes`), with optional inversion (`backend.brake_invert`)
- **Gear command**: momentary vJoy button 4
- **Generic vJoy button**: momentary press/release for an explicit `button` number
- **Camera**: momentary vJoy button `9 + cam_id` (special case: cam id 11 uses button 22)

### MobiFlight “MIP controls” path (L:Vars)

The **Fenix A320** profile currently sets `window.PROFILE.ui.mobiflight_mip_controls = true` and `window.__lvarProfile = "fenix_a320"` (see `profiles/fenix_a320.js`).

When that flag is true, the frontend routes some interactions to **L:Var writes** instead of vJoy:

- gear lever -> `setLvar('gear_handle', ...)`
- parking brake -> `setLvar('parking_brake', ...)`
- spoilers / speedbrake lock -> `setLvar('spoilers_handle', ...)` and `setLvar('speedbrake_lock', ...)`
- overhead/pedestal panels -> many `setLvar(...)` updates from UI components
- periodic sim-state refresh -> the frontend polls `GET /lvars` every ~450ms and applies returned values to UI indicators

Backend L:Var implementation:

- `backend/fsuipc_wapi_reader.py` loads mappings from `data/lvars.json` and uses MobiFlight client-data areas:
  - reads: `MF.SimVars.Add.(...)` then `vr.get((L:...))`
  - writes:
    - if `write_rpn` exists in mapping, calls `vr.set(write_rpn)`
    - else builds an RPN `value (>{L:VAR})` and calls `vr.set(...)`
  - “step” writes:
    - if mapping `lvar` is already an RPN expression (starts with `(`), it is executed as-is via `vr.set(...)`
    - otherwise reads current value, adds `delta`, then writes result

The L:Var keys and expressions for `fenix_a320` live in `data/lvars.json`.

### OFP + METAR (read-only utilities)

The backend provides:

- `GET /ofp`
  - fetches SimBrief JSON (hardcoded user id in `app.py`)
  - returns `pdf_url`, `origin_icao`, `destination_icao`
  - also fetches initial METAR strings (aviationweather.gov) when ICAOs are present
- `GET /metar?origin=....&destination=....`
  - fetches METAR JSON for requested ICAOs and returns raw strings

The Fenix A320 UI uses these endpoints to show a PDF OFP view plus METAR text.

## App entry points and pages

### PIN gate and profile selection

- `GET /` serves `templates/index.html`
  - index page shows a PIN keypad UI
  - on correct PIN, it reveals aircraft buttons linking to per-aircraft pages
- `POST /verify_pin`
  - request body: `{ "pin": "...." }`
  - on success: sets `session['authed'] = True`
- `POST /session`
  - request body: `{ "pin": "....", "profile": "<profile_name>" }`
  - on success: sets `session['authed'] = True` and `session['active_profile'] = <profile_name>`

Request gating:

- `app.before_request` redirects to `/` unless:
  - request is for static files
  - request path is `/test.html`
  - endpoint is one of: `index`, `verify_pin`, `set_session`
  - session contains `authed = True`

### Aircraft pages

`GET /<page>.html` serves the matching template and sets the active profile into the session:

- allowed pages: `index`, `fenix_a320`, `fenix_a350`, `pmdg_737`, `pmdg_777`
- for `fenix_a320.html` etc, it sets `session['active_profile']` to the page name
- templates reference the active profile script via:
  - `GET /profiles/<profile>.js` (served by `serve_profile`)
  - `GET /profiles/<profile>.json` exists but returns a small hardcoded profile object (see next section)

## Profiles (aircraft-specific configuration)

Profiles exist in two forms:

### 1) Browser-side profile scripts (`profiles/*.js`)

`GET /profiles/<name>.js` serves the file from the `profiles/` directory. Each profile script assigns `window.PROFILE = {...}` and may also define:

- `ui.*` configuration (detents, sensitivity/response, reverse behavior, camera config, flags like `mobiflight_mip_controls`)
- `mappings.vjoy.*` for vJoy button numbers used for logical actions
- `commands` object for transforming outbound payloads before they are sent to `/update_sim`
- `backend.*` formulas used by backend (spoiler formula, flap mapping, arm spoiler value)

Example currently present:

- `profiles/fenix_a320.js`:
  - enables `mobiflight_mip_controls`
  - defines throttle shaping in `commands.throttle` (idle floor / reverse mapping)
  - defines flap detents, throttle detents, control response curve parameters

### 2) JSON profile endpoint (`/profiles/<name>.json`)

`app.py` also exposes `GET /profiles/<profile_name>.json` that returns a hardcoded JSON dictionary from `PROFILE_JSON_DATA` for:

- `fenix_a320`
- `fenix_a350`
- `pmdg_737`
- `pmdg_777`

This JSON is not a 1:1 serialization of the JS profiles; it is a curated subset primarily under `ui` and some `mappings.vjoy`.

## Frontend code layout

### Templates

- `templates/index.html`: PIN keypad UI + aircraft selection buttons.
- `templates/fenix_a320.html`: primary advanced UI layout:
  - overhead sections (packs, batteries, fuel pumps, APU, external power)
  - exterior lights panel (3D canvas module)
  - engine masters + engine mode selector (3D modules)
  - center section with “CAMERAS / OFP” nav
  - pedestal with 3D controls: flaps lever, spoiler lever, brake pedals, parking brake, gear lever
  - TCAS/XPDR embedded panel and radar/PWS switch 3D module
  - throttle slider with detents and reverse logic
- `templates/fenix_a350.html`, `templates/pmdg_737.html`, `templates/pmdg_777.html`: aircraft pages using the shared JS runtime and aircraft-specific profile.

### Core JS runtime

- `static/js/config.js`: shared default mappings/constants (referenced by `main.js`).
- `static/js/main.js`: the main controller:
  - builds camera UI from `window.PROFILE.ui.camera_config`
  - sends vJoy payloads to `/update_sim`
  - provides `setLvar` / `stepLvar` helpers for `/lvars` endpoints (credentials same-origin)
  - when `mobiflight_mip_controls` is enabled, redirects many actions to L:Var writes and enables a 450ms `GET /lvars` poll
  - initializes several 3D components lazily via dynamic `import('/static/js/<module>.js')`
  - implements joystick input, throttle detent snapping, reverse behavior, and local persistence of some slider states (localStorage key `virtual_cockpit_state`)

### 3D / component modules (selected)

These are loaded dynamically from `static/js/`:

- `flap_lever_3d.js`
- `spoiler_lever_3d.js`
- `gear_lever_3d.js`
- `parking_brake_3d.js`
- `brake_pedals_test.js`
- `pedestal_clock.js`
- `ext_lt_lights_panel.js`
- `eng_master_switch.js`
- `eng_mode_selector.js`
- `radar_pws_switches_3d.js`
- `tcas_xpdr_panel.js`

The A320 template also includes an import map for CDN ESM modules:

- `three` and `three/addons/` from `unpkg.com`
- `pako` from `esm.sh`

### Styling

- `static/css/style.css`: the main stylesheet and layout system (includes A320-specific styling, control card layout, and component styling).
- `static/css/tcas_xpdr_embed.css`: stylesheet dedicated to the TCAS/XPDR embedded UI.

## Backend API summary (current)

Authentication / session:

- `GET /` -> landing page with PIN keypad
- `POST /verify_pin` -> `{pin}` -> sets `session['authed']`
- `POST /session` -> `{pin, profile}` -> sets `authed` and `active_profile`

Sim/control:

- `POST /update_sim` -> main control endpoint; supports `profile` override in JSON payload (falls back to `session['active_profile']`)

L:Vars:

- `GET /lvars` -> returns mapped L:Var values for requested profile (`?profile=` override supported)
- `POST /lvars` -> `{key, value}` with optional `{profile}`
- `POST /lvars/step` -> `{key, delta}` with optional `{profile}`

Profiles:

- `GET /profiles/<name>` -> serves profile JS file (adds `.js` if missing)
- `GET /profiles/<name>.json` -> returns hardcoded JSON in `PROFILE_JSON_DATA`

Utilities:

- `GET /ofp` -> SimBrief JSON -> returns PDF URL + initial METARs
- `GET /metar` -> aviationweather.gov METAR JSON -> returns raw strings
- `GET /test.html` -> serves repository `test.html` if present

## Build / packaging artifact included in repo

`output/VirtualControlsServer/_internal/` contains a packaged “frozen” copy of parts of the server (templates/static/backend/data/profiles). It mirrors runtime assets for a distribution build and is not the live source-of-truth during development (the active source is at the repository root `backend/`, `templates/`, `static/`, `profiles/`, `data/`).

## Dependencies (from `requirements.txt`)

- `flask`, `flask-socketio`
- `aiortc`
- `pyOpenSSL`
- `SimConnect`
- `pillow`, `numpy`
- `pyvjoy`
- `zipp`

Only a subset is used by the current runtime path shown in `app.py` (Flask, SimConnect, pyvjoy; plus MobiFlight SimConnect client-data usage via `backend/*`).

