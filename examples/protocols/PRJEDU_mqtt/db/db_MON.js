// =====================================================================
// MON/S00 -- the monitoring side.
//
// Subscribing, parsing the payload, the limits and the alarm state are
// XML. Script does the three things that are this project's own: log
// lines, a set point that moves on its own, and a JSON summary published
// back to the broker.
// =====================================================================

function start(evt)
{
    evt.Log(4, "MON: MQTT client to 127.0.0.1:1884, subscribing FLD/S00/+/val");
    return 0;
}

// val_fnc of PUMP. The attribute still holds the OLD value; the new one
// is evt.valn.
function on_pump(evt)
{
    if (evt.valn == evt.obj.val) return 0;
    evt.Log(4, "MON: pump " + (evt.valn == 1 ? "STARTED" : "stopped"));
    return 0;
}

// sta_fnc of LEVEL: ALM.onlvl moved the alarm bits (0x0004 warning,
// 0x0008 alarm) inside 'sta'. Only the alarm bits matter here.
function on_alarm(evt)
{
    var now = evt.stan & 0x000C;
    var was = evt.stap & 0x000C;
    if (now == was) return 0;

    var name = ["normal", "WARNING", "ALARM", "EMERGENCY"];
    evt.Log(4, "MON: level " + name[now >> 2] + " (sta " + evt.stap + " -> " + evt.stan + ")");
    return 0;
}

// Every thirty seconds, 40 -> 70 -> 95 -> 40 ...  95 drives the level past
// both high limits, so the alarm path is exercised too.
//
// The write goes to @pro, the WIRE side of the point: that is what runs
// PRO.out and puts FLD/S00/SETPOINT/val/set on the wire. Writing @val
// would change this engine's copy and tell nobody.
function move_setpoint(evt)
{
    var steps = [40.0, 70.0, 95.0];
    var n = evt.GetValue("id('MOVE_SP')/@cnt");
    var sp = steps[n % 3];

    evt.Log(4, "MON: asking the field for set point " + sp + " %");
    evt.SetValue("id('SETPOINT')/@pro", sp);
    evt.SetValue("id('MOVE_SP')/@cnt", n + 1);
    return 0;
}

// Every ten seconds: one log line, and the same numbers as ONE JSON
// message on MON/S00/summary.
//
// MQTT.publish is the script's way onto the wire for a topic that is not
// a point. The broker relays it to anyone subscribed -- mosquitto_sub
// sees it (README). It is NOT replayed to a late subscriber: the broker's
// retain comes from the field document, and this topic is not in it.
function report(evt)
{
    var lvl = evt.GetValue("id('LEVEL')/@val");
    var tmp = evt.GetValue("id('TEMP')/@val");
    var pmp = evt.GetValue("id('PUMP')/@val");
    var sp  = evt.GetValue("id('SETPOINT')/@val");
    var sta = evt.GetValue("id('LEVEL')/@sta");

    evt.Log(4, "MON: level " + lvl + " % (set point " + sp + "), temp " + tmp
             + " C, pump " + (pmp == 1 ? "on" : "off") + ", level sta " + sta);

    var summary = { level: lvl, setpoint: sp, temp: tmp, pump: pmp,
                    alarm: sta & 0x000C, time: Time.GetTimeStr(0) };
    if (!MQTT.publish("CN_MQ", "MON/S00/summary", JSON.stringify(summary), 0, 0))
        evt.Log(4, "MON: summary not sent (broker not connected?)");
    return 0;
}
