// =====================================================================
// SIM/S00 - a Tello drone, written in script.
//
// Two jobs, on two threads:
//
//   on_cmd(exc)   CN_SIM's pro_onparse. One datagram = one command. It
//                 answers at once ("ok", "error", "87"), or - for a
//                 command that moves the drone - starts a move and says
//                 nothing yet.
//   tick(evt)     every 0.1 s on TH_SIM. Moves the drone a step, sends the
//                 "ok" of a move that has just finished, and sends the
//                 state line to UDP 8890.
//
// Everything the two share is a <var> of this document, so the whole
// drone can be read in the element tree while it flies.
//
// THE FRAME. x points where the nose pointed at takeoff, y to the left of
// it, h up. yaw is clockwise-positive, -180..180, as on the real drone.
// =====================================================================

function start(evt)
{
    evt.Log(4, "SIM: a Tello on 127.0.0.1 - commands on UDP 8889, state to UDP 8890");
    evt.SetValue("id('CMD_MS')/@val", Time.GetTimeMs());
    return 0;
}

// ---- small helpers ----------------------------------------------------

function deg2rad(d) { return d * 0.017453292519943295; }

// what arrived, as text. A datagram is bytes; HEX_dec with 0x0401 turns
// hex back into a string, which is the shortest safe way from one to the
// other in script.
function arrived_text(exc)
{
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);
    exc.buf_recv.pos = exc.buf_recv.len;          // one datagram, one command
    return CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401);
}

// an answer inside the hook: it goes back to whoever sent the command
function answer(exc, txt)
{
    exc.buf_send.remove();
    exc.buf_send.append(txt.toS08());
    exc.send();
}

// Sending from outside a hook needs a session to send on: get_ses(0) is
// the connection's main session. (Not con.ses - on a <con> that is empty,
// and an exchange without a session has nowhere to go.)
//
// An answer from the timer, when a move ends. A UDP server remembers the
// last address that wrote to it, so a datagram sent later on CN_SIM goes
// to the ground station - there is only one.
function answer_later(evt, txt)
{
    var ses = xdb.con["CN_SIM"].get_ses(0);
    if (!ses) return;
    var exc = new CON_EXC(evt, ses);
    exc.buf_send.append(txt.toS08());
    exc.send();
    exc = 0;
}

function send_state(evt, txt)
{
    var ses = xdb.con["CN_SIMST"].get_ses(0);
    if (!ses) return;
    var exc = new CON_EXC(evt, ses);
    exc.buf_send.append(txt.toS08());
    exc.send();
    exc = 0;
}

// Nothing ever arrives on the state socket; if something does, drop it.
function on_nothing(exc)
{
    exc.buf_recv.pos = exc.buf_recv.len;
    return RES.OKY;
}

// ---- a move ------------------------------------------------------------
//
// A move is what is left to do, in the WORLD frame, plus what happens at
// the end. It is kept as JSON in id('TASK')/@val:
//   mx my mz   cm still to go         spd   cm/s
//   turn       degrees still to turn   hold  seconds to hover afterwards
//   land       1: the motors stop at the end
//   wait       the command whose "ok" is sent at the end ("" for none)
function task_new(evt, fwd, left, up, spd, turn, hold, land, wait)
{
    // Typed arithmetic: the LEFT operand decides, so every number that
    // may arrive as an integer is turned into a float first.
    var f = 0.0 + fwd, l = 0.0 + left;
    var r = deg2rad(evt.GetValue("id('YAW')/@val"));
    var t = {
        mx: f * Math.cos(r) + l * Math.sin(r),
        my: l * Math.cos(r) - f * Math.sin(r),
        mz: 0.0 + up,
        spd: 0.0 + spd, turn: 0.0 + turn, hold: 0.0 + hold,
        land: land, wait: wait
    };
    evt.SetValue("id('TASK')/@val", JSON.stringify(t));
}

function busy(evt)
{
    return evt.GetValue("id('TASK')/@val") ? true : false;
}

// JSON gives back 80 for 80.0, and an integer on the left of an
// arithmetic operator makes the whole expression integer - so a move read
// back from TASK is turned into floats before anything is done with it.
function task_get(ts)
{
    var t = JSON.parse(ts);
    t.mx = 0.0 + t.mx;  t.my = 0.0 + t.my;  t.mz = 0.0 + t.mz;
    t.spd = 0.0 + t.spd;  t.turn = 0.0 + t.turn;  t.hold = 0.0 + t.hold;
    return t;
}

// a distance argument: 20..500 cm, as the SDK says
function dist_ok(v) { return v >= 20 && v <= 500; }

// ---- the command socket --------------------------------------------------

function on_cmd(exc)
{
    var evt = exc.evt;
    var line = arrived_text(exc).trim();
    if (!line) return RES.OKY;

    evt.SetValue("id('CMD_MS')/@val", Time.GetTimeMs());
    evt.SetValue("id('CMDS')/@val", evt.GetValue("id('CMDS')/@val") + 1);

    var a = line.split(" ");
    var ans = do_cmd(evt, a[0].toLowerCase(), a);

    // Queries and rc are frequent: level 5, below the console's 4.
    var quiet = (a[0] == "rc") || (a[0].indexOf("?") > 0);
    evt.Log(quiet ? 5 : 4, "SIM: <- " + line + (ans == "" ? "" : "   -> " + ans));

    if (ans != "") answer(exc, ans);
    return RES.OKY;
}

// Returns the answer, or "" for no answer now (rc never has one; a move
// is answered by tick when it ends).
function do_cmd(evt, cmd, a)
{
    if (cmd == "command") {
        evt.SetValue("id('SDK')/@val", 1);
        return "ok";
    }
    // A real Tello may stay silent before "command"; this one says so.
    if (evt.GetValue("id('SDK')/@val") != 1) return "error Not in SDK mode";

    if (cmd.indexOf("?") > 0) return read_cmd(evt, cmd);

    var fly = evt.GetValue("id('FLY')/@val");
    var bat = evt.GetValue("id('BAT')/@val");
    var spd = evt.GetValue("id('SPEED')/@val");

    // ---- any time --------------------------------------------------------
    if (cmd == "emergency") {                    // motors off, in the air too
        if (fly == 1) evt.Log(4, "SIM: EMERGENCY - motors stopped at h="
                                 + Math.round(evt.GetValue("id('H')/@val")) + " cm");
        evt.SetValue("id('FLY')/@val", 0);
        evt.SetValue("id('H')/@val", 0.0);
        evt.SetValue("id('TASK')/@val", "");
        return "ok";
    }
    if (cmd == "streamon" || cmd == "streamoff") {
        evt.Log(4, "SIM: " + cmd + " - this drone has no camera; a real one sends H.264 to UDP 11111");
        return "ok";
    }
    if (cmd == "speed") {
        var s = parseInt(a[1]);
        if (!(s >= 10 && s <= 100)) return "error";
        evt.SetValue("id('SPEED')/@val", 0.0 + s);
        return "ok";
    }
    if (cmd == "rc") {                           // sticks: never answered
        if (a.length == 5 && fly == 1) {
            evt.SetValue("id('RC')/@val", a[1] + " " + a[2] + " " + a[3] + " " + a[4]);
            evt.SetValue("id('RC_MS')/@val", Time.GetTimeMs());
        }
        return "";
    }
    if (cmd == "takeoff") {
        if (fly == 1) return "error";
        if (bat < 10.0) return "error battery low";
        evt.SetValue("id('FLY')/@val", 1);
        evt.SetValue("id('X')/@val", 0.0);
        evt.SetValue("id('Y')/@val", 0.0);
        evt.SetValue("id('H')/@val", 0.0);
        task_new(evt, 0, 0, 80, 60, 0, 0.8, 0, "takeoff");
        return "";
    }

    // ---- in the air only ---------------------------------------------------
    if (fly != 1) return "error Motor stop";

    if (cmd == "land") {                         // lands from anywhere
        task_new(evt, 0, 0, 0.0 - evt.GetValue("id('H')/@val"), 40, 0, 0, 1, "land");
        return "";
    }
    if (cmd == "stop") {                         // hover now; a move is dropped
        evt.SetValue("id('TASK')/@val", "");
        evt.SetValue("id('RC')/@val", "0 0 0 0");
        return "ok";
    }

    if (busy(evt)) return "error busy";          // one move at a time

    var v = parseInt(a[1]);
    if (cmd == "up")      { if (!dist_ok(v)) return "error"; task_new(evt, 0, 0,  v, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "down")    { if (!dist_ok(v)) return "error"; task_new(evt, 0, 0, 0 - v, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "forward") { if (!dist_ok(v)) return "error"; task_new(evt,  v, 0, 0, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "back")    { if (!dist_ok(v)) return "error"; task_new(evt, 0 - v, 0, 0, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "left")    { if (!dist_ok(v)) return "error"; task_new(evt, 0,  v, 0, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "right")   { if (!dist_ok(v)) return "error"; task_new(evt, 0, 0 - v, 0, spd, 0, 0, 0, cmd); return ""; }
    if (cmd == "cw")      { if (!(v >= 1 && v <= 360)) return "error"; task_new(evt, 0, 0, 0, spd, v, 0, 0, cmd); return ""; }
    if (cmd == "ccw")     { if (!(v >= 1 && v <= 360)) return "error"; task_new(evt, 0, 0, 0, spd, 0 - v, 0, 0, cmd); return ""; }

    if (cmd == "flip") {
        var d = a[1];
        if (!(d == "l" || d == "r" || d == "f" || d == "b")) return "error";
        if (bat < 50.0) return "error No enough battery";
        evt.SetValue("id('BAT')/@val", bat - 1.0);           // a flip costs
        task_new(evt, 0, 0, 0, spd, 0, 1.0, 0, cmd);
        return "";
    }

    if (cmd == "go") {                           // go x y z speed, body frame
        var x = parseInt(a[1]), y = parseInt(a[2]), z = parseInt(a[3]), gs = parseInt(a[4]);
        if (!(gs >= 10 && gs <= 100)) return "error";
        if (Math.abs(x) > 500 || Math.abs(y) > 500 || Math.abs(z) > 500) return "error";
        if (Math.abs(x) < 20 && Math.abs(y) < 20 && Math.abs(z) < 20) return "error";
        task_new(evt, x, y, z, gs, 0, 0, 0, cmd);
        return "";
    }

    return "error";
}

// The read commands. A real Tello answers each in its own format; these
// are close enough to parse the same way.
function read_cmd(evt, cmd)
{
    var h = evt.GetValue("id('H')/@val");
    var t = evt.GetValue("id('TEMP')/@val");
    if (cmd == "battery?")  return "" + Math.round(evt.GetValue("id('BAT')/@val"));
    if (cmd == "speed?")    return Number.toFixed(evt.GetValue("id('SPEED')/@val"), 1);
    if (cmd == "time?")     return Math.round(evt.GetValue("id('FLYT')/@val")) + "s";
    if (cmd == "height?")   return Math.round(h / 10.0) + "dm";
    if (cmd == "temp?")     return Math.round(t - 3.0) + "~" + Math.round(t) + "C";
    if (cmd == "tof?")      return Math.round(h * 10.0 + 100.0) + "mm";
    if (cmd == "attitude?") return "pitch:0;roll:0;yaw:" + Math.round(evt.GetValue("id('YAW')/@val")) + ";";
    if (cmd == "baro?")     return Number.toFixed(56.3 + h / 100.0, 2);
    if (cmd == "wifi?")     return "90";
    if (cmd == "sdk?")      return "20";
    if (cmd == "sn?")       return "0TQSIMULATOR01";
    return "error";
}

// ---- the flight model ------------------------------------------------------

function tick(evt)
{
    var dt  = 0.1;
    var now = 0.0 + Time.GetTimeMs();   // a float: GetTimeMs is unsigned, and another thread's stamp may be later

    var fly = evt.GetValue("id('FLY')/@val");
    var x   = evt.GetValue("id('X')/@val");
    var y   = evt.GetValue("id('Y')/@val");
    var h   = evt.GetValue("id('H')/@val");
    var yaw = evt.GetValue("id('YAW')/@val");
    var bat = evt.GetValue("id('BAT')/@val");
    var tmp = evt.GetValue("id('TEMP')/@val");
    var tf  = evt.GetValue("id('FLYT')/@val");

    var x0 = x, y0 = y, h0 = h;

    if (fly == 1) {
        var ts = evt.GetValue("id('TASK')/@val");

        // The drone looks after itself: a flat battery or 15 s without a
        // word and it comes down. Neither sends an "ok" - nobody asked.
        if (!ts || task_get(ts).land != 1) {
            if (bat < 5.0) {
                evt.Log(4, "SIM: battery " + Math.round(bat) + " % - landing by itself");
                task_new(evt, 0, 0, 0.0 - h, 40, 0, 0, 1, "");
                ts = evt.GetValue("id('TASK')/@val");
            } else if (now - evt.GetValue("id('CMD_MS')/@val") > 15000) {
                evt.Log(4, "SIM: no command for 15 s - landing by itself");
                task_new(evt, 0, 0, 0.0 - h, 40, 0, 0, 1, "");
                ts = evt.GetValue("id('TASK')/@val");
            }
        }

        if (ts) {
            var t = task_get(ts);
            var d = Math.sqrt(t.mx * t.mx + t.my * t.my + t.mz * t.mz);

            if (Math.abs(t.turn) > 0.01) {                    // turn first
                var st = Math.min(Math.abs(t.turn), 90.0 * dt);
                if (t.turn < 0.0) st = 0.0 - st;
                yaw = yaw + st;
                t.turn = t.turn - st;
            } else if (d > 0.01) {                            // then travel
                var k = Math.min(1.0, t.spd * dt / d);
                x = x + k * t.mx;  y = y + k * t.my;  h = h + k * t.mz;
                t.mx = t.mx - k * t.mx;  t.my = t.my - k * t.my;  t.mz = t.mz - k * t.mz;
            } else if (t.hold > 0.0) {                        // then settle
                t.hold = t.hold - dt;
            } else {                                          // done
                ts = "";
                if (t.land == 1) { fly = 0; h = 0.0; evt.SetValue("id('FLY')/@val", 0); }
                if (t.wait) {
                    answer_later(evt, "ok");
                    evt.Log(4, "SIM: -> ok (" + t.wait + " done)");
                }
            }
            evt.SetValue("id('TASK')/@val", ts ? JSON.stringify(t) : "");
        } else if (now - evt.GetValue("id('RC_MS')/@val") < 1000) {
            // Sticks. A real Tello holds the last rc; this one lets go after
            // a second without a new one, so a lost page cannot fly it away.
            var rc = evt.GetValue("id('RC')/@val").split(" ");
            var sp = evt.GetValue("id('SPEED')/@val");
            var r  = deg2rad(yaw);
            var f  = sp * parseInt(rc[1]) / 100.0 * dt;
            var l  = 0.0 - sp * parseInt(rc[0]) / 100.0 * dt;
            x   = x + f * Math.cos(r) + l * Math.sin(r);
            y   = y - f * Math.sin(r) + l * Math.cos(r);
            h   = h + sp * parseInt(rc[2]) / 100.0 * dt;
            yaw = yaw + 90.0 * parseInt(rc[3]) / 100.0 * dt;
        }

        if (fly == 1) {
            if (h < 0.0) h = 0.0;
            bat = bat - evt.GetValue("id('DRAIN')/@val") * dt;
            tf  = tf + dt;
            tmp = tmp + (72.0 - tmp) * 0.002;                 // warms up in flight
        }
    } else {
        bat = bat - 0.005 * dt;
        tmp = tmp + (50.0 - tmp) * 0.002;
    }

    if (yaw > 180.0)  yaw = yaw - 360.0;
    if (yaw < -180.0) yaw = yaw + 360.0;
    if (bat < 0.0) bat = 0.0;

    evt.SetValue("id('X')/@val", x);
    evt.SetValue("id('Y')/@val", y);
    evt.SetValue("id('H')/@val", h);
    evt.SetValue("id('YAW')/@val", yaw);
    evt.SetValue("id('BAT')/@val", bat);
    evt.SetValue("id('TEMP')/@val", tmp);
    evt.SetValue("id('FLYT')/@val", tf);

    // The state line is sent only in SDK mode, as on the real drone.
    if (evt.GetValue("id('SDK')/@val") != 1) return 0;

    // Velocity of this step, world frame, then the attitude a quadcopter
    // would need for it: nose down to go forward, rolled to go sideways.
    var vx = (x - x0) / dt, vy = (y - y0) / dt, vz = (h - h0) / dt;
    var rr = deg2rad(yaw);
    var vf = vx * Math.cos(rr) - vy * Math.sin(rr);
    var vl = vx * Math.sin(rr) + vy * Math.cos(rr);
    var noise = (fly == 1) ? 1.0 : 0.0;
    var pitch = 0.0 - vf / 8.0 + noise * (Math.random() - 0.5);
    var roll  = 0.0 - vl / 8.0 + noise * (Math.random() - 0.5);

    var s = "pitch:" + Math.round(pitch)
          + ";roll:" + Math.round(roll)
          + ";yaw:" + Math.round(yaw)
          + ";vgx:" + Math.round(vx / 10.0)            // dm/s
          + ";vgy:" + Math.round(vy / 10.0)
          + ";vgz:" + Math.round(vz / 10.0)
          + ";templ:" + Math.round(tmp - 3.0)
          + ";temph:" + Math.round(tmp)
          + ";tof:" + (fly == 1 ? Math.round(h + 10.0) : 10)
          + ";h:" + Math.round(h)
          + ";bat:" + Math.round(bat)
          + ";baro:" + Number.toFixed(56.3 + h / 100.0, 2)
          + ";time:" + Math.round(tf)
          + ";agx:" + Number.toFixed(0.0 - pitch * 17.0, 2)
          + ";agy:" + Number.toFixed(roll * 17.0, 2)
          + ";agz:" + Number.toFixed(-1000.0 + noise * 10.0 * (Math.random() - 0.5), 2)
          + ";\r\n";
    send_state(evt, s);
    return 0;
}
