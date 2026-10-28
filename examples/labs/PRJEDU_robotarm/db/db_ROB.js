// =====================================================================
// ROB/S00 - a six-axis arm and its controller, simulated.
//
//   on_dash(exc)   CN_DASH's pro_onparse: dashboard command lines in,
//                  one reply line each
//   step(evt)      every 50 ms: power and brakes, the program, the
//                  motion, and the Modbus registers
//   fk(q)          forward kinematics: six joint angles -> tool position
//
// Everything a client can see lives in the registers (the <io>s under
// UR) or comes back as a dashboard reply. The <var>s are the controller's
// own memory.
// =====================================================================

function start(evt)
{
    set(evt, "GREETED", "[0,0,0,0,0]");
    registers(evt, q_get(evt), [0, 0, 0, 0, 0, 0]);
    evt.Log(4, "ROB: a simulated six-axis arm - dashboard on 127.0.0.1:29999, Modbus on 127.0.0.1:1504");
    return 0;
}

// Milliseconds now, as a float. Time.GetTimeMs() is an UNSIGNED 64-bit
// integer: 'now - t' with a t written a moment later by another thread
// is not -5 but 18446744073709551611. Floats first.
function ms() { return 0.0 + Time.GetTimeMs(); }

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function num(evt, id)    { return parseFloat("" + get(evt, id)); }
function reg(evt, r)     { return parseInt("" + evt.GetValue("id('R" + r + "')/@pro")); }
function reg_set(evt, r, v) { evt.SetValue("id('R" + r + "')/@pro", v); }
function rad(d) { return d * 0.017453292519943295; }

// ---- the dashboard server ---------------------------------------------------------
//
// A client may send several commands in one TCP segment, or half of one:
// complete lines are answered in order, the tail waits in the session's
// memory for the rest.
function on_dash(exc)
{
    var evt = exc.evt;
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    if (n <= 0) { exc.buf_recv.nxt = 256; return RES.INF_SUB_CONTINUE; }
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);
    exc.buf_recv.pos = exc.buf_recv.len;

    var carry = exc.ses.mem.carry;
    var lines = ((carry ? carry : "") + CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401)).split("\n");
    exc.ses.mem.carry = lines[lines.length - 1];

    var out = "";
    for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        var ans = dash(evt, line);
        // the queries arrive several times a second: level 5, below the console
        var q = line.toLowerCase();
        var quiet = q == "robotmode" || q == "safetystatus" || q == "programstate" || q == "running";
        evt.Log(quiet ? 5 : 4, "ROB: <- " + line + "   -> " + ans);
        out = out + ans + "\n";
    }
    if (out != "") {
        exc.buf_send.remove();
        exc.buf_send.append(out.toS08());
        exc.send();
    }
    return RES.OKY;
}

// One command, one reply. Commands are not case sensitive.
function dash(evt, line)
{
    var c = line.toLowerCase();
    var mode = "" + get(evt, "MODE");
    var safety = "" + get(evt, "SAFETY");
    var prog = "" + get(evt, "PROGRAM");
    var ps = "" + get(evt, "PSTATE");

    if (c == "robotmode")     return "Robotmode: " + mode;
    if (c == "safetystatus")  return "Safetystatus: " + safety;
    if (c == "programstate")  return ps + " " + (prog ? prog : "<unnamed>");
    if (c == "running")       return "Program running: " + (ps == "PLAYING" ? "true" : "false");
    if (c == "get loaded program") return prog ? "Loaded program: /programs/" + prog : "No program loaded";

    if (c == "power on") {
        if (mode == "POWER_OFF") transition(evt, "POWER_ON", "IDLE", 2000);
        return "Powering on";
    }
    if (c == "power off") {
        halt(evt, "STOPPED");
        set(evt, "MODE", "POWER_OFF");
        set(evt, "TRANS", "");
        return "Powering off";
    }
    if (c == "brake release") {
        // from power off, this one powers on first
        if (mode == "POWER_OFF") transition(evt, "POWER_ON", "IDLE", 2000, "RUNNING");
        else if (mode == "IDLE") transition(evt, "IDLE", "RUNNING", 1500);
        return "Brake releasing";
    }
    if (c.indexOf("load ") == 0) {
        var name = line.substring(5).trim();
        var slash = name.lastIndexOf("/");
        if (slash >= 0) name = name.substring(slash + 1);
        var all = JSON.parse(get(evt, "PROGRAMS"));
        if (!all[name]) return "File not found: /programs/" + name;
        halt(evt, "STOPPED");
        set(evt, "PROGRAM", name);
        return "Loading program: /programs/" + name;
    }
    if (c == "play") {
        if (mode != "RUNNING" || safety != "NORMAL" || !prog) return "Failed to execute: play";
        if (ps == "STOPPED") { set(evt, "PC", 0); set(evt, "STEP_MS", 0); set(evt, "TARGET", ""); }
        set(evt, "PSTATE", "PLAYING");
        return "Starting program";
    }
    if (c == "pause") {
        if (ps != "PLAYING") return "Failed to execute: pause";
        set(evt, "PSTATE", "PAUSED");
        return "Pausing program";
    }
    if (c == "stop") {
        if (ps == "STOPPED") return "Failed to execute: stop";
        halt(evt, "STOPPED");
        return "Stopped";
    }
    if (c == "unlock protective stop") {
        if (safety == "PROTECTIVE_STOP") {
            if (ms() - num(evt, "PSTOP_MS") < 5000)
                return "Cannot unlock protective stop until 5s after occurrence. Always inspect cause of protective stop before unlocking";
            set(evt, "SAFETY", "NORMAL");
        }
        return "Protective stop releasing";
    }
    if (c == "close safety popup") return "closing safety popup";
    if (c == "quit") return "Disconnected";
    return "could not understand: '" + line + "'";
}

// Power and brakes take time: MODE shows 'now', TRANS says what comes
// next and when. 'then' chains one more step (brake release from off).
function transition(evt, now_mode, to, after, then)
{
    set(evt, "MODE", now_mode);
    set(evt, "TRANS", JSON.stringify({ to: to, at: ms() + after, then: then ? then : "" }));
}

// Stop or pause the motion where it is.
function halt(evt, pstate)
{
    set(evt, "PSTATE", pstate);
    if (pstate == "STOPPED") {
        set(evt, "PC", 0);
        set(evt, "STEP_MS", 0);
        set(evt, "TARGET", "");
    }
}

// ---- the world -------------------------------------------------------------------

// val_fnc of DOOR. The attribute still holds the old value; the new one is evt.valn.
function on_door(evt)
{
    var open = parseInt("" + evt.valn) == 1;
    var safety = "" + get(evt, "SAFETY");
    if (open && safety == "NORMAL") {
        set(evt, "SAFETY", "SAFEGUARD_STOP");
        if ("" + get(evt, "PSTATE") == "PLAYING") set(evt, "PSTATE", "PAUSED");
        evt.Log(4, "ROB: the guard door opened - SAFEGUARD STOP");
    }
    if (!open && safety == "SAFEGUARD_STOP") {
        set(evt, "SAFETY", "NORMAL");
        evt.Log(4, "ROB: the guard door closed - safeguard stop reset, the program waits for 'play'");
    }
    return 0;
}

// val_fnc of BUMP: someone walked into the arm. main.step sets BUMP back to 0.
function on_bump(evt)
{
    if (parseInt("" + evt.valn) != 1) return 0;
    if ("" + get(evt, "MODE") != "RUNNING") return 0;
    if ("" + get(evt, "SAFETY") == "PROTECTIVE_STOP") return 0;
    set(evt, "SAFETY", "PROTECTIVE_STOP");
    set(evt, "PSTOP_MS", ms());
    if ("" + get(evt, "PSTATE") == "PLAYING") set(evt, "PSTATE", "PAUSED");
    evt.Log(4, "ROB: collision - PROTECTIVE STOP");
    return 0;
}

// ---- the controller's step ----------------------------------------------------------

function step(evt)
{
    var now = ms();
    var dt = 0.05;
    greet(evt);
    if (parseInt("" + get(evt, "BUMP")) == 1) set(evt, "BUMP", 0);

    // power and brakes
    var tr = "" + get(evt, "TRANS");
    if (tr) {
        var t = JSON.parse(tr);
        if (now >= t.at) {
            set(evt, "MODE", t.to);
            set(evt, "TRANS", "");
            evt.Log(4, "ROB: robot mode " + t.to);
            if (t.then) transition(evt, t.to, t.then, 1500);
        }
    }

    var q = q_get(evt);
    var qd = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    var moving = "" + get(evt, "MODE") == "RUNNING" && "" + get(evt, "SAFETY") == "NORMAL"
                 && "" + get(evt, "PSTATE") == "PLAYING";
    if (moving) {
        run(evt, now);
        qd = move(evt, q, dt);
    } else {
        set(evt, "VCUR", 0.0);
    }
    registers(evt, q, qd);
    return 0;
}

// A new dashboard client is greeted before anything else.
function greeted_list(evt) { return JSON.parse(get(evt, "GREETED")); }
function greet(evt)
{
    var con = xdb.con["CN_DASH"];
    var g = greeted_list(evt);
    var changed = false;
    for (var i = 1; i <= 4; i++) {
        var ses = con.get_ses(i);
        var up = ses && (parseInt("" + ses.sta) & 15) == 3;
        if (up && g[i] == 0) {
            var exc = new CON_EXC(evt, ses);
            exc.buf_send.append("Connected: Universal Robots Dashboard Server\n".toS08());
            exc.send();
            exc = 0;
            g[i] = 1;
            changed = true;
        } else if (!up && g[i] == 1) {
            g[i] = 0;
            changed = true;
        }
    }
    if (changed) set(evt, "GREETED", JSON.stringify(g));
}

// ---- the program ------------------------------------------------------------------
//
// PC is the step; STEP_MS is 0 until the step has begun. A step that is
// done moves PC on; a step that waits returns and is asked again next time.
function run(evt, now)
{
    var prog = JSON.parse(get(evt, "PROGRAMS"))["" + get(evt, "PROGRAM")];
    if (!prog) return;
    var pc = parseInt("" + get(evt, "PC"));
    if (pc >= prog.length) {
        halt(evt, "STOPPED");
        evt.Log(4, "ROB: program " + get(evt, "PROGRAM") + " finished");
        return;
    }
    var s = prog[pc];
    var began = num(evt, "STEP_MS");
    reg_set(evt, 133, pc);

    if (s.op == "movej") {
        if (began == 0) {
            var wp = JSON.parse(get(evt, "WAYPOINTS"))[s.to];
            var tq = [];
            for (var i = 0; i < 6; i++) tq.push(rad(0.0 + wp[i]));
            set(evt, "TARGET", JSON.stringify(tq));
            set(evt, "STEP_MS", now);
        } else if ("" + get(evt, "TARGET") == "") {
            next(evt, pc + 1);                   // move() cleared it: arrived
        }
        return;
    }
    if (s.op == "wait_reg") {
        if (reg(evt, s.reg) == s.val) next(evt, pc + 1);
        return;
    }
    if (s.op == "set_reg") { reg_set(evt, s.reg, s.val); next(evt, pc + 1); return; }
    if (s.op == "count") {
        var c = reg(evt, s.reg) + 1;
        reg_set(evt, s.reg, c);
        set(evt, "PLACED", c);
        next(evt, pc + 1);
        return;
    }
    if (s.op == "grip") {
        set(evt, "GRIP", s.on);
        reg_set(evt, 130, s.on);
        // closing on a part holds it; closing on nothing holds nothing
        set(evt, "HOLDING", s.on == 1 && reg(evt, 128) == 1 ? 1 : 0);
        next(evt, pc + 1);
        return;
    }
    if (s.op == "wait") {
        if (began == 0) set(evt, "STEP_MS", now);
        else if (now - began >= 1000.0 * s.s) next(evt, pc + 1);
        return;
    }
    if (s.op == "goto") { next(evt, s.step); return; }
    evt.Log(3, "ROB: unknown program step '" + s.op + "' at " + pc);
    halt(evt, "STOPPED");
}

function next(evt, pc)
{
    set(evt, "PC", pc);
    set(evt, "STEP_MS", 0);
}

// ---- the motion -------------------------------------------------------------------
//
// movej: every joint goes straight to its target angle, all arriving
// together. The joint with the furthest to go sets the pace; its speed
// ramps up and down at 120 deg/s^2 (a trapezoid), never above VMAX times
// the speed register. Returns the joint speeds, rad/s.
function move(evt, q, dt)
{
    var qd = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    var ts = "" + get(evt, "TARGET");
    if (!ts) return qd;
    var tq = JSON.parse(ts);
    var d = [], far = 0.0;
    for (var i = 0; i < 6; i++) {
        d.push((0.0 + tq[i]) - q[i]);
        if (Math.abs(d[i]) > far) far = Math.abs(d[i]);
    }
    if (far < 0.0005) {                              // there
        for (var j = 0; j < 6; j++) q[j] = 0.0 + tq[j];
        set(evt, "Q", JSON.stringify(q));
        set(evt, "TARGET", "");
        set(evt, "VCUR", 0.0);
        return qd;
    }
    var pct = reg(evt, 132);
    if (!(pct >= 10)) pct = 10;
    if (pct > 100) pct = 100;
    var vmax = rad(num(evt, "VMAX")) * pct / 100.0;
    var acc = rad(120.0);
    var v = num(evt, "VCUR") + acc * dt;             // speed up ...
    var vstop = Math.sqrt(2.0 * acc * far);          // ... but be able to stop in time
    if (v > vstop) v = vstop;
    if (v > vmax) v = vmax;
    var f = v * dt / far;
    if (f > 1.0) f = 1.0;
    for (var k = 0; k < 6; k++) {
        q[k] = q[k] + d[k] * f;
        qd[k] = d[k] * f / dt;
    }
    set(evt, "VCUR", v);
    set(evt, "Q", JSON.stringify(q));
    set(evt, "QD", JSON.stringify(qd));
    return qd;
}

function q_get(evt)
{
    var a = JSON.parse(get(evt, "Q"));
    var q = [];
    for (var i = 0; i < 6; i++) q.push(0.0 + a[i]);
    return q;
}

// ---- the registers ------------------------------------------------------------------

function registers(evt, q, qd)
{
    for (var i = 0; i < 6; i++) {
        evt.SetValue("id('Q" + i + "')/@pro", Math.round(q[i] * 1000.0));
        evt.SetValue("id('QD" + i + "')/@pro", Math.round(qd[i] * 1000.0));
    }
    var p = fk(q);
    evt.SetValue("id('TX')/@pro", Math.round(p[0] * 10000.0));      // m -> 0.1 mm
    evt.SetValue("id('TY')/@pro", Math.round(p[1] * 10000.0));
    evt.SetValue("id('TZ')/@pro", Math.round(p[2] * 10000.0));
    evt.SetValue("id('TRX')/@pro", Math.round(p[3] * 1000.0));      // rad -> mrad
    evt.SetValue("id('TRY')/@pro", Math.round(p[4] * 1000.0));
    evt.SetValue("id('TRZ')/@pro", Math.round(p[5] * 1000.0));
}

// ---- forward kinematics -----------------------------------------------------------
//
// UR5e, standard Denavit-Hartenberg: joint i turns about z by q[i], then
// d along z, a along x, and a twist alpha about x. Multiplying the six
// transforms gives the tool's position and orientation in the base frame.
// Returns [x, y, z, rx, ry, rz]: metres, and the orientation as a
// rotation vector (axis times angle, rad) - the form UR uses.
function fk(q)
{
    var D = [0.1625, 0.0, 0.0, 0.1333, 0.0997, 0.0996];
    var A = [0.0, -0.425, -0.3922, 0.0, 0.0, 0.0];
    var AL = [1.5707963267948966, 0.0, 0.0, 1.5707963267948966, -1.5707963267948966, 0.0];
    var T = [1.0, 0.0, 0.0, 0.0,  0.0, 1.0, 0.0, 0.0,  0.0, 0.0, 1.0, 0.0];   // 3x4, row major
    for (var i = 0; i < 6; i++) {
        var ct = Math.cos(q[i]), st = Math.sin(q[i]), ca = Math.cos(AL[i]), sa = Math.sin(AL[i]);
        var M = [ct, -st * ca,  st * sa, A[i] * ct,
                 st,  ct * ca, -ct * sa, A[i] * st,
                 0.0,      sa,       ca, D[i]];
        var R = [];
        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 4; c++) {
                var s = T[r * 4] * M[c] + T[r * 4 + 1] * M[4 + c] + T[r * 4 + 2] * M[8 + c];
                if (c == 3) s = s + T[r * 4 + 3];
                R.push(s);
            }
        }
        T = R;
    }
    var rv = rotvec(T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]);
    return [T[3], T[7], T[11], rv[0], rv[1], rv[2]];
}

// A rotation matrix as a rotation vector. Near 180 degrees - a tool
// pointing straight down is exactly there - the usual formula divides by
// sin(angle) = 0, so the axis comes from the diagonal instead.
function pos(v) { return v > 0.0 ? v : 0.0; }

function rotvec(r11, r12, r13, r21, r22, r23, r31, r32, r33)
{
    var c = (r11 + r22 + r33 - 1.0) / 2.0;
    if (c > 1.0) c = 1.0;
    if (c < -1.0) c = -1.0;
    var ang = Math.acos(c);
    if (ang < 0.000001) return [0.0, 0.0, 0.0];
    if (ang < 3.1415) {
        var k = ang / (2.0 * Math.sin(ang));
        return [k * (r32 - r23), k * (r13 - r31), k * (r21 - r12)];
    }
    var x = Math.sqrt(pos((r11 + 1.0) / 2.0));
    var y = Math.sqrt(pos((r22 + 1.0) / 2.0));
    var z = Math.sqrt(pos((r33 + 1.0) / 2.0));
    // signs relative to the largest component
    if (x >= y && x >= z) { if (r12 < 0.0) y = -y; if (r13 < 0.0) z = -z; }
    else if (y >= z)      { if (r12 < 0.0) x = -x; if (r23 < 0.0) z = -z; }
    else                  { if (r13 < 0.0) x = -x; if (r23 < 0.0) y = -y; }
    return [x * ang, y * ang, z * ang];
}
