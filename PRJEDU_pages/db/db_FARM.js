// =====================================================================
// PRJEDU_pages / FARM/S00 - the simulation, the level controllers, and
// the helpers the pages call.
//
//   start(evt)            once, after the document is loaded
//   step(evt)             once a second (the SIM timer): levels move, the
//                         controllers switch the pumps
//   tanks()               the tank ids, in order
//   tank(evt, id)         one tank as an object - what every page shows
//   set_points(evt, id, hi, lo)
//                         change a tank's set points; "" = done, else why not
//
// A page (.ayp) calls these as main.tank(evt, "T1"): a server page is a
// script like any other and sees this module by its scope name. Keeping
// the plant's knowledge HERE and the HTML in the page is the same split
// as model and view - the API page (api.ayp) and the HTML pages use the
// same tank() and cannot disagree.
// =====================================================================

var TANKS = ["T1", "T2", "T3"];
var INFLOW = 2.4;                        // % a second while the pump runs
var OUTFLOW = { T1: 1.1, T2: 0.8, T3: 0.45 };

function tanks() { return TANKS; }

function get(evt, id) { return evt.GetValue("id('" + id + "')/@val"); }

// 'sta' holds the alarm level in bits 2-3: 0 normal, 1 warning, 2 alarm,
// 3 emergency (0x0303 normal, 0x0347 warning, 0x034B alarm). 'sta' is a
// HEX-typed 16-bit value and the left operand decides the type of a
// result, so (sta & 0x000C) >> 2 would print as "0x0002"; 0 + ... makes
// it a plain integer.
function alarm_of(sta) { return 0 + ((sta & 0x000C) >> 2); }

function alarm_text(n) { return ["normal", "warning", "alarm", "emergency"][n]; }

// One tank, as the pages want it. null for an unknown id - a page must
// never put text from the request into an address unchecked, so it asks
// here first (see tank.ayp).
function tank(evt, id)
{
    if (TANKS.indexOf(id) < 0) return null;
    var sta = evt.GetValue("id('" + id + "_LVL')/@sta");
    return {
        id:    id,
        name:  evt.GetValue("id('" + id + "_LVL')/@desc"),
        level: get(evt, id + "_LVL"),
        pump:  get(evt, id + "_PUMP"),
        hi:    get(evt, id + "_SP_HI"),
        lo:    get(evt, id + "_SP_LO"),
        alarm: alarm_of(sta),
        text:  alarm_text(alarm_of(sta))
    };
}

// The page hands in what the visitor typed; the rules live here, once.
function set_points(evt, id, hi, lo)
{
    if (TANKS.indexOf(id) < 0) return "no such tank";
    var h = parseFloat("" + hi), l = parseFloat("" + lo);
    if (isNaN(h) || isNaN(l))    return "both set points must be numbers";
    if (h > 95.0 || h < 20.0)    return "stop the pump between 20 and 95 %";
    if (l < 5.0 || l > h - 10.0) return "start it at 5 % or more, and at least 10 % below the stop level";
    evt.SetValue("id('" + id + "_SP_HI')/@val", h);
    evt.SetValue("id('" + id + "_SP_LO')/@val", l);
    evt.Log(4, "set points of " + id + " changed to " + l + " .. " + h + " % (from a page, role " + evt.user_role + ")");
    return "";
}

function start(evt)
{
    evt.Log(4, "PRJEDU_pages: open http://127.0.0.1:8115/ - the pages are in ..\\www");
    return 0;
}

// One second of the plant. The controller is the classic two-point one:
// pump on at or below the low set point, off at or above the high one,
// and left as it is in between (that gap is what keeps it from chattering).
function step(evt)
{
    for (var i = 0; i < TANKS.length; i++) {
        var id = TANKS[i];
        var lvl  = 0.0 + get(evt, id + "_LVL");
        var pump = get(evt, id + "_PUMP");
        var hi   = 0.0 + get(evt, id + "_SP_HI");
        var lo   = 0.0 + get(evt, id + "_SP_LO");

        if (lvl <= lo) pump = 1;
        if (lvl >= hi) pump = 0;

        // what leaves the tank wanders a little, so the picture moves
        var out = OUTFLOW[id] * (0.6 + 0.8 * Math.random());
        lvl = lvl - out + (pump == 1 ? INFLOW : 0.0);

        evt.SetValue("id('" + id + "_PUMP')/@val", pump);
        evt.SetValue("id('" + id + "_LVL')/@val", lvl);     // ATR.lmt clamps, ALM.onlvl alarms
    }
    evt.SetValue("id('SIM')/@val", get(evt, "SIM") + 1);
    return 0;
}
