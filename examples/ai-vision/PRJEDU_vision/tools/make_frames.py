# =====================================================================
# make_frames.py -- draws the conveyor the example's camera "sees".
#
# NOT needed to run the example: its output, frames/f000.jpg .. f127.jpg,
# is part of the repository. Run it again only to change the scene:
#
#     py -3 tools\make_frames.py          (needs Pillow and numpy)
#
# The scene, 640 x 480, ten frames a second, 128 frames = 12.8 s, a loop:
#   - a filling line seen from the side: a wall, a conveyor belt whose
#     slats move with the bottles, sixteen bottles a loop
#   - a bottle every 8 frames, 40 px a frame (320 px apart, one at a time
#     in the inspection window in the middle of the picture)
#   - bottle k is at x = 160 + 40 * (f - 8k): its centre crosses x = 320,
#     the middle, exactly at frame 8k + 4
#   - four of the sixteen are faulty, the rest are good:
#       2  NO CAP     the capper missed it
#       6  WRONG CAP  a blue cap from the other product
#       9  LOW FILL   the filler ran short
#      13  CAP HIGH   the cap is on but not pressed down
#   - what a real camera adds, a little: sensor noise, a light that
#     flickers slowly, JPEG
#
# The colours are chosen so the engine can tell them apart in HSV (OpenCV's
# 8-bit scale, H 0..179): the cap is orange-red (H about 4), the liquid
# yellow-amber (H about 20), the wrong cap blue (H about 110); the glass,
# the label, the wall and the belt are grey or white (low saturation).
# =====================================================================
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 640, 480
FRAMES = 128
PER = 8                    # frames between bottles
STEP = 40                  # px a frame
KINDS = ["ok"] * 16
KINDS[2] = "nocap"
KINDS[6] = "blue"
KINDS[9] = "low"
KINDS[13] = "high"

BELT_Y0, BELT_Y1 = 380, 424
CAP_RED = (222, 52, 22)
CAP_BLUE = (36, 84, 196)
LIQUID = (204, 150, 38)
GLASS = (196, 214, 220)
GLASS_EDGE = (120, 140, 150)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frames")


def background(f):
    img = Image.new("RGB", (W, H), (0, 0, 0))
    a = np.zeros((H, W, 3), np.float32)
    # the wall: light grey, a little darker towards the corners
    yy, xx = np.mgrid[0:H, 0:W]
    r = ((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2
    wall = 212 - 40 * r
    a[:, :, 0] = wall
    a[:, :, 1] = wall + 2
    a[:, :, 2] = wall + 4
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    # a cable tray and a sign on the wall, so the picture is not empty
    d.rectangle([0, 40, W, 52], fill=(150, 152, 156))
    d.rectangle([24, 120, 120, 170], fill=(240, 196, 40), outline=(60, 60, 60), width=2)
    d.text((34, 132), "LINE 2", fill=(30, 30, 30), font=font(16))
    d.text((34, 150), "FILLING", fill=(30, 30, 30), font=font(12))
    # the conveyor: a dark belt with slats that move with the bottles
    d.rectangle([0, BELT_Y0, W, BELT_Y1], fill=(58, 60, 64))
    off = (f * STEP) % 40
    for x in range(-40, W + 40, 40):
        d.line([x + off, BELT_Y0 + 2, x + off, BELT_Y1 - 2], fill=(84, 86, 90), width=3)
    d.rectangle([0, BELT_Y1, W, H], fill=(96, 100, 108))
    d.rectangle([0, BELT_Y1, W, BELT_Y1 + 6], fill=(150, 154, 160))
    for x in range(30, W, 120):
        d.ellipse([x - 6, BELT_Y1 + 18, x + 6, BELT_Y1 + 30], fill=(70, 72, 78))
    return img, d


_fonts = {}


def font(size):
    if size not in _fonts:
        try:
            _fonts[size] = ImageFont.truetype("arialbd.ttf", size)
        except OSError:
            try:
                _fonts[size] = ImageFont.truetype("DejaVuSans-Bold.ttf", size)
            except OSError:
                _fonts[size] = ImageFont.load_default()
    return _fonts[size]


def bottle(d, cx, kind, k):
    cx = int(round(cx))
    bot = BELT_Y0                      # stands on the belt
    top = bot - 200                    # the body, 200 px
    # body + shoulder + neck, glass
    d.rounded_rectangle([cx - 45, top, cx + 45, bot], radius=14, fill=GLASS, outline=GLASS_EDGE, width=2)
    d.polygon([(cx - 45, top + 8), (cx - 20, top - 30), (cx + 20, top - 30), (cx + 45, top + 8)],
              fill=GLASS, outline=GLASS_EDGE)
    d.rectangle([cx - 20, top - 62, cx + 20, top - 28], fill=GLASS, outline=GLASS_EDGE, width=2)
    # the liquid: up to the fill line (low fill: 70 px lower)
    fill_y = top + 20 if kind != "low" else top + 90
    d.rounded_rectangle([cx - 41, fill_y, cx + 41, bot - 6], radius=10, fill=LIQUID)
    d.line([cx - 41, fill_y, cx + 41, fill_y], fill=(180, 120, 20), width=2)
    # the label
    d.rectangle([cx - 44, top + 96, cx + 44, top + 150], fill=(246, 246, 240), outline=(170, 170, 170))
    d.text((cx - 34, top + 104), "AyMON", fill=(40, 40, 40), font=font(18))
    d.text((cx - 34, top + 128), "0.5 L  #%02d" % (k % 16 + 1), fill=(90, 90, 90), font=font(12))
    # the cap
    if kind == "nocap":
        d.rectangle([cx - 18, top - 66, cx + 18, top - 60], fill=GLASS_EDGE)   # the open neck
        return
    colour = CAP_BLUE if kind == "blue" else CAP_RED
    lift = 16 if kind == "high" else 0
    y0 = top - 90 - lift
    d.rounded_rectangle([cx - 25, y0, cx + 25, y0 + 30], radius=4, fill=colour, outline=(60, 30, 20))
    for i in range(-20, 21, 8):        # the ribs of the cap
        d.line([cx + i, y0 + 4, cx + i, y0 + 26], fill=tuple(int(c * 0.8) for c in colour), width=2)
    if lift:
        d.rectangle([cx - 20, y0 + 30, cx + 20, top - 60], fill=GLASS)     # the neck shows under it


def frame(f, rng):
    img, d = background(f)
    for k in range(-2, 18):
        x = 160 + STEP * (f - PER * k)
        if -60 <= x <= W + 60:
            bottle(d, x, KINDS[k % 16], k)
    a = np.asarray(img).astype(np.float32)
    a *= 1.0 + 0.04 * np.sin(f / 9.0)                       # the light
    a += rng.normal(0.0, 2.0, a.shape)                      # the sensor
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        if name.endswith(".jpg"):
            os.remove(os.path.join(OUT, name))
    rng = np.random.default_rng(549)
    total = 0
    for f in range(FRAMES):
        p = os.path.join(OUT, "f%03d.jpg" % f)
        frame(f, rng).save(p, quality=82)
        total += os.path.getsize(p)
    print("%d frames, %.1f MB in %s" % (FRAMES, total / 1e6, os.path.normpath(OUT)))


if __name__ == "__main__":
    main()
