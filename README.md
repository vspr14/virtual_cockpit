# iPad Joy

## 1. What this project is about

This is a touch-friendly flight control panel for MSFS, designed to run on an iPad or any browser and drive simulator controls through vJoy. The UI provides on-screen sliders, a virtual joystick, buttons, and aircraft-specific behavior via profiles. All primary interaction with MSFS is done by sending vJoy axis and button outputs; there is no continuous SimConnect sim-state polling.

Key goals:
- Mobile-friendly cockpit controls
- Aircraft-specific behavior (Fenix A320, Fenix A350, PMDG 737, PMDG 777)
- vJoy output for all axes and buttons
- Minimal external dependencies so the UI logic is mostly self-contained in the browser

Special cases:
- Fenix A320 autopilot uses L:Vars via `data/lvars.json` and `backend/fsuipc_wapi_reader.py` to engage/disconnect AP in a Fenix-specific way.
- SimBrief OFP PDF and basic METAR strings are fetched via the backend for display, but they do not drive sim controls.

## 2. How to install (including dependencies)

### OS and simulator prerequisites
- Windows with MSFS installed
- vJoy installed (Device 1 is required; additional devices are not used by default)

### Python requirements
- Python 3.8+ recommended

### Python packages

Install all required packages:

```bash
pip install -r requirements.txt
```

Notes:
- `pyvjoy` is required for vJoy button/axis output.
- For Fenix A320 AP integration, you need a working MobiFlight WASM / WAPI setup so L:Vars from `data/lvars.json` are accessible.

## 3. How to set up

### vJoy configuration
1. Open **vJoy Configuration**.
2. Enable Device 1.
3. Ensure Device 1 has at least:
   - Axes: X, Y, Z, RX, RY, RZ, SL0
   - Buttons: enough for your mappings (see profile files in `profiles/`)
4. Apply and save the configuration.

### Button/axis verification
1. Open **vJoy Monitor**.
2. Move the UI controls in the browser (throttle, flaps, spoilers, brakes, rudder, joystick).
3. Confirm axes and buttons respond as expected on Device 1.
4. If a control does nothing, check the vJoy mapping in the corresponding profile.

### Run the app

From the project root:

```bash
python app.py
```

Then open in a browser (desktop or iPad):

```text
http://localhost:5000
```

You can also access it from another device on the LAN using `http://<your-pc-ip>:5000`.

## 4. Folder structure and responsibilities

```text
virtual_cockpit/
  app.py                        Flask app and vJoy / L:Var handlers
  backend/
    __init__.py
    simconnect_mobiflight.py    Legacy SimConnect helper (not used by default)
    mobiflight_variable_requests.py
    fsuipc_wapi_reader.py       L:Var write/step helper using MobiFlight WAPI
  data/
    lvars.json                  L:Var mappings used for Fenix A320 AP
  profiles/
    __init__.py
    fenix_a320.js               Aircraft profile and vJoy mappings (Fenix A320)
    fenix_a350.js               Profile cloned from A320 with name updated
    pmdg_737.js                 Profile and mappings for PMDG 737
    pmdg_777.js                 Profile and mappings for PMDG 777
  static/
    css/
      style.css                 UI styles
    js/
      config.js                 Base vJoy mapping defaults
      main.js                   UI logic and control handlers
  templates/
    index.html                  Landing page (aircraft selection)
    fenix_a320.html             Fenix A320 UI
    fenix_a350.html             Fenix A350 UI
    pmdg_737.html               PMDG 737 UI
    pmdg_777.html               PMDG 777 UI
```

## 5. Core behavior overview

- **vJoy outputs**  
  All control surface and button events are sent from the browser to Flask via `POST /update_sim`. `app.py` translates these payloads into `pyvjoy` axis and button outputs on vJoy Device 1. Examples include:
  - Throttle axis (`throttle`)
  - Flaps axis (`flaps_axis`)
  - Spoilers axis and arming (`spoilers`, `arm_spoilers`)
  - Brake axis (`brakes`)
  - Rudder axis (`rudder`)
  - Gear commands (`gear_command`)
  - Generic button presses (`vjoy_button`)
  - Camera shortcuts (`camera`)

- **No continuous SimConnect sim-state polling**  
  The previous SimConnect-based `/get_sim` endpoint and periodic JS polling have been removed. The UI state (sliders, indicators) is driven entirely by local interactions, not by sim feedback. This avoids any dependency on SimVar reads for flaps, brakes, spoilers, or autopilot state.

- **Fenix A320 autopilot (L:Vars)**  
  For the Fenix A320 profile only:
  - The A/P button in the UI calls `/lvars` and `/lvars/step` in `app.py`, which in turn use `backend/fsuipc_wapi_reader.py`.
  - Pressing A/P:
    - When off: steps the `ap_engage` L:Var to engage autopilot.
    - When on: pulses `ap_disconnect` once and then sets `ap_state_off` as defined in `data/lvars.json`.
  - Other aircraft use a simple vJoy button mapping for A/P so you can bind it directly in MSFS.

- **Aircraft profiles**  
  Profiles in `profiles/*.js` define:
  - UI configuration (detents, camera buttons, reverse behavior, etc.).
  - vJoy button mappings for each logical action.
  - Optional per-aircraft logic for things like throttle shaping.

- **State saving (per profile)**  
  The frontend (`static/js/main.js`) periodically saves slider positions (flaps, throttle, spoilers, brakes, rudder) to `localStorage` once per minute. On reload:
  - If a saved state exists for the current profile and is not the default, the sliders are restored and the corresponding vJoy outputs are sent once.

- **Parking brake behavior**  
  The parking brake button visual state is purely local:
  - Default load state is “ON” (buttons filled).
  - Tapping parking brake toggles a local boolean and sends the mapped vJoy button once; there is no sim-state tracking or auto-reset.

- **Flight controls page (per aircraft)**  
  The flight controls page contains:
  - Virtual joystick for pitch/roll.
  - Sliders for flaps, spoilers (with arming support), brakes (with optional left brake slider), and rudder.
  - Throttle slider with profile-defined detents, reverse logic, and an IDLE helper button.
  - Gear lever control that sends gear up/down vJoy output.

- **Cameras and OFP / METAR**  
  - Camera buttons (including a 10th “Custom” button) send camera vJoy button events according to the active profile.
  - OFP view shows the SimBrief PDF and origin/destination METAR strings, with separate refresh buttons for METAR and OFP/PDF.

- **Top of Descent (TD) timer (Fenix A320 only)**  
  - On the Fenix A320 flight controls page, above the joystick:
    - A live UTC clock is shown.
    - You can enter a TD time in UTC (HH:MM) and press `SET TD`.
  - The TD time is stored in `localStorage` and checked once per second while the page is open.
  - When the TD time is reached:
    - The status text shows that TD has been reached.
    - A short tone is played using the browser audio API (subject to browser/tab audio rules).
    - An alert dialog is shown as a reliable fallback notification.

## 6. Customization and extension

- Update mappings per aircraft in `profiles/*.js` (for example, to change which vJoy button is used for a given action).
- Adjust UI behavior (sliders, joystick, TD timer, camera logic, state saving) in `static/js/main.js`.
- Modify styles (layout, fonts, sizes) in `static/css/style.css`.

The backend (`app.py`) is intentionally kept small: it accepts high-level events from the browser and pushes them to vJoy (and L:Vars for the Fenix A320 autopilot), without trying to mirror full sim state back into the UI.

## 7. Plan of action: native iPad app (AI-agent–readable spec)

This section is a detailed, step-by-step specification so an AI agent (or developer) can build a native iPad client that talks to the existing Windows Flask backend. The backend stays unchanged except where noted; the iPad app is a new Swift/SwiftUI project that replicates the web UI and uses the HTTP API below.

---

### 7.1 Backend API contract (source of truth)

Base URL: `http://<PC_IP>:5000`. All requests that need an active profile must either use the session (after login and page load) or send the profile explicitly (see 7.2).

**Authentication (required for all endpoints except index)**

- `POST /verify_pin`  
  - Body: `{ "pin": "1234" }` (JSON).  
  - Success: `200`, `{ "ok": true }`; sets server session `authed = true`.  
  - Failure: `401`, `{ "ok": false }`.  
  - The native app must call this once after the user enters the PIN; use the same session (cookies) for subsequent requests.

**Profile selection (backend extension recommended)**

- Current behavior: the web app sets `session['active_profile']` by loading a page like `/<profile>.html` (e.g. `fenix_a320.html`). The native app cannot “load” HTML pages to set session.
- Recommended backend change: add `POST /session` with body `{ "pin": "1234", "profile": "fenix_a320" }` that (1) verifies PIN and sets `authed`, (2) sets `active_profile` to the given profile (one of `fenix_a320`, `fenix_a350`, `pmdg_737`, `pmdg_777`), (3) returns `{ "ok": true }`. If not implemented, the native app must rely on the backend exposing a way to set profile (e.g. header `X-Profile: fenix_a320` and backend reading it in `update_sim` and L:Var routes).

**Control events (primary endpoint)**

- `POST /update_sim`  
  - Headers: `Content-Type: application/json`.  
  - Body: one JSON object per request. The backend uses `session['active_profile']` to resolve profile (see `profiles/__init__.py`).  
  - All axis values are in the range `0.0` to `1.0` unless stated otherwise.  
  - Payloads (replace `...` with actual numbers):

| `type` | Required fields | Optional / notes | Backend behavior |
|--------|-----------------|------------------|------------------|
| `throttle` | `value` (0–1), `reverse` (bool) | — | Sets reverse button 2; axis Z = value × 32767. Profile may transform value (e.g. Fenix idle floor). |
| `rudder` | `value` (0–1) | — | Axis RX = value × 32767. |
| `brakes` | `value` (0–1) | — | Axis X = value × 32767. |
| `spoilers` | `value` (0–1) | — | Axis Y = profile.spoiler_formula(value) × 32767. |
| `arm_spoilers` | — | — | Axis Y = profile.arm_spoiler_value × 32767. |
| `flaps_axis` | `value` (0–1) | — | Axis SL0 = profile.flap_axis_mapping(value). Current mapping: (1−value)×32767. |
| `flight_controls` | `val_x` (0–1), `val_y` (0–1) | — | RZ = val_x × 32767, RY = val_y × 32767. Center is 0.5, 0.5. |
| `camera` | `cam_id` (int 1–10) | — | Button index = 9 + cam_id (press/release). |
| `gear_command` | — | `state`: "UP" or "DOWN" (optional) | Button 4 press/release. |
| `idle_command` | — | — | Axis Z = 0; button 3 press/release. |
| `vjoy_button` | `button` (int) | — | vJoy button index (1-based); press then release after 50 ms. |
| `flap_command` | `value` | — | value 0 → button 20, else button 21 (press/release). Rarely used. |

- Response: `200` with `{ "status": "success" }` or `{ "error": "..." }` with `500` on failure.

**L:Vars (Fenix A320 autopilot only)**

- `POST /lvars`  
  - Body: `{ "key": "<lvar_key>", "value": <number> }`.  
  - Used to set a L:Var (e.g. `ap_disconnect` = 1 then 0; `ap_state_off` = 0).  
  - Profile is taken from session. Returns `200` with result or `400`/`503` with error.

- `POST /lvars/step`  
  - Body: `{ "key": "<lvar_key>", "delta": <number> }`.  
  - Used to step a L:Var (e.g. `ap_engage` with delta 1).  
  - Profile from session. Returns `200` or `400`/`503`.

- For Fenix A320 AP disconnect: call `POST /lvars` with `{"key":"ap_disconnect","value":1}`, then after ~50 ms `{"key":"ap_disconnect","value":0}`, then after another ~50 ms `{"key":"ap_state_off","value":0}`. For engage: `POST /lvars/step` with `{"key":"ap_engage","delta":1}`.

**OFP and METAR (read-only)**

- `GET /ofp`  
  - No body. Returns JSON: `{ "pdf_url": "<url>", "metars": { "origin": "<string>", "destination": "<string>" }, "origin_icao": "<code>", "destination_icao": "<code>" }` or `502` with `{ "error": "..." }`.

- `GET /metar?origin=<ICAO>&destination=<ICAO>`  
  - Returns `{ "metars": { "origin": "<raw>", "destination": "<raw>" } }`.

**Profile data (for UI and mappings)**

- Current: `GET /profiles/<profile_name>.js` returns JavaScript that assigns `window.PROFILE = { ... }`.  
- Recommended backend addition: `GET /profiles/<profile_name>.json` that returns the same structure as JSON (so the native app can parse it without executing JS). Allowed `profile_name`: `fenix_a320`, `fenix_a350`, `pmdg_737`, `pmdg_777` (with or without `.json` suffix).  
- If `.json` is not added, the iPad app must ship with bundled profile JSON files derived from the existing `profiles/*.js` (see profile schema below).

---

### 7.2 Profile JSON schema (for native app)

Each profile has this structure (mirror of `profiles/*.js`):

```json
{
  "name": "Fenix A320",
  "ui": {
    "camera_config": [
      { "id": 1, "name": "Captain" },
      { "id": 2, "name": "Left Engine" },
      ...
      { "id": 10, "name": "Custom" }
    ],
    "flap_detents": [
      { "index": 0, "label": "0", "val": 0.0 },
      { "index": 1, "label": "1", "val": 0.25 },
      ...
    ],
    "throttle_detents": [
      { "label": "CLB", "val": 0.70 },
      { "label": "FLX/MCT", "val": 0.85 },
      { "label": "TO/GA", "val": 1 }
    ],
    "control_sensitivity": 1,
    "control_response": 1.6,
    "throttle_detent_snap": 0.05,
    "reverse_behavior": {
      "spool_down_ms": 0,
      "idle_floor": 0.007,
      "idle_rev": 0.0065,
      "idle_bump_up": 0.05,
      "idle_bump_ms": 150,
      "idle_bump_down": 0.0005
    },
    "arm_spoilers_button": true
  },
  "mappings": {
    "vjoy": {
      "PARKING_BRAKE": 1,
      "REVERSE_TOGGLE": 2,
      "IDLE_BUTTON": 3,
      "ARM_SPOILERS": 35,
      "GEAR_UP": 4,
      "GEAR_DOWN": 4,
      "AUTOPILOT": 5,
      "CAM_BASE": 10,
      ...
    }
  }
}
```

- **camera_config**: list of `{ id, name }`; `id` 1–10. The app sends `type: "camera", cam_id: id` to the backend.  
- **flap_detents**: ordered by `val`; slider snaps to nearest; labels shown beside slider.  
- **throttle_detents**: same idea; throttle slider can snap within `throttle_detent_snap` of a detent value.  
- **reverse_behavior**: when `spool_down_ms === 0`, reverse is “instant”: going to reverse sets throttle 0 and sends a brief bump; coming out of reverse uses `idle_bump_up` / `idle_bump_ms` / `idle_floor`.  
- **arm_spoilers_button**: if true, arm is a vJoy button only; if false, arm sends `arm_spoilers` axis value.  
- **mappings.vjoy**: logical name → vJoy button index (1-based). Use for PARKING_BRAKE, AUTOPILOT, ARM_SPOILERS, etc. Defaults are in `static/js/config.js` (VJOY_MAP) if a key is missing in the profile.

---

### 7.3 Client-side logic the native app must implement

- **Joystick**: 2D input (e.g. drag) producing `val_x`, `val_y` in 0–1. Apply optional `control_response` curve (e.g. power curve) and `control_sensitivity` scaling around center 0.5 before sending `flight_controls`. On release, send center (0.5, 0.5).  
- **Throttle**: If profile has `reverse_behavior.spool_down_ms === 0`, reverse toggle is immediate (no 2 s spool down). When engaging reverse: set local throttle to 0, send `throttle` with `value: reverse_behavior.idle_bump_down`, `reverse: true`, then after `idle_bump_ms` send `value: 0`, `reverse: true`. When leaving reverse: set throttle to `idle_bump_up`, send `throttle` with that value `reverse: false`, then after `idle_bump_ms` set to `idle_floor` and send again. For “IDLE” button: send `idle_command` (or throttle to idle detent if profile has custom throttle command).  
- **Flaps**: Slider 0–1; snap to nearest `flap_detents[].val`; send `flaps_axis` with that value.  
- **Spoilers**: Slider 0–1; send `spoilers` with value. If “Arm” is pressed: if `arm_spoilers_button` true, send `vjoy_button` with ARM_SPOILERS mapping (and optionally set slider to 0 and send `spoilers` 0); else send `arm_spoilers` and set slider to 0. When user moves spoiler slider above a small threshold, clear “armed” state locally.  
- **Brakes**: Slider 0–1; send `brakes` with value.  
- **Rudder**: Slider 0–1 (center 0.5); apply same response/sensitivity as joystick; send `rudder`.  
- **Gear**: Toggle button. Send `gear_command` (backend ignores `state` and toggles; or keep local state and send once per tap).  
- **Parking brake**: Local boolean, default **true** (ON) at launch. Toggle on tap; send `vjoy_button` with PARKING_BRAKE mapping. No sim-state read.  
- **A/P**: For profile name “Fenix A320” use L:Var flow (engage: `lvars/step` ap_engage 1; disconnect: ap_disconnect 1→0, then ap_state_off 0). For all other profiles send `vjoy_button` with AUTOPILOT mapping.  
- **Cameras**: Grid of buttons from `camera_config`; on tap send `camera` with `cam_id: item.id`.  
- **State persistence**: Save to local storage (e.g. UserDefaults or file) once per minute: `{ profile, flaps, throttle, spoilers, brake, rudder }`. On launch, if saved state exists for current profile and is not the default (e.g. all zeros and rudder 0.5), restore sliders and send each axis once.  
- **TD timer (Fenix A320 only)**: Show UTC clock (update every second). Input HH:MM (UTC); “Set TD” stores target UTC time (if in the past, use next day). Every second, if current time ≥ target and not yet fired: show “TD reached”, play short sound (use a pre-created AudioContext on first user gesture to avoid iOS blocking), and show an alert. Persist target time (and “fired” flag) in local storage so that if the user reopens the app after TD, they still get the alert once.

---

### 7.4 Backend changes required for the native app

1. **Profile in requests**  
   Either:  
   - Add `POST /session` with `{ "pin": "1234", "profile": "fenix_a320" }` that sets `session['authed']` and `session['active_profile']`, and have the native app call it after PIN entry and when changing aircraft; or  
   - For `POST /update_sim`, `POST /lvars`, `POST /lvars/step`, accept an optional body field `"profile": "fenix_a320"` (or header `X-Profile`) and use it instead of session when present, so the native app can send profile with every request without session.

2. **Profile as JSON**  
   Add `GET /profiles/<name>.json` (or `GET /api/profiles/<name>`) that returns the profile object as JSON (same structure as in 7.2), so the app can fetch profile config without parsing JS.

3. **CORS (if needed)**  
   If the native app hits the backend from a different origin (e.g. during development), ensure CORS allows the app’s origin for `POST /update_sim`, `POST /lvars`, `POST /lvars/step`, `GET /ofp`, `GET /metar`. For a pure native app using URLSession to the same LAN IP, same-origin is not an issue; CORS matters for web or hybrid.

---

### 7.5 Suggested implementation order for the AI agent

1. **Backend**  
   - Implement `POST /session` (pin + profile) and/or profile in request body/header for `update_sim` and L:Var routes.  
   - Implement `GET /profiles/<name>.json` returning profile JSON (or document that the app will bundle profile JSON).

2. **iPad app – project and networking**  
   - New Xcode project: iPad-only, SwiftUI, minimum iOS 16 (or per your target).  
   - Create a shared `BackendService`: base URL (e.g. `http://192.168.x.x:5000`), URLSession, cookie storage for session.  
   - Implement: `verifyPin(pin)`, `setProfile(profile)` (if using `/session`), `sendControl(payload)` (POST `/update_sim`), `setLvar(key, value)`, `stepLvar(key, delta)`, `getOfp()`, `getMetar(origin, destination)`, `getProfile(name)` (if backend serves JSON).  
   - Persist base URL and optionally PIN in UserDefaults; on first launch show “Enter PC URL and PIN” screen.

3. **iPad app – profile and aircraft selection**  
   - Load or fetch profiles for `fenix_a320`, `fenix_a350`, `pmdg_737`, `pmdg_777`.  
   - Aircraft selection screen: four buttons/cards; on tap set active profile and navigate to the main cockpit view.

4. **iPad app – main cockpit view (single screen first)**  
   - One scrollable or stacked layout that includes:  
     - Left: UTC clock + TD input + “Set TD” (Fenix A320 only); virtual joystick (drag view).  
     - Center: Flaps, spoilers, brakes sliders with labels from profile; gear lever; parking brake; A/P button; camera grid (from `camera_config`).  
     - Right: Throttle slider with detent labels; IDLE button; REVERSE toggle.  
     - Rudder: full-width horizontal slider (center 0.5).  
   - Wire each control to the correct `sendControl(...)` payload and apply profile (detents, mappings, reverse_behavior, arm_spoilers_button).

5. **iPad app – Fenix A320 specifics**  
   - A/P: use L:Var API (step for engage; set ap_disconnect 1→0 then ap_state_off 0 for disconnect).  
   - TD: UTC clock, HH:MM field, “Set TD” button; timer that checks every second; on fire: “TD reached”, sound, alert; persist in UserDefaults.

6. **iPad app – state persistence**  
   - Timer: every 60 s write current slider values + profile name to UserDefaults.  
   - On launch: read back; if profile matches and state ≠ default, set slider values and send each axis once.

7. **iPad app – OFP / METAR**  
   - Optional second screen or sheet: “OFP” button opens a view that calls `getOfp()`, shows PDF (e.g. in `WKWebView` or `SafariServices`) and METAR strings; refresh buttons for METAR and for full OFP refetch.

8. **Polish**  
   - Haptics on button press and detent snap.  
   - Connection status (e.g. ping or one failed request) and “Reconnect” or “Check URL”.  
   - Dark theme matching current web UI.  
   - If backend supports `POST /session`, “Change aircraft” without re-entering PIN.

9. **Testing**  
   - Backend on Windows, app on iPad on same LAN; verify every control type and profile; test TD timer, state restore, and L:Var A/P for Fenix A320.

---

### 7.6 Summary for the agent

- **Backend**: Keep `app.py` and vJoy; add optional `POST /session` and `GET /profiles/<name>.json`; optionally allow profile in request body/header for `update_sim` and L:Var routes.  
- **API**: Use the exact payloads in 7.1; all values 0–1 unless noted; profile is either session or explicit per request.  
- **Profile**: Use the schema in 7.2; get it from backend JSON or ship bundled JSON.  
- **App**: SwiftUI iPad app; BackendService for all HTTP; one main cockpit view with all controls; implement the client logic in 7.3; state save/restore and TD timer for A320; then OFP/METAR, haptics, and connection handling.
