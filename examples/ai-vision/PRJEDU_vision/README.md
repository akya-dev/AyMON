# PRJEDU_vision — a camera inspects bottles, in the engine

A filling line sends a bottle past a camera every 0.8 s. Each one must have
a red cap, pressed down, and be filled to the line. The camera looks, the
engine decides, and a bad bottle is rejected — with no Python, no OpenCV
and nothing to install. The camera is a **connection**, every picture is a
**blob**, and the inspection is twenty lines of JScript calling the
engine's image functions:

```bat
run.bat
```

Then open **http://127.0.0.1:8113/**.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

No camera is needed: the camera plays back the pictures in `frames\`, a
recording of the line, ten frames a second, in a loop. One button switches it
to the camera of your computer (see [Your own camera](#your-own-camera)).

The engine needs its picture module, `AyLIB_vision` (the camera and the image
functions), which ships in `../../../bin` beside it. Engine 4.3.4.577 or later: the
camera device and `PRO.vision` came in 4.3.4.570 .. 576, and 4.3.4.577 frees a
camera device at the stop. Up to 4.3.4.562 the camera and the image functions
were the two plug-ins `AyPRO_cam` and `AyPRO_img`.

## What you see

* **The line, live**: what the camera sees, five times a second, with the
  inspection window dashed over it. It is not a page refreshing pictures: it
  is one `<img>` whose source is an MJPEG stream the engine sends from memory,
  `GET /blob/VIS/S00/CN_VIEW/frm?stream=1`.
* **Four camera connections** and their state: `CN_CAM` opens the source,
  `CN_INS`, `CN_VIEW` and `CN_SEN` are views of it. Each one says how many frames
  a second it delivers, how many it reads, and what it is.
* **The last bottle**: the inspection window as the inspection saw it, with
  what it found drawn over it: the box where the cap must be (yellow), the fill
  line (blue), the liquid's top as found (magenta), and the verdict.
* **Rejects in the last 20 bottles**, with a warning at 35 % and an alarm at
  50 %, and the counts by reason. The recording has sixteen bottles, four of
  them bad, so the line runs at 25 %.
* **The last six rejects**, each a picture as it was rejected.
* **How fast**: what the line asks for and what the engine really does: the
  camera's and the inspection's frames a second (the connections' own
  `con_cam_rate`), bottles inspected and missed a minute (counted by the page),
  and the time one bottle takes.
* **The line, watched without a script**: four numbers the engine works out
  from every frame by itself, `PRO.vision` - is the line moving, a light
  barrier, the light, has the camera moved - each with its alarm, and their
  regions drawn over the live picture (see
  [Without a script: PRO.vision](#without-a-script-provision)).

The page may change seven things:

| Button | Element | What it does |
|---|---|---|
| Camera on / off | `CAM_ON` | `CN_CAM`'s `sta`. Its two views stay up and wait: idle, not lost |
| Source | `SRC` | the recording, or `usb:0`: your computer's first camera |
| Live view | `VIEW_FPS` | `CN_VIEW`'s `con_cam_fps`: 1, 2, 5 or 10 pictures a second |
| How often the inspection looks | `INS_FPS` | `CN_INS`'s `con_cam_fps`: every frame, or 10 down to 0.5 a second |
| The line | `SPEED` | the recording played at 10, 100 or 1000 frames a second: 75, 750 or 7500 bottles a minute |
| counters to zero | `RESET` | every count, and the reject rate, start again |
| the camera is right - take the bolt again | `SEN_REF` | a command to the camera device `DV_SEN`: `S_SHIFT` cuts its template again from the next frame |

## The faults

| Verdict | The bottle | How it is found |
|---|---|---|
| **NO CAP** | the capper missed it | no orange-red pixels in the box above the bottle |
| **WRONG CAP** | a blue cap from the other product | blue pixels there instead |
| **CAP HIGH** | the cap is on but not pressed down | the red pixels' middle is too high |
| **LOW FILL** | the filler ran short | the liquid's top is below the fill line |
| **MISSED** | nobody inspected it | it passed the camera and no inspection saw it whole |

A bottle nobody inspected is rejected, as on a real line: it may be any of the
above. It counts in the reject rate; it has no picture, because nobody looked
at it.

## What the log looks like

```
XDB:LIC: vision is not licensed: 2 camera(s) (CON.cam with a real source; link: and none: are free)
XDB:AyLIB: 'AyLIB_vision' attached (module abi 1.3, core 1.3)
VIS/S00:VIS: open http://127.0.0.1:8113/ - the line, the inspection and the rejects
VIS/S00:CN_INS.con_cam_crop: applied to the running CON.cam = 200,64,240,320
VIS/S00:VIS: cameras on this computer: usb:0 'FHD Camera'
VIS/S00:CN_CAM:CON.cam.connect: opened file:frames?fps=10&loop=1 -- file:frames (128 image(s), 10.0 fps, loop=1); out rgb 640x480, 0.0 fps -> @frm
VIS/S00:CN_INS:CON.cam.connect: opened link:CN_CAM -- link:CN_CAM (its @frm, at this connection's rate); out rgb, 10.0 fps -> @frm
VIS/S00:CN_VIEW:CON.cam.connect: opened link:CN_CAM -- link:CN_CAM (its @frm, at this connection's rate); out jpeg 480x360, 5.0 fps -> @frm
VIS/S00:DV_SEN:CON.cam.connect: opened link:CN_CAM -- link:CN_CAM (its @frm, at this connection's rate); out gray, 10.0 fps -> @frm
VIS/S00:DV_SEN:PRO.vision: block S_MOVE registered: diff on every frame
VIS/S00:DV_SEN:PRO.vision: block S_GATE registered: count on every frame
VIS/S00:DV_SEN:PRO.vision: block S_LIGHT registered: roi on every frame
VIS/S00:DV_SEN:PRO.vision: block S_SHIFT registered: match on every frame
VIS/S00:CN_INS.con_cam_fps: applied to the running CON.cam = 1
VIS/S00:VIS: inspection 10 -> 1 frames a second
VIS/S00:VIS: camera off - its two views wait, idle, until it delivers again
VIS/S00:S_MOVE:PRO.vision(1).pro.pol: @pro : Hata(ERR_RECEIVE_TIMEOUT)
VIS/S00:ALM.devsta_pbi: id('DV_SEN')/@sta ! 'sta' -> sta = 0x0347
VIS/S00:ALM.devsta_nbi: id('DV_SEN')/@sta ! 'sta' -> sta = 0x034A
VIS/S00:VIS: camera on
VIS/S00:ALM.devsta_nrm: id('DV_SEN')/@sta ! 'sta' -> sta = 0x0343
VIS/S00:SEN_REF:PRO.vision(1).pro.out: [986012] -> @pro : Tamam
VIS/S00:DV_SEN:PRO.vision: block S_SHIFT -- template taken again (frame 312, ref command)
```

`applied to the running CON.cam` is the camera module confirming a live
field: the connection took the new value without reconnecting. With the camera
off, `CN_SEN`'s blocks stop getting frames: each block's poll times out
(`ERR_RECEIVE_TIMEOUT`, the ERROR lines are expected here) and `ALM.devsta`
marks the device, first some blocks silent (`pbi`, warning), then none
(`nbi`, alarm); when the camera is on again, `nrm`.

## How it works

### A camera is a connection

```xml
<con id="CN_CAM" xdb_fnc="[CON.cam,PRO.cam]" xdb_cls="cls_CAM"
     con_host="file:frames?fps=10&amp;loop=1" con_cam_w="640" con_cam_h="480" con_cam_fps="0"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="2" con_tmo="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]" evt_thr="TH_INS"/>
```

The engine owns it like any connection: `sta` switches it on and off,
`con_rct` dials it again when it is lost, it has a session and a health alarm,
and it takes one connection of the licence. What is different is what
arrives: every frame is a **blob** written into the connection's own
attribute `frm`. A blob is the engine's value for large binary data. It is
written once and then only referenced: the inspection, the encoder and the
HTTP server all read the same bytes, nobody copies them.

`con_host` names the source:

| `con_host` | The source |
|---|---|
| `file:frames?fps=10&loop=1` | the pictures in a directory, in name order (here the recording) |
| `usb:0`, `usb:FHD` | a camera of this computer, by number or by part of its name |
| `http://host/video` | an MJPEG stream: an IP camera, a phone running an "IP camera" app |
| `snap:http://host/snapshot.jpg` | one JPEG request per frame |
| `link:CN_CAM` | another connection's frames |

### One camera, four views

A device opens once. `link:CN_CAM` gives its frames to more connections, in
memory, and each one puts them through **its own** `con_cam_*` fields:

| Connection | `con_cam_*` | For |
|---|---|---|
| `CN_CAM` | `fps 0` (every frame), `w 640` `h 480` | the source: any camera gives 640 × 480 from here on |
| `CN_INS` | `fps 10`, `crop 200,64,240,320`, `out rgb` | the inspection: the middle of the picture, in colour |
| `CN_VIEW` | `fps 5`, `w 480` `h 360`, `out jpeg` `q 70` | the page: smaller, compressed |
| `CN_SEN` | `fps 10`, `out gray` | the line's sensors, `PRO.vision`: grey is all they look at |

The line's speed is `CN_CAM`'s own: `file:frames?fps=N`. `con_host` is read when
the connection opens and cannot be written while it runs, so `SPEED` (and
`SRC`) switch the camera off, write it, and switch it on again.

`con_cam_fps`, `con_cam_crop`, `con_cam_out`, `con_cam_w` / `_h` and
`con_cam_q` are **live**: written while the connection runs, they apply to the
next frame, no reconnect. That is what the page's buttons do, through a script:

```js
function on_ins_fps(evt)
{
    evt.SetValue("id('CN_INS')/@con_cam_fps", evt.valn);    // a live field
    return 0;
}
```

When `CN_CAM` stops, its views stay connected and wait: idle, not "lost". The
link has nothing to time out on while its source is off on purpose.

### The inspection

`CN_INS`'s frame runs `main.inspect` (`frm_fnc`) on the thread `TH_INS`, never
on the document's thread. `frm_typ="0x750E"` makes the write queued and keeps
only the newest frame: if the inspection is slower than the camera, frames are
skipped, they never pile up.

```js
var hsv = IMG.hsv(f);                                        // colour in hue / saturation / value
var liq = IMG.inrange(hsv, LIQ_LO, LIQ_HI);                  // the amber liquid, as a mask
var parts = IMG.label(liq, 50, 16);                          // its pieces, with boxes
// ... the lowest big piece is the bottle's foot: where the bottle is
var box = IMG.crop(hsv, roi.x, roi.y, roi.w, roi.h);         // the box above the bottle
var red = IMG.inrange(box, CAP_LO, CAP_HI);                  // the right cap's colour
red = IMG.dilate(IMG.erode(red, 3), 3);                      // an opening: specks go
var nred = IMG.count(red);                                   // how much of it above the bottle
var capY = roi.y + IMG.moments(red).cy;                      // and how high
```

The cap's two masks are **cleaned** before they are counted: an *opening*,
`IMG.erode` then `IMG.dilate` with a 3 × 3 box (`OPEN_K`). A speck of the cap's
colour - sensor noise, a JPEG edge - would count as cap and pull its middle; a
part bigger than the box keeps its shape. The box is cut out first, so the
cleaning costs 70 × 80 pixels, not the window: measured, it adds nothing a
bottle's time shows (on the whole 240 × 320 window, for all three masks, it
made a bottle 4 times slower and at 1000 frames a second bottles were missed).
The liquid's mask is not cleaned: `IMG.label`'s smallest part, 50 pixels,
already leaves specks out.

A bottle is inspected **once**: the first time it is whole in the window and
within `CENTRE_TOL` of the middle. The picture for the page is drawn on a copy
and encoded:

```js
var o = IMG.rect(f, cx - 48, 2, 96, foot.y + foot.h - 2, col, 3);
o = IMG.text(o, 6, h - 22, why, [255, 255, 255], 3);
evt.SetValue("id('SHOT')/@val", IMG.encode(o, "jpeg", 85));
```

Every `IMG.*` function gives a **new** blob: the camera's frame is never
changed, and `CN_VIEW` streams it untouched. One bottle takes 2 to 3 ms on a
laptop that runs at full speed, 5 to 15 when Windows schedules the engine
for efficiency (see [How fast can it go](#how-fast-can-it-go)).

### Configuration, not code

The window, the colours and the limits are `<var>`s in `db\db_VIS.xml`, read
at every bottle:

| Element | Value | Meaning |
|---|---|---|
| `WIN` | `200,64,240,320` | the inspection window, given to `CN_INS` as `con_cam_crop` at start |
| `LIQ_LO` / `LIQ_HI` | `13,110,80` / `30,255,255` | the liquid's colour, HSV (H 0..179) |
| `CAP_LO` / `CAP_HI` | `0,130,80` / `9,255,255` | the right cap |
| `WRONG_LO` / `WRONG_HI` | `95,110,60` / `130,255,255` | the other product's cap |
| `OPEN_K` | `3` | the cap box's masks are cleaned with a k × k opening; `1` = not cleaned |
| `CAP_MIN` | `400` | pixels of a cap's colour that make a cap |
| `CAP_Y_MIN` | `34` | a pressed-down cap's middle is at least this low |
| `FILL_Y_MAX` | `160` | the liquid's top must be at least this high |
| `CENTRE_TOL` | `50` | how near the middle a bottle is inspected |

Coordinates are in the window, not in the whole picture.

### Missed bottles

`main.second` runs once a second. The recording puts a bottle in the middle
of the picture every 8 frames, so the camera's own frame number (the blob's
`seq`) says how many have passed. One that passed and was never inspected is
`MISSED`. `PASSED` lags 0.6 s behind on purpose: a bottle passing now is
still being inspected. With your own camera nobody knows how many passed, and
`PASSED` / `MISSED` stay still.

### Without a script: PRO.vision

The inspection above is a script, and a script is the right tool for a
judgement with several steps. Much of what a line needs watching is simpler: a
number from a region of the picture, and an alarm when it leaves its range.
For that the engine has `PRO.vision`: a camera **device** whose blocks are
analyses the engine runs on every frame it delivers, on the device's own
thread - no script, no event and no blob copy per frame.

```xml
<con id="CN_SEN" xdb_fnc="[CON.cam,PRO.vision]" con_host="link:CN_CAM"
     con_cam_fps="10" con_cam_out="gray" con_cam_tmo="2" con_ses="1" .../>
<dev id="DV_SEN" pro_con="CN_SEN" sta_fnc="[PRO.sta,ALM.devsta]" ...>
  <bi id="S_MOVE" xdb_cls="cls_VB" pro_fni="diff" pro_adr="0,180,640,200" pro_vision_lo="25">
    <io id="MOVE" xdb_cls="cls_VR" pro_adr="2" val_alm_onllo_wrn="0.02" val_alm_onllo_alm="0.005"/>
  </bi>
  ...
</dev>
```

`con_ses="1"` makes `CN_SEN` a group of cameras with one `<dev>` each (here one,
`DV_SEN`), the engine's usual connection - device - block order. A block's
`pro_fni` names the analysis and `pro_adr` its region in the picture
(`x,y,w,h`); its result is a row of numbers, and `PRO.inp` hands number *n* to
the `<io>` whose `pro_adr` is *n* - exactly as a Modbus block hands out its
registers. From there an `<io>` is an ordinary point: `ALM.onlvl` limits,
MQTT, history, replication.

| Block | Analysis | Region | Gives (`<io>`) | Alarm |
|---|---|---|---|---|
| `S_MOVE` | `diff`: this frame against the one before | the band the bottles pass through | `MOVE`, the share of pixels that changed by 25+ grey levels: about 0.23 while the line runs | under 0.02 warning, 0.005 alarm: the line stands |
| `S_GATE` | `count`: pixels between two grey levels | a strip 8 px wide at the middle, below the label | `GATE`, the share of the strip that is liquid (120..175; the wall is 212): a **light barrier**, a bottle in it three frames in eight | - |
| `S_LIGHT` | `roi`: mean, min, max .. | the wall above the bottles | `LIGHT`, its mean brightness; the recording's lamp flickers a little | under 140 warning, 80 alarm: a dead lamp, a covered lens |
| `S_SHIFT` | `match`: a template found again | a bolt under the belt, cut from the first frame; searched for within 40 px (`pro_vision_area`) | `SHIFT_DX`, `SHIFT_DY` (px moved), `SHIFT_SCORE` (-1..1) | moved 4 px warning, 10 alarm; score under 0.8 / 0.6: the bolt is covered or gone |

Two more things come with the device order:

* **A watchdog.** A block's poll (once a second) writes nothing while frames
  arrive; with no frame for `con_cam_tmo` (2 s) it times out, the block and
  its points go WAITING, and `ALM.devsta` marks the device: a camera that stops
  is a device that does not answer, as any other.
* **Commands.** `SEN_REF` is an `<io pro_fno="ref" pro_fnc="[PRO.out]">` of the
  device: any write makes every `match` block cut its template again (and a
  `diff` with `pro_vision_ref="keep"` its reference) from the next frame. After
  a camera has been moved on purpose, that is the "it is right now" button.

`CN_SEN` looks ten times a second whatever the line does, in grey (the
analyses use the grey plane; a colour frame is turned into its grey first).
It is a `link:`, so it costs no camera of the licence, and its four blocks
cost about 0.15 of a core at ten frames a second. The regions are in the
640 × 480 picture, and the page draws them over the live view from the blocks'
own `pro_adr`.

`PRO.vision` has three more analyses: `grid` (a mean per cell, a heat map),
`line` (the grey levels along a segment) and `edge` (Sobel). The field note
*Camera Capture* §3.5 has them all.

## How fast can it go

Press **The line: 1000 frames/s** and **every frame**. Measured on a laptop
(Windows, i7-12700H, one engine, engine 4.3.4.581, six runs):

| | Asked | Done |
|---|---|---|
| the camera, `CN_CAM` | 1000 frames/s | about 500 frames/s (485 .. 517) |
| the inspection, `CN_INS` | every frame | the same: every frame the camera gave |
| bottles inspected | 7500 a minute | about 3800 a minute, none missed, the reject rate the recording's 25 % |
| one bottle | | 2.3 to 2.6 ms: find it, judge it, draw on it, JPEG |
| the engine | | about 1.9 cores (`CN_SEN`'s sensors about 0.15 of them) |

The laptop's own state moves these numbers more than the engine does: earlier
measurements on it gave 600 to 730 frames a second (engine 4.3.4.577 gives
the same 500 today), and Windows may run a
program "power throttled" - on an efficiency core, for low power - when its
window is not in front: then the camera gives 450 and a bottle takes 5 to
15 ms. A run measured for numbers clears that first (the engine's own camera
threads already opt out).

On Linux (WSL on the same laptop) the camera reaches about 490 frames a
second with the example on the Linux file system, and about 130 with it on
the Windows disk (`/mnt/c`): every frame is a file opened through WSL's file
bridge. The inspection follows the camera either way, none missed.

What stops it is reading the recording: every frame is a JPEG on the disk,
decoded one at a time (about 1.4 ms). A real camera gives pixels and costs far
less; there the camera's own rate is the limit (the laptop's USB camera: 30
frames a second). The inspection keeps up: it gets every frame because the
camera wakes its views as each frame arrives (engine 4.3.4.552: before, a view
looked every 5 ms and stopped at about 200 a second).

Then press **10/s** for the inspection, still at 1000: it looks at one frame
in fifty and misses almost every bottle (about 3500 a minute). The
camera's rate and the inspection's rate are two fields of two connections.

## Try this

| Do | See |
|---|---|
| **How often the inspection looks: 2/s**, then **1/s** | a bottle is whole in the window for about 0.4 s. At 2/s some pass between two looks, at 1/s most: `MISSED` climbs and the reject rate goes into alarm. `CN_INS` reads 10 frames a second and delivers 1 or 2 |
| **Camera off**, wait, **on** | `CN_CAM` off; `CN_INS` and `CN_VIEW` stay *running*, delivering nothing; no "lost" line in the log. `CN_SEN`'s device is different on purpose: its blocks' watchdog sets them WAITING within a few seconds and the device goes into alarm. On again: the recording starts from its first frame and everything carries on |
| **Live view: 1/s** | only the page's picture slows down. The inspection still looks ten times a second: four views, four rates |
| **Your camera**, then cover its lens with a hand | `LIGHT` falls into alarm; hold the camera still and `MOVE` falls to 0: "the line stands"; move the camera a little and `SHIFT_DX` / `SHIFT_DY` say how far. **take the bolt again** makes where it is now the new place (with a real scene, `S_SHIFT`'s template is whatever is at 246,426 in your picture) |
| set `OPEN_K` to `1` in `db\db_VIS.xml` and restart | the cap box is no longer cleaned: on the recording nothing changes - it is clean - and the time a bottle takes neither; with a noisy camera, specks start to count |
| open **http://127.0.0.1:8113/blob/VIS/S00/CN_VIEW/frm?stream=1** in a second tab | the live view without the page |
| open **http://127.0.0.1:8113/blob/VIS/S00/SHOT/val** | the last bottle, one JPEG |
| set `FILL_Y_MAX` to `120` in `db\db_VIS.xml` and restart | the fill line is now above the good bottles' level: every bottle is LOW FILL |
| set `CAP_LO` to `0,130,80` and `CAP_HI` to `130,255,255` and restart | red and blue are both "the right cap": the WRONG CAP bottle passes. That is what a too-wide colour range does |
| set `con_cam_crop` on `CN_INS` in the XML to `0,0,640,480` (and `WIN` the same) | the whole picture is the window: two bottles in it at times, and the coordinates of the limits no longer fit |

## Your own camera

Press **Source: your camera**. `CN_CAM` is switched off, its `con_host` becomes
`usb:0`, and it is switched on again (`con_host` is read when a connection opens
and cannot be written while it runs). The log names the cameras the computer
has at start (`cameras on this computer: ...`); for another one write
`usb:1` or `usb:<part of its name>` into `main.on_src` in `db\db_VIS.js`.

The inspection keeps running: hold something amber with a red top in the
middle of the picture and it judges it like a bottle. Nothing else will look
like one, so with a real scene the live view and the camera's state are what
there is to see.

A phone works too, through an "IP camera" app that serves MJPEG: put
`http://<phone>:8080/video` as `CN_CAM`'s `con_host` in the XML (the address the
app shows).

On Linux `usb:0` is `/dev/video0` (V4L2). That path is built but **not tested**
on a real camera yet.

## A real IP camera

An IP camera, or an NVR, gives two things: a **picture** and a **web
interface** with its events (motion, a line crossed, its alarm inputs) and its
commands (alarm outputs, PTZ, presets, a snapshot). The engine takes both.

> **Not yet tried on a real camera.** Everything below is built and checked
> against fake cameras in the engine's own test set (RTSP with exact pixels,
> Dahua, Hikvision and ONVIF with their real message formats), not against a
> camera on a desk. If yours answers differently, the log line says what it
> answered.

### The picture

`CN_CAM` takes the camera's stream instead of the recording. In
`db\db_VIS.xml`:

```xml
<con id="CN_CAM" xdb_fnc="[CON.cam,PRO.cam]" xdb_cls="cls_CAM" desc="the camera"
     con_host="rtsp://192.168.1.64:554/Streaming/Channels/102"
     pro_usr="admin" pro_pwd="..."
     con_cam_w="640" con_cam_h="480" con_cam_fps="10" con_cam_tmo="5"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="5" con_tmo="2"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]" evt_thr="TH_INS"/>
```

| Camera | `con_host` |
|---|---|
| Hikvision, sub stream | `rtsp://<ip>:554/Streaming/Channels/102` (`101` = main stream) |
| Dahua, sub stream | `rtsp://<ip>:554/cam/realmonitor?channel=1&subtype=1` (`subtype=0` = main; in the XML the `&` is written `&amp;`) |
| any camera with MJPEG | `http://<ip>/<path>` |
| any camera, a snapshot per frame | `snap:http://<ip>/<path>`: Dahua `/cgi-bin/snapshot.cgi?channel=1`, Hikvision `/ISAPI/Streaming/channels/101/picture` |

* **RTSP** goes over one TCP connection (RTP interleaved, no UDP port), H.264
  or H.265, decoded by Windows' own decoder. H.265 needs Microsoft's **HEVC
  Video Extensions**; without them the log says `no H.265 decoder on this
  machine` - install them, or set the camera to H.264. Every frame is
  decoded (each is built on the one before); the **sub stream** is enough here
  and costs a fraction of the main one.
* **The login** is `pro_usr` / `pro_pwd`, Basic or Digest as the camera asks.
  Put it there, not in the URL: the attribute keeps the password out of every
  log line.
* **On Linux** the RTSP part runs but there is no decoder yet: the connection
  is refused with a line saying so. Use `http://` MJPEG or `snap:` there.
* Everything else stays as it is: `CN_INS`, `CN_VIEW` and `CN_SEN` are
  `link:CN_CAM` and get the camera's frames, `con_cam_w` / `_h` make them
  640 × 480 for the window and the sensors' regions. The inspection will find
  no bottle in a real scene; the sensors (motion, light, has the camera moved)
  work on any picture.
* `SRC` and `SPEED` rewrite `CN_CAM`'s `con_host` (`main.cam_host` in
  `db\db_VIS.js`): with an IP camera, put its URL there for `src == 1`.

### Events and commands

The web interface is a camera **device**: a `<con>` with `con_ses="1"` and a
`<dev>` naming the camera's family, `con_cam_api="dahua"`, `"hik"` or
`"onvif"`. Its source is `none:` - the picture comes through `CN_CAM`, so the
camera is opened once and the device costs no camera of the licence. Put it
beside `CN_SEN`:

```xml
<!-- the points' classes: an event block, an input block, a point, a command -->
<tio id="cls_EB" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" evt="0"
     pro="" pro_typ="0x1401" pro_fni="evt"
     evt_per="1.0" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta_fnc="[EVT.sta,PRO.sta]"/>
<tio id="cls_IB" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" evt="0"
     pro="0" pro_typ="0x0104" pro_fni="din"
     evt_per="1.0" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta_fnc="[EVT.sta,PRO.sta]"/>
<tio id="cls_EP" sta="0x0302" sta_typ="0x1142" pro="0" pro_typ="0x1104" pro_fnc="[VAL.put]"
     val="0" val_typ="0x0104"/>
<tio id="cls_CMD" xdb_acl="0xFF111113" sta="0x0302" sta_typ="0x1142"
     pro="" pro_typ="0x1401" pro_fnc="[PRO.out]"/>

<con id="CN_IPC" xdb_fnc="[CON.cam,PRO.cam]" desc="the camera's web interface"
     con_host="none:" con_cam_api="hik" con_cam_http="http://192.168.1.64"
     pro_usr="admin" pro_pwd="..."
     con_mod="CLIENT" pro_role="MASTER" con_ses="1" con_rct="5" con_tmo="2" thr_wrk="0"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="IPC" pro_con="CN_IPC" pro_adr="1" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta,ALM.devsta]">
  <bi id="IPC_E" xdb_cls="cls_EB">                                 <!-- the event stream -->
    <io id="IPC_MOTION" xdb_cls="cls_EP" pro_adr="VMD"/>           <!-- Dahua: VideoMotion -->
    <io id="IPC_LINE"   xdb_cls="cls_EP" pro_adr="linedetection"/> <!-- Dahua: CrossLineDetection -->
  </bi>
  <bi id="IPC_I" xdb_cls="cls_IB">                                 <!-- alarm inputs, every second -->
    <io id="IPC_IN1" xdb_cls="cls_EP" pro_adr="1"/>
  </bi>
  <io id="IPC_OUT1" xdb_cls="cls_CMD" pro_fno="dout" pro_adr="1"/> <!-- alarm output 1 -->
  <io id="IPC_PTZ"  xdb_cls="cls_CMD" pro_fno="ptz"/>
</dev>
```

| Point | What it does |
|---|---|
| `<bi pro_fni="evt">` | the camera's event stream, kept open and dialled again when it drops. Each `<io>` is an event by its code in `pro_adr`: 1 while it lasts, 0 when it ends. The block's own `pro` is the last event as JSON |
| `<bi pro_fni="din">` | the alarm inputs, asked at every poll: `pro_adr` = input from 1 (ONVIF has no such request: there an input is an event, `"DigitalInput:<token>"`) |
| `<io pro_fno="dout">` | an alarm output, `pro_adr` from 1: a non-zero number or `on` switches it on |
| `<io pro_fno="ptz">` | `{"cmd":"left","speed":5,"ms":800}` (`up down left right zoomin zoomout ..`, speed 1..8, the engine sends the stop after `ms`), `{"cmd":"preset","n":3}`, `"stop"` |
| `<io pro_fno="snap">` | the camera's snapshot, as a frame of the device: give the `<dev>` a frame block (`<bi pro_fni="frm">`) to receive it |

A command is **sent, not stored** (`PRO.out`): the camera's own state comes
back through the events and the inputs. A refusal is one ERROR line with the
camera's answer. Every point is an ordinary one - on MQTT under `VIS/S00/..`
like the rest, so the page could show `IPC_MOTION` and write `IPC_PTZ`
(`VIS/S00/IPC_PTZ/pro/set`; `cls_CMD`'s `xdb_acl` lets the page write it).
The event stream runs on the device's own thread and never waits; an input
poll or a command is one request, at most 3 s.

**ONVIF** - any camera or NVR that speaks it, whatever the brand:
`con_cam_api="onvif"`, `con_cam_http="http://<ip>[:port]"`, the same login.
The engine reads the camera's clock, services, profiles (`pro_adr` of the
`<dev>` = profile n) and relays once; events come by subscription. An event
point names the topic or its last part: `pro_adr="Motion"`,
`"RuleEngine/TamperDetector/Tamper"`, an input `"DigitalInput:DI_1"`; there is
no `din` block. `dout` is the n-th relay, `ptz` moves and goes to presets,
`snap` fetches the snapshot the camera names.

The field note *Camera Capture* (§3.2 RTSP, §3.4 events, ONVIF) has every
detail; it comes with the licensed product.

## The recording

`frames\` holds 128 JPEG pictures, 3.2 MB, made by `tools\make_frames.py`
(Pillow and numpy; not needed to run the example). The script says how the
scene is built: where the bottles are on every frame, which four are bad, the
colours, the noise and the flicker it adds.

## If there is no picture

The page says "waiting for the camera". Look in `log\VIS-*.log` and
`log\XDB-*.log`:

| Line | Meaning |
|---|---|
| `AyLIB: 'AyLIB_vision' not loaded: ...(Win32 error 126)`, then `engine will not start` | the picture module is missing: copy `AyLIB_vision.dll` (`libAyLIB_vision.so` on Linux) with the rest of `bin` |
| `AyLIB: 'AyLIB_vision' REFUSED: abi ..., core is ...` or `init failed` | the module and `AyPRO` are from different builds: copy them together, 4.3.4.564 or later |
| `AyPLG: 'AyPRO_cam' is now the engine module 'AyLIB_vision' (C563) -- loaded under its new name; rename it in xdb_lib` | a project written for an engine before 4.3.4.563: it still works; write `xdb_lib="AyLIB_vision"` and the line goes |
| `CN_SEN` stays *starting*, no `PRO.vision: block .. registered` line | an engine before 4.3.4.574 does not know `PRO.vision`; use the `bin` this example ships with |
| `CN_CAM ... NOT opened -- file: no JPEG / PNG image at 'frames'` | the engine started in another directory. `run.bat` / `run.sh` start it in this one: `frames` is relative to it |
| `CN_CAM ... NOT opened -- usb:0 -- no such camera` | no camera, or another program holds it |

## Licence

Six connections (the camera and its three views, the web server, MQTT), one
device (`DV_SEN`), one document: inside FREE. Cameras are counted by the
licence feature `vision`: without it two cameras with a real source may run
(`file:`, `usb:`, `http:`); the three views are `link:` connections and are
not counted. The start-up line
`LIC: vision is not licensed: 2 camera(s) ...` says so; this example uses one.
