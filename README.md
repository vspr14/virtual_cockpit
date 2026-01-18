# iPad Joy

## 1. What this project is about
This is a touch-friendly flight control panel for MSFS, designed to run on an iPad or any browser and drive simulator controls through vJoy and MobiFlight L:Vars. It provides on-screen sliders, joysticks, buttons, and aircraft-specific behavior via profiles.

Key goals:
- Mobile-friendly cockpit controls
- Aircraft-specific behavior (Fenix A320, PMDG 737/777)
- vJoy output for axes and buttons
- MobiFlight L:Var read/write for aircraft state and inputs

## 2. How to install (including dependencies)

### OS and simulator prerequisites
- Windows with MSFS installed
- vJoy installed
- FSUIPC7 installed
- MobiFlight WASM installed in MSFS

### Python requirements
- Python 3.8+ recommended

### Python packages
Install packages:

```
pip install -r requirements.txt
```

Notes:
- `pyvjoy` is required for vJoy button/axis output.
- `simconnect` is required for SimConnect access.
- MobiFlight support is based on the code from the https://github.com/Koseng/MSFSPythonSimConnectMobiFlightExtension repo.

## 3. How to set up

### vJoy configuration
1. Open **vJoy Configuration**.
2. Enable Device 1 and Device 2.
3. Ensure Device 1 has at least:
   - Axes: X, Y, Z, RX, RY, RZ, SL0
   - Buttons: enough for your mappings (see profile file)
4. Ensure Device 2 has:
   - Axes: X and Y
5. Apply and save the configuration.

### Button/axis verification
1. Open **vJoy Monitor**.
2. Move the UI controls in the browser.
3. Confirm axes and buttons respond as expected.
4. If a control does nothing, check the vJoy mapping in the profile.

### L:Var setup
1. Install FSUIPC7 and enable the MobiFlight WASM module in MSFS.
2. L:Vars used by this app are defined in `data/lvars.json`.
3. Only keys in `data/lvars.json` are read or written.

### How to find L:Vars in MSFS
1. Enable Developer Mode: **Options → General Options → Developers → Developer Mode**.
2. Load into the aircraft you want.
3. Open **Tools → Behaviors**.
4. In the Behaviors window, open the **LocalVariables** tab and use the filter box to search by name.
5. Hover a cockpit control and press **Ctrl + G** to jump to its related behavior or variable names.

References:
- https://docs.flightsimulator.com/html/Developer_Mode/Menus/Tools/Behaviors_Debug.htm
- https://microsoft.github.io/msfs-avionics-mirror/2024/docs/interacting-with-msfs/simvars/

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
    fsuipc_wapi_reader.py      L:Var read/write/step via MobiFlight
    simconnect_mobiflight.py   SimConnect helper for MobiFlight client data
    mobiflight_variable_requests.py  MobiFlight variable access
  data/
    lvars.json                 L:Var keys, expressions, and notes
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
- **L:Var read/write**: handled in `backend/fsuipc_wapi_reader.py` and exposed via:
  - `GET /lvars` for polling state
  - `POST /lvars` for setting values
  - `POST /lvars/step` for increment/decrement expressions
- **Aircraft profiles**: in `profiles/*.js`, used to override UI behavior and vJoy mappings.
- **L:Var definitions**: in `data/lvars.json`. Each entry includes a `key`, `lvar`, and optional `note`.

### Common customization points
- Add or update L:Vars in `data/lvars.json`.
- Update mappings per aircraft in `profiles/*.js`.
- Adjust UI logic in `static/js/main.js`.
