// =====================================================================
// TEL/S00 - the ground station.
//
// Who runs what, and on which thread:
//
//   on_cmd / on_mission / on_rc   val_fnc of CMD, MISSION, RC - whoever
//                                 wrote the request (the page: MQTT thread)
//   on_reply(exc)                 CN_TELLO's pro_onparse - an answer arrived
//   on_state(exc)                 CN_STATE's pro_onparse - a state line
//   tick(evt)                     every 0.1 s on TH_TEL - the sequencer,
//                                 the keep-alive, the safety rules
//
// Everything they share is a <var> of this document: QUEUE, BUSY and its
// timestamps. Three threads change QUEUE and BUSY, so a change that reads
// one and writes the other is made under CN_TELLO's script lock,
// con.lock() / con.unlock() - one lock, always the same one.
// =====================================================================

function start(evt)
{
    evt.Log(4, "TEL: ground station - Tello commands to UDP 8889, state from UDP 8890");
    evt.Log(4, "TEL: fly it from http://127.0.0.1:8090/");
    return 0;
}

// ---- small helpers ----------------------------------------------------------

function get(evt, id)     { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v)  { evt.SetValue("id('" + id + "')/@val", v); }

function say(evt, txt)
{
    set(evt, "MSG", txt);
    evt.Log(4, "TEL: " + txt);
}

function link() { return xdb.con["CN_TELLO"]; }

// ---- sending ------------------------------------------------------------------

// One datagram, one command. Nothing waits for the answer here: it
// arrives on its own, in on_reply.
//
// To send from outside a hook, an exchange needs a session: get_ses(0) is
// the connection's main session. (Not con.ses - on a <con> that is empty.)
function tello_send(evt, txt)
{
    var ses = link().get_ses(0);
    if (!ses) { evt.Log(3, "TEL: CN_TELLO has no session yet, '" + txt + "' not sent"); return 1; }
    var exc = new CON_EXC(evt, ses);
    exc.buf_send.append(txt.toS08());
    var res = exc.send();
    exc = 0;
    set(evt, "SENT_MS", Time.GetTimeMs());
    set(evt, "SENT", get(evt, "SENT") + 1);
    if (res != 0) evt.Log(3, "TEL: could not send '" + txt + "' (" + res + ")");
    return res;
}

// How long an answer may take. A move is answered when it ENDS.
function answer_tmo(cmd)
{
    var c = cmd.split(" ")[0];
    if (c == "command" || c == "speed" || c == "stop" || c == "emergency"
        || c == "streamon" || c == "streamoff" || c.indexOf("?") > 0) return 3000;
    return 30000;
}

// Send and remember what we wait for. The caller holds the lock.
function send_busy(evt, cmd)
{
    set(evt, "BUSY", cmd);
    set(evt, "BUSY_MS", Time.GetTimeMs());
    set(evt, "BUSY_TMO", answer_tmo(cmd));
    tello_send(evt, cmd);
}

// ---- the queue: QUEUE holds the commands, '|' between them ----------------------

function q_add(evt, cmds)
{
    var con = link();
    con.lock(1000);
    try {
        var q = get(evt, "QUEUE");
        for (var i = 0; i < cmds.length; i++)
            q = q ? q + "|" + cmds[i] : cmds[i];
        set(evt, "QUEUE", q);
    } catch (e) {
        evt.Log(3, "TEL: q_add: " + e.message);
    } finally {
        con.unlock();
    }
}

// land, stop, emergency: forget the queue and go out now
function send_now(evt, cmd)
{
    var con = link();
    con.lock(1000);
    try {
        set(evt, "QUEUE", "");
        send_busy(evt, cmd);
    } catch (e) {
        evt.Log(3, "TEL: send_now: " + e.message);
    } finally {
        con.unlock();
    }
}

// ---- requests -----------------------------------------------------------------

// The commands a request may name. Anything else is refused here and never
// reaches the drone.
function known(c)
{
    var ok = "|command|takeoff|land|emergency|stop"
           + "|up|down|left|right|forward|back|cw|ccw|flip|go|speed|streamon|streamoff"
           + "|battery?|speed?|time?|height?|temp?|attitude?|baro?|tof?|wifi?|sdk?|sn?|";
    return ok.indexOf("|" + c + "|") >= 0;
}

// val_fnc of CMD. Inside a *_fnc the attribute still holds the OLD value;
// the request is evt.valn.
function on_cmd(evt)
{
    var line = ("" + evt.valn).trim().toLowerCase();
    if (!line) return 0;
    var c = line.split(" ")[0];

    if (c == "rc")  { say(evt, "refused: sticks go through RC, not CMD"); return 0; }
    if (!known(c))  { say(evt, "refused: '" + line + "' is not a Tello command"); return 0; }

    if (c == "land" || c == "stop" || c == "emergency") {
        send_now(evt, line);
        say(evt, line + " - sent at once, queue emptied");
        return 0;
    }
    q_add(evt, [line]);
    return 0;
}

// The flight plans. A plan is a list of commands; the queue sends them one
// after the other, each when the drone has answered the one before. Add
// your own here - and try "tower", which climbs until the ground station
// says no.
function missions()
{
    return {
        square: ["takeoff", "forward 100", "cw 90", "forward 100", "cw 90",
                 "forward 100", "cw 90", "forward 100", "cw 90", "land"],
        box:    ["takeoff", "go 100 0 0 50", "go 0 100 50 50", "go -100 0 0 50",
                 "go 0 -100 -50 50", "land"],
        hop:    ["takeoff", "up 60", "flip f", "down 60", "land"],
        tower:  ["takeoff", "up 100", "up 100", "up 100", "land"]
    };
}

function on_mission(evt)
{
    var name = ("" + evt.valn).trim().toLowerCase();
    if (!name) return 0;
    var plan = missions()[name];
    if (!plan) { say(evt, "no mission called '" + name + "' - see main.missions()"); return 0; }

    var cmds = [];
    for (var i = 0; i < plan.length; i++) {
        // already in the air: the plan starts from here
        if (plan[i] == "takeoff" && get(evt, "FLYING") == 1) continue;
        cmds.push(plan[i]);
    }
    q_add(evt, cmds);
    say(evt, "mission " + name + ": " + cmds.length + " commands queued");
    return 0;
}

// val_fnc of RC: "a b c d", each -100..100. Sent at once, never queued:
// rc has no answer to wait for.
function on_rc(evt)
{
    var p = ("" + evt.valn).trim().split(" ");
    if (p.length != 4) return 0;
    if (get(evt, "FLYING") != 1) return 0;

    var v = [];
    for (var i = 0; i < 4; i++) {
        var n = parseInt(p[i]);
        if (!(n >= -100 && n <= 100)) n = 0;
        v.push(n);
    }
    // the height rule holds for the sticks too
    if (v[2] > 0 && get(evt, "H") >= get(evt, "MAX_H")) v[2] = 0;

    tello_send(evt, "rc " + v[0] + " " + v[1] + " " + v[2] + " " + v[3]);
    return 0;
}

// ---- what comes back ------------------------------------------------------------

function arrived_text(exc)
{
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);
    exc.buf_recv.pos = exc.buf_recv.len;
    return CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401);
}

// CN_TELLO's pro_onparse: the answer to the command in BUSY.
function on_reply(exc)
{
    var evt = exc.evt;
    if (exc.buf_recv.len <= exc.buf_recv.pos) {      // nothing yet: ask for it
        exc.buf_recv.nxt = 512;
        return RES.INF_SUB_CONTINUE;
    }
    var txt = arrived_text(exc).trim();
    set(evt, "REPLY", txt);

    var con = link();
    con.lock(1000);
    try {
        var busy = get(evt, "BUSY");
        if (!busy) {
            evt.Log(5, "TEL: answer with nothing waiting: '" + txt + "'");
        } else {
            var secs = Number.toFixed((0.0 + Time.GetTimeMs() - get(evt, "BUSY_MS")) / 1000.0, 1);
            if (txt.indexOf("error") == 0) {
                // The drone said no: the rest of a plan makes no sense now.
                set(evt, "QUEUE", "");
                say(evt, "'" + busy + "' refused by the drone: " + txt + " - queue emptied");
            } else {
                if (busy == "command" && txt == "ok") {
                    set(evt, "SDK", 1);
                    say(evt, "the drone is in SDK mode");
                }
                evt.Log(busy.indexOf("?") > 0 ? 5 : 4,
                        "TEL: " + busy + " -> " + txt + " (" + secs + " s)");
            }
            set(evt, "BUSY", "");
        }
    } catch (e) {
        evt.Log(3, "TEL: on_reply: " + e.message);
    } finally {
        con.unlock();
    }
    return RES.OKY;
}

// CN_STATE's pro_onparse: "pitch:0;roll:0;yaw:0;...;agz:-999.00;\r\n"
// Every field whose name, in capitals, is a <var> here is written.
function on_state(exc)
{
    var evt = exc.evt;
    var txt = arrived_text(exc).trim();
    var ids = { pitch: 1, roll: 1, yaw: 1, vgx: 1, vgy: 1, vgz: 1, templ: 1, temph: 1,
                tof: 1, h: 1, bat: 1, baro: 1, time: 1, agx: 1, agy: 1, agz: 1 };

    var f = txt.split(";");
    for (var i = 0; i < f.length; i++) {
        var kv = f[i].split(":");
        if (kv.length != 2 || !ids[kv[0]]) continue;
        set(evt, kv[0].toUpperCase(), 0.0 + parseFloat(kv[1]));
    }

    set(evt, "FLYING", get(evt, "H") > 5.0 ? 1 : 0);
    set(evt, "STATES", get(evt, "STATES") + 1);
    set(evt, "STATE_MS", Time.GetTimeMs());
    return RES.OKY;
}

// ---- the ground station's clock ------------------------------------------------

// The rules, checked just before a command goes out - not when it was
// queued: by then the drone is somewhere else. Returns "" to go ahead, or
// why not.
function rule_check(evt, cmd)
{
    var a = cmd.split(" ");
    var h = get(evt, "H");
    var max_h = get(evt, "MAX_H");

    if (a[0] == "takeoff") {
        var bat = get(evt, "BAT");
        var need = get(evt, "BAT_TAKEOFF");
        if (bat < need) return "battery " + bat + " % is below BAT_TAKEOFF " + need + " %";
    }
    if (a[0] == "up" && h + parseInt(a[1]) > max_h)
        return "up " + a[1] + " from " + Math.round(h) + " cm passes MAX_H " + max_h + " cm";
    if (a[0] == "go" && h + parseInt(a[3]) > max_h)
        return "go to " + Math.round(h + parseInt(a[3])) + " cm passes MAX_H " + max_h + " cm";
    return "";
}

function tick(evt)
{
    var now = 0.0 + Time.GetTimeMs();   // a float: GetTimeMs is unsigned, and another thread's stamp may be later

    // ---- the link: no state line for 1.5 s -------------------------------------
    var last = get(evt, "STATE_MS");
    var up = (last > 0 && now - last < 1500) ? 1 : 0;
    if (up != get(evt, "LINK")) {
        set(evt, "LINK", up);
        if (up == 0) {
            // It may have been switched off: it will want "command" again.
            set(evt, "SDK", 0);
            say(evt, "LINK LOST - no state from the drone for 1.5 s");
        } else {
            say(evt, "link up - state lines arriving");
        }
    }

    var flying = get(evt, "FLYING");
    if (flying != 1) set(evt, "AUTOLAND", 0);

    // ---- safety: the battery -----------------------------------------------------
    if (flying == 1 && get(evt, "AUTOLAND") != 1 && get(evt, "BAT") <= get(evt, "BAT_LAND")) {
        set(evt, "AUTOLAND", 1);
        send_now(evt, "land");
        say(evt, "battery " + get(evt, "BAT") + " % - LANDING, queue emptied");
        return 0;
    }

    var con = link();
    con.lock(1000);
    try {
        var busy = get(evt, "BUSY");

        // ---- an answer that never came ----------------------------------------
        if (busy && now - get(evt, "BUSY_MS") > get(evt, "BUSY_TMO")) {
            set(evt, "BUSY", "");
            if (busy != "command") {
                set(evt, "QUEUE", "");
                say(evt, "no answer to '" + busy + "' in " + (get(evt, "BUSY_TMO") / 1000)
                         + " s - queue emptied");
            }
            busy = "";
        }

        if (!busy) {
            var q = get(evt, "QUEUE");
            if (get(evt, "SDK") != 1) {
                // ---- not in SDK mode: ask, again every 3 s (the timeout above)
                send_busy(evt, "command");
            } else if (q) {
                // ---- the next command of the queue
                var p = q.indexOf("|");
                var cmd = (p < 0) ? q : q.substring(0, p);
                set(evt, "QUEUE", (p < 0) ? "" : q.substring(p + 1));

                var why = rule_check(evt, cmd);
                if (why) {
                    set(evt, "QUEUE", "");
                    say(evt, "refused '" + cmd + "': " + why + " - queue emptied");
                } else {
                    send_busy(evt, cmd);
                }
            } else if (flying == 1 && now - get(evt, "SENT_MS") > 5000) {
                // ---- keep-alive: 15 s without a command and a Tello lands
                send_busy(evt, "battery?");
            }
        }
    } catch (e) {
        evt.Log(3, "TEL: tick: " + e.message);
    } finally {
        con.unlock();
    }
    return 0;
}
