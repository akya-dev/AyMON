# Engine modules

The script scopes that live in the engine modules beside the engine: `FILE` and `NET`
(AyLIB_net), `IMG` and `CAM` (AyLIB_vision), `GPIO`, `I2C` and `SPI` (AyLIB_hw). How a
module attaches, what a refusal looks like, who may call what, then every function. The
pictures these functions work on are blobs ([Time, text and codecs](02_Time_Text_and_Codecs.md#blob),
[Scripting](../03_Scripting.md#pictures-and-other-large-values-blobs)); the pins and
buses are set up in XML ([Pins and buses](../09_Pins_and_Buses.md)). Every result below
was measured on engine 4.4.2.702, on Windows.

* [How a module attaches](#how-a-module-attaches)
* [FILE](#file)
* [IMG](#img)
* [CAM](#cam)
* [GPIO](#gpio)
* [I2C and SPI](#i2c-and-spi)
* [NET](#net)

---

## How a module attaches

A module is a library beside the engine in `bin`: `AyLIB_net.dll`, `AyLIB_vision.dll`,
`AyLIB_hw.dll` on Windows, `libAyLIB_net.so` and so on on Linux. It is not loaded until a
project needs it.

| Module | Script scopes | `xdb_fnc` types | Attached by |
|---|---|---|---|
| AyLIB_net | `FILE`, `NET` | `CON.ssh`, `PRO.smtp`, `PRO.ftp`, `PRO.sftp` | the first `FILE.*` call, or a `<con>` of one of its types. **Not by `NET.*`** |
| AyLIB_vision | `IMG`, `CAM` | `CON.cam`, `PRO.cam`, `PRO.vision` | the first `IMG.*` / `CAM.*` call, or a camera `<con>` |
| AyLIB_hw | `GPIO`, `I2C`, `SPI` | `CON.gpio`, `PRO.gpio`, `CON.i2c`, `CON.spi`, `PRO.reg` | the first call, or a `<con>` of its types |

The log says so once: `AyLIB: 'AyLIB_net' attached (module abi 1.3, core 1.3)`. To attach
one at the start instead, name it on the **root** document:

```xml
<xdb id="PLT/S00" xdb_lib="AyLIB_net" ...>
```

That is needed only for `NET.ver()` before anything else of AyLIB_net ran: without it the
call is a runtime error, `'object variable not found'`.

**A module that is not there.** The call that wanted it writes one line and fails the same
way as a misspelt name:

```
AyLIB: 'AyLIB_vision' not loaded: AyLIB_vision.dll (Win32 error 126: the file, OR A DLL IT NEEDS ..., was not found)
Global.start [4, 17] Code error: 'object variable not found' >>> gray(Blob.from("abc")); ...
```

A runtime error stops the rest of the function, and its `PANIC` line raises the document's
health to EMERGENCY. Deploy the modules with the engine: copy all of `bin`.

**A function that refuses its arguments** writes one `ERROR` line with the reason, returns
`undefined`, and the script goes on:

```
CallScopeFunction: #XDB/XDB/: 'crop' refused [ERR_EXECUTE_INVRANGE] -- IMG.crop: rectangle 5,5,1,1 outside the 2x2 image
```

Inside a `try` it throws instead: `e.message` is the reason, `e.res` the code
([RES](02_Time_Text_and_Codecs.md#res)), `e.fnc` the function.

```js
try { IMG.crop(img, 6, 0, 4, 2); }
catch (e) { evt.Log(LOG.WARN, e.message); }   // IMG.crop: rectangle 6,0,4,2 outside the 8x6 image
```

**Who may call.** `FILE.*` and `I2C.scan` need role 6 (Engineer) or above; the rest has no
role check of its own. A script the engine runs on its own — `xdb_start`, a timer, a chain
— runs as the engine (`evt.user_role` is 9) and passes. A script a user started (a page, a
shell line, an MQTT command) has that user's role:

```
FILE.exists: needs role Engineer (6) or higher, the call runs with role 3
```

That is why [PRJEDU_net](../../examples/data/PRJEDU_net/) makes its archive on a timer.

**Threads.** Every function runs on the thread that calls it and holds it until it returns.
A big archive or heavy image work belongs on a worker thread (`evt_thr`), not on the
document's own ([Timers and events](../02_Timers_and_Events.md)).

**Help.** These scopes have no `help` key; the text is under `help_` and the first
function's name: `FILE.help_list`, `IMG.help_decode`, `CAM.help_list`, `GPIO.help_chips`,
`I2C.help_scan`, `SPI.help_sim`, `NET.help_ver`. `FILE.help` is `undefined`.

---

## FILE

Directories and ZIP archives. The engine's own `File` scope opens, reads and writes one
file ([File](07_SQL_History_Files_and_Cluster.md#file-plain-files)); `FILE` works
around it. Script functions.

Rules for every function:

* Path macros are expanded: `%PRJ%`, `%DB%`, `%ROOT%`, `%BIN%`. A `/` at the end does not
  matter; on Windows `/` and `\` may be mixed.
* Role 6 (Engineer) or above, see above.
* What **removes** — `rmdir`, and the source of `move` — works only below `%PRJ%` or `%DB%`,
  and never on those two themselves. `..` does not get round it.
* Not counted by the licence.

### FILE.list

`FILE.list(dir[, pattern])` → array

The entries of one directory, sorted by name, files and directories together. Not
recursive.

| Argument | Meaning |
|---|---|
| `dir` | a directory; anything else is refused (`'...' is no directory`) |
| `pattern` | `*` any run, `?` one character, letters without case. Missing: everything |

Each entry is `{name, dir, size, mtime}`: `dir` is 1 for a directory (its `size` 0),
`mtime` is **UTC** ISO text ending in `Z`, not the project's zone. A link or junction is
listed with `dir` 0 and `size` 0.

```js
FILE.list("%PRJ%/tmp/logs")
// [{"name":"a.txt","dir":0,"size":7,"mtime":"2026-11-11T09:37:52Z"},
//  {"name":"b.csv","dir":0,"size":7,"mtime":"2026-11-11T09:37:52Z"},
//  {"name":"old","dir":1,"size":0,"mtime":"2026-11-11T09:37:52Z"}]
FILE.list("%PRJ%/tmp/logs", "*.TXT")    // [{"name":"a.txt",...}]
FILE.list("%PRJ%/tmp/logs", "?.csv")    // [{"name":"b.csv",...}]
```

More than 20000 entries are refused: narrow it with a pattern.

### FILE.exists

`FILE.exists(path)` → `0`, `1` or `2`

`0` nothing there, `1` a file, `2` a directory.

```js
FILE.exists("%PRJ%")                // 2
FILE.exists("%PRJ%/tmp/logs/a.txt") // 1
FILE.exists("%PRJ%/tmp/none")       // 0
```

An empty path is refused (`argument 1 (a path) is missing`).

### FILE.mkdir

`FILE.mkdir(dir)` → `1`

Makes the directory and every parent missing. A directory that is already there is fine.

```js
FILE.mkdir("%PRJ%/tmp/a/b")    // 1
FILE.mkdir("%PRJ%/tmp")        // 1: already there
```

### FILE.rmdir

`FILE.rmdir(dir[, mode])` → integer

Removes a directory below `%PRJ%` or `%DB%`. Returns how many entries went (files and
directories, counted at every level, the directory itself included).

| `mode` | |
|---|---|
| `0` (default) | only when it is empty |
| `1` | with everything in it |
| `2` | everything in it; the directory stays |

```js
FILE.rmdir("%PRJ%/tmp/logs", 2)   // 5: two files, a directory with one file, one archive
FILE.rmdir("%PRJ%/tmp/logs")      // 1: empty now
FILE.rmdir("%PRJ%/tmp/archive", 1)  // 3: archive/2026/b.csv, archive/2026, archive
```

Refused: a directory with something in it in mode 0 (`it is not empty? (mode 1 removes
its content too)`), `%PRJ%` or `%DB%` itself, anything outside them (`is not below the
project`), a mode other than 0–2, a path that is no directory. A link or junction inside
is removed as a link; what it points to is not touched (measured with a junction: the
target's files stayed). If one entry cannot be removed, the call stops there and says how
many went before it.

### FILE.move

`FILE.move(src, dst)` → `1`

Renames or moves a file or a directory. **An existing `dst` is replaced.** Missing
directories on the way to `dst` are made.

```js
FILE.move("%PRJ%/tmp/logs/b.csv", "%PRJ%/tmp/archive/2026/b.csv")   // 1: archive/2026 made
FILE.move("%PRJ%/tmp/logs/d.txt", "%PRJ%/tmp/logs/e.txt")           // 1: e.txt replaced
```

`src` must be below `%PRJ%` or `%DB%` (`FILE.move("C:/Windows/win.ini", ..)` is refused);
`dst` may be anywhere the engine's user can write.

### FILE.zip

`FILE.zip(src, zipfile[, level])` → object

A directory's content, or one file, into a ZIP archive.

| Argument | Meaning |
|---|---|
| `src` | a directory: everything in it, at every level; or one file |
| `zipfile` | the archive. Missing directories are made; an existing archive is replaced |
| `level` | `0` stored (not compressed), `1`..`9` deflate. Missing: `6` |

Returns `{files, dirs, bytes, size, links, method}`: files and directories written, the
bytes before compression, the archive's size, links left out, `"deflate"` or `"stored"`.

```js
FILE.zip("%PRJ%/tmp/logs", "%PRJ%/tmp/out/logs.zip")
// {"files":3,"dirs":1,"bytes":51,"size":409,"links":0,"method":"deflate"}
// in the archive: a.txt, b.csv, old/, old/c.txt
FILE.zip("%PRJ%/tmp/logs/old/c.txt", "%PRJ%/tmp/out/c.zip", 0)
// {"files":1,"dirs":0,"bytes":37,"size":145,"links":0,"method":"stored"}
```

* The names inside are relative to `src` (no `logs/` in front), UTF-8, with `/`; an empty
  directory is kept as an entry.
* An archive written into the directory it archives leaves itself out.
* It is written as `<zipfile>.part` and renamed when whole: a reader never sees half an
  archive.
* Links and junctions are not followed; `links` counts them.
* One file that cannot be read refuses the whole call. So do a file or an archive of
  4 GiB or more and more than 65534 entries (no ZIP64).

There is no unzip.

---

## IMG

Image functions on blobs: decode and encode JPEG and PNG, colour, crop and scale, masks,
measurements, drawing, alignment, template matching. Written to run on every camera frame:
on the machine these pages were measured on, a 640×480 colour frame took 4 ms through
`IMG.blur(f, 5)` and 1 ms through `IMG.stats`. Script functions.

**What an image is.** A raw blob with the shape `[h, w]` (grey) or `[h, w, ch]`, `ch` 1–4
(3 = RGB, 4 = RGBA). Most functions want 8-bit samples (`u8`); `crop`, `threshold`,
`stats`, `hist`, `grid` and `channel` take any sample type. An encoded blob (a JPEG, a PNG)
is refused everywhere but `decode`: `argument 1 is an encoded image (PNG) -- IMG.decode it
first`.

**Every function returns a new blob**, drawing functions too: they draw on a copy, never on
the image you give them. The frame number and capture time (`seq`, `tim`) travel with
what is made of an image. A function that would give back the same pixels gives back the
same blob (`gray` of a grey image, `blur` with 1, `shift` by 0, 0 ...).

**Arguments.** A rectangle or `roi` is four numbers, `[x, y, w, h]` or `{x, y, w, h}`. A
colour is one number for every channel or an array per channel. Fractions are rounded to
the nearest whole number. Sides up to 16384, images up to 64 MiB. Pixel arithmetic is in
integers: Windows and Linux give the same bytes.

**The images the examples use**, made from hex:

```js
function h2(v) { var d = "0123456789abcdef"; return d.substr(v / 16, 1) + d.substr(v % 16, 1); }
function px(b) { return CODEC.HEX_enc(b.toBuffer()); }      // to look at the pixels
function zero(w, h) { return Blob.from(new Blob(w * h).toBuffer(), {dtype: "u8", shape: [h, w]}); }

// G: 8 x 6 grey ramp, pixel (x, y) = 10x + 30y
var s = "";
for (var y = 0; y < 6; y++) for (var x = 0; x < 8; x++) s = s + h2(10 * x + 30 * y);
var G = Blob.from(CODEC.HEX_dec(s), {dtype: "u8", shape: [6, 8]});
//   row 0:   0  10  20  30  40  50  60  70
//   row 1:  30  40  50  60  70  80  90 100
//   row 2:  60  70  80  90 100 110 120 130
//   row 3:  90 100 110 120 130 140 150 160
//   row 4: 120 130 140 150 160 170 180 190
//   row 5: 150 160 170 180 190 200 210 220

// C: 4 x 2 colours: red, green, blue, white / black, grey 128, yellow, cyan
var C = Blob.from(CODEC.HEX_dec("ff0000 00ff00 0000ff ffffff 000000 808080 ffff00 00ffff"),
                  {dtype: "u8", shape: [2, 4, 3]});
```

### IMG.decode

`IMG.decode(file[, ch])` → image

A JPEG or PNG in a blob to raw 8-bit pixels.

| Argument | Meaning |
|---|---|
| `file` | a blob holding the file's bytes: `Blob.from(File.read(..), "jpeg")`, a camera frame with `con_cam_out="jpeg"`, `IMG.encode`'s result |
| `ch` | `0` (default) as stored: grey 1, colour 3, colour with alpha 4 (grey with alpha gives 4). Or `1`, `3`, `4`. `2` is refused |

```js
var png = IMG.encode(G, "png");         // {"blob":1,"len":76,"fmt":"png","w":8,"h":6,"ch":1,...}
var back = IMG.decode(png);              // {"blob":1,"len":48,"fmt":"raw","dtype":"u8","w":8,"h":6,"ch":1,...}
px(back) == px(G)                        // true: PNG is lossless
IMG.decode(IMG.encode(C, "jpeg", 95))    // 4 x 2 x 3
IMG.decode(IMG.encode(C, "jpeg", 95), 1) // 4 x 2, grey
```

Refused: not a blob, a blob that already holds raw samples, bytes that are no JPEG or PNG
(`not a readable JPEG or PNG (stb: unknown image type)`), a picture over the limits. A PNG
whose data cannot hold the size its header claims is refused before it is decoded.

### IMG.encode

`IMG.encode(img, "jpeg" | "png"[, quality])` → blob

An 8-bit image with 1, 3 or 4 channels to a JPEG (`"jpeg"` or `"jpg"`) or PNG file in a
blob. `quality` 1..100, default 90, JPEG only (`png takes no quality`).

```js
IMG.encode(C, "jpeg", 95)    // {"blob":1,"len":766,"fmt":"jpeg","w":4,"h":2,"ch":3,...}
IMG.encode(G, "jpeg")        // {"blob":1,"len":650,"fmt":"jpeg","w":8,"h":6,"ch":3,...}
IMG.encode(G, "png")         // {"blob":1,"len":76,"fmt":"png","w":8,"h":6,"ch":1,...}
```

**A JPEG is always written with three components**, a grey image too, so its shape says
`ch` 3. Decode it with `IMG.decode(j, 1)` to get grey back.

### IMG.gray

`IMG.gray(img)` → image

RGB or RGBA to one grey channel: `(77·R + 150·G + 29·B + 128) >> 8`. A grey image comes
back as it is.

```js
px(IMG.gray(C))    // "4d951dff0080e2b2": 77 149 29 255 / 0 128 226 178
```

### IMG.hsv

`IMG.hsv(img)` → image

RGB or RGBA to HSV, three channels: H 0..179 (degrees / 2, the OpenCV 8-bit convention),
S and V 0..255. A grey image is refused.

```js
px(IMG.hsv(C))
// red 00ffff, green 3cffff, blue 78ffff, white 0000ff,
// black 000000, grey 000080, yellow 1effff, cyan 5affff
```

### IMG.crop

`IMG.crop(img, x, y, w, h)` → image

A rectangle cut out, any sample type. The rectangle must lie inside.

```js
px(IMG.crop(G, 2, 1, 3, 2))               // "323c46505a64": 50 60 70 / 80 90 100
px(IMG.crop(G, [2, 1, 3, 2]))             // the same
px(IMG.crop(G, {x: 2, y: 1, w: 3, h: 2})) // the same
```

### IMG.resize

`IMG.resize(img, w, h[, mode])` → image

An 8-bit image, any channels, to `w` × `h`. `mode` `"linear"` (default, bilinear,
pixel centres mapped) or `"nearest"`.

```js
px(IMG.resize(G, 4, 3))              // 20 40 60 80 / 80 100 120 140 / 140 160 180 200
px(IMG.resize(G, 4, 3, "nearest"))   // 40 60 80 100 / 100 120 140 160 / 160 180 200 220
```

### IMG.threshold

`IMG.threshold(img, t[, inv])` → mask

One channel, any sample type, to a mask: 255 where the value is **above** `t`, else 0.
`inv` (a number other than 0, or `"inv"`): 255 where it is at or below `t`.

```js
px(IMG.threshold(G, 100))
// row 0, 1: 0 ... 0           (100 is not above 100)
// row 2:    0 0 0 0 0 255 255 255
// row 3:    0 0 255 255 255 255 255 255
// row 4, 5: 255 ... 255
```

### IMG.inrange

`IMG.inrange(img, lo, hi)` → mask

8 bits, any channels, to a mask: 255 where **every** channel lies within `lo`..`hi`.
`lo` and `hi` are numbers or one value per channel; three values on an RGBA image leave
alpha free.

```js
px(IMG.inrange(G, 50, 100))                       // 255 for the values 50..100
px(IMG.inrange(C, [200, 0, 0], [255, 60, 60]))    // "ff00000000000000": only the red pixel
```

Run it on `IMG.hsv(..)` to pick a colour by hue: [PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/)
does.

### IMG.stats

`IMG.stats(img[, roi])` → object

`{n, mean, min, max, std}` over the image or a rectangle of it (`std` = population
standard deviation). With more than one channel each field is an array, one per channel.
A NaN sample of a float image is left out of `n`.

```js
IMG.stats(G)                 // {"n":48,"mean":110,"min":0,"max":220,"std":56.1248608016091}
IMG.stats(G, [0, 0, 2, 2])   // {"n":4,"mean":20,"min":0,"max":40,"std":15.8113883008419}
IMG.stats(C)                 // {"n":[8,8,8],"mean":[111.625,143.5,111.625],"min":[0,0,0],"max":[255,255,255],"std":[...]}
```

### IMG.hist

`IMG.hist(img, bins[, lo, hi])` → array

A histogram of one channel: `bins` counts (1..65536), bin = ⌊(v − lo) · bins / (hi − lo)⌋,
values outside `lo`..`hi` not counted. An 8-bit image defaults to 0..256; any other sample
type needs `lo` and `hi`.

```js
IMG.hist(G, 4)            // [12,16,17,3]: 0-63, 64-127, 128-191, 192-255
IMG.hist(G, 4, 0, 100)    // [3,4,8,5]: 0-24, 25-49, 50-74, 75-99
```

### IMG.count

`IMG.count(mask[, roi])` → integer

How many samples of a one-channel 8-bit image are not 0.

```js
var M = IMG.threshold(G, 150);    // 1 pixel in row 3, 4 in row 4, 7 in row 5
IMG.count(M)                      // 12
IMG.count(M, 0, 4, 8, 2)          // 11: rows 4 and 5 only
```

### IMG.moments

`IMG.moments(mask[, roi])` → object

`{area, cx, cy}`: the count of non-zero samples and their centre, in image coordinates
(also with a `roi`). `cx` and `cy` are `-1` when `area` is 0.

```js
IMG.moments(M)                          // {"area":12,"cx":4.75,"cy":4.5}
IMG.moments(IMG.threshold(G, 250))      // {"area":0,"cx":-1,"cy":-1}
```

### IMG.absdiff

`IMG.absdiff(a, b)` → image

`|a − b|` per sample, two 8-bit images of the same shape. The usual motion test:
`IMG.count(IMG.threshold(IMG.gray(IMG.absdiff(now, before)), 25))`.

```js
px(IMG.absdiff(G, IMG.shift(G, 1, 0)))
// each row: its first pixel (nothing beside it), then 10 10 10 10 10 10 10
```

Shapes that differ are refused: `shapes differ: 2x2x1 and 3x3x1`.

### IMG.blur

`IMG.blur(img, k)` → image

A `k` × `k` box mean, 8 bits, any channels, edges repeated, rounded. `k` odd, 1..63; `1`
gives the same image back.

```js
px(IMG.crop(IMG.blur(G, 3), 0, 0, 8, 1))   // 13 20 30 40 50 60 70 77
```

### IMG.label

`IMG.label(mask[, minArea[, max]])` → object

The connected parts of a mask (8-connected: diagonal neighbours belong together), in the
order of their first pixel, top to bottom, left to right.

| Argument | Meaning |
|---|---|
| `mask` | one channel, 8 bits; not 0 = on |
| `minArea` | parts smaller than this are left out. Default 1 |
| `max` | at most this many boxes (0..65535). Default 256 |

Returns `{count, boxes}`; each box is `{x, y, w, h, area, cx, cy}`. `count` counts every
part of `minArea` or more, even when `max` cut the list.

```js
// 6 x 4:  ##...#
//         ##...#
//         ......
//         .##...
var S = Blob.from(CODEC.HEX_dec("ffff000000ff ffff000000ff 000000000000 00ffff000000"),
                  {dtype: "u8", shape: [4, 6]});
IMG.label(S)
// {"count":3,"boxes":[{"x":0,"y":0,"w":2,"h":2,"area":4,"cx":0.5,"cy":0.5},
//                     {"x":5,"y":0,"w":1,"h":2,"area":2,"cx":5,"cy":0.5},
//                     {"x":1,"y":3,"w":2,"h":1,"area":2,"cx":1.5,"cy":3}]}
IMG.label(S, 3)       // {"count":1,"boxes":[the first]}
IMG.label(S, 1, 1)    // {"count":3,"boxes":[the first]}
```

### IMG.rect

`IMG.rect(img, x, y, w, h, color[, t])` → image

A copy with a rectangle drawn on it. `t` is the line width inside the rectangle, default
1; `0` fills it, and so does a width of half the rectangle or more. Parts outside the
image are clipped.

```js
var Z = zero(7, 4);
px(IMG.rect(Z, 1, 0, 5, 4, 255))       // an outline: x 1..5, y 0..3
px(IMG.rect(Z, 1, 1, 3, 2, 9, 0))      // filled with 9
px(IMG.rect(Z, -2, -2, 4, 4, 7, 0))    // clipped: only x 0..1, y 0..1
px(Z)                                  // still all 0
px(IMG.rect(C, 0, 0, 1, 1, [1, 2, 3], 0))   // the first pixel 010203
```

### IMG.line

`IMG.line(img, x0, y0, x1, y1, color[, t])` → image

A copy with a line drawn on it, end points included, `t` × `t` square pen (1..64,
default 1), clipped.

```js
px(IMG.line(zero(8, 6), 0, 0, 7, 5, 1))     // a diagonal of 1s
px(IMG.line(zero(8, 6), 0, 2, 7, 2, 1, 3))  // rows 1, 2 and 3 all 1
```

To draw many segments, use `IMG.lines`: one copy for all of them.

### IMG.text

`IMG.text(img, x, y, text, color[, scale])` → image

A copy with text drawn on it: a 5 × 7 font, 6 pixels a character, `\n` for a new line 8
pixels down, everything times `scale` (1..16). `x`, `y` are the top-left.

```js
IMG.count(IMG.text(zero(40, 10), 1, 1, "Hi!", 255))      // 34 pixels set
IMG.count(IMG.text(zero(40, 20), 1, 1, "Hi!", 255, 2))   // 136: four times as many
```

The font has digits, `A`–`Z`, a blank and `! " # % ' ( ) * + , - . / : ; < = > ? [ ] _`.
Lower case is drawn as upper case; any other character, and every non-ASCII one, as a box.
Up to 1024 bytes.

### IMG.lut

`IMG.lut(img, table)` → image

Every sample through a table of 256 values (0..255), 8-bit images.

| `table` | |
|---|---|
| 256 numbers | one table for every channel |
| `[t0, t1, t2]` (or four) | one table per channel |
| `[t0, t1, t2]` on a grey image | a **palette**: the grey value picks a colour, the result has 3 (or 4) channels |

```js
var inv = [];
for (var i = 0; i < 256; i++) inv.push(255 - i);
px(IMG.lut(G, inv))                      // "fff5ebe1..": 255 245 235 225 ...
var r = [], g = [], b = [];
for (var i = 0; i < 256; i++) { r.push(i); g.push(0); b.push(255 - i); }
var heat = IMG.lut(G, [r, g, b]);        // {"blob":1,"len":144,...,"w":8,"h":6,"ch":3,...}
px(IMG.crop(heat, 0, 0, 2, 1))           // "0000ff0a00f5": 0 is blue, 10 a little red
```

A table that is not 256 numbers is refused (`table 1 has 3 values, want 256`).

### IMG.grid

`IMG.grid(img, cols, rows[, options])` → array

The image cut into `cols` × `rows` cells, one number per cell, row by row. One channel, any
sample type. A cell is `w / cols` × `h / rows` pixels from the top-left; what is left over
at the right and bottom is not measured. Made for a thermal camera's grid of temperatures.

| Option | Default | |
|---|---|---|
| `a`, `b` | 1, 0 | the unit: each sample counts as `u = a·v + b` |
| `lo`, `hi` | all | only samples whose `u` lies within count |
| `stat` | `"mean"` | or `"std"`, `"min"`, `"max"` of the counted samples, in `u` |
| `fill` | 0 | 0..1: a cell with fewer counted samples than `fill` × its area is scaled down in proportion (mean only) |
| `empty` | 0 | the value of a cell with nothing counted |
| `dec` | none | round to 0..9 decimals |
| `min`, `max` | none | clamp the result |

```js
IMG.grid(G, 2, 2)                                   // [45,85,135,175]: 4 x 3 cells
IMG.grid(G, 2, 2, {stat: "max"})                    // [90,130,180,220]
IMG.grid(G, 2, 2, {stat: "std", dec: 2})            // [26.93,26.93,26.93,26.93]
IMG.grid(G, 2, 2, {a: 0.5, b: -10, lo: 0, hi: 40, dec: 1, empty: -1})
                                                    // [16.5,26.7,37.5,-1]
IMG.grid(G, 3, 2)                                   // [35,55,75,125,145,165]: 2 x 3 cells, columns 6 and 7 left out
IMG.grid(G, 2, 2, {lo: 100, fill: 1})               // [0,46.6666666666667,127.5,175]
var raw = Blob.from(CODEC.HEX_dec("e803d007b80ba00f"), {dtype: "u16", shape: [2, 2]});  // 1000 2000 / 3000 4000
IMG.grid(raw, 2, 1, {a: 0.1, b: -50})               // [150,250]
```

### IMG.align

`IMG.align(img, ref[, {r, lo}])` → object

The translation that puts `img` onto `ref`: `IMG.shift(img, dx, dy)` lies on `ref`. Two
one-channel 8-bit images of the same size.

| Option | Default | |
|---|---|---|
| `r` | 32 | the largest shift searched, up to half the smaller side |
| `lo` | none | compare only `ref` pixels of `lo` or more: the part, not the background |

Returns `{dx, dy, err, n}`: `err` is the mean absolute difference at that shift, `n` the
pixels compared. Ties go to the smaller shift.

```js
// N: 18 x 16, dark (20), with a bright L-shape and one bright dot (200): 12 bright pixels
var t = "";
for (var y = 0; y < 16; y++) for (var x = 0; x < 18; x++) {
    var on = 0;
    if (x >= 7 && x <= 8 && y >= 6 && y <= 9) on = 1;
    if (y == 9 && x >= 7 && x <= 11) on = 1;
    if (x == 12 && y == 4) on = 1;
    t = t + (on ? "c8" : "14");
}
var N = Blob.from(CODEC.HEX_dec(t), {dtype: "u8", shape: [16, 18]});

var moved = IMG.shift(N, 2, -1);
IMG.align(moved, N, {r: 4})            // {"dx":-2,"dy":1,"err":0,"n":240}
IMG.align(moved, N, {r: 4, lo: 100})   // {"dx":-2,"dy":1,"err":0,"n":12}
```

### IMG.shift

`IMG.shift(img, dx, dy[, fill])` → image

The image moved by `dx`, `dy`: `out(x, y) = img(x − dx, y − dy)`. What is uncovered gets
`fill` (default 0; a number or one value per channel). 8 bits, any channels.

```js
px(IMG.shift(G, 1, 1))        // row 0 all 0, then each row starts with 0
px(IMG.shift(G, -2, 0, 99))   // each row moved left, ending in 99 99
```

### IMG.lines

`IMG.lines(img, points, color[, t[, mode]])` → image

Many segments in one copy: for a trend drawn over a frame every time.

| Argument | Meaning |
|---|---|
| `points` | one flat array `x0, y0, x1, y1, ...` |
| `mode` | `"seg"` (default): four numbers per segment, a multiple of 4. `"strip"`: a polyline, an even count |
| `t` | pen width 1..64 |

A coordinate that is not a number (`null`, `undefined`, NaN) leaves its segment out — a gap
in the trend.

```js
px(IMG.lines(zero(8, 6), [0, 0, 7, 0,  0, 5, 7, 5], 1))          // the top and bottom rows
px(IMG.lines(zero(8, 6), [0, 0, 7, 5, 0, 5], 1, 1, "strip"))     // a diagonal, then the bottom row
px(IMG.lines(zero(8, 6), [0, 0, 7, 0,  null, 1, 7, 1,  0, 5, 7, 5], 1))   // the middle one left out
```

### IMG.channel

`IMG.channel(img, n)` → image

Channel `n` (0..ch−1) of an image, any sample type. One channel comes back as it is.

```js
px(IMG.channel(C, 1))    // "00ff00ff0080ffff": the green channel
```

### IMG.erode

`IMG.erode(mask, k)` → mask

The minimum over a `k` × `k` box: a part shrinks by `k / 2` on every side. One channel,
8 bits, `k` odd 1..63. At the image's edge only the pixels inside count.

```js
// a 3 x 3 square of 255 in a 5 x 5 image
var Q = Blob.from(CODEC.HEX_dec("0000000000 00ffffff00 00ffffff00 00ffffff00 0000000000"),
                  {dtype: "u8", shape: [5, 5]});
px(IMG.erode(Q, 3))      // only the centre pixel left
```

`IMG.dilate(IMG.erode(m, k), k)` removes specks smaller than `k`:
[PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/) cleans its masks that way.

### IMG.dilate

`IMG.dilate(mask, k)` → mask

The maximum over a `k` × `k` box: a part grows by `k / 2` on every side.

```js
px(IMG.dilate(Q, 3))     // all 25 pixels 255
```

### IMG.sobel

`IMG.sobel(img[, mode])` → image

Edges of a one-channel 8-bit image, 8 bits out. `"x"` and `"y"`: `(|g| + 2) / 4` of the
horizontal or vertical Sobel gradient; `"mag"` (default): `√(gx² + gy²) / 4`, rounded.

```js
px(IMG.crop(IMG.sobel(G, "x"), 0, 2, 8, 1))   // 10 20 20 20 20 20 20 10
px(IMG.crop(IMG.sobel(G, "y"), 0, 2, 8, 1))   // 60 60 60 60 60 60 60 60
px(IMG.crop(IMG.sobel(G), 0, 2, 8, 1))        // 61 63 63 63 63 63 63 61
```

The image's edge is repeated outward, so the border shows half a gradient.

### IMG.match

`IMG.match(img, tpl[, area])` → object

Where a small picture lies in a bigger one: `{x, y, score}`, the template's best top-left
by normalised cross-correlation, `score` −1..1. Both one channel, 8 bits.

| Argument | Meaning |
|---|---|
| `tpl` | the template; not larger than `img` |
| `area` | `{x, y, w, h}`: where the top-left may lie (an object; an array is refused). Missing: anywhere |

```js
var tpl = IMG.crop(N, 6, 5, 5, 5);               // N from IMG.align above
IMG.match(N, tpl)                                // {"x":6,"y":5,"score":1}
IMG.match(N, tpl, {x: 0, y: 0, w: 4, h: 4})      // {"x":3,"y":2,"score":0.25}: the best in that area
IMG.match(N, IMG.crop(N, 0, 0, 3, 3))            // {"x":0,"y":0,"score":0}: a flat template matches nothing
```

The mean is taken out of both, so brightness does not matter, only the pattern. Ties go to
the first place in row order.

---

## CAM

The cameras themselves are connections: `<con xdb_fnc="[CON.cam,PRO.cam]">`, frames into a
blob attribute ([CON.cam](09_Connection_and_Protocol_Types.md#concam),
[PRO.cam](09_Connection_and_Protocol_Types.md#procam)). One script function lists what
this machine has.

### CAM.list

`CAM.list()` → array

The cameras on this machine: `[{idx, url, name, id}]`. `url` is what a `<con>`'s
`con_host` takes.

```js
var l = CAM.list();
l.length       // 1
l[0].idx       // 0
l[0].url       // "usb:0"
l[0].name      // the device's name, as the system gives it
```

[PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/) calls it at the start to say which
cameras it found. A camera counts against the licence; the list
does not ([Licensing](../04_Licensing.md)).

---

## GPIO

A board's own lines. They are set up in XML ([Pins and buses](../09_Pins_and_Buses.md)): a
`<con xdb_fnc="[CON.gpio,PRO.gpio]">` per chip, a `<dev>`, and a `<bi>` or `<io>` per line.
The script functions look at a running connection and feed one held in memory. Each takes
the `<con>`'s **id** as its first argument.

The examples run on this connection: a chip in memory with lines 17 and 27 wired together
and a PWM channel on 18, an input block on 22 and 27, an output on 17, a PWM point on 18.

```xml
<con id="CN_G" xdb_fnc="[CON.gpio,PRO.gpio]" con_host="sim:jumper=17-27,pwm=18:2"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="5" con_tmo="1" pro_try="0"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D_G" pro_con="CN_G" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_IN" xdb_fnc="[XDB.evt]" pro_fni="in" evt="0" evt_per="0.2" evt_typ="0x5204"
      evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="IN22" pro_adr="22" sta="0x0302" sta_typ="0x1142" pro="0" pro_typ="0x1104"/>
    <io id="IN27" pro_adr="27" sta="0x0302" sta_typ="0x1142" pro="0" pro_typ="0x1104"/>
  </bi>
  <io id="OUT17" pro_fno="out" pro_adr="17" pro_safe="0" sta="0x0302" sta_typ="0x1142"
      pro="0" pro_typ="0x1104" pro_fnc="[PRO.out]"/>
  <io id="FAN" pro_fno="pwm" pro_adr="18" pro_pwm_hz="1000" pro_safe="0" sta="0x0302"
      sta_typ="0x1142" pro="0" pro_typ="0x1308" pro_fnc="[PRO.out]"/>
</dev>
```

A chip in memory (`con_host="sim:.."`) works on every platform. Real lines need Linux; on
Windows there are none.

### GPIO.chips

`GPIO.chips()` → array

This machine's GPIO chips: `[{chip, label, lines, named}]`, what `con_host` may name
(`gpiochip0`, `label:pinctrl-rp1`). Linux only; on Windows it is `[]`.

```js
GPIO.chips()      // [] on Windows
```

### GPIO.info

`GPIO.info(con[, line])` → array

Every line of the connection's chip, or one: `[{line, name, consumer, used, out}]`.
`consumer` is who holds the line (`AyXDB:<con id>` for this engine); `out` 1 for an
output. The connection must be running.

```js
GPIO.info("CN_G", 17)   // [{"line":17,"name":"GPIO17","consumer":"AyXDB:CN_G","used":1,"out":1}]
GPIO.info("CN_G", 22)   // [{"line":22,"name":"GPIO22","consumer":"AyXDB:CN_G","used":1,"out":0}]
GPIO.info("CN_G", 18)   // [{"line":18,"name":"GPIO18","consumer":"","used":0,"out":0}]: a PWM point, not a line request
GPIO.info("CN_G").length   // 54: a chip in memory has the 54 lines of a Raspberry Pi
```

`GPIO.info("NOPE")` is refused: `'NOPE' is no running CON.gpio`. On a real board this is
how to find out who holds a line before a block refuses it.

### GPIO.pwm

`GPIO.pwm(con)` → array

The connection's PWM points as they run: `[{id, line, how, period_ns, duty_ns, enable}]`.

```js
evt.SetValue("id('FAN')/@pro", 25);    // 25 %
GPIO.pwm("CN_G")
// [{"id":"FAN","line":18,"how":"sim/2","period_ns":1000000,"duty_ns":250000,"enable":1}]
```

### GPIO.sim

`GPIO.sim(con, line, seq)` → integer

A chip in memory only: levels on an input line, as if something outside drove it. Returns
how many levels it delivered.

| `seq` | |
|---|---|
| `"1"`, `"0"` | that level, now |
| `"0:1,300:0,600:1"` | `microseconds:level` from now, delivered at once with those timestamps: a 300 µs pulse, then high |
| `"join:21"`, `"part:21"` | a key matrix: the key on this row line and column 21 pressed, let go |
| `"dht:23:55"`, `"dht:off"` | a DHT sensor on the line answering 23 °C and 55 %, or not answering |

```js
GPIO.sim("CN_G", 22, "1")                  // 1; IN22 reads 1 at the next poll
GPIO.sim("CN_G", 23, "0:1,300:0,600:1")    // 3
evt.SetValue("id('OUT17')/@pro", 1);       // IN27 reads 1: the jumper 17-27
```

Refused: an output line (`line 17 cannot be driven from outside (an output, or no such
line)`), a connection that is not a running `sim:` chip. The [board examples](../../examples/board/)
drive their buttons and sensors this way.

---

## I2C and SPI

A bus is a `<con xdb_fnc="[CON.i2c,PRO.reg]">` or `[CON.spi,PRO.raw]`
([Pins and buses](../09_Pins_and_Buses.md#i2c-and-spi)). The examples use buses in memory:

```xml
<con id="CN_I2C" xdb_fnc="[CON.i2c,PRO.reg]" con_host="sim:mpu6050@0x68+pcf8574@0x27+reg@0x50"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="5" con_tmo="1" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<con id="CN_SPI" xdb_fnc="[CON.spi,PRO.raw]" con_host="sim:loop@0+max7219@1+mfrc522@2+adc0834@3+shift@4"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="5" con_tmo="1" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

with a `<dev pro_adr="0x68">` under `CN_I2C` that reads the MPU6050's acceleration into
`AX` (the XML of [PRJHW_reverse](../../examples/board/PRJHW_reverse/)).

### I2C.scan

`I2C.scan(con)` → array

The addresses 0x08..0x77 on the bus that answer a one-byte read, as numbers. Role 6
(Engineer) or above: on a real bus a read can disturb a chip.

```js
I2C.scan("CN_I2C")      // [39,80,104]: 0x27, 0x50, 0x68
```

A connection that is no `CON.i2c` is refused (`'CN_SPI' is no CON.i2c`).

### I2C.sim

`I2C.sim(con, address[, stim])` → object

A chip in memory: feeds it values (`stim`, `"name=value,.."`) and answers its state.

| Model | `stim` | State |
|---|---|---|
| `mpu6050` | `ax ay az t gx gy gz` (raw counts) | `{who, pwr, cfg, gyro, accel}` |
| `pcf8574` | – (an LCD1602 behind it) | `{l1, l2, on, bl, mode4, clears, bytes}`: the two lines of text |
| `reg` | `"0=12,1=AB"`: register = value, both hex | `{ptr, r:[16 registers]}` |

```js
I2C.sim("CN_I2C", 0x68)                       // {"who":104,"pwr":0,"cfg":0,"gyro":0,"accel":0}
I2C.sim("CN_I2C", 0x68, "ax=1000,az=-2");     // AX reads 1000 at the next poll
I2C.sim("CN_I2C", 0x50, "0=12,1=AB")          // {"ptr":1,"r":[18,171,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}
I2C.sim("CN_I2C", 0x27)                       // {"l1":"                ","l2":"                ","on":0,...}
```

An address with no chip is refused: `'CN_I2C' has no chip 0x10 in memory`. The connection
must be running.

### SPI.sim

`SPI.sim(con, cs[, stim])` → object

The same for an SPI bus; `cs` is the chip select.

| Model | `stim` | State |
|---|---|---|
| `loop` | – | `{bytes}`: what came back |
| `max7219` | – | `{rows:[8], on, test, scan, inten, dec}`: the LED matrix |
| `mfrc522` | `uid=DEADBEEF`, `uid=` (no card) | `{ant, tag, tx, resets}` |
| `adc0834` | `"0=128,1=64"`: channel = value | `{sgl, ch, conv}` |
| `shift` | – | `{out:[..], latches}`: a 74HC595's outputs |

```js
SPI.sim("CN_SPI", 3, "0=128,1=64")   // {"sgl":0,"ch":0,"conv":0}: no conversion asked for yet
SPI.sim("CN_SPI", 1)                 // {"rows":[0,0,0,0,0,0,0,0],"on":0,"test":0,"scan":0,"inten":0,"dec":0}
SPI.sim("CN_SPI", 2, "uid=DEADBEEF") // {"ant":0,"tag":0,"tx":0,"resets":0}: a card held to the reader
```

`I2C.sim` and `SPI.sim` are the same function: either answers on either kind of bus.

---

## NET

### NET.ver

`NET.ver()` → text

The version of the AyLIB_net module.

```js
NET.ver()    // "0.5"
```

`NET` is the one module scope that is **not** attached by its first call: until a `FILE.*`
call, a `CON.ssh` / `PRO.smtp` / `PRO.ftp` / `PRO.sftp` connection or
`xdb_lib="AyLIB_net"` on the root has loaded the module, `NET.ver()` is a runtime error
(`'object variable not found'`). The protocols it carries are in
[Connection and protocol types](09_Connection_and_Protocol_Types.md).
