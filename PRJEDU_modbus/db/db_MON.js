// =====================================================================
// MON/S00 -- the monitoring side.
//
// Notice how little there is. The polling, the bit picking, the scaling,
// the rounding, the limits and the alarm state are all XML: PRO.pol,
// pro_adr="2.1", VAL.cnv, ATR.rou, ATR.lmt and ALM.onlvl do that work
// without a line of script. Script is for the things that are genuinely
// yours -- here, two log lines.
//
// That is the shape of a healthy AyMON project: configuration does the
// standard work, script does the specific work.
// =====================================================================

function start(evt)
{
    evt.Log(4, "MON: polling unit 1 at 127.0.0.1:1502, holding registers 0..3, once a second");
    return 0;
}

// Called on every new value of PUMP_RUN, because the <io> names it in
// val_fnc. TRAP: inside a val_fnc the attribute still holds the OLD value --
// the one being written is evt.valn. Getting this wrong is the classic
// first bug, and it looks like "my script is one poll behind".
function on_pump(evt)
{
    var now = evt.valn;
    var was = evt.obj.val;
    if (now == was) return 0;

    evt.Log(4, "MON: pump " + (now ? "STARTED" : "stopped"));
    return 0;
}

// Every ten seconds: what the plant looks like right now.
function report(evt)
{
    var lvl = evt.GetValue("id('TANK_LEVEL')/@val");
    var tmp = evt.GetValue("id('TANK_TEMP')/@val");
    var pmp = evt.GetValue("id('PUMP_RUN')/@val");
    var vlv = evt.GetValue("id('VALVE_OPEN')/@val");
    var hot = evt.GetValue("id('TEMP_HIGH')/@val");
    var sta = evt.GetValue("id('TANK_LEVEL')/@sta");

    evt.Log(4, "MON: level " + lvl + " %, temp " + tmp + " C, pump "
             + (pmp ? "on" : "off") + ", valve " + (vlv ? "open" : "shut")
             + ", hot " + hot + ", level sta " + sta);
    return 0;
}
