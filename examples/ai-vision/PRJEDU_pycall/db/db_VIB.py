# =====================================================================
# db_VIB.py - VIB/S00's Python side: vibration analysis, called from
# the XML and from the JScript, asynchronously.
#
# Two functions are marked @xdb_fnc. For each, the engine generates a
# JScript wrapper in this script's scope ('vib', the <script>'s id):
#
#   analyse(evt)            ONE parameter named 'evt' -> an EVENT call.
#                           db_VIB.xml hangs it on a point:
#                               <var id="WAVE" val_fnc="[vib.analyse]">
#                           Every write to WAVE queues a call; Python sees
#                           the new value as evt.valn. The engine writes
#                           WAVE itself only AFTER this function returns.
#
#   forecast(limit, stamp)  anything else -> an ARGUMENT call, from
#                           JScript:  vib.forecast(4.5, Time.GetTimeMs())
#                           The JScript gets 1 back at once ("queued"),
#                           never the result - Python writes the result
#                           where it belongs (FORECAST) when it is done.
#
# Both calls are queued to the one Python thread; neither the timer that
# wrote WAVE nor the JScript that called forecast() waits for Python.
#
# Only the standard library: a 512-point block and its spectrum up to
# 400 Hz is a few tens of milliseconds of plain Python - measured, it is
# on the page.
# =====================================================================
from XDB import *
import json
import math

xdb = None
xdb_evt = []                 # no per-cycle items: this script only answers calls

FMAX = 400.0                 # the spectrum the page shows, Hz
BAND = (80.0, 100.0)         # the bearing's outer race defect frequency (BPFO) is 90 Hz
MAX_AGE_MS = 4000            # a block that waited longer than this is not analysed
history = []                 # (time ms, rms) of the last minutes, for forecast()
skipped = 0                  # blocks dropped because they were too old
_tables = {}                 # cos/sin tables per (n, fs)


def init(xdb_in):
    global xdb
    xdb = xdb_in
    xdb.Log(4, "VIB: Python ready - analyse() and forecast() are callable from the engine")


def _table(n, fs):
    key = (n, fs)
    if key not in _tables:
        kmax = min(n // 2, int(FMAX * n / fs))
        _tables[key] = [
            ([math.cos(2 * math.pi * k * i / n) for i in range(n)],
             [math.sin(2 * math.pi * k * i / n) for i in range(n)])
            for k in range(kmax + 1)]
    return _tables[key]


def _set(id_, v):
    xdb.SetValue("id('" + id_ + "')/@val", v)


@xdb_fnc
def analyse(evt):
    """The event call: one block of samples in WAVE -> the figures."""
    global skipped
    t0 = Time.GetTimeMs()
    blk = json.loads(evt.valn)
    x, fs = blk["x"], float(blk["fs"])
    waited = t0 - int(blk["t"])                   # how long the call sat in the queue

    # The calls queue up if Python is slower than the data - the caller
    # never waits, so nothing else would stop the queue from growing. A
    # block this old is history: drop it and let the queue catch up.
    if waited > MAX_AGE_MS:
        skipped += 1
        _set("PY_CALL", json.dumps({"call": "analyse", "t": blk["t"], "waited_ms": waited, "took_ms": 0,
                                    "n": len(x), "skipped": skipped}))
        return

    n = len(x)
    mean = sum(x) / n
    x = [v - mean for v in x]
    rms = math.sqrt(sum(v * v for v in x) / n)
    peak = max(abs(v) for v in x)

    # amplitude spectrum by a plain DFT, 0 .. FMAX Hz
    spec = []
    for c, s in _table(n, fs):
        re = sum(a * b for a, b in zip(x, c))
        im = sum(a * b for a, b in zip(x, s))
        spec.append(2.0 * math.sqrt(re * re + im * im) / n)
    df = fs / n
    k_top = max(range(1, len(spec)), key=lambda k: spec[k])
    band = math.sqrt(sum(spec[k] ** 2 for k in range(len(spec)) if BAND[0] <= k * df <= BAND[1]) / 2.0)

    history.append((t0, rms))
    del history[:-300]

    _set("RMS", round(rms, 2))                     # its val_fnc chain runs: ALM.onlvl
    _set("PEAK", round(peak, 2))
    _set("CREST", round(peak / rms, 2) if rms > 0 else 0.0)
    _set("FREQ", round(k_top * df, 1))
    _set("BPFO", round(band, 2))
    _set("SPEC", json.dumps({"df": df, "a": [round(a, 3) for a in spec]}))
    # "t" (the block's stamp) makes every call a new value: an unchanged
    # value is not published, and two calls often take the same time
    _set("PY_CALL", json.dumps({"call": "analyse", "t": blk["t"], "waited_ms": waited,
                                "took_ms": Time.GetTimeMs() - t0, "n": n, "skipped": skipped}))
    # evt.valn is left as it is: the engine writes WAVE when this returns


@xdb_fnc
def forecast(limit, stamp):
    """The argument call: when does the RMS reach 'limit', at the present rate?"""
    t0 = Time.GetTimeMs()
    pts = [(t, r) for t, r in history if t >= t0 - 60000]      # the last minute
    out = {"limit": limit, "n": len(pts), "waited_ms": t0 - int(stamp)}
    if len(pts) >= 5:
        tm = sum(t for t, _ in pts) / len(pts)
        rm = sum(r for _, r in pts) / len(pts)
        sxx = sum((t - tm) ** 2 for t, _ in pts)
        slope = sum((t - tm) * (r - rm) for t, r in pts) / sxx if sxx else 0.0    # per ms
        now_r = rm + slope * (t0 - tm)
        out["per_min"] = round(slope * 60000.0, 3)
        out["now"] = round(now_r, 2)
        if now_r >= limit:
            out["eta_s"] = 0
        elif slope > 0:
            out["eta_s"] = int((limit - now_r) / slope / 1000.0)
    out["took_ms"] = Time.GetTimeMs() - t0
    _set("FORECAST", json.dumps(out))
