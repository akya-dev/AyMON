// =====================================================================
// LINE/S00 - the machine, ten steps a second.
//
// Reads ONE thing from the MES: the hold register (reg 6). Writes its
// state, the reason it knows, two counters and the product into
// registers 0..5, where the MES's next poll finds them.
//
// Script arithmetic takes the type of its LEFT operand: an integer on
// the left makes the whole expression an integer (5 / 2.0 is 2). Every
// sum that must stay a fraction starts with 0.0 +.
// =====================================================================

function start(evt)
{
    evt.Log(4, "LINE: making parts - Modbus TCP 127.0.0.1:1505, unit 1, registers 0..6");
    return 0;
}

function geti(evt, id)   { return parseInt("" + evt.GetValue("id('" + id + "')/@val")); }
function getf(evt, id)   { return parseFloat("" + evt.GetValue("id('" + id + "')/@val")); }
function getms(evt, id)  { return evt.GetValue("id('" + id + "')/@val"); }   // a signed 64-bit attribute
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function reg(evt, id)    { return parseInt("" + evt.GetValue("id('" + id + "')/@pro")); }
function setreg(evt, id, v)
{
    // only when it changes: every write is an event
    if (reg(evt, id) != v) evt.SetValue("id('" + id + "')/@pro", v);
}

// A request from the page: 1 = do it. It waits while the machine is not
// running (a jam cannot break down), and is reset when it is done.
function request(evt, id)  { return geti(evt, id) == 1; }
function done(evt, id)     { set(evt, id, 0); }

// a whole number of milliseconds between lo and hi seconds
function rnd_ms(lo, hi)
{
    return parseInt("" + (1000.0 * lo + 1000.0 * (hi - lo) * Math.random()));
}

function fault_text(r)
{
    if (r == 10) return "hydraulic pressure low";
    if (r == 11) return "motor overload";
    if (r == 12) return "sensor fault";
    return "fault " + r;
}

// Stop the machine. 'reason' is what it REPORTS (0 = it does not know),
// 'why' what really happened - only the log and this document know.
function stop_begin(evt, now, reason, dur_ms, why)
{
    set(evt, "MODE", "STOP");
    set(evt, "REASON", reason);
    set(evt, "WHY", why);
    set(evt, "STOP_MS", now);
    set(evt, "STOP_END_MS", now + dur_ms);
    evt.Log(4, "LINE: stopped - " + why + " (reports reason " + reason + ")");
}

function step(evt)
{
    var now = Time.GetTimeMs();
    var last = getms(evt, "LAST_MS");
    var dt_ms = (last > 0) ? now - last : 100;
    if (dt_ms < 0) dt_ms = 0;
    if (dt_ms > 1000) dt_ms = 1000;           // a late step does not make parts out of nothing
    set(evt, "LAST_MS", now);
    var dt = (0.0 + dt_ms) / 1000.0;

    var fault_now = request(evt, "FAULT_NOW");
    var jam_now   = request(evt, "JAM_NOW");
    var mat_now   = request(evt, "MATERIAL_NOW");
    var chg_now   = request(evt, "CHANGE_NOW");

    var mode = "" + evt.GetValue("id('MODE')/@val");
    var hold = reg(evt, "R_HOLD") == 1;

    // ---- a stop that has run its time ----
    if (mode == "STOP" && now >= getms(evt, "STOP_END_MS")) {
        var reason = geti(evt, "REASON");
        var took = (0.0 + (now - getms(evt, "STOP_MS"))) / 1000.0;
        if (reason == 30) {
            var p = geti(evt, "PRODUCT") == 1 ? 2 : 1;
            set(evt, "PRODUCT", p);
            set(evt, "LOT_LEFT", geti(evt, "LOT"));
            set(evt, "STARTUP_LEFT", geti(evt, "STARTUP"));
            set(evt, "PROGRESS", 0.0);
        }
        evt.Log(4, "LINE: running again after " + evt.GetValue("id('WHY')/@val") + ", "
                   + (0.0 + Math.round(took * 10.0)) / 10.0 + " s");
        set(evt, "REASON", 0);
        set(evt, "WHY", "");
        mode = "RUN";
        set(evt, "MODE", mode);
    }

    // ---- held by the MES for a planned stop ----
    if (mode == "RUN" && hold) {
        mode = "HOLD";
        set(evt, "MODE", mode);
        set(evt, "REASON", 90);
        set(evt, "WHY", "planned break (held by the MES)");
        set(evt, "STOP_MS", now);
        evt.Log(4, "LINE: held by the MES - planned break");
    }
    else if (mode == "HOLD" && !hold) {
        mode = "RUN";
        set(evt, "MODE", mode);
        set(evt, "REASON", 0);
        set(evt, "WHY", "");
        evt.Log(4, "LINE: released by the MES");
    }

    // ---- running: things go wrong, parts come out ----
    if (mode == "RUN") {
        var pf = geti(evt, "FAULT_EVERY_S"), pm = geti(evt, "MATERIAL_EVERY_S"), pj = geti(evt, "JAM_EVERY_S");
        if (fault_now || (pf > 0 && Math.random() < dt / pf)) {
            var r = 10 + parseInt("" + Math.floor(3.0 * Math.random()));
            stop_begin(evt, now, r, rnd_ms(15, 45), fault_text(r));
            if (fault_now) done(evt, "FAULT_NOW");
            mode = "STOP";
        }
        else if (mat_now || (pm > 0 && Math.random() < dt / pm)) {
            stop_begin(evt, now, 0, rnd_ms(10, 30), "no material");
            if (mat_now) done(evt, "MATERIAL_NOW");
            mode = "STOP";
        }
        else if (jam_now || (pj > 0 && Math.random() < dt / pj)) {
            stop_begin(evt, now, 0, rnd_ms(1, 4), "jam");
            if (jam_now) done(evt, "JAM_NOW");
            mode = "STOP";
        }
        else if (chg_now) {
            stop_begin(evt, now, 30, 1000 * geti(evt, "CHANGE_S"), "changeover (lot ended early)");
            done(evt, "CHANGE_NOW");
            mode = "STOP";
        }
    }
    if (mode == "RUN" && make_parts(evt, now, dt)) mode = "STOP";

    // ---- the registers ----
    // Two writes, and a poll can fall between them. Stopping: the reason
    // first, then the state; starting: the state first, then the reason -
    // so a poll never sees "stopped, no reason" that was not true.
    var st = mode == "RUN" ? 1 : (mode == "HOLD" ? 2 : 0), rs = mode == "RUN" ? 0 : geti(evt, "REASON");
    if (st == 1) { setreg(evt, "R_STATE", st); setreg(evt, "R_REASON", rs); }
    else         { setreg(evt, "R_REASON", rs); setreg(evt, "R_STATE", st); }
    setreg(evt, "R_PRODUCT", geti(evt, "PRODUCT"));
    return 0;
}

// Full speed, or a slow spell: a third of the time or so the line runs
// at SLOW_PCT % - worn tools, a careful operator, material that feeds
// badly. The machine does not say so; the MES sees it only as parts that
// come too slowly. Returns true if the lot ended and a changeover began.
function make_parts(evt, now, dt)
{
    var next_slow = getms(evt, "NEXT_SLOW_MS");
    if (next_slow == 0) { next_slow = now + rnd_ms(30, 90); set(evt, "NEXT_SLOW_MS", next_slow); }
    if (now >= next_slow) {
        var end = now + rnd_ms(20, 60);
        set(evt, "SLOW_END_MS", end);
        set(evt, "NEXT_SLOW_MS", end + rnd_ms(40, 120));
    }
    var speed = (now < getms(evt, "SLOW_END_MS")) ? getf(evt, "SLOW_PCT") / 100.0 : 1.0;

    var cycle_ms = geti(evt, geti(evt, "PRODUCT") == 1 ? "CYCLE_A_MS" : "CYCLE_B_MS");
    var progress = getf(evt, "PROGRESS") + dt * 1000.0 * speed / cycle_ms;

    var total = reg(evt, "R_TOTAL"), scrap = reg(evt, "R_SCRAP"), su = reg(evt, "R_SCRAP_SU");
    var startup = geti(evt, "STARTUP_LEFT"), lot_left = geti(evt, "LOT_LEFT");
    var made = 0, bad = 0, stopped = false;
    while (progress >= 1.0) {
        progress = progress - 1.0;
        var is_bad = (startup > 0) ? (Math.random() < 0.333) : (Math.random() * 100.0 < getf(evt, "SCRAP_PCT"));
        total = (total + 1) & 0xFFFF;                 // a 16-bit register: 65535 + 1 = 0
        made++;
        if (is_bad) {
            scrap = (scrap + 1) & 0xFFFF;
            bad++;
            if (startup > 0) su = (su + 1) & 0xFFFF;
        }
        if (startup > 0) startup--;
        lot_left--;
        if (lot_left <= 0) {
            stop_begin(evt, now, 30, 1000 * geti(evt, "CHANGE_S"), "changeover");
            progress = 0.0;
            stopped = true;
            break;
        }
    }
    set(evt, "PROGRESS", progress);
    if (made > 0) {
        setreg(evt, "R_TOTAL", total);
        setreg(evt, "R_SCRAP", scrap);
        setreg(evt, "R_SCRAP_SU", su);
        set(evt, "STARTUP_LEFT", startup);
        set(evt, "LOT_LEFT", lot_left);
        set(evt, "MADE", getms(evt, "MADE") + made);
        set(evt, "MADE_BAD", getms(evt, "MADE_BAD") + bad);
    }
    return stopped;
}
