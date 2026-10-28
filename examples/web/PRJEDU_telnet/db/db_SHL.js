// =====================================================================
// PRJEDU_telnet -- the script side.
//
// A script file is a COLLECTION OF FUNCTIONS, not a program: nothing here
// runs by itself. The engine calls these because an XML attribute names
// them -- xdb_start="main.start(evt);", evt_fnc="[main.tick]",
// sta_fnc="[EVT.sta,main.on_level]", pro_oncmd="main.shell_cmd(ses, cmd);".
//
// The language is the engine's own JScript-like engine; the six places it
// is not JavaScript are in docs/03_Scripting.md.
// =====================================================================

// ---------------------------------------------------------------------
// THE PLANT
// ---------------------------------------------------------------------

function start(evt)
{
    evt.Log(4, "SHELL: telnet 127.0.0.1 2323   (TLS on 2324)");
    evt.Log(4, "SHELL: users admin/admin123, eng/eng123, opr/opr123, mon/mon123");
    return 0;
}

// Once a second. The tank fills while the pump runs and drains while it
// does not; the simulator only drives the pump while MAINT is 0.
function tick(evt)
{
    var n    = evt.GetValue("id('COUNT')/@val");
    var lvl  = evt.GetValue("id('LEVEL')/@val");   // double
    var pump = evt.GetValue("id('PUMP')/@val");
    var man  = evt.GetValue("id('MAINT')/@val");

    // The left operand decides the type of the result, so start with the
    // double: 'lvl + ...' is floating point, '1 + lvl' would not be.
    lvl = lvl + (pump ? 1.7 : -1.1) + (Math.random() - 0.5);

    if (!man) {
        // Plain two-point control, with the limits deliberately outside the
        // alarm limits: the level therefore visits WARNING on both sides,
        // which gives 'log on' in the shell something to show.
        if (lvl < 15) evt.SetValue("id('PUMP')/@val", 1);
        if (lvl > 92) evt.SetValue("id('PUMP')/@val", 0);
    }

    // ONE write, and the element does the rest: ATR.rou rounds to val_rou,
    // ATR.lmt clamps to val_min..val_max, ALM.onlvl moves the alarm bits
    // inside 'sta'. None of that is script.
    evt.SetValue("id('LEVEL')/@val", lvl);
    evt.SetValue("id('COUNT')/@val", n + 1);
    return 0;
}

// Called whenever LEVEL's 'sta' changes -- which is what ALM.onlvl does
// when the value crosses a limit. Without a user interface, the log is
// where an alarm shows up, and 'log on' in the shell is how you watch it.
function on_level(evt)
{
    var now = evt.stan;
    var was = evt.stap;
    if (now == was) return 0;

    evt.Log(4, "LEVEL sta " + was + " -> " + now
             + "  value " + evt.GetValue("id('LEVEL')/@val") + " %");
    return 0;
}

// ---------------------------------------------------------------------
// THE COMMAND HOOK  (pro_oncmd)
//
// Consulted AFTER the built-in commands (help, who, ver, log, cd, exit)
// and BEFORE script evaluation. Return a value to answer the command;
// return nothing at all and the shell evaluates the line itself.
//
// It runs with the SESSION'S OWN ROLE, like everything else in the shell.
// That is what makes 'ses.user_role' worth testing here: the hook is not a
// way to escalate, it is a place to refuse early with a readable message
// instead of letting the write fail silently against an xdb_acl.
// ---------------------------------------------------------------------

function shell_cmd(ses, cmd)
{
    var line = String.trim(cmd);
    var low  = String.toLowerCase(line);

    if (low == "ping") return "pong";

    if (low == "plant")
        return "level "  + evt.GetValue("id('LEVEL')/@val") + " %"
             + ", pump " + (evt.GetValue("id('PUMP')/@val")  ? "on" : "off")
             + ", mode " + (evt.GetValue("id('MAINT')/@val") ? "MANUAL" : "auto")
             + ", step " + evt.GetValue("id('COUNT')/@val")
             + "  (you are " + ses.user + ", role " + ses.user_role + ")";

    if (low == "pump on" || low == "pump off")
    {
        if (ses.user_role < 3)
            return "pump: role " + ses.user_role + " may not touch the pump";

        if (!evt.GetValue("id('MAINT')/@val"))
            return "pump: the simulator owns the pump - an engineer has to"
                 + " set MAINT first:\r\n"
                 + "      evt.SetValue(\"id('MAINT')/@val\", 1)";

        var on = (low == "pump on") ? 1 : 0;

        // The write still goes through PUMP's own xdb_acl with this
        // session's role: the check above is a courtesy, not the gate.
        evt.SetValue("id('PUMP')/@val", on);
        return "pump " + (on ? "on" : "off");
    }

    // No return: 'help', a script expression, anything else falls through.
}
