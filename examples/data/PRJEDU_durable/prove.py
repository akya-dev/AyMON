#!/usr/bin/env python3
# =====================================================================
# PRJEDU_durable -- the proof, without your hands: start the engine, change
# the set point through the page, kill the engine as a crash would, start it
# again, and compare what came back. Python's standard library only.
#
#     python prove.py                  the engine from ../../../bin
#     python prove.py C:\path\to\bin   another engine
#
# Close a running PRJEDU_durable first (it holds port 8124).
# Exit code = the number of failed checks.
# =====================================================================
import json
import os
import platform
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:8124"
fails = 0


def check(name, ok, detail=""):
    global fails
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail != '' else ''}")
    if not ok:
        fails += 1


def engine_dir():
    if len(sys.argv) > 1:
        return sys.argv[1]
    if os.name == "nt":
        plat, exe = "win-x64", "AyXDB.exe"
    else:
        m = platform.machine()
        plat, exe = ("linux-arm64" if m in ("aarch64", "arm64") else "linux-x64"), "AyXDB"
    for d in (os.path.join(HERE, "..", "..", "..", "bin", plat), os.path.join(HERE, "..", "bin", plat), os.path.join(HERE, "bin", plat)):
        if os.path.exists(os.path.join(d, exe)):
            return os.path.abspath(d)
    sys.exit("the engine is not found: pass its directory")


def start(binp):
    exe = os.path.join(binp, "AyXDB.exe" if os.name == "nt" else "AyXDB")
    args = [exe, "-console", os.path.join(HERE, "db", "AyXDB.xml")]
    for d in (os.path.join(HERE, "..", "..", "..", "bin", "lic"), os.path.join(HERE, "..", "bin", "lic")):
        if os.path.exists(os.path.join(d, "AyMON.lic")):
            args.append("-lic:" + os.path.abspath(d))
            break
    env = dict(os.environ)
    kw = {}
    if os.name == "nt":
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        env["LD_LIBRARY_PATH"] = binp
        kw["start_new_session"] = True
    os.makedirs(os.path.join(HERE, "log"), exist_ok=True)
    return subprocess.Popen(args, cwd=HERE, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)


def state(timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(URL + "/api.ayp", timeout=2) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(0.2)
    return None


def set_point(v):
    data = urllib.parse.urlencode({"sp": str(v)}).encode()
    req = urllib.request.Request(URL + "/", data=data, method="POST")
    try:
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass


def stop(p):
    try:
        p.send_signal(signal.CTRL_BREAK_EVENT if os.name == "nt" else signal.SIGINT)
        p.wait(20)
    except Exception:
        p.kill()
        p.wait()


binp = engine_dir()
print(f"engine: {binp}")
p = start(binp)
a = state()
if a is None:
    p.kill()
    sys.exit("the page did not answer in 30 s (is another PRJEDU_durable running? see log/)")
want_sp = 61.5 if a["sp"] != 61.5 else 48.5
set_point(want_sp)
time.sleep(4)
a = state()
p.kill()                                   # as a crash: no CTRL-C, no clean stop
p.wait()
print(f"killed at: {a['batches']} batches, set point {a['sp']}, shift {a['shift']}, {len(a['jobs'])} rows, since this start {a['since']}")

p = start(binp)
b = state()
time.sleep(2.5)                            # the log's state on the page is copied once a second
b2 = state()
stop(p)
if b2 is not None:
    b["log"] = b2["log"]
if b is None:
    sys.exit("the page did not answer after the restart")
print(f"back with: {b['batches']} batches, set point {b['sp']}, shift {b['shift']}, {len(b['jobs'])} rows, since this start {b['since']}")

check("the batch counter came back (a kill loses at most rec_flush, 10 ms)", b["batches"] >= a["batches"], (a["batches"], b["batches"]))
check("the set point changed through the page came back", b["sp"] == want_sp, (want_sp, b["sp"]))
check("the job list came back, rows made at run time", len(b["jobs"]) >= min(10, a["batches"]) - 1 and b["jobs"] and b["jobs"][-1]["n"] >= a["jobs"][-1]["n"],
      [j["n"] for j in b["jobs"]][-3:])
check("the counter without xdb_dur began at 0 again", b["since"] < a["since"], (a["since"], b["since"]))
check("the durable log writes", b["log"]["writes"] == 1, b["log"])
print(f"{5 - fails}/5")
sys.exit(fails)
