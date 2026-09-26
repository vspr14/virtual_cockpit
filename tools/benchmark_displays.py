"""Benchmark: what do MSFS pop-outs and display streaming cost the sim?

Each phase records the sim's frames with Intel PresentMon (frame times, CPU/GPU busy per frame), samples
CPU time of the sim and of this server, total GPU 3D utilisation, and (with --stream) runs a headless viewer
that pulls the displays from the server exactly like the iPad does.

  python tools/benchmark_displays.py windows                      sim windows (are the pop-outs there?)
  python tools/benchmark_displays.py run baseline                 no pop-outs
  python tools/benchmark_displays.py run popouts                  pop-outs open, nobody watching
  python tools/benchmark_displays.py run stream --stream pfd,nd,ewd,sd --fps 30 --width 700
  python tools/benchmark_displays.py report                       compare phases (first phase = reference)

Keep the camera still and the sim unpaused while a phase records. Results: one JSON line per phase in
%LOCALAPPDATA%/VirtualCockpit/benchmarks/displays.jsonl (--out to change).
"""
import argparse
import csv
import ctypes
import glob
import http.cookiejar
import json
import os
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from ctypes import wintypes

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

LOCAL = os.environ.get('LOCALAPPDATA', tempfile.gettempdir())
PRESENTMON = os.path.join(LOCAL, 'VirtualCockpit', 'tools', 'PresentMon.exe')
DEFAULT_OUT = os.path.join(LOCAL, 'VirtualCockpit', 'benchmarks', 'displays.jsonl')
SIM_EXES = tuple(os.environ.get('VC_BENCH_EXES', 'FlightSimulator2024.exe,FlightSimulator.exe').split(','))

_kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
_kernel32.OpenProcess.restype = wintypes.HANDLE


# ---------- CPU time ----------

def _ft(ft):
    return ((ft.dwHighDateTime << 32) | ft.dwLowDateTime) / 1e7


def process_cpu_s(pid):
    """User + kernel CPU seconds of a process, None if it can't be opened."""
    h = _kernel32.OpenProcess(0x1000, False, pid)
    if not h:
        return None
    try:
        c, e, k, u = (wintypes.FILETIME() for _ in range(4))
        if not _kernel32.GetProcessTimes(h, ctypes.byref(c), ctypes.byref(e), ctypes.byref(k), ctypes.byref(u)):
            return None
        return _ft(k) + _ft(u)
    finally:
        _kernel32.CloseHandle(h)


def system_cpu():
    idle, kern, user = wintypes.FILETIME(), wintypes.FILETIME(), wintypes.FILETIME()
    _kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kern), ctypes.byref(user))
    return _ft(idle), _ft(kern) + _ft(user)   # kernel time includes idle


def sim_pids():
    out = subprocess.run(['tasklist', '/FO', 'CSV', '/NH'], capture_output=True, text=True).stdout
    pids = {}
    for row in csv.reader(out.splitlines()):
        if len(row) > 1 and row[0].lower() in [e.lower() for e in SIM_EXES]:
            pids[int(row[1])] = row[0]
    return pids


# ---------- GPU utilisation (Windows performance counters) ----------

class GpuSampler:
    """Total 3D-engine utilisation plus the share of chosen PIDs, sampled once a second with typeperf."""

    def __init__(self, seconds, pids):
        self.pids = pids
        self.file = os.path.join(tempfile.gettempdir(), f'vc_gpu_{os.getpid()}_{int(time.time())}.csv')
        self.proc = subprocess.Popen(
            ['typeperf', r'\GPU Engine(*engtype_3D)\Utilization Percentage', '-si', '1',
             '-sc', str(int(seconds)), '-f', 'CSV', '-o', self.file, '-y'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def result(self):
        try:
            self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        try:
            with open(self.file, newline='', encoding='utf-8', errors='replace') as fh:
                rows = list(csv.reader(fh))
            os.remove(self.file)
        except OSError:
            return None
        if len(rows) < 3:
            return None
        head = rows[0]
        total, per = [], {p: [] for p in self.pids}
        for row in rows[1:]:
            vals = []
            for name, v in zip(head[1:], row[1:]):
                try:
                    x = float(v)
                except ValueError:
                    continue
                vals.append((name, x))
            total.append(sum(x for _, x in vals))
            for p in self.pids:
                per[p].append(sum(x for name, x in vals if f'pid_{p}_' in name))
        mean = lambda xs: round(statistics.fmean(xs), 1) if xs else None
        return {'total_3d_pct': mean(total), 'by_pid_pct': {str(p): mean(v) for p, v in per.items()}}


# ---------- server + headless viewer ----------

class Server:
    def __init__(self, base, pin, aircraft):
        self.base, self.pin, self.aircraft = base.rstrip('/'), pin, aircraft
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def login(self):
        req = urllib.request.Request(self.base + '/verify_pin', data=json.dumps({'pin': self.pin}).encode(),
                                     headers={'Content-Type': 'application/json'})
        self.opener.open(req, timeout=5).read()

    def get(self, path):
        return json.loads(self.opener.open(self.base + path, timeout=10).read())

    def cookie_header(self):
        return '; '.join(f'{c.name}={c.value}' for c in self.jar)


class Viewer(threading.Thread):
    """Pulls display frames over the WebSocket like the iPad, counting frames and bytes per display."""

    def __init__(self, server, displays, fps, width, quality):
        super().__init__(daemon=True)
        self.server, self.displays, self.fps, self.width, self.quality = server, displays, fps, width, quality
        self.counts = {d: 0 for d in displays}
        self.bytes = 0
        self.status = None
        self.error = None
        self.recording = False
        self.stop_flag = False

    def run(self):
        from simple_websocket import Client
        url = self.server.base.replace('http', 'ws', 1) + f'/ws/{self.server.aircraft}/displays'
        try:
            ws = Client.connect(url, headers={'Cookie': self.server.cookie_header()})
        except Exception as err:
            self.error = f'connect failed: {err}'
            return
        ws.send(json.dumps({'type': 'subscribe', 'fps': self.fps, 'quality': self.quality,
                            'displays': {d: {'width': self.width} for d in self.displays}}))
        try:
            while not self.stop_flag:
                msg = ws.receive(timeout=0.5)
                if msg is None:
                    continue
                if isinstance(msg, str):
                    data = json.loads(msg)
                    if data.get('type') == 'status':
                        self.status = data.get('displays')
                    continue
                n = msg[0]
                display = msg[1:1 + n].decode()
                if self.recording:
                    self.counts[display] = self.counts.get(display, 0) + 1
                    self.bytes += len(msg)
        finally:
            ws.close()


# ---------- PresentMon ----------

def record_presentmon(seconds, exe, csv_path):
    if not os.path.isfile(PRESENTMON):
        raise SystemExit(f'PresentMon not found at {PRESENTMON}')
    return subprocess.Popen(
        [PRESENTMON, '--process_name', exe, '--output_file', csv_path, '--timed', str(int(seconds)),
         '--terminate_after_timed', '--no_console_stats', '--session_name', 'VCDisplayBench',
         '--stop_existing_session'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _num(v):
    try:
        x = float(v)
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def parse_presentmon(csv_path, exe):
    paths = glob.glob(os.path.splitext(csv_path)[0] + '*.csv')
    rows = []
    for p in paths:
        with open(p, newline='', encoding='utf-8-sig', errors='replace') as fh:
            rows += [r for r in csv.DictReader(fh) if r.get('Application', '').lower() == exe.lower()]
    if not rows:
        return None
    chains = {}
    for r in rows:
        chains.setdefault(r['SwapChainAddress'], []).append(r)
    main_key = max(chains, key=lambda k: len(chains[k]))
    main = chains[main_key]
    ft = [x for x in (_num(r['MsBetweenPresents']) for r in main[1:]) if x and x > 0]
    t = [x for x in (_num(r['TimeInMs']) for r in main) if x is not None]
    duration_s = (max(t) - min(t)) / 1000 if len(t) > 1 else None
    if not ft or not duration_s:
        return None
    fts = sorted(ft)
    pct = lambda q: fts[min(len(fts) - 1, int(q * len(fts)))]
    gpu_busy = [x for x in (_num(r.get('MsGPUBusy')) for r in main) if x is not None]
    cpu_busy = [x for x in (_num(r.get('MsCPUBusy')) for r in main) if x is not None]
    all_gpu = sum(x for x in (_num(r.get('MsGPUBusy')) for r in rows) if x is not None)
    return {
        'frames': len(main), 'duration_s': round(duration_s, 2), 'swapchains': len(chains),
        'swapchain_presents': sorted((len(v) for v in chains.values()), reverse=True),
        'fps_avg': round(len(ft) / (sum(ft) / 1000), 2),
        'fps_1pct_low': round(1000 / pct(0.99), 2), 'fps_0_1pct_low': round(1000 / pct(0.999), 2),
        'frametime_ms': {'p50': round(pct(0.5), 2), 'p95': round(pct(0.95), 2), 'p99': round(pct(0.99), 2),
                         'max': round(fts[-1], 2)},
        'gpu_busy_ms_avg': round(statistics.fmean(gpu_busy), 3) if gpu_busy else None,
        'cpu_busy_ms_avg': round(statistics.fmean(cpu_busy), 3) if cpu_busy else None,
        'gpu_busy_all_swapchains_pct': round(100 * all_gpu / 1000 / duration_s, 1),
    }


# ---------- commands ----------

def cmd_windows(args):
    from backend.displays import winenum
    wins = winenum.list_windows(tuple(e.lower() for e in SIM_EXES))
    if not wins:
        print('No sim windows (is MSFS running?)')
    for w in sorted(wins, key=lambda w: -w['width'] * w['height']):
        print(f"{w['hwnd']:>10}  {w['width']:>5}x{w['height']:<5} {'minimized ' if w['minimized'] else ''}"
              f"{w['exe']}  {w['title']!r}")


def cmd_run(args):
    pids = sim_pids()
    if not pids:
        raise SystemExit('MSFS is not running.')
    sim_pid, exe = next(iter(pids.items()))
    server = Server(args.server, args.pin, args.aircraft)
    server_stats0 = None
    try:
        server.login()
        server_stats0 = server.get(f'/api/{args.aircraft}/displays/stats')
    except Exception as err:
        print(f'(server not reachable: {err}; server CPU not measured)')
        if args.stream:
            raise SystemExit('--stream needs the server running')

    viewer = None
    if args.stream:
        viewer = Viewer(server, [d.strip() for d in args.stream.split(',') if d.strip()], args.fps, args.width,
                        args.quality)
        viewer.start()
        print(f'viewer warming up {args.warmup}s ...')
        time.sleep(args.warmup)
        if viewer.error:
            raise SystemExit(viewer.error)

    csv_path = os.path.join(tempfile.gettempdir(), f'vc_pm_{args.label}_{int(time.time())}.csv')
    server_pid = server_stats0['pid'] if server_stats0 else None
    gpu = GpuSampler(args.seconds, [p for p in (sim_pid, server_pid) if p])
    cpu0 = {p: process_cpu_s(p) for p in (sim_pid, server_pid) if p}
    sys0 = system_cpu()
    t0 = time.time()
    if viewer:
        viewer.recording = True
    pm = record_presentmon(args.seconds, exe, csv_path)
    print(f'recording {args.label!r} for {args.seconds}s ... keep the camera still')
    pm.wait(timeout=args.seconds + 30)
    wall = time.time() - t0
    if viewer:
        viewer.recording = False
    cpu1 = {p: process_cpu_s(p) for p in cpu0}
    sys1 = system_cpu()
    server_stats1 = server.get(f'/api/{args.aircraft}/displays/stats') if server_stats0 else None
    if viewer:
        viewer.stop_flag = True
        viewer.join(timeout=3)

    ncpu = os.cpu_count() or 1
    busy = (sys1[1] - sys0[1]) - (sys1[0] - sys0[0])
    result = {
        'label': args.label, 'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'seconds': round(wall, 1),
        'sim': {'exe': exe, 'pid': sim_pid},
        'presentmon': parse_presentmon(csv_path, exe),
        'cpu_pct_of_one_core': {('sim' if p == sim_pid else 'server'): round(100 * (cpu1[p] - cpu0[p]) / wall, 1)
                                for p in cpu0 if cpu0[p] is not None and cpu1[p] is not None},
        'system_cpu_pct': round(100 * busy / (sys1[1] - sys0[1]), 1) if sys1[1] > sys0[1] else None,
        'cpu_count': ncpu,
        'gpu': gpu.result(),
    }
    if server_stats0 and server_stats1:
        result['server_displays'] = {
            'captures': server_stats1['captures'],
            'capture_frames': server_stats1['capture_frames'] - server_stats0['capture_frames'],
            'encodes': server_stats1['encodes'] - server_stats0['encodes'],
            'encode_ms_avg': server_stats1['encode_ms_avg'],
        }
    if viewer:
        result['stream'] = {
            'displays': viewer.displays, 'target_fps': args.fps, 'width': args.width, 'quality': args.quality,
            'fps_received': {d: round(n / wall, 1) for d, n in viewer.counts.items()},
            'mbit_s': round(viewer.bytes * 8 / wall / 1e6, 2), 'status': viewer.status,
        }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'a', encoding='utf-8') as fh:
        fh.write(json.dumps(result) + '\n')
    print(json.dumps(result, indent=2))


def cmd_report(args):
    try:
        with open(args.out, encoding='utf-8') as fh:
            rows = [json.loads(l) for l in fh if l.strip()]
    except OSError:
        raise SystemExit(f'no results in {args.out}')
    rows = [r for r in rows if r.get('presentmon')]
    if not rows:
        raise SystemExit('no usable phases')
    ref = rows[0]['presentmon']
    print(f"{'phase':<18}{'fps':>8}{'chg':>8}{'1% low':>9}{'chg':>8}{'p95 ms':>8}{'GPU ms':>8}"
          f"{'sim CPU':>9}{'srv CPU':>9}{'GPU 3D%':>9}{'chains':>8}  stream")
    for r in rows:
        pm = r['presentmon']
        d = lambda k: f"{100 * (pm[k] - ref[k]) / ref[k]:+.1f}%"
        cpu = r.get('cpu_pct_of_one_core', {})
        gpu = (r.get('gpu') or {}).get('total_3d_pct')
        st = r.get('stream')
        stream = f"{','.join(st['displays'])} @{st['target_fps']}fps->{st['fps_received']} {st['mbit_s']}Mbit/s" if st else ''
        print(f"{r['label']:<18}{pm['fps_avg']:>8.1f}{d('fps_avg'):>8}{pm['fps_1pct_low']:>9.1f}"
              f"{d('fps_1pct_low'):>8}{pm['frametime_ms']['p95']:>8.1f}{pm['gpu_busy_ms_avg'] or 0:>8.2f}"
              f"{cpu.get('sim', 0):>8.0f}%{cpu.get('server', 0):>8.0f}%{gpu if gpu is not None else float('nan'):>9.1f}"
              f"{pm['swapchains']:>8}  {stream}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=DEFAULT_OUT)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('windows')
    run = sub.add_parser('run')
    run.add_argument('label')
    run.add_argument('--seconds', type=int, default=60)
    run.add_argument('--stream', default='', help='comma-separated display ids to pull, e.g. pfd,nd,ewd,sd')
    run.add_argument('--fps', type=int, default=30)
    run.add_argument('--width', type=int, default=700)
    run.add_argument('--quality', type=int, default=80)
    run.add_argument('--warmup', type=int, default=5)
    run.add_argument('--server', default='http://127.0.0.1:5000')
    run.add_argument('--pin', default=os.environ.get('VC_PIN', '1234'))
    run.add_argument('--aircraft', default='fenix_a320')
    sub.add_parser('report')
    args = ap.parse_args()
    {'windows': cmd_windows, 'run': cmd_run, 'report': cmd_report}[args.cmd](args)


if __name__ == '__main__':
    main()
