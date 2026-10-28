// =====================================================================
// PRJEDU_mcp / PLT/S00 -- the plant simulator.
//
// Nothing in this file knows about MCP. The assistant sees the plant the
// same way every other client does: through the element tree. That is the
// point -- an AI endpoint is one more channel, not one more design.
// =====================================================================

function start(evt)
{
    evt.Log(4, "PLANT: running; MCP endpoints on 127.0.0.1:8095 (read) and :8096 (read+write)");
    return 0;
}

// Once a second. The tank fills while the pump runs and drains while it
// does not; the controller switches the pump around SETPOINT unless MAINT
// is 1.
function tick(evt)
{
    var n    = evt.GetValue("id('COUNT')/@val");
    var lvl  = evt.GetValue("id('LEVEL')/@val");      // double
    var sp   = evt.GetValue("id('SETPOINT')/@val");   // double
    var pump = evt.GetValue("id('PUMP')/@val");
    var man  = evt.GetValue("id('MAINT')/@val");

    // The left operand decides the type of the result: start with the
    // double, so 'lvl + ...' stays floating point.
    lvl = lvl + (pump ? 1.6 : -1.0) + (Math.random() - 0.5);

    if (!man) {
        // Two-point control with a little hysteresis. With the default
        // setpoint (60) the level stays well inside the alarm limits; raise
        // the setpoint to 90 and it rides into the WARNING band above 85.
        if (lvl < sp - 8) evt.SetValue("id('PUMP')/@val", 1);
        if (lvl > sp + 4) evt.SetValue("id('PUMP')/@val", 0);
    }

    // One write; ATR.rou, ATR.lmt and ALM.onlvl do the rest.
    evt.SetValue("id('LEVEL')/@val", lvl);
    evt.SetValue("id('COUNT')/@val", n + 1);
    return 0;
}

// Called when LEVEL's sta changes, i.e. when the value crosses a limit.
// The same transition is what an assistant sees as sta_txt "RUN WRN new".
function on_level(evt)
{
    if (evt.stan == evt.stap) return 0;
    evt.Log(4, "LEVEL sta " + evt.stap + " -> " + evt.stan
             + "  value " + evt.GetValue("id('LEVEL')/@val") + " %");
    return 0;
}
