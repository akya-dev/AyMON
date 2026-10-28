// =====================================================================
// MON/S00 - the monitoring side.
//
// Notice what is NOT here: no OIDs, no packets, no polling loop, no
// parsing. PRO.pol asks, the <io> addresses say what to ask for, VAL.put
// brings the answer across, VAL.cnv scales it and ALM.onlvl raises the
// alarm. Script only says things that are this project's own.
// =====================================================================

function start(evt)
{
    evt.Log(4, "MON: SNMP v2c manager -> 127.0.0.1:1161, base 1.3.6.1.4.1.99999, every 2 s");
    return 0;
}

// val_fnc of PUMP. Inside a chain the attribute still holds the OLD value;
// the one being written is evt.valn.
function on_pump(evt)
{
    if (evt.valn == evt.obj.val) return 0;
    evt.Log(4, "MON: pump " + (evt.valn == 1 ? "STARTED" : "stopped"));
    return 0;
}

// sta_fnc of LEVEL: ALM.onlvl moved the alarm bits (0x0004 warning,
// 0x0008 alarm) inside 'sta'.
function on_alarm(evt)
{
    var now = evt.stan & 0x000C;
    var was = evt.stap & 0x000C;
    if (now == was) return 0;

    var name = ["normal", "WARNING", "ALARM", "EMERGENCY"];
    evt.Log(4, "MON: level " + name[now >> 2] + " (sta " + evt.stap + " -> " + evt.stan + ")");
    return 0;
}

function report(evt)
{
    var lvl = evt.GetValue("id('LEVEL')/@val");
    var tmp = evt.GetValue("id('TEMP')/@val");
    var pmp = evt.GetValue("id('PUMP')/@val");
    var str = evt.GetValue("id('STARTS')/@val");
    var upt = evt.GetValue("id('UPTIME')/@val");
    var dsc = evt.GetValue("id('DESCR')/@val");

    evt.Log(4, "MON: level " + lvl + " %, temp " + tmp + " C, pump " + (pmp == 1 ? "on" : "off")
             + ", starts " + str + ", agent up " + (upt / 100) + " s ('" + dsc + "')");
    return 0;
}
