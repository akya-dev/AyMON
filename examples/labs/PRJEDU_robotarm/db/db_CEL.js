// =====================================================================
// CEL/S00 - the cell controller.
//
//   on_reply(exc)  CN_DASH's pro_onparse: dashboard reply lines
//   tick(evt)      every 100 ms: the dashboard queue, the status
//                  questions once a second, the feeder
//   handshake(evt) part of the tick: registers 128 and 131 with the robot
//                  program, and the parts count
//   on_cmd / on_feed / on_speed   the page's three requests
// =====================================================================

function start(evt)
{
    evt.Log(4, "CEL: cell controller - robot dashboard 127.0.0.1:29999, Modbus 127.0.0.1:1504, page http://127.0.0.1:8098/");
    return 0;
}

// Milliseconds now, as a float. Time.GetTimeMs() is an UNSIGNED 64-bit
// integer: 'now - t' with a t written a moment later by another thread
// is not -5 but 18446744073709551611. Floats first.
function ms() { return 0.0 + Time.GetTimeMs(); }

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function num(evt, id)    { return parseFloat("" + get(evt, id)); }
function inum(evt, id)   { return parseInt("" + get(evt, id)); }

// the last n items of an array
function last(a, n)
{
    if (a.length <= n) return a;
    var r = [];
    for (var i = a.length - n; i < a.length; i++) r.push(a[i]);
    return r;
}

function say(evt, txt)
{
    set(evt, "MSG", txt);
    evt.Log(4, "CEL: " + txt);
}

function dash() { return xdb.con["CN_DASH"]; }

// connected: the connection's main session is RUNNING (low nibble 3)
function dash_up()
{
    var ses = dash().get_ses(0);
    return ses && (parseInt("" + ses.sta) & 15) == 3;
}

// ---- sending --------------------------------------------------------------------
//
// A line to the dashboard. To send from outside a hook, an exchange needs
// a session: get_ses(0) is the connection's main session.
function dash_send(evt, txt)
{
    var ses = dash().get_ses(0);
    if (!ses) return 1;
    var exc = new CON_EXC(evt, ses);
    exc.buf_send.append((txt + "\n").toS08());
    var res = exc.send();
    exc = 0;
    if (res != 0) evt.Log(3, "CEL: could not send '" + txt + "' (" + res + ")");
    return res;
}

// The next command from the queue, if nothing is waiting for a reply.
// The caller holds the connection's lock.
function pump(evt)
{
    if ("" + get(evt, "BUSY")) return;
    var q = "" + get(evt, "QUEUE");
    if (!q) return;
    var i = q.indexOf("|");
    var cmd = i < 0 ? q : q.substring(0, i);
    set(evt, "QUEUE", i < 0 ? "" : q.substring(i + 1));
    set(evt, "BUSY", cmd);
    set(evt, "BUSY_MS", ms());
    dash_send(evt, cmd);
}

// Operator commands go before the status questions still queued.
function q_add(evt, cmd, first)
{
    var con = dash();
    con.lock(1000);
    try {
        var q = "" + get(evt, "QUEUE");
        if (first) set(evt, "QUEUE", q ? cmd + "|" + q : cmd);
        else       set(evt, "QUEUE", q ? q + "|" + cmd : cmd);
        pump(evt);
    } catch (e) {
        evt.Log(3, "CEL: q_add: " + e.message);
    } finally {
        con.unlock();
    }
}

// ---- what comes back ------------------------------------------------------------
//
// Lines, not packets: a reply may arrive in two pieces, or two replies in
// one. The first line of a new connection is a greeting, not an answer.
function on_reply(exc)
{
    var evt = exc.evt;
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    if (n <= 0) { exc.buf_recv.nxt = 256; return RES.INF_SUB_CONTINUE; }
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);
    exc.buf_recv.pos = exc.buf_recv.len;

    var carry = exc.ses.mem.carry;
    var lines = ((carry ? carry : "") + CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401)).split("\n");
    exc.ses.mem.carry = lines[lines.length - 1];

    var con = dash();
    con.lock(1000);
    try {
        for (var i = 0; i < lines.length - 1; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            if (line.indexOf("Connected: ") == 0) {
                set(evt, "LINK", 1);
                say(evt, "the robot's dashboard says: " + line);
                continue;
            }
            var busy = "" + get(evt, "BUSY");
            if (!busy) { evt.Log(4, "CEL: a reply to nothing: '" + line + "'"); continue; }
            use_reply(evt, busy, line);
            set(evt, "BUSY", "");
        }
        pump(evt);                        // the next one, at once
    } catch (e) {
        evt.Log(3, "CEL: on_reply: " + e.message);
    } finally {
        con.unlock();
    }
    return RES.OKY;
}

function use_reply(evt, cmd, line)
{
    if (cmd == "robotmode" && line.indexOf("Robotmode: ") == 0) {
        set(evt, "ROBOTMODE", line.substring(11).trim());
        return;
    }
    if (cmd == "safetystatus" && line.indexOf("Safetystatus: ") == 0) {
        var s = line.substring(14).trim();
        set(evt, "SAFETY", s);
        set(evt, "SAFETY_CODE", s == "NORMAL" ? 0 : s == "PROTECTIVE_STOP" ? 1 : s == "SAFEGUARD_STOP" ? 2 : 3);
        return;
    }
    if (cmd == "programState") {
        var sp = line.indexOf(" ");
        set(evt, "PSTATE", sp < 0 ? line : line.substring(0, sp));
        var p = sp < 0 ? "" : line.substring(sp + 1).trim();
        set(evt, "PROGRAM", p == "<unnamed>" ? "" : p);
        return;
    }
    // an operator command: into the log the page shows
    var log = JSON.parse(get(evt, "DASH_LOG"));
    log.push({ t: Time.GetTimeStr(0).substring(11, 19), cmd: cmd, reply: line });
    log = last(log, 10);
    set(evt, "DASH_LOG", JSON.stringify(log));
    var refused = line.indexOf("Failed") == 0 || line.indexOf("could not") == 0
                  || line.indexOf("Cannot") == 0 || line.indexOf("File not found") == 0;
    say(evt, (refused ? "the robot refused '" : "'") + cmd + "': " + line);
}

// ---- the tick -------------------------------------------------------------------

function tick(evt)
{
    var now = ms();
    var up = dash_up();
    if (!up && inum(evt, "LINK") == 1) {
        set(evt, "LINK", 0);
        set(evt, "ROBOTMODE", "");
        set(evt, "SAFETY", "");
        set(evt, "PSTATE", "");
        say(evt, "the robot's dashboard is gone - dialling again");
    }

    var con = dash();
    con.lock(1000);
    try {
        if (!up) {
            set(evt, "BUSY", "");
            set(evt, "QUEUE", "");
        } else {
            // a reply that never came
            var busy = "" + get(evt, "BUSY");
            if (busy && now - num(evt, "BUSY_MS") > 1000.0 * num(evt, "REPLY_TMO")) {
                set(evt, "TIMEOUTS", inum(evt, "TIMEOUTS") + 1);
                evt.Log(3, "CEL: no reply to '" + busy + "'");
                set(evt, "BUSY", "");
            }
            // the status questions, once a second, unless some are still queued
            if (now - num(evt, "POLL_MS") >= 1000.0 && ("" + get(evt, "QUEUE")).indexOf("robotmode") < 0) {
                set(evt, "POLL_MS", now);
                set(evt, "POLLS", inum(evt, "POLLS") + 3);
                var q = "" + get(evt, "QUEUE");
                var add = "robotmode|safetystatus|programState";
                set(evt, "QUEUE", q ? q + "|" + add : add);
            }
            pump(evt);
        }
    } catch (e) {
        evt.Log(3, "CEL: tick: " + e.message);
    } finally {
        con.unlock();
    }

    handshake(evt, now);

    // the feeder: a part every FEED_S seconds, while it runs and there is room
    if (inum(evt, "FEED") == 1 && inum(evt, "INFEED") < inum(evt, "INFEED_MAX")
        && now - num(evt, "FEED_MS") >= 1000.0 * num(evt, "FEED_S")) {
        set(evt, "FEED_MS", now);
        set(evt, "INFEED", inum(evt, "INFEED") + 1);
    }
    return 0;
}

// ---- the handshake --------------------------------------------------------------
//
// Every tick. PART_READY and TAKEN are registers 128 and 131 as the last
// poll read them.
//   a part waits, 128 is 0 and the robot is not holding a 'taken'  -> 128 = 1
//   the robot says taken (131) while 128 is 1                      -> 128 = 0
// and a part leaves the infeed on the EDGE of 131 (0 -> 1), not on its
// level: the level lasts several polls, and each would count it again.
// A write takes a poll to show; PR_MS keeps the cell from writing the
// same thing twice in that time.
function handshake(evt, now)
{
    var ready = parseInt("" + evt.GetValue("id('PART_READY')/@pro"));
    var taken = parseInt("" + evt.GetValue("id('TAKEN')/@pro"));

    // a part leaves the infeed once: on the robot's 'taken' going 0 -> 1
    if (taken == 1 && inum(evt, "TAKEN_SEEN") == 0 && inum(evt, "INFEED") > 0)
        set(evt, "INFEED", inum(evt, "INFEED") - 1);
    set(evt, "TAKEN_SEEN", taken);

    if (now - num(evt, "PR_MS") > 300.0) {
        if (ready == 0 && taken == 0 && inum(evt, "INFEED") > 0) {
            evt.SetValue("id('W_READY')/@pro", 1);
            set(evt, "PR_MS", now);
        } else if (ready == 1 && taken == 1) {
            evt.SetValue("id('W_READY')/@pro", 0);
            set(evt, "PR_MS", now);
        }
    }

    // parts put down: register 129 counts; the cell times them
    var placed = parseInt("" + evt.GetValue("id('PLACED')/@pro"));
    var seen = inum(evt, "PLACED_SEEN");
    if (seen >= 0 && placed > seen) {
        var at = JSON.parse(get(evt, "PLACED_AT"));
        if (at.length > 0) set(evt, "CYCLE_S", 0.1 * Math.round((now - at[at.length - 1]) / 100.0));   // now is a float: float arithmetic
        at.push(now);
        at = last(at, 6);
        set(evt, "PLACED_AT", JSON.stringify(at));
        if (at.length > 1)
            set(evt, "RATE", Math.round(10.0 * (at.length - 1) / ((0.0 + at[at.length - 1] - at[0]) / 60000.0)) / 10.0);
    }
    set(evt, "PLACED_SEEN", placed);
}

// ---- the page's requests ---------------------------------------------------------

// val_fnc of CMD. The attribute still holds the old value; the request is evt.valn.
function on_cmd(evt)
{
    var line = ("" + evt.valn).trim();
    if (!line) return 0;
    var c = line.toLowerCase();
    var known = "|power on|power off|brake release|play|pause|stop|unlock protective stop|close safety popup|";
    var ok = known.indexOf("|" + c + "|") >= 0 || c.indexOf("load ") == 0;
    if (!ok) { say(evt, "refused: '" + line + "' is not a dashboard command this cell sends"); return 0; }
    if (!dash_up()) { say(evt, "refused: the robot's dashboard is not connected"); return 0; }

    // the cell's rules
    var mode = "" + get(evt, "ROBOTMODE"), safety = "" + get(evt, "SAFETY"), ps = "" + get(evt, "PSTATE");
    if (c == "play" && mode != "RUNNING") { say(evt, "refused: play needs the robot RUNNING (it is " + mode + ") - power on, brake release"); return 0; }
    if (c == "play" && safety != "NORMAL") { say(evt, "refused: play needs safety NORMAL (it is " + safety + ")"); return 0; }
    if (c == "play" && !("" + get(evt, "PROGRAM"))) { say(evt, "refused: no program loaded"); return 0; }
    if (c == "power off" && ps == "PLAYING") { say(evt, "refused: stop the program before power off"); return 0; }

    // pause and stop jump the queue
    q_add(evt, c.indexOf("load ") == 0 ? line : c, c == "pause" || c == "stop");
    return 0;
}

function on_feed(evt)
{
    var on = parseInt("" + evt.valn) == 1;
    if (on) set(evt, "FEED_MS", ms());
    say(evt, on ? "the feeder runs: a part every " + get(evt, "FEED_S") + " s" : "the feeder stops");
    return 0;
}

// val_fnc of SPEED: 10..100 %, written to register 132 for the robot program.
function on_speed(evt)
{
    var v = parseInt("" + evt.valn);
    if (!(v >= 10)) v = 10;
    if (v > 100) v = 100;
    evt.SetValue("id('W_SPEED')/@pro", v);
    return 0;
}
