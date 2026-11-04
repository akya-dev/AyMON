#!/usr/bin/env python3
# =====================================================================
# PRJEDU_records -- what is really in log/history.db? Python's own sqlite3,
# nothing to install. It only reads, so it can run while the engine does. Any
# SQLite tool would do; this one also checks the rules.
#
#     python check.py          the rows, and the checks
#
# Exit code = the number of failed checks.
# =====================================================================
import bisect
import os
import sqlite3
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "log", "history.db")
PERIOD_MS = 10000   # his_per in db_TANK.xml
DEADBAND = 1.0      # his_dbd of TEMP

fails = 0


def check(name, ok, detail=""):
    global fails
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}{'  -- ' + detail if detail else ''}")
    if not ok:
        fails += 1


if not os.path.exists(DB):
    sys.exit("log/history.db is not there yet: start the example first")

# mode=rw, not ro: an engine killed in the middle of a commit leaves a journal
# that SQLite must roll back first, and mode=ro refuses to.
con = sqlite3.connect("file:" + DB.replace("\\", "/") + "?mode=rw", uri=True, timeout=5)
n = {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("alm", "evt", "val")}
print(f"rows: alm {n['alm']}, evt {n['evt']}, val {n['val']}")

print("\nthe numbered events, run by run")
runs = con.execute("SELECT run, count(*), count(DISTINCT n), min(n), max(n) FROM evt"
                   " WHERE n IS NOT NULL GROUP BY run ORDER BY run").fetchall()
for run, cnt, dist, lo, hi in runs:
    check(f"run {run}: {cnt} rows, numbers {lo} .. {hi}", cnt == dist and lo == 1 and hi == cnt,
          "" if cnt == hi else f"{hi - cnt} missing")
if not runs:
    check("there are numbered events", False)

print("\nvalue history")
# A period's rules hold within one run: a new run's first change is always a
# record, so a period cut by a restart may hold more than two rows.
starts = [r[0] for r in runs]
rows = defaultdict(list)
for rid, ms, val in con.execute("SELECT rid, ms, val FROM val ORDER BY id"):
    rows[rid].append((ms, val, bisect.bisect_right(starts, ms)))
for rid, r in sorted(rows.items()):
    per = defaultdict(int)
    for ms, _, run in r:
        per[run, ms // PERIOD_MS] += 1
    over = sum(1 for c in per.values() if c > 2)
    check(f"{rid}: {len(r)} rows in {len(per)} periods, at most two a period", not over,
          f"{over} period(s) above two" if over else "")
held = [1 for a, b in zip(rows["TEMP"], rows["TEMP"][1:])
        if a[2] == b[2] and a[0] // PERIOD_MS == b[0] // PERIOD_MS and abs(b[1] - a[1]) < DEADBAND - 1e-9]
check("TEMP: no change under the deadband inside a period", not held, f"{len(held)} found" if held else "")

print("\nalarms and events")
alm = con.execute("SELECT fnc, count(*) FROM alm GROUP BY fnc").fetchall()
print("  alm by function:", dict(alm))
check("every alarm row says which limit", all(f for f, _ in alm))
pump = con.execute("SELECT count(*) FROM evt WHERE knd='evt' AND txt LIKE 'fill pump:%'").fetchone()[0]
doses = con.execute("SELECT count(*) FROM evt WHERE n IS NOT NULL").fetchone()[0]
if doses >= 80:     # the first fill takes about half a minute: 40 s of doses
    check(f"HIS.evt wrote the pump's changes: {pump}", pump > 0)
else:
    print(f"  the pump's changes so far: {pump} (the first comes after about half a minute)")
for txt, rol, sta in con.execute("SELECT txt, rol, sta FROM evt WHERE knd='aud' ORDER BY id DESC LIMIT 3"):
    print(f"  audit: {txt!r}, role {rol}, sta 0x{sta:04X}")

print("\nthe journal")
jdir = os.path.join(HERE, "log", "rec")
seg = [f for f in os.listdir(jdir) if f.endswith(".jrn")] if os.path.isdir(jdir) else []
check(f"log/rec holds {len(seg)} segment(s)", len(seg) > 0)

print(f"\n{'all checks passed' if not fails else str(fails) + ' check(s) FAILED'}")
sys.exit(fails)
