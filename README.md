# iPad Joy

## 1. What this project is about
This is a touch-friendly flight control panel for MSFS, designed to run on an iPad or any browser and drive simulator controls through vJoy. Sim state (flaps, gear, brakes, autopilot, etc.) is read via the official MSFS SDK (SimConnect). It provides on-screen sliders, joysticks, buttons, and aircraft-specific behavior via profiles.

Key goals:
- Mobile-friendly cockpit controls
- Aircraft-specific behavior (Fenix A320, Fenix A350, PMDG 737/777)
- vJoy output for axes and buttons
- SimConnect (MSFS SDK) for reading sim variables only

## 2. How to install (including dependencies)

### OS and simulator prerequisites
- Windows with MSFS installed
- vJoy installed (Device 1 only; Device 2 optional)

### Python requirements
- Python 3.8+ recommended

### Python packages
Install packages:

```
pip install -r requirements.txt
```

Notes:
- `pyvjoy` is required for vJoy button/axis output.
- `SimConnect` (e.g. from PyPI) is required for reading sim variables via the MSFS SDK.

## 3. How to set up

### vJoy configuration
1. Open **vJoy Configuration**.
2. Enable Device 1 (and optionally Device 2 if you add features that use it).
3. Ensure Device 1 has at least:
   - Axes: X, Y, Z, RX, RY, RZ, SL0
   - Buttons: enough for your mappings (see profile file)
4. Apply and save the configuration.

### Button/axis verification
1. Open **vJoy Monitor**.
2. Move the UI controls in the browser.
3. Confirm axes and buttons respond as expected.
4. If a control does nothing, check the vJoy mapping in the profile.

### Run the app
From the project root:

```
python app.py
```

Open in a browser:
```
http://localhost:5000
```

## 4. What each thing does (including folder structure)

```
ipad_joy/
  app.py                       Flask app and vJoy/SimConnect handlers
  backend/
    __init__.py
    simconnect_mobiflight.py   SimConnect helper (optional)
  profiles/
    fenix_a320.js              Aircraft profile and vJoy mappings
    pmdg_737.js
    pmdg_777.js
  static/
    css/style.css              UI styles
    js/config.js               Base vJoy mapping defaults
    js/main.js                 UI logic and control handlers
  templates/
    index.html                 Landing page
    fenix_a320.html            Fenix A320 UI
    pmdg_737.html              PMDG 737 UI
    pmdg_777.html              PMDG 777 UI
  fully_working/               Archived reference versions
```

### Core behavior overview
- **vJoy outputs**: handled in `app.py` (`/update_sim` endpoint).
- **Sim state (read-only)**: `GET /get_sim` returns SimConnect data (flaps, gear, spoilers, brakes, parking brake, autopilot master). The UI polls this and syncs sliders/indicators. Uses the official MSFS SDK (SimConnect) with standard SimVars (e.g. FLAPS_HANDLE_INDEX, GEAR_HANDLE_POSITION, BRAKE_LEFT_POSITION, AUTOPILOT_MASTER).
- **Aircraft profiles**: in `profiles/*.js`, used to override UI behavior and vJoy mappings.

### Common customization points
- Update mappings per aircraft in `profiles/*.js`.
- Adjust UI logic in `static/js/main.js`.
