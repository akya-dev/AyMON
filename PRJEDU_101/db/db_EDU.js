// =====================================================================
// PRJEDU_101 -- the script side of the example.
//
// A script file is a COLLECTION OF FUNCTIONS, not a program: nothing here
// runs by itself. The engine calls these functions because an XML attribute
// names them -- xdb_start="main.start(evt);", evt_fnc="[main.read_sensor]",
// sta_fnc="[...,main.on_alarm]". The scope name 'main' comes from
// <script id="main">.
//
// The language is the engine's own JScript-like engine. It is close to
// JavaScript -- var/let/const, functions, objects, arrays, try/catch, throw,
// ?:, ||, &&, ?? -- and differs in six places worth knowing before you write
// anything long: docs/03_Scripting.md.
// =====================================================================

// Called once, after the document is loaded and its elements exist.
// evt is the event object of the document itself.
function start(evt)
{
    evt.Log(4, "PRJEDU_101: hello. Watch SENSOR / SENSOR_F / ALARM / COUNT.");
    evt.Log(4, "PRJEDU_101: the alarm limits are 10 / 14 / 26 / 30 degrees.");
    return 0;
}

// Called once a second by the timer on <var id="SENSOR">.
//
// TRAP WORTH LEARNING EARLY: inside a *_fnc chain, reading the attribute
// gives you the OLD value -- the value being written is evt.valn. Here we
// are the ones producing the value, so it does not bite, but it will the
// first time you write a val_fnc. (See docs/02_Timers_and_Events.md.)
function read_sensor(evt)
{
    // A slow sine plus a little noise: something to watch without hardware.
    // evt.GetValue / evt.SetValue take an ADDRESS: an XPath to an element
    // plus the attribute. id('X') is the fast form -- every element id is
    // indexed, so it does not walk the tree.
    var c = evt.GetValue("id('COUNT')/@val");

    // ---- THE ONE THING THAT SURPRISES EVERY NEWCOMER -------------------
    // ARITHMETIC HERE IS TYPED, NOT JavaScript's "everything is a double",
    // and THE LEFT OPERAND DECIDES THE TYPE OF THE RESULT.
    // COUNT is an unsigned 32-bit attribute, so 'c' is an INTEGER:
    //     c / 12               integer / integer -> 0, 0, 0, ... for c < 12
    //     20 + 0.22            integer + float   -> 20
    //     Math.round(x) / 100.0   integer / float -> still an integer
    // Put the float on the LEFT, or make the left operand a float:
    //     c / 12.0             20.0 + 0.22
    // This is not a bug to work around: it is how a control engine keeps a
    // 16-bit register 16 bits wide. Be deliberate about your literals.
    // --------------------------------------------------------------------
    var v = 20.0 + 12.0 * Math.sin(c / 12.0) + (Math.random() - 0.5);
    var f = v * 9.0 / 5.0 + 32.0;

    // ONE write, and everything else follows from it:
    //   SENSOR/@val   -> this element's own value
    //   SENSOR_F/@val -> the calculated one
    //   ALARM/@val    -> the one with limits, whose chain moves the alarm bits
    evt.SetValue("id('SENSOR')/@val",   v);
    evt.SetValue("id('SENSOR_F')/@val", f);
    evt.SetValue("id('ALARM')/@val",    v);
    evt.SetValue("id('COUNT')/@val",    c + 1);

    // Print every tenth reading, so the log stays readable.
    // We read the values BACK instead of printing our own: that is what the
    // plant actually stored, after ATR.rou rounded it to val_rou (0.1) and
    // ATR.lmt clamped it to val_min..val_max. Seeing the difference between
    // what you computed and what the element holds is the point.
    if ((c % 10) == 0)
        evt.Log(4, "reading " + c + ": stored " + evt.GetValue("id('ALARM')/@val")
                 + " C, raw " + v + " C, " + evt.GetValue("id('SENSOR_F')/@val") + " F");
    return 0;
}

// Called whenever the 'sta' of <var id="ALARM"> changes -- which is what
// ALM.onlvl does when the value crosses a limit.
//
// 'sta' is one 16-bit field: the low nibble is the runtime state, the next
// one the alarm configuration, then the command, then the operating role.
// We only want to say what a human would say.
function on_alarm(evt)
{
    var now = evt.stan;          // the state being written
    var was = evt.stap;          // the one before it
    if (now == was) return 0;

    var v = evt.GetValue("id('ALARM')/@val");
    evt.Log(4, "ALARM sta " + was + " -> " + now + "  value " + v + " C");
    return 0;
}
