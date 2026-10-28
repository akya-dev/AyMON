// =====================================================================
// FLD/S00 -- the field side: a tank that fills and drains.
//
// Nothing here knows about MQTT. tick() writes values; the broker on
// CN_BRK publishes every change of this document. That is the whole
// integration.
// =====================================================================

function start(evt)
{
    evt.Log(4, "FLD: MQTT broker on 127.0.0.1:1884, publishing FLD/S00/<id>/<attribute>");
    return 0;
}

// Once a second. The pump starts 3 % below the set point and stops 3 %
// above it; the outlet drains at a rate that wanders.
function tick(evt)
{
    var n    = evt.GetValue("id('STEPS')/@val");
    var lvl  = evt.GetValue("id('LEVEL')/@val");
    var sp   = evt.GetValue("id('SETPOINT')/@val");
    var pump = evt.GetValue("id('PUMP')/@val");

    // Typed arithmetic, left operand decides (PRJEDU_101): n is an
    // unsigned integer, so the float goes on the left.
    var drain = 1.2 + 0.8 * Math.sin(n / 20.0);

    if (pump == 1 && lvl > sp + 3.0) pump = 0;
    if (pump == 0 && lvl < sp - 3.0) pump = 1;

    lvl = lvl - drain;
    if (pump == 1) lvl = lvl + 3.5;
    if (lvl < 0.0) lvl = 0.0;
    if (lvl > 100.0) lvl = 100.0;

    var t = 18.0 + 4.0 * Math.sin(n / 60.0) + (Math.random() - 0.5) * 0.2;

    // One MQTT message per value that actually CHANGES. PUMP is written
    // every second and goes on the wire only when it switches.
    evt.SetValue("id('LEVEL')/@val", lvl);
    evt.SetValue("id('TEMP')/@val",  t);
    evt.SetValue("id('PUMP')/@val",  pump);
    evt.SetValue("id('STEPS')/@val", n + 1);
    return 0;
}

// The last link of SETPOINT's val_fnc. The attribute still holds the OLD
// value here; the new one, already rounded and clamped, is evt.valn.
function on_setpoint(evt)
{
    evt.Log(4, "FLD: SETPOINT " + evt.valp + " -> " + evt.valn + " % (written over MQTT)");
    return 0;
}
