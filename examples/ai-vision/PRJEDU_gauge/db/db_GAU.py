# =====================================================================
# GAU/S00 - the Python side: a camera that looks at a dial gauge, and a
# reader that works out what the gauge says.
#
# How the engine runs this file (AyMON's Python module, AyLIB_Python):
#   init(xdb)    once, after the file is compiled. It fills xdb_evt: one
#                row per element this script looks after.
#   the row      ["IMG", "val", cam_init, cam_loop, cam_done, state]
#                cam_loop runs every thr_per (100 ms, set on the
#                <script>) and takes a picture when one is due; whatever
#                it puts in evt.valn the engine writes to IMG/@val
#                afterwards (only the old way, PATH 0, uses that).
#   xdb.GetValue / xdb.SetValue   read and write any element, exactly as
#                a JScript function would; a write runs the element's
#                val_fnc chain (PRESS: rounding and alarms).
#
# How a picture travels (PATH, the page chooses):
#   1, 2   the frame goes to the engine as a numpy array: FRAME/@val is a
#          blob, one copy on the way in. The script measures it natively
#          (main.on_frame), this file reads the gauge from the engine's
#          own bytes (xdb.GetValue gives a read-only numpy view, no copy),
#          and the same blob, handed back to PIC/@val, is encoded by the
#          engine (main.encode, IMG.encode). The page fetches it over HTTP.
#   0      the old way, kept to compare: a PNG written here by hand,
#          base64 in a string, published over MQTT like any value.
#
# Only numpy and the standard library.
# =====================================================================
from XDB import *
import base64
import math
import struct
import sys
import time
import zlib

try:
    import numpy as np
    np_error = ""
except ImportError as e:         # reported in init(), where xdb can log it
    np = None
    np_error = (str(e) or repr(e)) + (" <- " + repr(e.__cause__) if e.__cause__ else "")         + (" <- " + repr(e.__context__) if e.__context__ and e.__context__ is not e.__cause__ else "")

xdb = None
xdb_evt = []

N = 240                          # the dial's picture is N x N pixels, grey

# SIZE 1: a 640 x 480 camera that sees a panel with the dial on it. The
# dial's N x N region starts at ROI_BIG; the reader looks at that region only.
BIG_W, BIG_H = 640, 480
ROI_BIG = (200, 120)
PERIOD_MS = (1000.0, 100.0)      # SIZE 0: one frame a second, SIZE 1: ten

# THE GAUGE ITSELF - the physical dial the camera looks at. The camera draws
# this one, and it never changes. The CAL_* elements are what the READER
# believes about it: set them wrong and the reading is wrong, as with a
# real gauge measured badly.
GAUGE = {"v0": 0.0, "v1": 10.0, "a0": -135.0, "a1": 135.0, "r": 100.0}


def init(xdb_in):
    global xdb, xdb_evt
    xdb = xdb_in
    if np is None:
        how = "py -3.11 -m pip install numpy" if sys.platform == "win32" else "python3.11 -m pip install numpy"
        # numpy's own message runs over many lines; a log line is one
        xdb.Log(0, "GAU: numpy could not be imported - " + " | ".join(l.strip() for l in np_error.splitlines() if l.strip()))
        xdb.Log(0, "GAU: not installed for this Python? run:  " + how)
        xdb.Log(4, "GAU: this Python looks for packages in: " + ", ".join(sys.path))
        return
    xdb.Log(4, "GAU: Python " + ".".join(str(x) for x in sys.version_info[:3])
            + ", numpy " + np.__version__ + " - pictures travel as blobs")
    xdb_evt = [
        # 0:id   1:atr  2:init    3:loop    4:done    5:arg (state kept between frames)
        ["IMG", "val", cam_init, cam_loop, cam_done, {}],
    ]


# ---- reading the configuration ---------------------------------------------

def num(id_, default=0.0):
    v = xdb.GetValue("id('" + id_ + "')/@val")
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def calibration():
    return {"v0": num("CAL_V0"), "v1": num("CAL_V1", 10.0),
            "a0": num("CAL_A0", -135.0), "a1": num("CAL_A1", 135.0),
            "r": num("CAL_R", 100.0)}


def value_to_angle(v, cal):
    return cal["a0"] + (v - cal["v0"]) / (cal["v1"] - cal["v0"]) * (cal["a1"] - cal["a0"])


def angle_to_value(a, cal):
    return cal["v0"] + (a - cal["a0"]) / (cal["a1"] - cal["a0"]) * (cal["v1"] - cal["v0"])


# =====================================================================
# THE CAMERA
#
# The dial is drawn once, in cam_init, and kept. Each frame moves it (a
# knocked camera), draws the needle where TRUE puts it, and adds what a
# real camera adds. Drawing is done with distance fields: for every pixel,
# how far it is from the shape, turned into coverage with a one-pixel soft
# edge - which is also how the picture gets its anti-aliasing.
# =====================================================================

# A 5 x 7 font, digits only - enough for the dial's numbers.
FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}


def cover(d):
    """Coverage of a shape at signed distance d (negative = inside)."""
    return np.clip(0.5 - d, 0.0, 1.0)


def paint(img, c, shade):
    """Lay colour 'shade' over img where the coverage is c."""
    return img * (1.0 - c) + shade * c


def draw_dial(cal):
    """The dial without its needle, centred in the picture."""
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    cx = cy = N / 2.0
    R = cal["r"]
    dx, dy = xx - cx, yy - cy
    r = np.hypot(dx, dy)
    theta = np.degrees(np.arctan2(dx, -dy))           # clockwise from 12 o'clock

    img = 0.42 + 0.12 * yy / N                        # the wall behind the gauge
    img = paint(img, cover(np.abs(r - (R + 5.0)) - 5.0), 0.22)    # the bezel
    img = paint(img, cover(r - R), 0.93)                           # the face

    # the band from 8.5 bar to the end of the scale
    a_lo, a_hi = value_to_angle(8.5, cal), cal["a1"]
    band = (theta >= a_lo) & (theta <= a_hi)
    img = paint(img, cover(np.abs(r - (R - 9.0)) - 3.0) * band, 0.55)

    # ticks: every 0.5 bar, the whole bars longer
    steps = int(round((cal["v1"] - cal["v0"]) / 0.5))
    for i in range(steps + 1):
        v = cal["v0"] + 0.5 * i
        a = math.radians(value_to_angle(v, cal))
        along = dx * math.sin(a) - dy * math.cos(a)   # distance along the tick's ray
        perp = np.abs(dx * math.cos(a) + dy * math.sin(a))
        major = (i % 2 == 0)
        inner = R - (16.0 if major else 9.0)
        width = 1.6 if major else 0.8
        c = cover(perp - width) * cover(inner - along) * cover(along - (R - 3.0))
        img = paint(img, c, 0.12)

        if major:                                     # the number under the tick
            txt = str(int(round(v)))
            s = 2                                     # 2 px per font bit
            w = len(txt) * 6 * s - s
            h = 7 * s
            tx = int(round(cx + 0.66 * R * math.sin(a) - w / 2.0))
            ty = int(round(cy - 0.66 * R * math.cos(a) - h / 2.0))
            for k, ch in enumerate(txt):
                for row, bits in enumerate(FONT[ch]):
                    for col, b in enumerate(bits):
                        if b == "1":
                            x0 = tx + (k * 6 + col) * s
                            y0 = ty + row * s
                            img[y0:y0 + s, x0:x0 + s] = 0.15
    return img.astype(np.float32)


def draw_frame(st, true_value, noise):
    """One picture: the dial, moved; the needle; and the camera's trouble.
    Returns the picture (0..1) and what was done to it, for the log."""
    rng = st["rng"]
    cal = GAUGE                                       # the camera draws the real dial
    R = cal["r"]

    # a knocked camera: the dial is a few pixels off where it was
    sx = sy = 0
    if noise >= 3:
        sx, sy = st["knock"]
        if rng.random() < 0.02:                       # now and then, knocked again
            st["knock"] = (int(rng.integers(-8, 9)), int(rng.integers(-8, 9)))
    img = np.roll(st["dial"], (sy, sx), axis=(0, 1))

    cx, cy = N / 2.0 + sx, N / 2.0 + sy
    dx, dy = st["xx"] - cx, st["yy"] - cy

    # the needle: tapering, with a short tail behind the pivot
    wobble = rng.normal(0.0, 0.4) if noise >= 1 else 0.0     # it vibrates
    a = math.radians(value_to_angle(true_value, cal) + wobble)
    along = dx * math.sin(a) - dy * math.cos(a)
    perp = np.abs(dx * math.cos(a) + dy * math.sin(a))
    tip, tail = 0.82 * R, 0.18 * R
    half = 2.4 - 1.5 * np.clip(along / tip, 0.0, 1.0)
    img = paint(img, cover(perp - half) * cover(along - tip) * cover(-tail - along), 0.08)
    img = paint(img, cover(np.hypot(dx, dy) - 7.0), 0.18)          # the pivot

    trouble = []
    if noise >= 1:                                    # a cheap lens: blur
        img = sum(np.roll(img, (i, j), axis=(0, 1)) for i in (-1, 0, 1) for j in (-1, 0, 1)) / 9.0
    if noise >= 2:                                    # light from one side
        ang = rng.uniform(0, 2 * math.pi)
        img = img * (0.8 + 0.25 * ((st["xx"] - N / 2) * math.cos(ang) + (st["yy"] - N / 2) * math.sin(ang)) / N)
        if rng.random() < 0.4:                        # glare off the glass
            gx, gy = rng.uniform(cx - R * 0.7, cx + R * 0.7), rng.uniform(cy - R * 0.7, cy + R * 0.7)
            img = img + 0.75 * np.exp(-((st["xx"] - gx) ** 2 + (st["yy"] - gy) ** 2) / (2 * 16.0 ** 2))
            trouble.append("glare")
    if noise >= 3 and rng.random() < 0.25:            # someone walks past
        hx, hy = rng.uniform(cx - R * 0.5, cx + R * 0.5), rng.uniform(cy - R * 0.5, cy + R * 0.5)
        img = img - 0.6 * np.exp(-((st["xx"] - hx) ** 2 + (st["yy"] - hy) ** 2) / (2 * 30.0 ** 2))
        trouble.append("shadow")
    if noise >= 3 and (sx or sy):
        trouble.append("camera moved %d,%d px" % (sx, sy))
    sigma = (0.01, 0.03, 0.05, 0.08)[int(noise)]      # sensor noise
    img = img + rng.normal(0.0, sigma, img.shape)
    return np.clip(img, 0.0, 1.0).astype(np.float32), trouble


# =====================================================================
# THE READER - what would run on a real camera's picture, unchanged
#
#   1  find the dial: the bright disc of the face, near where it should
#      be. Its centroid is the pivot, even if the camera has moved.
#   2  find the needle: look along rays from the pivot, every half degree
#      over the scale, and average the brightness between the numbers and
#      the pivot. The needle is the ray most darker than its neighbours
#      (METHOD 0), or simply the darkest ray (METHOD 1, the first version).
#   3  turn the angle into bar with the calibration.
#   4  say how sure it is: how much darker the needle is than the face,
#      and how far ahead of the second-darkest ray.
# =====================================================================

def read_gauge(img, cal, st, method=0):
    R = cal["r"]

    # 1 - the dial's centre
    c0 = N / 2.0
    win = st["near"]                                  # pixels within R+15 of where it should be
    vals = img[win]
    lo, hi = np.percentile(vals, 20), np.percentile(vals, 95)
    face = win.copy()
    face[win] = vals > (lo + hi) / 2.0
    if face.sum() < 100:
        return None
    cy, cx = float(st["yy"][face].mean()), float(st["xx"][face].mean())
    if math.hypot(cx - c0, cy - c0) > 20:            # that is not the dial
        return None

    # 2 - the darkest ray
    angles = st["angles"]
    ar = np.radians(angles)[:, None]
    radii = np.linspace(0.18 * R, 0.55 * R, 24)[None, :]
    px = np.clip(np.rint(cx + radii * np.sin(ar)), 0, N - 1).astype(int)
    py = np.clip(np.rint(cy - radii * np.cos(ar)), 0, N - 1).astype(int)
    profile = img[py, px].mean(axis=1)

    # METHOD 0: light and shadow change slowly with the angle, a needle does
    # not. Take away the average of the 30 degrees around each ray, and what
    # is left is how much darker a ray is than its neighbourhood. A shadow is
    # wide and mostly cancels out; the needle is narrow and stays.
    # METHOD 1, the first version: how much darker than the dial as a whole.
    # Simpler, and fooled by the first shadow that is darker than the needle.
    if method == 1:
        local = np.full_like(profile, np.median(profile))
    else:
        k = 61                                        # 30 degrees at 0.5 degree steps
        padded = np.pad(profile, k // 2, mode="reflect")
        local = np.convolve(padded, np.ones(k) / k, mode="valid")
    dip = local - profile                             # > 0: darker than around it
    dip = np.convolve(dip, [0.25, 0.5, 0.25], mode="same")
    i = int(np.argmax(dip))

    # sub-degree: the vertex of a parabola through the three best points
    a_best = float(angles[i])
    if 0 < i < len(angles) - 1:
        y0, y1, y2 = dip[i - 1], dip[i], dip[i + 1]
        den = y0 - 2 * y1 + y2
        if den < -1e-6:
            a_best += float(0.5 * (y0 - y2) / den * (angles[1] - angles[0]))

    # 4 - how sure: how deep the needle is against the face around it, and
    # how far ahead of the best candidate more than 12 degrees away
    depth = float(dip[i])
    away = np.abs(angles - angles[i]) > 12.0
    depth2 = float(dip[away].max()) if away.any() else 0.0
    contrast = min(1.0, max(0.0, depth / (0.4 * max(float(local[i]), 1e-3))))
    lead = min(1.0, max(0.0, 2.0 * (depth - depth2) / max(depth, 1e-3)))
    conf = contrast * lead

    # 3 - the value
    return {"angle": a_best, "value": angle_to_value(a_best, cal), "conf": conf, "cx": cx, "cy": cy}


# =====================================================================
# SIZE 1: THE BIGGER CAMERA - the dial is one part of what it sees
# =====================================================================

def draw_panel():
    """The panel around the dial, drawn once: a wall lit from above, a pipe
    and a nameplate. Only a background: nothing reads it."""
    yy, xx = np.mgrid[0:BIG_H, 0:BIG_W].astype(np.float32)
    img = 0.36 + 0.16 * yy / BIG_H + 0.04 * np.sin(xx / 53.0)
    pipe = np.clip(1.0 - np.abs(yy - 400.0) / 26.0, 0.0, 1.0)
    img = img * (1.0 - pipe) + (0.30 + 0.35 * np.clip(1.0 - np.abs(yy - 392.0) / 30.0, 0.0, 1.0)) * pipe
    img[60:92, 470:600] = 0.80                        # a nameplate
    img[66:86, 478:592] = 0.20
    img[360:380, 310:330] = 0.25                      # the gauge's stem into the pipe
    return np.clip(img, 0.0, 1.0).astype(np.float32)


def compose(st, small, noise):
    """The 640 x 480 frame: the panel, with its own sensor noise, and the
    dial's picture where the dial is."""
    sigma = (0.01, 0.03, 0.05, 0.08)[int(noise)]
    k = int(st["rng"].integers(0, len(st["pool"])))
    big = st["panel"] + sigma * np.roll(st["pool"][k], int(st["rng"].integers(0, BIG_W)), axis=1)
    x0, y0 = ROI_BIG
    big[y0:y0 + N, x0:x0 + N] = small
    return big


def holder(a):
    """The engine's XDB.Blob behind a numpy view of a blob. numpy puts a
    memoryview between the two (a.base is the memoryview, a.base.obj the
    blob), so follow the chain rather than trust a.base."""
    b = a
    while b is not None and not hasattr(b, "ptr"):
        b = getattr(b, "base", None) if not isinstance(b, memoryview) else b.obj
    return b


def to_u8(img):
    """0..1 floats to the 8-bit grey a camera delivers."""
    return (np.clip(img, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


# =====================================================================
# PATH 0, THE OLD WAY: a grey PNG written by hand, for a data: URL
# =====================================================================

def png_gray(a):
    h, w = a.shape
    raw = np.concatenate([np.zeros((h, 1), np.uint8), a], axis=1).tobytes()   # filter 0 per row

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))


# =====================================================================
# THE LOOP
# =====================================================================

def cam_init(evt, st):
    cal = calibration()
    st["cal"] = cal
    if "dial" not in st:
        st["dial"] = draw_dial(GAUGE)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    st["yy"], st["xx"] = yy, xx
    st["near"] = np.hypot(xx - N / 2.0, yy - N / 2.0) < cal["r"] + 15.0
    st["angles"] = np.arange(min(cal["a0"], cal["a1"]) - 8.0, max(cal["a0"], cal["a1"]) + 8.0, 0.5)
    st.setdefault("rng", np.random.default_rng())
    st.setdefault("knock", (5, -3))
    st.setdefault("last", "")
    st.setdefault("due", 0.0)
    st.setdefault("size", -1)
    st.setdefault("path", -1)
    evt.Log(4, "GAU: reader calibrated to %g..%g bar over %g..%g deg, radius %g px"
            % (cal["v0"], cal["v1"], cal["a0"], cal["a1"], cal["r"]))


def cam_loop(evt, st):
    size = int(min(1, max(0, num("SIZE", 0))))
    path = int(min(2, max(0, num("PATH", 2))))
    now = time.time() * 1000.0

    if size != st["size"]:                            # the camera was changed
        st["size"] = size
        st["due"] = 0.0
        if size == 1 and "panel" not in st:
            st["panel"] = draw_panel()
            st["pool"] = [st["rng"].normal(0.0, 1.0, (BIG_H, BIG_W)).astype(np.float32) for _ in range(4)]
        x0, y0 = ROI_BIG if size == 1 else (0, 0)
        xdb.SetValue("id('ROI_X')/@val", x0)
        xdb.SetValue("id('ROI_Y')/@val", y0)

    # the loop runs every 100 ms (thr_per); take a picture only when one is due
    if now < st["due"]:
        return
    period = PERIOD_MS[size]
    st["due"] = max(st["due"] + period, now + period / 2.0)   # keep the rate, never catch up in a burst

    if path != st["path"]:                            # the way changed: drop the other way's picture
        if path == 0:
            xdb.SetValue("id('PIC')/@val", "")
        elif st["path"] == 0:
            evt.valn = ""                             # IMG: the engine writes it after this call
        st["path"] = path

    t0 = time.perf_counter()
    cal = calibration()
    if cal != st["cal"]:                              # the calibration was changed
        cam_init(evt, st)
        cal = st["cal"]

    true_value = num("TRUE")
    noise = int(min(3, max(0, num("NOISE", 1))))
    method = int(num("METHOD", 0))
    x0, y0 = ROI_BIG if size == 1 else (0, 0)

    # THE CAMERA takes a picture: 8-bit grey, as a camera delivers it
    xdb.SetValue("id('CAP')/@val", now)
    small, trouble = draw_frame(st, true_value, noise)
    frame = to_u8(compose(st, small, noise) if size == 1 else small)
    frames = int(num("FRAMES")) + 1
    xdb.SetValue("id('FRAMES')/@val", frames)       # also the picture's number (main.encode)
    xdb.SetValue("id('SEEN')/@val", round(true_value, 3))    # TRUE moves on; this is the frame's

    if path == 0:
        view = frame                                  # the reader reads this file's own array
    else:
        # To the engine: one copy, and FRAME/@val is a blob; its val_fnc
        # (main.on_frame) has measured it by the time this returns. Read it
        # back: a read-only numpy view of the engine's bytes, no copy
        # (behind it, the engine's XDB.Blob holds the frame for as long as
        # the view lives).
        xdb.SetValue("id('FRAME')/@val", frame)
        view = xdb.GetValue("id('FRAME')/@val")
        blob = holder(view)
        at = "0x%X" % blob.ptr
        xdb.SetValue("id('SAME')/@val", 1 if at == xdb.GetValue("id('FRAME_AT')/@val") else 0)

    # THE READER, on the dial's region: a slice (still no copy), then the
    # reader's own floating-point copy to calculate with
    region = view[y0:y0 + N, x0:x0 + N].astype(np.float32) * (1.0 / 255.0)
    got = read_gauge(region, cal, st, method)

    # Every number handed to the engine is a plain float or int: the module
    # converts those, and a numpy scalar is stored as a number only in a
    # typed attribute - so the script writes float(x).
    if got is None:
        why = "no dial found"
        conf = 0.0
    else:
        conf = float(got["conf"])
        xdb.SetValue("id('ANGLE')/@val", round(float(got["angle"]), 2))
        xdb.SetValue("id('CX')/@val", round(float(got["cx"]), 1))
        xdb.SetValue("id('CY')/@val", round(float(got["cy"]), 1))
        why = "" if conf >= num("CONF_MIN", 0.3) else "confidence %.2f is below CONF_MIN" % conf
    xdb.SetValue("id('CONF')/@val", round(conf, 3))

    if why:
        xdb.SetValue("id('REJECTS')/@val", int(num("REJECTS")) + 1)
        read = "not used: " + why + ((" (" + ", ".join(trouble) + ")") if trouble else "")
    else:
        xdb.SetValue("id('PRESS')/@val", float(got["value"]))            # the measurement
        xdb.SetValue("id('ERR')/@val", round(float(got["value"]) - true_value, 3))
        read = "ok" + ((" despite " + ", ".join(trouble)) if trouble else "")
    xdb.SetValue("id('READ')/@val", read)

    # say it in the log only when the verdict changes, not every frame
    kind = read.split(":")[0].split(" ")[0]
    if kind != st["last"]:
        st["last"] = kind
        evt.Log(4, "GAU: frame %d - %s" % (frames, read))

    # THE PICTURE FOR THE PAGE, last: the page takes it as "this frame is done"
    if path == 0:
        evt.valn = "data:image/png;base64," + base64.b64encode(png_gray(frame)).decode("ascii")
    else:
        xdb.SetValue("id('PIC')/@val", blob)         # the same blob, not a copy: main.encode makes the picture
    xdb.SetValue("id('MS')/@val", round((time.perf_counter() - t0) * 1000.0, 1))


def cam_done(evt, st):
    evt.Log(4, "GAU: camera off after %d frames" % int(num("FRAMES")))
