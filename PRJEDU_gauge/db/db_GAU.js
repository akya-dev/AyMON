// =====================================================================
// GAU/S00 - the script side: the process the gauge is fitted to.
//
// A compressor fills a tank; the plant draws air from it. The compressor
// starts at 6 bar and stops at 8. Every two minutes the pressure switch
// sticks for a while and the pressure runs on towards 9.5 bar until the
// relief valve lifts - which is what the high alarms on PRESS are for.
//
// This writes TRUE, the value nobody can measure. The camera (db_GAU.py)
// draws the needle where TRUE puts it, and reads PRESS back from the
// picture.
//
// It also looks after the picture once Python has handed it over:
// on_frame measures the frame natively and encode turns it into the JPEG
// or PNG the page fetches. Both get the frame as a blob, the engine's own
// bytes; neither copies it. They run on the thread that wrote the frame,
// Python's, not on this document's thread.
// =====================================================================

function start(evt)
{
    evt.Log(4, "GAU: open http://127.0.0.1:8091/ - the picture, the reading, and how wrong it is");
    return 0;
}

// Twice a second, from the timer on <var id="T_SIM">.
function tick(evt)
{
    var n    = evt.GetValue("id('STEPS')/@val");
    var p    = evt.GetValue("id('TRUE')/@val");
    var comp = evt.GetValue("id('COMP')/@val");

    // what the plant draws, wandering
    var draw = 0.10 + 0.06 * Math.sin(n / 37.0) + 0.03 * Math.sin(n / 7.0);

    // the pressure switch - and, for the last 40 s of every two minutes,
    // a switch that sticks (steps are half seconds: 240 steps = 120 s)
    var stuck = (n % 240) >= 160;
    if ((n % 240) == 160) evt.Log(4, "GAU: the pressure switch sticks");
    if (comp == 1 && p > 8.0 && !stuck) comp = 0;
    if (comp == 0 && p < 6.0) comp = 1;
    if (p > 9.5) {
        // the relief valve lifts: a bar goes at once, and the compressor stops
        evt.Log(4, "GAU: relief valve lifted at " + Number.toFixed(p, 2) + " bar");
        comp = 0;
        p = p - 1.0;
    }

    p = p - draw;
    if (comp == 1) p = p + 0.22;
    if (p < 0.0) p = 0.0;

    if (comp != evt.GetValue("id('COMP')/@val"))
        evt.Log(4, "GAU: compressor " + (comp == 1 ? "ON" : "off") + " at " + Number.toFixed(p, 2) + " bar");

    evt.SetValue("id('TRUE')/@val", p);
    evt.SetValue("id('COMP')/@val", comp);
    evt.SetValue("id('STEPS')/@val", n + 1);
    return 0;
}

// The last link of NOISE's val_fnc, after rounding and clamping.
function on_noise(evt)
{
    if (evt.valn == evt.valp) return 0;             // the same value written again
    var names = ["clean", "noise and blur", "uneven light and glare", "shadows and a knocked camera"];
    evt.Log(4, "GAU: NOISE " + evt.valp + " -> " + evt.valn + " (" + names[Math.round(evt.valn)] + ")");
    return 0;
}

// The last link of METHOD's val_fnc.
function on_method(evt)
{
    if (evt.valn == evt.valp) return 0;             // the same value written again
    evt.Log(4, "GAU: METHOD " + evt.valp + " -> " + evt.valn
               + (evt.valn == 1 ? " (the darkest ray - the first version)" : " (darker than its neighbours)"));
    return 0;
}

// ---------------------------------------------------------------------
// THE PICTURE
// ---------------------------------------------------------------------

// FRAME's val_fnc: Python has just written a frame (a raw blob, u8 [h,w]).
// A second, native reading of the same bytes: how much light falls on the
// dial's face. IMG.stats is AyLIB_vision's; the region is the middle of the
// dial, wherever the dial sits in the frame.
function on_frame(evt)
{
    var f = evt.valn;
    if ("" + f == "") return 0;                     // an empty blob: nothing to measure
    var x = evt.GetValue("id('ROI_X')/@val");
    var y = evt.GetValue("id('ROI_Y')/@val");
    var s = IMG.stats(f, { x: x + 60, y: y + 60, w: 120, h: 120 });
    evt.SetValue("id('LIGHT')/@val", s.mean);
    evt.SetValue("id('FRAME_AT')/@val", f.ptr);     // Python compares its view with this
    return 0;
}

// PIC's val_fnc: Python writes the frame's blob here at the end of each
// frame. Replace it with the encoded picture before it is stored, and give
// it the frame's number: the page asks for a new picture when the number
// in the descriptor moves, and the HTTP answer carries it back
// (X-Blob-Seq, ETag). A frame from numpy carries no number of its own,
// so the encoded bytes are wrapped once more with one (Blob.from).
function encode(evt)
{
    var f = evt.valn;
    if ("" + f == "" || f.fmt != "raw") return 0;   // clearing it, or already a picture
    var e;
    if (evt.GetValue("id('PATH')/@val") == 1) e = IMG.encode(f, "png");
    else                                          e = IMG.encode(f, "jpeg", evt.GetValue("id('JPG_Q')/@val"));
    evt.valn = Blob.from(e.toBuffer(), { fmt: e.fmt, seq: evt.GetValue("id('FRAMES')/@val") });
    return 0;
}

// The last link of PATH's val_fnc.
function on_path(evt)
{
    if (evt.valn == evt.valp) return 0;             // the same value written again
    var names = ["base64 PNG in MQTT", "PNG blob over HTTP", "JPEG blob over HTTP"];
    evt.Log(4, "GAU: PATH " + evt.valp + " -> " + evt.valn + " (" + names[Math.round(evt.valn)] + ")");
    return 0;
}

// The last link of SIZE's val_fnc.
function on_size(evt)
{
    if (evt.valn == evt.valp) return 0;             // the same value written again
    evt.Log(4, "GAU: SIZE " + evt.valp + " -> " + evt.valn
               + (evt.valn == 1 ? " (640 x 480, ten frames a second)" : " (240 x 240, one frame a second)"));
    return 0;
}
