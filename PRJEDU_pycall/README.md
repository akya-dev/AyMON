# PRJEDU_pycall — call Python from the XML and from JScript, asynchronously

A pump with a bearing that is slowly going. A vibration sensor sends a block
of 512 samples every two seconds; **Python** works out what is in it — RMS,
peak, crest factor, the spectrum and the energy in the bearing's band — and
every five seconds **JScript asks Python** when the vibration will reach the
alarm limit. Neither side waits for Python:

```xml
<var id="WAVE" val_typ="0x1401" val_fnc="[vib.analyse]"/>      <!-- from the XML -->
```

```javascript
var q = vib.forecast(4.5, Time.GetTimeMs());                   // from JScript: q = 1, "queued"
```

```bat
run.bat
```

Then open **http://127.0.0.1:8112/**.

On Linux the same example starts with `./run.sh` (the engine in `../bin/linux-x64`; see
"On Linux" in the top README).

**Needs a 64-bit Python 3.11** — nothing else: the analysis is the Python
standard library (`json`, `math`), no numpy. On Windows a python.org 3.11
installed "for all users" with "Add to PATH"; on Linux `python3.11` (Debian
12's default `python3`; the deadsnakes PPA on Ubuntu 22.04 / 24.04):

```bash
sudo apt install python3.11
```

**Needs the engine of 4.3.4.513 or later** (the one in `../bin`). Before 513
the alarm `ALM.onlvl` computes on a value Python writes from inside an event
call was logged but not stored, so `RMS` and `BPFO` never showed WARNING or
ALARM.

## What you see

* **The pump, now**: every figure Python computed from the last block.
  `RMS` and the bearing band `BPFO` carry their own alarms; the last tile is
  Python's forecast of when `RMS` reaches 4.5 mm/s.
* **The block the sensor sent** and **what Python made of it**: the 512
  samples, and their amplitude spectrum from 0 to 400 Hz. 25 Hz is the
  pump's speed (1500 rpm), 50 Hz its second harmonic, and the red line in the
  grey band is the bearing's outer race at 90 Hz, with a sideband 25 Hz on
  either side: the defect is struck once a revolution harder than the rest.
* **RMS, the last five minutes**, with the warning (2.8) and alarm (4.5)
  limits and Python's forecast, dashed, into the grey future.
* **Call 1** and **Call 2**: the two calls, measured on every call — how long
  it waited in the queue for the Python thread and how long it ran there, and
  how many blocks Python dropped because they had waited too long (see
  [When Python is slow](#when-python-is-slow)).
* **Replace the bearing**: the one value the page may write. The bearing
  starts again from a small defect and the story repeats: warning after
  about a minute and a half, alarm about a minute later.

## The two calls

A Python function marked `@xdb_fnc` gets a JScript wrapper in its script's
scope — the `<script>`'s `id`, here `vib`. Its **parameters** decide what kind
of call it is:

```python
@xdb_fnc
def analyse(evt):            # ONE parameter, named 'evt': an EVENT call
    blk = json.loads(evt.valn)          # the value being written
    ...
    xdb.SetValue("id('RMS')/@val", round(rms, 2))

@xdb_fnc
def forecast(limit, stamp):  # anything else: an ARGUMENT call
    ...
    xdb.SetValue("id('FORECAST')/@val", json.dumps(out))
```

| | event call — `[vib.analyse]` | argument call — `vib.forecast(a, b)` |
|---|---|---|
| where | any `*_fnc` in the XML, like `[ATR.rou]` | a JScript expression |
| Python gets | `evt`: `evt.valn` the new value, `evt.valp` the current one | the arguments, as `int` / `float` / `str` / `bool` |
| the caller gets | the chain goes on at once | `1` = queued (`0` = could not be queued) — **never the result** |
| the attribute | written by the engine **after** the function returns | — |
| the result | wherever Python writes it | wherever Python writes it |

Both are queued to the one Python thread and run there one after the other.
That is the point: a Python function may take 10 ms or 3 s, and the thread
that called it — here the one every timer of the document runs on — goes on
at its own pace. The answer comes back the way every other value in AyMON
does: Python writes it into a point. `RMS` then runs its own `val_fnc`
(`ATR.rou`, `ALM.onlvl`) exactly as if a 4-20 mA transmitter had written it;
the page, the log and any other client see a measurement.

**What does not work:** `var r = vib.forecast(...)` does not give the
forecast. For a result in the same line, write the function in JScript.

## Measured

Engine 4.3.4.513, 190 s from a cold start each: about 95 blocks analysed
and 38 forecasts asked. Windows 11 with Python 3.11.9; Linux is Ubuntu 22.04
under WSL 2 with Python 3.11 from deadsnakes.

| | Windows | Linux |
|---|---|---|
| `vib.forecast(...)` as JScript sees it | `1` in 0 ms, every call | `1` in 0 – 1 ms, every call |
| `analyse`: waited in the queue | 0 – 2 ms, median 1 | 0 – 1 ms, median 0 |
| `analyse`: ran in Python (512 samples, DFT to 400 Hz) | 3 – 21 ms, median 12 | 2 – 20 ms, median 3 |
| `forecast`: waited in the queue | 0 – 16 ms, median 4 | 0 – 9 ms, median 1.5 |
| `forecast`: ran in Python | 0 – 1 ms | 0 ms |
| the engine, all of it | 5.5 s of CPU in 190 s (2.9 %), 32 MB | not measured |

The argument call waits a little longer than the event call: it is picked up
within one cycle of the Python thread (`thr_per="20"`).

What the alarms did (the same runs):

| s (Windows / Linux) | |
|---|---|
| 55 / 53 | `BPFO` warning (1.5 mm/s) — the bearing band sees the defect first |
| 93 / 91 | `RMS` warning at 2.84 mm/s; Python's forecast at that moment: alarm in 95 s |
| 107 / 105 | `BPFO` alarm (3.0) |
| 137 / 135 | `RMS` alarm at 4.55 / 4.53 mm/s — 44 s after the warning, not 95 (Linux: 94) |
| 170 / 170 | **Replace the bearing**: `RMS` back to 1.2, both alarms gone (`sta` 0x0343: normal, with the NEW bit waiting for an acknowledgement) |

The forecast is a straight line through the last minute, and this defect
grows faster the worse it gets — so the forecast is always late, and says so
less the closer it comes. That is a property of the model, not of the call:
put a better one in `forecast()` and nothing else changes.

At 170 s the probe also tried to write `RMS` itself: refused, as for any
page — the page may write `SERVICE` and nothing else (`xdb_acl`). The
refusal is the one ALERT line in the log: `RMS.val: xdb_acl ... (rol 0)`.

## When Python is slow

Put `time.sleep(3.0)` into `analyse()` — a block every 2 s, three seconds
to analyse one. Measured on Windows over 60 s:

**Without the age check** (the first version of this example):

| | |
|---|---|
| `sense()`, the JScript timer | every 2.0 s, to the tenth, all minute |
| `vib.forecast(...)` | every 5.0 s, returned `1` in 0 ms, all minute |
| `analyse`: waited in the queue | 1, 1021, 2026, 3043 … **19 254 ms** after a minute — one more second every call |
| `forecast`: waited | 5 s, 6 s, 10 s … 21 s — it queues behind the blocks |

Nothing on the engine's side slows down: the caller never waits, which is the
point — but by the same token nothing stops the queue from growing. After an
hour the page would show a vibration from half an hour ago.

**With the age check** that is in `db_VIB.py`:

```python
if waited > MAX_AGE_MS:          # 4000 ms: the block is history
    skipped += 1
    ...
    return
```

| | |
|---|---|
| `analyse`: waited in the queue | 2.1 – 4.3 s, and stays there |
| blocks dropped | one in three (9 in the minute), counted on the page |
| `forecast`: waited | 3 – 6.3 s, and stays there |

Two blocks in three are analysed, the newest ones; the result is never more
than about four seconds old. Deciding what to drop is the Python side's job,
because only it knows what an old block is worth — a counter would want every
one of them, a vibration monitor only the latest.

## Try this

| Do | See |
|---|---|
| press **Replace the bearing** | `RMS` drops to about 1.2 mm/s and both alarms go; the forecast says "not rising" for a minute, then the story starts again |
| in `db\db_VIB.py` put `import time; time.sleep(3.0)` in `analyse()` after the age check and restart | see [When Python is slow](#when-python-is-slow): the timers keep time, the waits settle at 2–4 s and "blocks dropped as too old" counts |
| the same, and set `MAX_AGE_MS = 10 ** 9` | the age check is off: "waited in the queue" grows by a second every call |
| change `BAND` in `db_VIB.py` to `(20.0, 30.0)` and restart | the "bearing band" now measures the pump's own speed: it no longer grows |
| in `db\db_VIB.js` set `LIMIT = 2.8` | the forecast answers for the warning limit instead; it is an argument, the Python side is unchanged |

## If nothing happens

The page shows `--` everywhere. Look in `log\VIB-*.log`:

| Line | Meaning |
|---|---|
| `AyLIB: 'AyLIB_Python' not loaded ... error 126` (Windows) | no 64-bit Python 3.11 found on the `PATH`. Install one "for all users" with "Add to PATH" ticked |
| `AyLIB: 'AyLIB_Python' not loaded ... libpython3.11.so.1.0` (Linux) | no Python 3.11 on the machine: `sudo apt install python3.11` |
| no `JS wrappers generated for 2 python function(s)` | the functions are not marked `@xdb_fnc`, or `db_VIB.py` did not compile (the line before says why) |
| `PY.CallArg function not found` | the name in `vib.forecast(...)` is not a function in `db_VIB.py` |
| `init failed [ERR_COMMON_INVTYPE]` | `AyLIB_Python` and `AyPRO` are from different builds. Copy them together |

## Licence

Two connections, one document: well inside FREE. The Python module reports
itself as free.
