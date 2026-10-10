// =====================================================================
// VIS/S00 - the inspection.
//
// inspect() is CN_INS's frm_fnc: it runs on TH_INS for every frame of the
// inspection window (a colour blob, the middle of the camera's picture),
// as often as INS_FPS lets frames through. It
//
//   1. finds the bottle: the liquid is amber, so the amber pixels below
//      the label (the "foot") say where the bottle is,
//   2. waits until the bottle is whole in the window and near its middle,
//      and inspects it ONCE:
//        cap      red pixels above the bottle: none = NO CAP; blue ones
//                 instead = WRONG CAP; red but too high = CAP HIGH (the
//                 box's masks cleaned first: an opening, IMG.erode then
//                 IMG.dilate, OPEN_K)
//        level    the top of the amber liquid: below the line = LOW FILL
//   3. counts, draws what it found over the picture (SHOT) and keeps the
//      rejects' pictures (REJ0..REJ5).
//
// Every picture is a blob and every IMG.* function gives a NEW blob, so
// nothing here changes the camera's frame: CN_VIEW streams the same
// frames untouched.
//
// second() runs once a second on the same thread: from the camera's own
// frame number it knows how many bottles passed (the recording puts one
// in the middle of the picture every 8 frames), so a bottle that passed
// and was never inspected is counted as MISSED - and, as on a real line,
// rejected (it counts in REJ_PCT; it has no picture).
//
// Everything that is a number of the line - colours, the window, the
// limits - is an element in db_VIS.xml, read when it is needed.
// =====================================================================

var st = {
    inside: false,      // the last frame had a whole bottle in it
    seen: 0,            // when (ms)
    done: false,        // this bottle is inspected
    last: [],           // the last 20 verdicts, 1 = reject
    rejn: 0,            // rejects so far: the next picture goes to REJ(rejn % 6)
    rejinfo: [],        // what REJ_INFO says, newest first
    inspected_rec: 0,   // bottles inspected while the source was the recording
    base: 0,            // bottles that passed in earlier runs of the camera
    camseq: 0,          // the camera frame number seen last
    src_host: "",       // a new con_host for the camera, once it is off
    stale: -1           // tim of the frame a restarted camera left behind
};

function start(evt)
{
    evt.Log(4, "VIS: open http://127.0.0.1:8113/ - the line, the inspection and the rejects");
    // the window is configuration (WIN); the inspection connection takes it
    // as a live field: no reconnect
    evt.SetValue("id('CN_INS')/@con_cam_crop", evt.GetValue("id('WIN')/@val"));
    // the cameras this computer has: what con_host="usb:0" would open
    var l = CAM.list();
    var names = "";
    for (var i = 0; i < l.length; i++) names = names + (i ? ", " : "") + l[i].url + " '" + l[i].name + "'";
    evt.Log(4, "VIS: cameras on this computer: " + (l.length ? names : "none"));
    return 0;
}

// "13,110,80" -> [13, 110, 80]
function triple(evt, id)
{
    var p = String.split("" + evt.GetValue("id('" + id + "')/@val"), ",");
    return [parseInt(p[0]), parseInt(p[1]), parseInt(p[2])];
}
function num(evt, id) { return 0.0 + evt.GetValue("id('" + id + "')/@val"); }

// A colour mask, cleaned: an OPENING - erode, then dilate, with a k x k box.
// Specks smaller than the box (sensor noise, JPEG edges) go; a part bigger
// than the box keeps its shape. k 1 = the mask as it was (OPEN_K).
function clean(m, k)
{
    if (k <= 1) return m;
    return IMG.dilate(IMG.erode(m, k), k);
}
function count(evt, id, add) { evt.SetValue("id('" + id + "')/@val", evt.GetValue("id('" + id + "')/@val") + add); }

// ---------------------------------------------------------------------
// CN_INS frm_fnc: one frame of the inspection window
// ---------------------------------------------------------------------
function inspect(evt)
{
    var f = evt.valn;
    if ("" + f == "") return 0;                     // cleared: the camera stopped
    var t0 = Time.GetTimeMs();
    var w = f.w, h = f.h;

    // 1. the liquid, and the bottle's foot: the lowest big amber part
    // (not cleaned: IMG.label's smallest part, 50 px, already leaves specks out)
    var hsv = IMG.hsv(f);
    var liq = IMG.inrange(hsv, triple(evt, "LIQ_LO"), triple(evt, "LIQ_HI"));
    var parts = IMG.label(liq, 50, 16);
    var foot = null;
    var footMin = num(evt, "FOOT_MIN");
    for (var i = 0; i < parts.boxes.length; i++) {
        var b = parts.boxes[i];
        if (b.area < footMin) continue;
        if (foot == null || b.y + b.h > foot.y + foot.h) foot = b;
    }
    // whole in the window: not cut by its left or right edge
    var whole = foot != null && foot.x >= 2 && foot.x + foot.w <= w - 2 && foot.w >= 70;
    if (!whole) { st.inside = false; return 0; }

    var now = Time.GetTimeMs();
    if (!st.inside || now - st.seen > 450) st.done = false;   // a new bottle
    st.inside = true;
    st.seen = now;
    if (st.done) return 0;                          // this one is inspected already
    var cx = foot.cx;
    if (Math.abs(cx - w / 2) > num(evt, "CENTRE_TOL")) return 0;   // not near the middle yet
    st.done = true;

    // 2a. the level: the highest amber part above this bottle's foot
    var level = foot.y;
    for (var j = 0; j < parts.boxes.length; j++) {
        var p = parts.boxes[j];
        if (Math.abs(p.cx - cx) < 45 && p.y < level) level = p.y;
    }

    // 2b. the cap: a box above the bottle, as wide as a cap and a bit more
    var cx0 = Math.max(0, Math.round(cx - 35));
    var roi = { x: cx0, y: 0, w: Math.min(70, w - cx0), h: 80 };
    // the box alone, its colour masks cleaned: a speck counts as cap and
    // pulls the cap's middle, so it goes first (OPEN_K). Cut out before,
    // the cleaning costs a 70 x 80 box, not the window.
    var k = num(evt, "OPEN_K");
    var box = IMG.crop(hsv, roi.x, roi.y, roi.w, roi.h);
    var red  = clean(IMG.inrange(box, triple(evt, "CAP_LO"), triple(evt, "CAP_HI")), k);
    var blue = clean(IMG.inrange(box, triple(evt, "WRONG_LO"), triple(evt, "WRONG_HI")), k);
    var nred = IMG.count(red);
    var nblue = IMG.count(blue);
    var capMin = num(evt, "CAP_MIN");
    var capY = -1;
    if (nred >= capMin) capY = roi.y + IMG.moments(red).cy;

    // the verdict: the first fault found
    var why = "OK";
    if (nred < capMin) why = nblue >= capMin ? "WRONG CAP" : "NO CAP";
    else if (capY < num(evt, "CAP_Y_MIN")) why = "CAP HIGH";
    else if (level > num(evt, "FILL_Y_MAX")) why = "LOW FILL";

    // 3. the picture: the bottle, the cap box, the fill line, the verdict
    var good = why == "OK";
    var col = good ? [40, 200, 70] : [235, 40, 40];
    var o = IMG.rect(f, Math.round(cx - 48), 2, 96, foot.y + foot.h - 2, col, 3);
    o = IMG.rect(o, roi.x, roi.y, roi.w, roi.h, [250, 220, 0], 1);
    var fy = num(evt, "FILL_Y_MAX");
    o = IMG.line(o, Math.round(cx - 56), fy, Math.round(cx + 56), fy, [0, 190, 255], 1);
    o = IMG.line(o, Math.round(cx - 44), level, Math.round(cx + 44), level, [255, 0, 255], 1);
    o = IMG.rect(o, 0, h - 26, w, 26, col, 0);
    o = IMG.text(o, 6, h - 22, why, [255, 255, 255], 3);
    var jpg = IMG.encode(o, "jpeg", 85);

    var ms = Time.GetTimeMs() - t0;
    if (evt.GetValue("id('SRC')/@val") == 0) st.inspected_rec++;
    count(evt, "INSPECTED", 1);
    evt.SetValue("id('LAST')/@val", why);
    evt.SetValue("id('LEVEL')/@val", level);
    evt.SetValue("id('CAP_Y')/@val", capY);
    evt.SetValue("id('MS')/@val", ms);
    evt.SetValue("id('SHOT')/@val", jpg);
    if (good) count(evt, "GOOD", 1);
    else {
        if (why == "NO CAP")    count(evt, "NOCAP", 1);
        if (why == "WRONG CAP") count(evt, "WRONGCAP", 1);
        if (why == "CAP HIGH")  count(evt, "CAPHIGH", 1);
        if (why == "LOW FILL")  count(evt, "LOWFILL", 1);
        reject(evt, why, jpg);
    }
    verdict(evt, good ? 0 : 1);
    return 0;
}

// a reject's picture into the next of the six slots
function reject(evt, why, jpg)
{
    var slot = st.rejn % 6;
    st.rejn++;
    evt.SetValue("id('REJ" + slot + "')/@val", jpg);
    var e = { slot: slot, why: why, no: st.rejn, at: Time.GetTimeStr() };
    var list = [e];
    for (var i = 0; i < st.rejinfo.length && list.length < 6; i++)
        if (st.rejinfo[i].slot != slot) list.push(st.rejinfo[i]);
    st.rejinfo = list;
    evt.SetValue("id('REJ_INFO')/@val", JSON.stringify(list));
}

// the reject rate over the last 20 verdicts
function verdict(evt, bad)
{
    st.last.push(bad);
    if (st.last.length > 20) {
        var k = [];
        for (var i = st.last.length - 20; i < st.last.length; i++) k.push(st.last[i]);
        st.last = k;
    }
    var n = 0;
    for (var j = 0; j < st.last.length; j++) n = n + st.last[j];
    evt.SetValue("id('REJ_PCT')/@val", 100.0 * n / st.last.length);
}

// ---------------------------------------------------------------------
// Once a second (T_SEC, TH_INS)
// ---------------------------------------------------------------------

// Bottles that passed the middle of the picture by camera frame s: the
// recording has one there at frame 8k + 4 (tools/make_frames.py), and the
// camera delivers every recorded frame (CN_CAM con_cam_fps 0).
function passed_by(s)
{
    var i = 0 + s - 1;                  // 0 + first: s may come as an unsigned number,
                                        // and the left operand decides the arithmetic
    if (i < 4) return 0;
    return Math.floor((i - 4) / 8) + 1;
}

function second(evt)
{
    src_switch(evt);
    if (evt.GetValue("id('SRC')/@val") != 0) return 0;      // a real camera: nobody knows
    var fr = evt.GetValue("id('CN_CAM')/@frm");
    if ("" + fr == "") return 0;                            // the camera is off
    if (fr.tim == st.stale) return 0;   // the last frame of the run before
    var s = 0 + fr.seq;                 // the frame number: signed from here on
    if (s < st.camseq) st.base = st.base + passed_by(st.camseq);   // the camera started again
    st.camseq = s;
    // what had passed 0.6 s ago: a bottle inspected now passed then
    var passed = st.base + passed_by(s - 6);
    evt.SetValue("id('PASSED')/@val", passed > 0 ? passed : 0);   // just after a reset it lags
    var missed = evt.GetValue("id('MISSED')/@val");
    var gone = 0 + passed - st.inspected_rec - missed;
    if (gone > 1000) gone = 1000;       // more than a second's worth at 1000 frames a second: a bug
    for (var i = 0; i < gone; i++) {
        count(evt, "MISSED", 1);        // no picture: nobody looked at it
        verdict(evt, 1);
    }
    return 0;
}

// ---------------------------------------------------------------------
// What the page writes
// ---------------------------------------------------------------------
function on_ins_fps(evt)
{
    if (evt.valn == evt.valp) return 0;
    evt.SetValue("id('CN_INS')/@con_cam_fps", evt.valn);    // a live field: no reconnect
    evt.Log(4, "VIS: inspection " + evt.valp + " -> " + (evt.valn == 0 ? "every frame" : evt.valn + " frames a second"));
    return 0;
}

function on_view_fps(evt)
{
    if (evt.valn == evt.valp) return 0;
    evt.SetValue("id('CN_VIEW')/@con_cam_fps", evt.valn);
    return 0;
}

// CAM_ON is queued to TH_INS like SRC and SPEED: the counters' state is
// only ever touched on that thread.
function on_cam_on(evt)
{
    if (evt.valn == evt.valp) return 0;
    evt.Log(4, evt.valn == 1 ? "VIS: camera on" : "VIS: camera off - its two views wait, idle, until it delivers again");
    if (evt.valn == 1) cam_restarting(evt);
    evt.SetValue("id('CN_CAM')/@sta", evt.valn == 1 ? 0x0303 : 0x0000);
    return 0;
}

// The camera opens again and counts its frames from 1: the bottles of the
// run that ended are kept in st.base. Done here, where it is known, not
// guessed from a frame number that went down (at 1000 frames a second the
// new run may be past the old one before second() looks).
function cam_restarting(evt)
{
    var fr = evt.GetValue("id('CN_CAM')/@frm");
    if ("" + fr != "") {
        st.base = st.base + passed_by(0 + fr.seq);
        st.stale = fr.tim;          // that frame stays in frm until the new run's first
    }
    st.camseq = 0;
}

// SRC is queued to TH_INS (db_VIS.xml): it only leaves a note, second()
// does the rest. con_host is read when the connection opens and cannot be
// written while it runs, so: off, wait until it is off, write, on.
// what CN_CAM's con_host is for SRC and SPEED
function cam_host(src, speed)
{
    if (src == 1) return "usb:0";
    return "file:frames?fps=" + Math.round(speed) + "&loop=1";
}

// a new con_host for the camera: switch it off, second() does the rest
function cam_retarget(evt, host)
{
    st.src_host = host;
    evt.Log(4, "VIS: the camera becomes " + host + " - switching it off first");
    evt.SetValue("id('CN_CAM')/@sta", 0x0000);
}

function on_src(evt)
{
    if (evt.valn == evt.valp) return 0;
    cam_retarget(evt, cam_host(evt.valn, evt.GetValue("id('SPEED')/@val")));
    return 0;
}

// SPEED is queued to TH_INS like SRC. The recording only: a real camera
// gives what it gives (its value is used when SRC goes back to 0).
function on_speed(evt)
{
    if (evt.valn == evt.valp) return 0;
    if (evt.GetValue("id('SRC')/@val") != 0) return 0;
    cam_retarget(evt, cam_host(0, evt.valn));
    return 0;
}

// from second(): the camera is off now, give it its new source
function src_switch(evt)
{
    if (st.src_host == "") return;
    var sta = 0 + evt.GetValue("id('CN_CAM')/@sta");
    if ((sta & 0x000F) != 0) return;                         // not off yet
    evt.SetValue("id('CN_CAM')/@con_host", st.src_host);
    st.src_host = "";
    if (evt.GetValue("id('CAM_ON')/@val") == 1) {
        cam_restarting(evt);
        evt.SetValue("id('CN_CAM')/@sta", 0x0303);
    }
}

function on_reset(evt)
{
    if (evt.valn == evt.valp) return 0;
    var ids = ["INSPECTED", "GOOD", "NOCAP", "WRONGCAP", "CAPHIGH", "LOWFILL", "MISSED", "PASSED", "REJ_PCT"];
    for (var i = 0; i < ids.length; i++) evt.SetValue("id('" + ids[i] + "')/@val", 0);
    st.last = [];
    st.inspected_rec = 0;
    // count from here: the bottles that crossed the middle up to the frame
    // the camera has now are behind us (inspected or not)
    var fr = evt.GetValue("id('CN_CAM')/@frm");
    if ("" + fr != "") st.camseq = 0 + fr.seq;
    st.base = -passed_by(st.camseq + 1);
    evt.Log(4, "VIS: counters reset");
    return 0;
}
