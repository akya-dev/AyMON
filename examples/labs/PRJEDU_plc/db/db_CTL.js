// =====================================================================
// CTL/S00 - the PLC program. One scan every 100 ms, top to bottom:
//
//   1  read the input image      the <io>s the Modbus poll keeps fresh
//   2  edges and timers          what changed since the last scan
//   3  the step sequence         at most one transition per scan
//   4  the output image          from the step, AND the interlocks
//   5  write the outputs         one register, only if it differs
//
// A step sequence is the whole program's state: one number, STEP, and the
// time it was entered. Everything else is worked out again every scan.
//
// Typed arithmetic: the left operand decides, and an untyped attribute
// comes back as text. get() turns everything into a float.
// =====================================================================

function start(evt)
{
    // the step the program starts in began now - STEP_MS is local, so it
    // comes up 0 and "in step for" would count from 1970
    set(evt, "STEP_MS", 0.0 + Time.GetTimeMs());
    evt.Log(4, "PLC: filling line - remote I/O on 127.0.0.1:1503, scan " + get(evt, "T_SCAN", "evt_per") + " s");
    evt.Log(4, "PLC: HMI on http://127.0.0.1:8093/ - press START");
    return 0;
}

function get(evt, id, atr)
{
    var v = evt.GetValue("id('" + id + "')/@" + (atr ? atr : "val"));
    return (v == null) ? 0.0 : parseFloat("" + v);
}
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function bit(evt, id) { return evt.GetValue("id('" + id + "')/@val") == 1; }

function say(evt, txt)
{
    set(evt, "MSG", txt);
    evt.Log(4, "PLC: " + txt);
}

function step_name(s)
{
    var names = ["IDLE", "CONVEY", "POSITION", "FILL", "DRIP", "RELEASE", "", "", "FAULT", "E-STOP"];
    return names[s];
}

// the one way into a step: its number, its name, and the time it began
function go(evt, s, now)
{
    set(evt, "STEP", s);
    set(evt, "STEP_NAME", step_name(s));
    set(evt, "STEP_MS", now);
    set(evt, "STEP_T", 0.0);
}

function fault(evt, why, now)
{
    set(evt, "FAULT", why);
    go(evt, 8, now);
    say(evt, "FAULT - " + why + ". Press RESET");
}

// The last link of the input block's pro_fnc: an answer came. The
// watchdog in scan() counts from here.
function on_poll(evt)
{
    set(evt, "POLL_MS", Time.GetTimeMs());
    return 0;
}

function scan(evt)
{
    var now = 0.0 + Time.GetTimeMs();   // a float: GetTimeMs is unsigned, and another thread's stamp may be later
    set(evt, "SCANS", get(evt, "SCANS") + 1.0);

    // ---- 1  the input image --------------------------------------------------
    var pe_fill  = bit(evt, "I_PE_FILL");
    var ls_full  = bit(evt, "I_LS_FULL");
    var estop_ok = bit(evt, "I_ESTOP_OK");
    var start    = bit(evt, "I_START");
    var stop_ok  = bit(evt, "I_STOP_OK");
    var reset    = bit(evt, "I_RESET");
    var comm_ok  = (now - evt.GetValue("id('POLL_MS')/@val")) < 1000.0 * get(evt, "T_WATCHDOG");
    set(evt, "COMM_OK", comm_ok ? 1 : 0);

    // ---- 2  edges: this scan's input against the last scan's ----------------
    var start_rise = start && !bit(evt, "M_START");
    var reset_rise = reset && !bit(evt, "M_RESET");
    var stop_press = !stop_ok && bit(evt, "M_STOP_OK");   // NC contact: pressed = 1 -> 0
    set(evt, "M_START", start ? 1 : 0);
    set(evt, "M_RESET", reset ? 1 : 0);
    set(evt, "M_STOP_OK", stop_ok ? 1 : 0);

    var s = parseInt("" + evt.GetValue("id('STEP')/@val"));
    var t = (now - evt.GetValue("id('STEP_MS')/@val")) / 1000.0;   // time in this step, s
    set(evt, "STEP_T", 0.1 * Math.round(t * 10.0));

    // ---- 3  the sequence ---------------------------------------------------------
    // Highest priority first: the emergency stop and the I/O link override
    // whatever step is active.
    if (!estop_ok && comm_ok) {
        if (s != 9) { go(evt, 9, now); set(evt, "STOP_REQ", 0); say(evt, "EMERGENCY STOP - everything off. Pull it out, then RESET"); }
    } else if (!comm_ok && s != 8 && s != 0) {
        fault(evt, "no answer from the remote I/O for " + get(evt, "T_WATCHDOG") + " s", now);
    } else {
        if (stop_press && s >= 1 && s <= 5) {
            set(evt, "STOP_REQ", 1);
            say(evt, "STOP - finishing the bottle under the nozzle");
        }
        var stop_req = bit(evt, "STOP_REQ");

        if (s == 0) {                                          // IDLE
            if (start_rise) {
                if (!stop_ok) say(evt, "START refused - STOP is pressed");
                else if (!comm_ok) say(evt, "START refused - no remote I/O");
                else { set(evt, "CYCLE_MS", now); go(evt, 1, now); say(evt, "running"); }
            }
        } else if (s == 1) {                                   // CONVEY
            if (stop_req && !pe_fill) {
                set(evt, "STOP_REQ", 0); go(evt, 0, now); say(evt, "stopped");
            } else if (pe_fill) {
                go(evt, 2, now);
            }
        } else if (s == 2) {                                   // POSITION
            if (t >= get(evt, "T_SETTLE")) go(evt, 3, now);
        } else if (s == 3) {                                   // FILL
            if (!pe_fill)           fault(evt, "the bottle left the nozzle while filling", now);
            else if (ls_full)       go(evt, 4, now);
            else if (t >= get(evt, "T_FILL_MAX"))
                fault(evt, "not full after " + get(evt, "T_FILL_MAX") + " s - is the supply tank empty?", now);
        } else if (s == 4) {                                   // DRIP
            if (t >= get(evt, "T_DRIP")) {
                set(evt, "FILLED", get(evt, "FILLED") + 1.0);
                go(evt, 5, now);
            }
        } else if (s == 5) {                                   // RELEASE
            if (!pe_fill) {
                set(evt, "CYCLE", 0.1 * Math.round((now - evt.GetValue("id('CYCLE_MS')/@val")) / 100.0));
                set(evt, "CYCLE_MS", now);
                if (stop_req) { set(evt, "STOP_REQ", 0); go(evt, 0, now); say(evt, "stopped"); }
                else go(evt, 1, now);
            }
        } else if (s == 8) {                                   // FAULT
            if (reset_rise) {
                if (!comm_ok) say(evt, "RESET refused - still no remote I/O");
                else { set(evt, "FAULT", ""); set(evt, "STOP_REQ", 0); go(evt, 0, now); say(evt, "reset - press START"); }
            }
        } else if (s == 9) {                                   // E-STOP
            if (reset_rise) { go(evt, 0, now); say(evt, "reset after the emergency stop - press START"); }
        }
    }

    // ---- 4  the output image -------------------------------------------------------
    s = parseInt("" + evt.GetValue("id('STEP')/@val"));
    var blink = (Math.floor(now / 500.0) % 2) == 0;             // 1 Hz lamp
    var conv  = estop_ok && (s == 1 || s == 5);
    // THE INTERLOCK: the valve needs a bottle under it, whatever the step says
    var valve = estop_ok && s == 3 && pe_fill;
    var lrun  = (s >= 1 && s <= 5) && !(bit(evt, "STOP_REQ") && !blink);
    var lflt  = (s == 9) || (s == 8 && blink);

    // the LIFE BIT: flips every 500 ms, whatever the program does. The
    // remote I/O switches its outputs off when it stops flipping.
    var life = (Math.floor(now / 500.0) % 2) == 1;

    var q = (conv ? 1 : 0) + (valve ? 2 : 0) + (lrun ? 4 : 0) + (lflt ? 8 : 0) + (life ? 32768 : 0);
    set(evt, "Q_CMD", q);
    set(evt, "Q_CONV", conv ? 1 : 0);
    set(evt, "Q_VALVE", valve ? 1 : 0);
    set(evt, "Q_LRUN", lrun ? 1 : 0);
    set(evt, "Q_LFLT", lflt ? 1 : 0);

    // ---- 5  write the outputs - one Modbus register, only when it differs
    //         from what the remote I/O reported in the last poll
    if (comm_ok && q != parseInt("" + evt.GetValue("id('Q_WORD')/@pro")))
        evt.SetValue("id('Q_WORD')/@pro", q);
    return 0;
}

// val_fnc of CABLE: the bench pulls the fieldbus cable, or plugs it back.
function on_cable(evt)
{
    evt.SetValue("id('CN_MB')/@sta", evt.valn == 1 ? 0x0303 : 0x0000);
    evt.Log(4, "PLC: the fieldbus cable is " + (evt.valn == 1 ? "plugged back in" : "PULLED"));
    return 0;
}
