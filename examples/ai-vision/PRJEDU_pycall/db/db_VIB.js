// =====================================================================
// db_VIB.js - VIB/S00's JScript side: the vibration sensor (simulated)
// and the call to Python's forecast().
//
//   sense(evt)    every 2 s: one block of 512 samples (2560 samples a
//                 second, 0.2 s) into WAVE. Writing WAVE is all it does
//                 - the XML hands the block to Python (val_fnc) and this
//                 function returns at once.
//   ask(evt)      every 5 s: vib.forecast(limit, now) - an ARGUMENT call
//                 into Python. It answers 1 = "queued" before Python has
//                 even started; the answer arrives in FORECAST later.
//   service(evt)  the page's "Replace the bearing" (SERVICE's val_fnc)
//
// The pump: 1500 rpm (25 Hz) with some imbalance, its 2nd harmonic, and
// a bearing whose outer race is going: a 90 Hz component (the bearing's
// BPFO) that grows by itself, modulated by the running speed.
// =====================================================================

var FS = 2560.0;
var N = 512;
var LIMIT = 4.5;          // RMS alarm limit, mm/s - the same number as RMS's val_alm_onlhi_alm

function start(evt)
{
    evt.Log(4, "VIB: a sensor block every 2 s -> WAVE -> Python analyse(); forecast() every 5 s");
    return 0;
}

function r3(v) { return (0.0 + Math.round(v * 1000.0)) / 1000.0; }

function sense(evt)
{
    // the bearing gets worse every block, and faster the worse it is -
    // the way a spalling race goes: warning in about a minute and a half,
    // alarm about a minute later
    var f = 0.0 + evt.GetValue("id('FAULT')/@val");
    f = f * 1.02 + 0.02;
    if (f > 9.0) f = 9.0;
    evt.SetValue("id('FAULT')/@val", r3(f));

    var w = 2.0 * Math.PI;
    var p1 = w * Math.random(), p2 = w * Math.random(), p3 = w * Math.random();
    var x = [];
    for (var i = 0; i < N; i++) {
        var t = (0.0 + i) / FS;                                         // 0.0 + : the left operand decides the type
        var v = 1.6 * Math.sin(w * 25.0 * t + p1)                       // running speed
              + 0.5 * Math.sin(w * 50.0 * t + p2)                       // its 2nd harmonic
              + f * Math.sin(w * 90.0 * t + p3) * (1.0 + 0.3 * Math.sin(w * 25.0 * t))   // the bearing
              + 0.5 * (Math.random() - 0.5);                            // everything else
        x.push(r3(v));
    }
    // One write. WAVE's val_fnc queues vib.analyse(evt) on the Python
    // thread; this timer is done before Python has looked at the block.
    evt.SetValue("id('WAVE')/@val", JSON.stringify({ t: Time.GetTimeMs(), fs: FS, x: x }));
    return 0;
}

function ask(evt)
{
    var t0 = Time.GetTimeMs();
    var q = vib.forecast(LIMIT, t0);          // 1 = queued; the result is not here
    var t1 = Time.GetTimeMs();
    evt.SetValue("id('JS_CALL')/@val", JSON.stringify({ call: "forecast", at: t0, returned: q, ms: t1 - t0 }));
    return 0;
}

function service(evt)
{
    if (evt.valn <= evt.valp) return 0;                     // the page writes the count + 1
    evt.SetValue("id('FAULT')/@val", 0.3);                  // a new bearing is not a perfect one
    evt.Log(4, "VIB: the bearing was replaced");
    return 0;
}
