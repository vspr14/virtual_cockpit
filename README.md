# Virtual Cockpit

Touch-friendly cockpit panels for Microsoft Flight Simulator, served from your PC to an iPad (or any browser)
on the same network. Each aircraft gets its own page; controls talk to the sim through MobiFlight WASM
(LVars), and camera views through vJoy buttons.

Currently included: **Fenix A320**: camera views and T.O. CONFIG, SimBrief OFP and METARs, AUTO BRK,
landing gear, pedestal clock, ATC/TCAS panel, weather radar SYS / PWS.

## Requirements (sim PC, Windows)

- Python 3.12+ and `pip install -r requirements.txt`
- MSFS with the [MobiFlight WASM module](https://github.com/MobiFlight/MobiFlight-WASM-Module) installed
  (reads/writes aircraft LVars)
- [vJoy](https://github.com/jshafer817/vJoy) with device 1 enabled; bind its buttons to camera views in MSFS
  (button numbers per aircraft are in `aircraft/<id>/aircraft.json`)

## Run

```bash
python app.py            # http://<pc-ip>:5000
python app.py 1          # debug mode with auto-reload
python app.py 1 1        # debug + self-signed HTTPS (needs pyOpenSSL)
```

Open `http://<pc-ip>:5000` on the iPad, enter the PIN, pick an aircraft. For a full-screen app, use Safari's
**Share → Add to Home Screen**. The sim can be started before or after the server; the server connects when
MSFS is running.

Settings (environment variables): `VC_PIN` (default `1234`), `VC_SIMBRIEF_USERID`, `VC_PORT` (default
`5000`), `VC_SECRET_KEY`.

## Displays tab (live cockpit screens)

The cockpit page has three tabs: **CONTROLS**, **OFP** and **DISPLAYS**. The Displays tab streams the sim's
screens (Fenix: PFD, ND, upper and lower ECAM) to the iPad. Toggle the screens you want (default PFD + ND); they
are laid out as large as the screen allows. **ARRANGE** lets you place them yourself: drag a screen to move it,
its corner to resize it (the shape is kept, edges snap to each other). **AUTO** goes back to the automatic
layout. Selection and arrangement are remembered on that device.

How it works: MSFS draws each popped-out screen into its own window. With the **virtual monitor** installed, the
server moves those windows onto it (borderless, one slot per screen, off the taskbar), so you never see them,
and captures that monitor as one picture (Windows Graphics Capture) at the capture rate, only while someone
watches. Measured with four screens streaming at 25 fps: about -3% sim fps and no change in 1% lows, within the
run-to-run noise. Each screen is a crop of that picture, scaled to the tile's exact pixel size, JPEG-encoded once for every
viewer and sent over one WebSocket. Without the virtual monitor the windows are captured one by one (Windows
Graphics Capture) and must stay open on your desktop.

### Virtual monitor (one-time install)

Uses the free, open-source [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver)
(signed by the SignPath Foundation). From an **admin** PowerShell in the repo folder:

```powershell
powershell -ExecutionPolicy Bypass -File tools\virtual_display\install.ps1              # install
powershell -ExecutionPolicy Bypass -File tools\virtual_display\install.ps1 -Uninstall   # remove
```

It downloads the pinned driver release, checks its signature, writes `C:\VirtualDisplayDriver\vdd_settings.xml`
(from `tools/virtual_display/vdd_settings.xml`: one 1600×1600 monitor at 60 Hz on the GPU that drives your main
monitor) and adds the device. The server then sizes the monitor and tucks it diagonally under a corner of your
desktop, sharing a single pixel of edge (Windows needs a shared edge), so the mouse can't wander onto it.

Each flight: in the sim hold **Right-Alt** and click each screen to pop it out, then **DISPLAYS → SETUP** and pick
which screen each window shows. The window moves to the virtual monitor right away. Assignments are remembered;
a pop-out that reappears where it first opened (or already sits in its slot) is picked up and moved by itself.
Setting a window to "Not used" gives it back to your desktop with its frame.

### Automatic pop-out

Works like [MSFS Pop Out Panel Manager](https://github.com/hawkeye-stan/msfs-2024-popout-panel-manager), with
ChasePlane. Once per aircraft, in **DISPLAYS → SETUP → Automatic pop-out**: pick a ChasePlane view that shows the
screens, **TAKE PICTURE**, then tap a screen's name and tap that screen in the picture (avoid spots near the edge of
the view). **POP OUT NOW** or, with **Pop out when a flight starts** ticked, the server does it by itself when the
camera goes from the loading / Ready to Fly screen to the cockpit. Either way, for each screen:

1. ChasePlane jumps straight to the view (its local API, `ws://127.0.0.1:8652`, no transition)
2. the sim is brought to the front, the cursor is put on the screen and clicked once (to focus the cockpit)
3. Right-Alt + click, up to 5 tries, until the pop-out window appears; it's moved to the virtual monitor at once

Then ChasePlane returns to its default view, and the cursor and focused window are put back. Takes about 12 s for
four screens; keep your hands off the mouse meanwhile. Nothing is clicked if the sim window isn't in front or
another window covers the spot. Calibration: `%LOCALAPPDATA%\VirtualCockpit\popout.json`.

Per aircraft: `aircraft/<id>/displays.json` lists the screens (`id`, `label`, `name`, `aspect`), the default
selection, the AUTO layout preset (`layout`: a `cols` x `rows` grid of equal tiles in the screens' true shape, as large as the tab allows, `cells` gives each
screen's `[column, row]` or `[column, row, columns spanned]`; the A320 has PFD, ND, upper ECAM on top, the lower ECAM
under the upper one and the EFB under PFD + ND), `web` (web pages shown live as tiles instead of streamed: `id`,
`label`, `name`, `url` where `{host}` becomes this server's host; the A320's is the Fenix EFB that Fenix's gateway
serves on port 8083: touchable, costs the sim nothing measurable, a button on the tile grows it to the whole tab; it
needs this site on plain HTTP, since Safari blocks an http page inside an https one) and `match` (aircraft.cfg path globs for the automatic pop-out); the slots on the virtual monitor follow from
that list and leave out the taskbar Windows shows on it. Settings: `VC_DISPLAY_CAPTURE_FPS` (default 30),
`VC_DISPLAY_PROCESSES` (sim exe names), `VC_DISPLAY_STATE_FILE`, `VC_DISPLAY_DOCK` (`0` = don't use the virtual
monitor), `VC_DISPLAY_DOCK_SIZE` (default `1600x1600`; must be a resolution listed in `vdd_settings.xml`),
`VC_DISPLAY_DOCK_ADAPTER` (adapter name to recognise it by), `VC_DISPLAY_DOCK_CAPTURE` (`wgc`, or `dxgi`),
`VC_DISPLAY_POPOUT_FILE`, `VC_CHASEPLANE_API_URL`.

### Measuring the cost

`tools/benchmark_displays.py` records the sim's frames with Intel PresentMon (downloaded to
`%LOCALAPPDATA%\VirtualCockpit\tools\PresentMon.exe`) plus CPU and GPU use, optionally while a headless viewer
pulls the displays like the iPad does:

```bash
python tools/benchmark_displays.py run baseline                     # no pop-outs
python tools/benchmark_displays.py run popouts                      # pop-outs open, nobody watching
python tools/benchmark_displays.py run stream4 --stream pfd,nd,ewd,sd
python tools/benchmark_displays.py report
```

With a frame-rate cap the FPS barely moves; compare the GPU/CPU busy time per frame instead, or uncap the sim for
the test.

## ChasePlane views

ChasePlane keeps a separate profile per aircraft preset (the Fenix CFM/IAE × SL/WF are four), so camera
buttons would have to be bound again for every variant. **ChasePlane views** (link on the aircraft picker,
`/chaseplane`) gives every variant of an aircraft the same view behind each website camera button:

- The reference views live in `aircraft/<id>/chaseplane.json`. **Use as reference** on a profile copies the
  views bound to the website's buttons there (tune a view in ChasePlane, bind it, capture, apply).
- **Apply** writes them, with exactly one vJoy binding per button, into every matching profile. It reuses the
  view already bound to a button (or an unbound view with the camera's name) and creates missing ones. Other
  views, keyboard keys and other devices are left alone, and nothing is deleted.
- The aircraft loaded in MSFS is skipped (ChasePlane holds it in memory); apply after switching aircraft or
  returning to the menu. If MSFS is running but can't be asked, nothing is written.
- Every changed profile is backed up first to `%LOCALAPPDATA%\VirtualCockpit\chaseplane_backups`;
  **Restore backup** puts one back.
- Command line: `python -m backend.chaseplane status | apply | capture <aircraft> <profile> | restore ...`

`chaseplane.json`: `match` (globs against the preset's aircraft.cfg path or the profile folder name, so new
variants and livery presets are picked up automatically), `global_cameras` (buttons bound to a ChasePlane
action instead of a view, e.g. EXT = `CAM_TOGGLE_IN_OUT`; reported, not written) and `views` (camera id →
reference view). Cameras without a reference view (e.g. `custom_03`) are not synced.

Settings: `VC_CHASEPLANE_DIR` (ChasePlane's `work\aircraft` folder), `VC_CHASEPLANE_BACKUP_DIR`,
`VC_CHASEPLANE_VJOY` (`"<device id>|<device name>"`; default: newest vJoy binding found in the profiles) and
`VC_CHASEPLANE_AUTOSYNC=1` (the server applies pending changes by itself whenever the aircraft isn't loaded).

## Adjusting sizes (Fenix A320)

Edit the variables at the top of `static/css/aircraft/fenix_a320.css`:

| Variable | Meaning |
|---|---|
| `--gear-height` | Largest height of the gear lever; it shrinks (to 80px) when the screen is short |
| `--gear-width` | Largest width of the gear lever |
| `--clock-scale` | Clock size multiplier (1 = design size) |
| `--clock-width` | Clock width before scaling |

## Project layout

```
app.py                       Flask app: PIN gate, registers the routes
backend/
  aircraft.py                Aircraft registry (scans aircraft/*/aircraft.json)
  settings.py, paths.py      Settings (env vars) and file locations (source or PyInstaller)
  routes/                    pages.py (PIN, picker, cockpit pages), lvars.py, camera.py, ofp.py, chaseplane.py,
                             displays.py (setup API + WebSocket frame stream)
  chaseplane/                ChasePlane view sync: sync.py (rules), store.py (files, backups), CLI
  displays/                  Displays tab: dock.py (virtual monitor: placement + capture), popout.py (automatic
                             pop-out), monitors.py,
                             winenum.py (sim windows), capture.py (per-window fallback), assignments + encoding
  sim/                       mobiflight.py (LVar transport), vjoy.py (buttons), simstate.py (loaded aircraft,
                             flight start), chaseplane_api.py (ChasePlane camera API),
                             simconnect_mobiflight.py + mobiflight_variable_requests.py (MobiFlight client)
aircraft/<id>/               One folder per aircraft
  aircraft.json              name, sim transport, cameras (id, label, vJoy button)
  lvars.json                 the only sim variables this aircraft's page may read or write
  chaseplane.json            optional: ChasePlane view set shared by all its variants
  displays.json              optional: screens the Displays tab can stream
tools/benchmark_displays.py  what pop-outs and display streaming cost the sim (PresentMon)
tools/virtual_display/       virtual monitor install script + driver settings
templates/
  base.html, index.html      shared page shell; PIN + aircraft picker
  aircraft/<id>.html         the aircraft's cockpit page
  widgets/                   reusable markup (TCAS panel, clock, annunciator pushbutton, back link)
static/js/
  core/                      api.js (HTTP), sim.js (writes, pulses, polling, write holds), touch.js
  widgets/                   reusable controls; know nothing about aircraft or LVars
  aircraft/<id>/             the aircraft's page script: wires widgets to its LVars
static/css/
  base.css, widgets/*.css    shared styles
  aircraft/<id>.css          the aircraft's layout
```

### How a page talks to the sim

- `GET /api/<id>/lvars` returns every variable in `aircraft/<id>/lvars.json` (polled every 450 ms).
  MobiFlight forgets registered variables whenever any client clears its shared list (another tool, a second
  server) or its module restarts; reads would then freeze while writes still work. The server writes a
  counter to `L:VC_MOBIFLIGHT_CANARY` and re-registers everything when the counter stops coming back.
- `POST /api/<id>/lvars {key, value}` writes one; unknown keys are rejected.
- Momentary pushbuttons are sent as a press (1) then release (0) through one queue (`sim.pulse`), spaced so
  the aircraft registers every press.
- After a write, that control ignores sim values until the write has landed (`sim.hold` / `sim.isHeld`),
  so the UI never flickers back to the old state.
- `POST /api/<id>/camera {cam_id}` presses the vJoy button mapped in `aircraft.json`.
- `GET /api/ofp`, `GET /api/metar` fetch the SimBrief OFP and METARs.

## Adding an aircraft

1. `aircraft/<id>/aircraft.json`: `{"name": "...", "sim": "mobiflight", "cameras": [...]}`
2. `aircraft/<id>/lvars.json`: `{"my_key": {"lvar": "L:NAME"}}` for each variable the page uses
   (optionally `"write_rpn"` for a custom MobiFlight RPN write).
3. `templates/aircraft/<id>.html`: extend `base.html`; include widgets from `templates/widgets/`.
4. `static/js/aircraft/<id>/main.js`: `createSim('<id>')`, init widgets, map them to your keys, `sim.start()`.
5. `static/css/aircraft/<id>.css`: page layout.
6. Optional, `aircraft/<id>/chaseplane.json`: `{"match": ["simobjects/airplanes/<package>/*"], "views": {}}`,
   then bind the views once in one variant and **Use as reference** on the ChasePlane page.

The aircraft appears in the picker automatically. Nothing shared needs editing. Keep aircraft-specific
logic out of `core/` and `widgets/`; add new reusable controls under `widgets/`.

## Packaging

`output/`, `build/` and `dist/` are git-ignored. When building with PyInstaller, include the `templates`,
`static` and `aircraft` folders as data (`backend/paths.py` resolves them inside the bundle).
