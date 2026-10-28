// =====================================================================
// CTL/S00 - the PID controller, the step-response measurement and the
// step test that suggests a tuning.
//
//   tick(evt)        every T_PID period (the sample time h), on TH_CTL
//   on_sp / on_mode / on_tuning / on_aw / on_tune
//                    val_fnc of the lab's controls: they log and note, the
//                    work is done in tick
//
// Everything is a <var> of this document, so every term of the loop can
// be watched while it runs.
//
// TYPED ARITHMETIC. In this script language the LEFT operand decides:
// 3 / 10 is 0 when 3 is an integer, and 0.0 + "0.5" is the text "00.5".
// get() below turns every value into a float, and every constant here is
// written with its decimal point.
// =====================================================================

function start(evt)
{
    evt.Log(4, "CTL: PID on the heater - Kp " + get(evt, "KP") + ", Ti " + get(evt, "TI")
               + " s, Td " + get(evt, "TD") + " s, h " + get(evt, "T_PID", "evt_per") + " s");
    evt.Log(4, "CTL: open http://127.0.0.1:8092/");
    return 0;
}

// A value as a float. parseFloat, not 0.0 + v: an attribute that is not
// typed (evt_per is one) comes back as TEXT, and 0.0 + "0.5" is the text
// "00.5" - a string concatenation, not a sum.
function get(evt, id, atr)
{
    var v = evt.GetValue("id('" + id + "')/@" + (atr ? atr : "val"));
    return (v == null) ? 0.0 : parseFloat("" + v);
}
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function round2(v) { return 0.01 * Math.round(v * 100.0); }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function say(evt, txt)
{
    set(evt, "MSG", txt);
    evt.Log(4, "CTL: " + txt);
}

// ---- the lab's controls -------------------------------------------------------

// A set-point change is a step response to measure. Inside a *_fnc the
// attribute still holds the old value: evt.valp is where the step starts.
function on_sp(evt)
{
    var from = 0.0 + evt.valp, to = 0.0 + evt.valn;
    if (from == to) return 0;
    set(evt, "STEP_FROM", from);
    set(evt, "STEP_TO", to);
    set(evt, "STEP_T", 0.0);
    set(evt, "T10", -1.0);
    set(evt, "T90", -1.0);
    set(evt, "RISE", -1.0);
    set(evt, "OVERSHOOT", 0.0);
    set(evt, "SETTLE", -1.0);
    set(evt, "IAE", 0.0);
    set(evt, "STEP_ON", 1);
    evt.Log(4, "CTL: set point " + from + " -> " + to + " C");
    return 0;
}

function on_mode(evt)
{
    evt.Log(4, "CTL: " + (evt.valn == 1 ? "AUTO - the PID drives the heater" : "MANUAL - MV follows MV_MAN"));
    return 0;
}

function on_tuning(evt)
{
    evt.Log(4, "CTL: " + evt.obj.id + " " + evt.valp + " -> " + evt.valn);
    return 0;
}

function on_aw(evt)
{
    evt.Log(4, "CTL: anti-windup " + (evt.valn == 1 ? "ON" : "OFF - the integral may run away while MV is at a limit"));
    return 0;
}

function on_tune(evt)
{
    if (evt.valn == 1) evt.Log(4, "CTL: step test requested");
    return 0;
}

// ---- the loop ------------------------------------------------------------------

function tick(evt)
{
    var h  = get(evt, "T_PID", "evt_per");          // the sample time
    var pv = evt.GetValue("doc('PLT/S00')/id('TM')/@val");
    if (pv == null) return 0;                        // no plant yet
    pv = parseFloat("" + pv);
    set(evt, "PV", pv);
    set(evt, "FAN_SEEN", evt.GetValue("doc('PLT/S00')/id('FAN')/@val"));

    // the step test takes the loop over while it runs
    if (tune(evt, pv, h)) return 0;

    var sp = get(evt, "SP");
    var kp = get(evt, "KP"), ti = get(evt, "TI"), td = get(evt, "TD");
    var auto = (evt.GetValue("id('MODE')/@val") == 1);

    // ---- the trip -------------------------------------------------------
    var trip = get(evt, "T_TRIP");
    if (pv >= trip && evt.GetValue("id('TRIPPED')/@val") != 1) {
        set(evt, "TRIPPED", 1);
        set(evt, "MV_MAN", 0.0);
        set(evt, "MODE", 0);
        auto = false;
        say(evt, "TRIP - " + round2(pv) + " C reached T_TRIP " + trip + " C: heater off, MANUAL");
    }
    if (evt.GetValue("id('TRIPPED')/@val") == 1 && pv < trip - 10.0) {
        set(evt, "TRIPPED", 0);
        say(evt, "trip cleared at " + round2(pv) + " C - AUTO may be selected again");
    }

    // ---- the PID ----------------------------------------------------------
    var e  = sp - pv;
    var p  = kp * e;
    var i  = get(evt, "I_STATE");
    var d  = get(evt, "D_STATE");
    var pvp = get(evt, "PV_PREV");

    // derivative on the measurement, first-order filtered:
    //   D_k = a * D_k-1 - Kp * Td * N / (Td + N h) * (y_k - y_k-1),  a = Td / (Td + N h)
    if (td > 0.0) {
        var n = get(evt, "N_FILT");
        var den = td + n * h;
        d = td / den * d - kp * td * n / den * (pv - pvp);
    } else {
        d = 0.0;
    }

    var mv;
    if (auto && evt.GetValue("id('TRIPPED')/@val") != 1) {
        var v = p + i + d;                           // what the PID asks for
        mv = clamp(v, 0.0, 100.0);                   // what the heater can do
        if (ti > 0.0) {
            // Anti-windup by conditional integration: at a limit, stop
            // integrating in the direction that pushes further into it.
            var stuck = (v > 100.0 && e > 0.0) || (v < 0.0 && e < 0.0);
            if (!(get(evt, "AW") == 1.0 && stuck))
                i = i + kp * h / ti * e;
        }
    } else {
        // MANUAL: the output is the operator's, and the integral tracks it
        // (I = MV - P - D), so that AUTO starts from here without a bump.
        mv = get(evt, "MV_MAN");
        i = mv - p - d;
    }

    // the state at full precision (local), the terms rounded for the page
    set(evt, "I_STATE", i);
    set(evt, "D_STATE", d);
    set(evt, "MV", round2(mv));
    set(evt, "P_TERM", round2(p));
    set(evt, "I_TERM", round2(i));
    set(evt, "D_TERM", round2(d));
    set(evt, "PV_PREV", pv);

    measure(evt, pv, sp, h, auto);
    return 0;
}

// ---- the step response ------------------------------------------------------------
//
// Measured on the set-point step last made in AUTO: 10 -> 90 % rise time,
// overshoot past the new set point in % of the step, settling time (the
// last moment outside a band of 2 % of the step, at least 0.2 C), and
// IAE, the integral of |error|. Reported after 180 s, or when the next
// step starts.
function measure(evt, pv, sp, h, auto)
{
    if (evt.GetValue("id('STEP_ON')/@val") != 1) return;
    if (!auto) { set(evt, "STEP_ON", 0); return; }

    var from = get(evt, "STEP_FROM"), to = get(evt, "STEP_TO");
    var t = get(evt, "STEP_T") + h;
    set(evt, "STEP_T", t);
    set(evt, "IAE", round2(get(evt, "IAE") + Math.abs(sp - pv) * h));

    var size = to - from;
    var progress = (pv - from) / size;
    if (get(evt, "T10") < 0.0 && progress >= 0.1) set(evt, "T10", t);
    if (get(evt, "T90") < 0.0 && progress >= 0.9) {
        set(evt, "T90", t);
        set(evt, "RISE", round2(t - get(evt, "T10")));
    }
    var over = (progress - 1.0) * 100.0;
    if (over > get(evt, "OVERSHOOT")) set(evt, "OVERSHOOT", round2(over));

    var band = Math.max(0.02 * Math.abs(size), 0.2);
    if (Math.abs(pv - to) > band) set(evt, "SETTLE", round2(t));

    if (t >= 180.0) {
        set(evt, "STEP_ON", 0);
        var rise = get(evt, "RISE"), settle = get(evt, "SETTLE");
        say(evt, "step " + from + " -> " + to + " C: rise " + (rise < 0.0 ? "never reached 90 %" : rise + " s")
                 + ", overshoot " + get(evt, "OVERSHOOT") + " %, settling "
                 + (settle >= 170.0 ? "not within 180 s" : settle + " s")
                 + ", IAE " + Math.round(get(evt, "IAE")) + " C.s");
    }
}

// ---- the step test ------------------------------------------------------------------
//
// Returns true while it has the loop. Phases:
//   1  MANUAL at the current heater power; wait until the temperature
//      moves less than 0.3 C in 15 s
//   2  step the heater by TUNE_STEP and record every sample until the
//      temperature settles again (less than 1 % of the change in 20 s)
//   3  fit and suggest, put the loop back
function tune(evt, pv, h)
{
    var want = (evt.GetValue("id('TUNE')/@val") == 1);
    var phase = evt.GetValue("id('TUNE_PHASE')/@val");

    if (!want) {
        if (phase != 0) tune_end(evt, "stopped");
        return false;
    }

    var t = get(evt, "TUNE_T") + h;
    set(evt, "TUNE_T", t);

    if (phase == 0) {                                // start
        set(evt, "TUNE_MODE0", evt.GetValue("id('MODE')/@val"));
        set(evt, "TUNE_MV0", get(evt, "MV"));
        set(evt, "MV_MAN", get(evt, "MV"));
        set(evt, "MODE", 0);
        set(evt, "STEP_ON", 0);
        set(evt, "TUNE_PHASE", 1);
        set(evt, "TUNE_T", 0.0);
        set(evt, "TUNE_REF", pv);
        say(evt, "step test: MANUAL at " + round2(get(evt, "MV")) + " %, waiting for a steady temperature");
        set(evt, "TUNE_STATE", "waiting for a steady temperature");
        return hold(evt, pv);
    }

    if (phase == 1) {                                // waiting for steady
        if (t >= 15.0) {
            if (Math.abs(pv - get(evt, "TUNE_REF")) < 0.3) {
                var mv0 = get(evt, "TUNE_MV0"), dmv = get(evt, "TUNE_STEP");
                if (mv0 + dmv > 100.0) dmv = 0.0 - dmv;   // no room upwards: step down
                set(evt, "TUNE_DMV", dmv);
                set(evt, "TUNE_PV0", pv);
                set(evt, "MV_MAN", mv0 + dmv);
                set(evt, "TUNE_DATA", "[]");
                set(evt, "TUNE_PHASE", 2);
                set(evt, "TUNE_T", 0.0);
                set(evt, "TUNE_STATE", "recording the answer to a " + dmv + " % step");
                say(evt, "step test: steady at " + round2(pv) + " C, heater " + round2(mv0) + " -> " + round2(mv0 + dmv) + " %");
            } else {
                set(evt, "TUNE_REF", pv);            // not yet: another 15 s
                set(evt, "TUNE_T", 0.0);
            }
        }
        if (t > 600.0) tune_end(evt, "gave up: the temperature did not settle in 10 minutes");
        return hold(evt, pv);
    }

    // phase 2: recording
    var data = JSON.parse(evt.GetValue("id('TUNE_DATA')/@val"));
    data.push(round2(pv));
    set(evt, "TUNE_DATA", JSON.stringify(data));

    var n20 = Math.round(20.0 / h);
    var moved = pv - get(evt, "TUNE_PV0");
    if (t > 30.0 && data.length > n20 && Math.abs(moved) > 0.5) {
        var back = 0.0 + data[data.length - 1 - n20];
        if (Math.abs(pv - back) < 0.01 * Math.abs(moved)) {
            fit(evt, data, h);
            return hold(evt, pv);
        }
    }
    if (t > 900.0) tune_end(evt, "gave up: no steady answer in 15 minutes");
    return hold(evt, pv);
}

// MANUAL output while the step test has the loop, with the integral tracking
function hold(evt, pv)
{
    var mv = get(evt, "MV_MAN");
    var p = get(evt, "KP") * (get(evt, "SP") - pv);
    set(evt, "I_STATE", mv - p);
    set(evt, "D_STATE", 0.0);
    set(evt, "MV", round2(mv));
    set(evt, "P_TERM", round2(p));
    set(evt, "I_TERM", round2(mv - p));
    set(evt, "D_TERM", 0.0);
    set(evt, "PV_PREV", pv);
    return true;
}

// First order plus dead time from the recorded answer, by the two-point
// method: the times at which 28.3 % and 63.2 % of the change are reached
// give tau = 1.5 (t63 - t28) and theta = t63 - tau. Then the SIMC rules
// (Skogestad) for a PI with the closed-loop time constant tc = theta:
//   Kp = tau / (K (tc + theta)),   Ti = min(tau, 4 (tc + theta))
function fit(evt, data, h)
{
    var pv0 = get(evt, "TUNE_PV0"), dmv = get(evt, "TUNE_DMV");
    var m = data.length;
    var last = 0.0;
    for (var j = m - 10; j < m; j++) last = last + data[j];
    last = last / 10.0;
    var change = last - pv0;
    var k = change / dmv;

    var t28 = -1.0, t63 = -1.0;
    for (var i = 0; i < m; i++) {
        var f = (0.0 + data[i] - pv0) / change;
        if (t28 < 0.0 && f >= 0.283) t28 = h * (i + 1);   // h first: a float on the left
        if (t63 < 0.0 && f >= 0.632) t63 = h * (i + 1);
    }
    var tau = 1.5 * (t63 - t28);
    var theta = t63 - tau;
    if (theta < 0.0) theta = 0.0;
    var tc = Math.max(theta, 0.1 * tau);
    var kp = tau / (k * (tc + theta));
    var ti = Math.min(tau, 4.0 * (tc + theta));

    set(evt, "ID_K", round2(k));
    set(evt, "ID_TAU", round2(tau));
    set(evt, "ID_THETA", round2(theta));
    set(evt, "SUG_KP", round2(kp));
    set(evt, "SUG_TI", round2(ti));
    tune_end(evt, "done: K " + round2(k) + " C/%, tau " + round2(tau) + " s, theta " + round2(theta)
                  + " s -> suggested PI: Kp " + round2(kp) + " %/C, Ti " + round2(ti) + " s");
}

function tune_end(evt, why)
{
    set(evt, "MV_MAN", get(evt, "TUNE_MV0"));
    set(evt, "MODE", evt.GetValue("id('TUNE_MODE0')/@val"));
    set(evt, "TUNE_PHASE", 0);
    set(evt, "TUNE_T", 0.0);
    set(evt, "TUNE", 0);
    set(evt, "TUNE_STATE", why);
    say(evt, "step test " + why);
}
