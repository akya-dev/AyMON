# PRJEDU_gauge — read a dial gauge with a camera, in Python

An old plant has a mechanical pressure gauge on a tank: no transmitter, no
cable, and nobody willing to open the line to fit one. A camera pointed at the
dial is the retrofit. This example is that retrofit. Python draws what the
camera would see and finds the needle in it, and from there the reading is an
ordinary AyMON point, with rounding, alarms and a live web page:

```bat
run.bat
```

Then open **http://127.0.0.1:8091/**.

On Linux the same example starts with `./run.sh` (the engine in `../bin/linux-x64`; see
"On Linux" in the top README).

**Needs a 64-bit Python 3.11 with numpy** (`PRJEDU_pycall` needs the same
Python without numpy; `PRJEDU_opcua` a Python of its own for the machine). On Windows, a python.org 3.11 installed "for
all users" with "Add to PATH":

```bat
py -3.11 -m pip install numpy
```

On Linux, Python 3.11 itself (Debian 12: the default `python3`; Ubuntu 22.04 /
24.04: the deadsnakes PPA) and pip for it:

```bash
sudo apt install python3.11 python3.11-venv
python3.11 -m ensurepip --user
python3.11 -m pip install --user numpy
```

No camera, no OpenCV. The picture and the reader are numpy and the Python
standard library. The engine encodes the picture for the page with its image
functions, in the engine module `AyLIB_vision`, which ships in `../bin` beside
the engine (engine 4.3.4.564 or later; before 4.3.4.563 they were the
plug-in `AyPRO_img`).

## What you see

* **What the camera sees**: the picture, with what the reader found drawn
  over it: the dial's centre (cross), the scale (dashed arc), and the needle
  (green if the frame was used, red if it was not).
* **How the picture travels**, and **the camera**: two of the things the
  page may write, to compare the ways a picture can reach a page (see
  [A picture is a blob](#a-picture-is-a-blob)):

  | PATH | The picture |
  |---|---|
  | 0 | a PNG written by Python, base64 in a string, over MQTT: how this example did it before the engine had blobs |
  | 1 | a blob: the engine encodes a PNG, the page fetches it over HTTP |
  | 2 | a blob, encoded as a JPEG (the default) |

  | SIZE | The camera |
  |---|---|
  | 0 | 240 × 240, one frame a second: the dial fills the picture |
  | 1 | 640 × 480, ten frames a second: the dial is one part of a panel, and the reader looks at its region only |

* **Reading**: `PRESS`, the measurement, next to the true pressure when the
  frame was taken and the difference between them. With a real gauge you
  never see the true value. Here you do, so you can see how good the reader
  is.
* **Confidence**: how sure the reader is. Below `CONF_MIN` (0.3) a frame is
  not used and `PRESS` keeps its last good value.
* **How hard the camera's life is**: four buttons, another thing the page
  may write:

  | NOISE | The camera adds |
  |---|---|
  | 0 | nothing: a clean picture |
  | 1 | sensor noise, a soft lens, a needle that vibrates |
  | 2 | light from one side, and glare off the glass now and then |
  | 3 | a shadow passing over the dial, and a camera that has been knocked a few pixels sideways |

* **How the reader finds the needle**: the last thing the page may write,
  to compare the reader with its own first version on the same pictures
  (see [How the reader works](#how-the-reader-works)).
* **What the picture costs**: counted by the page itself over the last ten
  seconds: bytes a second on MQTT and on HTTP, the size of one picture, how
  many pictures a second are shown, and their age: from the moment the
  camera took the frame to the picture on the page.
* **One frame, two readers, no copy**: how much light falls on the dial,
  measured by the engine itself (`IMG.stats`), and the address of the
  frame's bytes as the script saw them. Python reads the gauge from the same
  address.
* **The last two minutes**: true against read, with every second in which a
  frame was not used marked. Every two minutes the tank's pressure switch
  sticks and the pressure runs up to the relief valve at 9.5 bar, through
  both high alarms on `PRESS`.

How good is the reader? Measured on 1200 random frames per level (three runs
of 400), over the frames the reader used, reading the 8-bit picture the
camera delivers:

| NOISE | Frames used | Mean error | Worst error |
|---|---|---|---|
| 0 | 100 % | 0.02 bar | 0.06 bar |
| 1 | 100 % | 0.04 bar | 0.11 bar |
| 2 | 99.8 % | 0.12 bar | 0.57 bar |
| 3 | 89 % | 0.22 bar | 1.0 bar, and once 5.5 bar (see below) |

## What the log looks like

```
XDB:AyLIB: 'AyLIB_vision' attached (module abi 1.3, core 1.3)
GAU/S00:AyLIB: 'AyLIB_Python' attached (module abi 1.0, core 1.3)
GAU/S00:scr.Python(vision): ... interpreter home C:\Program Files\Python311 (... version 3.11.9 ...)
GAU/S00:GAU: open http://127.0.0.1:8091/ - the picture, the reading, and how wrong it is
GAU/S00:GAU: Python 3.11.9, numpy 1.26.4 - pictures travel as blobs
GAU/S00:GAU: reader calibrated to 0..10 bar over -135..135 deg, radius 100 px
GAU/S00:GAU: frame 1 - ok
GAU/S00:GAU: compressor ON at 5.12 bar
GAU/S00:GAU: PATH 2 -> 0 (base64 PNG in MQTT)
GAU/S00:GAU: SIZE 0 -> 1 (640 x 480, ten frames a second)
GAU/S00:GAU: NOISE 1 -> 3 (shadows and a knocked camera)
GAU/S00:GAU: frame 18 - not used: no dial found (shadow, camera moved 5,-3 px)
GAU/S00:GAU: frame 21 - ok despite camera moved 5,-3 px
```

A frame line is written only when the verdict changes, not every frame.
When the engine stops, the last line is `Clear: Done (blobs alive: 0)`: no
frame was left behind.

## How the reader works

`read_gauge()` in `db\db_GAU.py`, four steps. Nothing in it knows the picture
was drawn rather than photographed:

1. **Find the dial.** The face is the brightest large thing near where the
   dial should be. Threshold halfway between dark and bright, and the
   centroid of the bright pixels is the pivot, even when the camera has
   moved.
2. **Find the needle.** From the pivot, every half degree across the scale,
   average the brightness along a ray between the pivot and the numbers.
   Then subtract, from each ray, the average of the 30 degrees around it.
   Light and shadow change slowly with the angle, so they cancel out. A
   needle is narrow, so it stays. The needle is the ray most darker than its
   neighbours, refined to a fraction of a degree with a parabola through the
   best three.
3. **Turn the angle into bar** with the calibration: a straight line from
   (`CAL_A0`, `CAL_V0`) to (`CAL_A1`, `CAL_V1`).
4. **Say how sure it is.** How deep the needle's dip is against the face
   around it, times how far it is ahead of the best candidate more than 12
   degrees away. A clean needle scores 1. A needle under glare, or a shadow
   that looks like a second needle, scores near 0.

Step 2 is the lesson. The first version of this reader took the darkest ray
and nothing else, and it is still there: **METHOD 1** on the page. On clean
pictures the two are equally good. With glare and shadows the first version
now and then reads a shadow as the needle, several bar off, **and is
confident about it**: in 1200 frames at NOISE 3, 41 readings more than 1 bar
wrong got past `CONF_MIN`. METHOD 0 let one through (the 5.5 bar in the
table). A reader that is sometimes wrong is normal. A reader that is wrong
and sure of itself is dangerous, and the confidence measure is where that is
fixed.

## A picture is a blob

A camera frame is large, and a page wants it quickly. Before the engine had a
value type for large binary data, this example sent the picture the only way
a value could travel: a PNG written by hand in Python, base64 in a string,
published over MQTT once a second (65 KB of text). That way is still here,
**PATH 0**, so the two can be compared on the same run.

Now the frame is a **blob**: immutable bytes with a shape, shared by
reference. Nothing copies it after it has entered the engine:

```
Python   frame = uint8 array [h, w]
   |      xdb.SetValue("id('FRAME')/@val", frame)            the ONE copy
   v
FRAME    a blob (val_typ 0x150E)
   |      val_fnc main.on_frame: IMG.stats on the dial        native reading, no copy
   |
Python   view = xdb.GetValue("id('FRAME')/@val")              read-only numpy view, no copy
   |      read_gauge(view[y0:y0+240, x0:x0+240])              the reader
   |      xdb.SetValue("id('PIC')/@val", the view's blob)     the same blob, no copy
   v
PIC      val_fnc main.encode: IMG.encode -> JPEG or PNG, numbered with the frame
   |      MQTT:  {"blob":1,"len":13890,"fmt":"jpeg","seq":24,"tim":0}    only this
   v
page     GET /blob/GAU/S00/PIC/val                            the bytes, from the engine's memory
```

The pieces, each one line:

```xml
<var id="FRAME" val="" val_typ="0x150E" val_fnc="[main.on_frame]"/>   <!-- a blob, run the chain -->
<var id="PIC"   val="" val_typ="0x150E" val_fnc="[main.encode]"/>
<con id="CN_WEB" ... pro_blob="/blob"/>                                 <!-- serve blobs under /blob -->
<xdb id="XDB" xdb_lib="AyLIB_vision" xdb_lib_req="1" ...>                <!-- root: the IMG.* functions -->
```

```js
function encode(evt) {                     // PIC's val_fnc in db_GAU.js, shortened: PATH 1 encodes a PNG
    var e = IMG.encode(evt.valn, "jpeg", evt.GetValue("id('JPG_Q')/@val"));
    evt.valn = Blob.from(e.toBuffer(), { fmt: e.fmt, seq: evt.GetValue("id('FRAMES')/@val") });
    return 0;
}
```

**Why the page fetches, rather than streams.** The engine can also stream a
blob attribute as MJPEG (`/blob/GAU/S00/PIC/val?stream=1`: every write is a
part, one line of HTML shows it). The page does not use it, for two reasons.
It draws the reader's findings over the picture, so it must know which frame
it is showing: the fetch's answer says so (`X-Blob-Seq`), an `<img>` fed by
a stream does not. And it measures how old each picture is, which needs the
same number. The page fetches only when the descriptor's `seq` has moved, one
fetch at a time; the engine always answers with the newest picture, so a
slow page skips frames and never falls behind. For a plain viewer the stream
is the better choice: see [Try this](#try-this).

**Why the numbering in `encode`.** A frame that comes from numpy carries no
frame number (`seq` 0), and `IMG.encode` passes on the number its input has.
So the script wraps the encoded bytes once more with the number:
`toBuffer()` and `Blob.from` copy the encoded picture (13 KB here) twice. The
number is what makes the HTTP answer carry `X-Blob-Seq` and an `ETag`.

**The measured difference.** One engine, one page (headless Chrome), the
three paths taken in turn, twice each, at both camera sizes, on the same
machine. The engine's figures include Python, which draws the frames inside
the engine's process:

Each cell is Windows / Linux. Where two runs of the same path differed, both
ends are given. MQTT and HTTP are the bytes the page received, headers
included; the age is the median from the camera's time stamp (`CAP`) to the
picture on the page.

**240 × 240, one frame a second (SIZE 0)**

| | PATH 0 base64 | PATH 1 PNG blob | PATH 2 JPEG blob |
|---|---|---|---|
| one picture | 65.4 KB of text (a 49 KB PNG) | 57.9 KB | 13.9 KB |
| MQTT, KB/s | 63.4–64.4 / 64.2 | 0.5 / 0.5 | 0.5 / 0.5 |
| HTTP, KB/s | 0 / 0 | 56.2 / 56.9 | 14.0 / 13.9 |
| engine CPU | 3.0–3.2 % / 2.7–2.8 % | 2.8–3.4 % / 2.8–2.9 % | 3.0–3.2 % / 2.6–2.7 % |
| age | 9 / 7–8 ms | 12 / 11 ms | 10 / 9 ms |
| engine memory | 43 / 60 MB | 43 / 60–61 MB | 44 / 60 MB |

**640 × 480, ten frames a second (SIZE 1)**

| | PATH 0 base64 | PATH 1 PNG blob | PATH 2 JPEG blob |
|---|---|---|---|
| one picture | 315.5 KB of text (a 237 KB PNG) | 307.8 KB | 60.5 KB |
| MQTT, KB/s | 3067 / 3071–3086 | 4.2 / 4.2 | 4.2 / 4.2 |
| HTTP, KB/s | 0 / 0 | 2994–2996 / 2999–3004 | 591–592 / 591–592 |
| pictures shown a second | 9.9 / 10.0 | 10.0 / 10.0 | 10.0 / 10.0 |
| engine CPU | 19–20 % / 16–17 % | 28–31 % / 23–24 % | 16 % / 12–13 % |
| Python's time per frame, encoding included | 17–18 / 14–15 ms | 26–28 / 21–22 ms | 13–14 / 10 ms |
| age | 19–21 / 15–17 ms | 30–32 / 25–26 ms | 17 / 13 ms |
| engine memory | 51–54 / 72–74 MB | 53–54 / 76 MB | 50–53 / 76 MB |

What the numbers say:

* **MQTT is free again.** With a blob the picture no longer travels on the
  values' connection: 64 KB/s becomes 0.5 KB/s, and 3 MB/s becomes 4 KB/s
  (the values and the descriptors).
* **The bytes are saved by JPEG, not by leaving base64.** Base64 adds a third
  to the PNG, but the engine's PNG encoder compresses worse than Python's
  zlib, so the PNG blob is only 2–11 % smaller than the base64 text. The JPEG
  is 4.7 to 5.2 times smaller than either.
* **The CPU is the encoder's.** At one frame a second every path costs about
  3 %. At ten, the JPEG blob is the cheapest (16 % / 12 %), base64 is next,
  and the PNG blob is the dearest: the engine's PNG encoder is slower than
  zlib. Most of the rest is Python drawing the picture.
* **Age** follows the encoder too: the JPEG blob reaches the page in 13 to
  17 ms at ten frames a second, the PNG blob in 25 to 32 ms.
* **No memory grows with the frames.** The engine's memory stayed level
  across every phase; it steps up once with the larger camera. Windows
  reports the working set, Linux the resident set: they are not comparable
  with each other.

**Not measured here:** more than one page at a time (base64 sends every
picture through every MQTT subscription; with blobs each page fetches its
own), a real network (everything ran on one machine; the Linux engine ran in
WSL 2, the page in Chrome on Windows), other browsers, a Raspberry Pi, a real
camera.

## What it teaches

**Python beside the engine, with nothing in between.** A `<script
language="Python">` is all it takes. The engine attaches its Python module the
first time it sees one, finds the installed Python 3.11 through the `PATH`,
and runs the script on its own thread:

```xml
<script id="vision" xdb_fnc="[SCR.prs]" src="%DB%/db_GAU.py" language="Python"
        thr_per="100" thr_tmo="5"></script>
```

```python
from XDB import *

def init(xdb_in):                 # once, after the file is compiled
    global xdb, xdb_evt
    xdb = xdb_in
    xdb_evt = [["IMG", "val", cam_init, cam_loop, cam_done, {}]]

def cam_loop(evt, st):            # every thr_per; a frame when one is due
    true_value = float(xdb.GetValue("id('TRUE')/@val"))
    ...
    xdb.SetValue("id('FRAME')/@val", frame)          # a numpy array becomes a blob
    view = xdb.GetValue("id('FRAME')/@val")          # and comes back as a read-only view
    ...
    xdb.SetValue("id('PRESS')/@val", value)          # runs PRESS's val_fnc
```

`xdb.GetValue` / `xdb.SetValue` are the same calls a JScript function makes,
and a write runs the element's `val_fnc` chain: `PRESS` is rounded and alarmed
by `ATR.rou` and `ALM.onlvl`, whoever wrote it. The chain runs on the thread
that wrote: `main.on_frame` and `main.encode` are JScript, but they run on
Python's thread, not on the document's, which keeps the image work off the
document's timers.

**A measurement is more than a number.** `PRESS` is only written when the
reader trusts the frame. `CONF` has its own low alarms, and `READ` says in
words why a frame was not used. Downstream nothing knows the value came from
a picture. That is the point of a retrofit.

**Calibration is configuration.** `CAL_V0`, `CAL_V1`, `CAL_A0`, `CAL_A1`,
`CAL_R` and `CONF_MIN` are `<var>`s that Python reads every frame. For a
different gauge you change them in the XML, not in the code. They describe
the gauge to the **reader** only. The camera draws the real dial from its own
constant, so a wrong calibration gives a wrong reading, as it would in a
plant.

**One frame, two readers.** `main.on_frame` measures the light on the dial
with `IMG.stats` in C, and Python reads the needle with numpy, from the same
bytes: the page shows the address the script saw, and `SAME` is 1 when
Python's view starts at that address. Behind a numpy view of a blob sits the
engine's `XDB.Blob`, which keeps the frame alive while the view lives. numpy
puts a `memoryview` between the two (`view.base` is the memoryview,
`view.base.obj` the blob), so `holder()` in `db_GAU.py` follows the chain.
Hand that blob, not the array, back to `SetValue`, and the engine gets the
same frame again, not a copy.

**Every number handed to the engine is a plain `float` or `int`.** A numpy
scalar is stored as a number only in a typed attribute, so the script writes
`float(x)`. An array is different: it becomes a blob.

## Try this

| Do | See |
|---|---|
| **SIZE 1**, then the three **PATH** buttons | "What the picture costs": base64 moves the whole picture through MQTT; the blob paths leave MQTT with the values and the descriptors only |
| open **http://127.0.0.1:8091/blob/GAU/S00/PIC/val?stream=1** in a second tab | the same pictures as an MJPEG stream, no page at all (PATH 1 or 2). Each write of `PIC` is one part |
| press **3 shadow** and watch the red ✕ marks on the trend | the frames the reader refused. `PRESS` holds its value through them |
| **3 shadow**, then **1 darkest ray** | the first version of the reader. Wait for a shadow: now and then the read line jumps several bar and is **not** marked ✕ |
| set `CONF_MIN` to `0` in `db\db_GAU.xml` and restart | nothing is refused any more. At NOISE 3 a shadow now and then gives a reading several bar off: the refused frames were the bad ones |
| set `CAL_A1` to `130` and restart | the reader believes the scale ends 5 degrees early. The error grows with the pressure, from 0 at the bottom of the scale to about +0.15 bar at the top. That is what a badly measured retrofit looks like. The camera still draws the real gauge (`GAUGE` in `db_GAU.py`) |
| set `JPG_Q` to `30` and restart | a picture of about 5 KB instead of 14 KB (measured at 240 × 240), and blocky. The reader does not care: it reads the raw frame, not the JPEG |
| untick "show what the reader found" | the picture as the camera sees it. Try reading it yourself at NOISE 3 |

## A real gauge

Replace `draw_frame()` with a real picture: a grey `numpy` array, the dial
roughly in the middle of the 240 × 240 region the reader looks at. With
OpenCV installed (`py -3.11 -m pip install opencv-python`), for example:

```python
cap = cv2.VideoCapture(0)                      # once, in cam_init
ok, frame = cap.read()                         # every frame, in cam_loop
frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)   # uint8 [h, w]: hand it to FRAME as it is
```

and set `ROI_BIG` in `db_GAU.py` to where the dial is in the camera's
picture. Then measure your gauge. Where is the needle at the first and last
mark (`CAL_A0`, `CAL_A1`), what do they read (`CAL_V0`, `CAL_V1`), and how
many pixels is the dial's radius (`CAL_R`)? The reader expects a light face
with a dark needle. For a black face with a white needle, invert the picture
(`frame = 255 - frame`).

This part is **not tested here**: it needs a camera and a gauge.

## If there is no picture

The page says "waiting for the first frame". Look in `log\GAU-*.log` and
`log\XDB-*.log`:

| Line | Meaning |
|---|---|
| `AyLIB: 'AyLIB_vision' not loaded: ...AyLIB_vision.dll (Win32 error 126)`, then `engine will not start` | the image module is missing: copy `AyLIB_vision.dll` (`libAyLIB_vision.so` on Linux) with the rest of `bin`. It needs an engine of the same build, 4.3.4.564 or later |
| `AyPLG: 'AyPRO_img' is now the engine module 'AyLIB_vision' (C563) -- loaded under its new name; rename it in xdb_lib` | a project written for an older engine: it still works; write `xdb_lib="AyLIB_vision"` and the line goes |
| `AyLIB: 'AyLIB_Python' not loaded ... error 126` (Windows) | no 64-bit Python 3.11 found on the `PATH`. Install one "for all users" with "Add to PATH" ticked |
| `AyLIB: 'AyLIB_Python' not loaded ... libpython3.11.so.1.0` (Linux) | no Python 3.11 on the machine: `sudo apt install python3.11` |
| `GAU: numpy could not be imported - ... No module named 'numpy'` | not installed for **this** Python: `py -3.11 -m pip install numpy`, or `python3.11 -m pip install --user numpy` on Linux (not `pip`, which may be another version) |
| `init failed [ERR_COMMON_INVTYPE]` | `AyLIB_Python` and `AyPRO` are from different builds. Copy them together |

The `numpy could not be imported` line carries numpy's own explanation, and the
next line lists every directory this Python looked in.

## Licence

Two connections, two documents: well inside FREE. The Python module and the
image plug-in report themselves as free.
