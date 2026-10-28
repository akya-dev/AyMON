// =====================================================================
// PLT/S00 - the filling line, ten steps a second.
//
// Reads ONE thing from the PLC: the output register R_OUT (reg 3), which
// the PLC writes over Modbus. Writes the inputs back into R_IN, R_BLVL
// and R_TANK (reg 0..2), where the PLC's next poll finds them.
//
// A bottle is [x, level, overflowed]: x in cm along the line, level in %.
// The list is rebuilt every step rather than changed in place, with every
// number made a float on the way (0.0 + ...): JSON gives back 70 for 70.0,
// and in this script language an integer on the left of + makes the
// whole sum an integer.
// =====================================================================

function start(evt)
{
    evt.Log(4, "PLT: filling line - remote I/O on Modbus TCP 127.0.0.1:1503, unit 1, registers 0..3");
    return 0;
}

function get(evt, id) { return parseFloat("" + evt.GetValue("id('" + id + "')/@val")); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function on(evt, id) { return evt.GetValue("id('" + id + "')/@val") == 1; }

function step(evt)
{
    // the line's geometry, cm (a script file is a collection of functions:
    // constants live in the function that uses them)
    var NOZZLE = 100.0;       // the filling position
    var MOUTH  = 3.0;         // the nozzle hits a bottle's mouth within this of it, and PE_FILL sees this far
    var EXIT   = 150.0;       // the exit photo-eye
    var END    = 170.0;       // where a bottle leaves the line
    var PITCH  = 30.0;        // bottles arrive this far apart
    var dt = 0.1;

    // TANK_REFILL is reset here, not in its own val_fnc: inside a *_fnc
    // chain the value being written is stored AFTER the chain, so a
    // reset there would be overwritten by the 1 it is resetting.
    if (on(evt, "TANK_REFILL")) {
        set(evt, "TANK", 100.0);
        set(evt, "TANK_REFILL", 0);
        evt.Log(4, "PLT: supply tank refilled");
    }
    var out = parseInt("" + evt.GetValue("id('R_OUT')/@pro"));

    // THE FAULT STATE: the PLC flips bit 15 every 500 ms. No flip for
    // 1.5 s - a cut cable, a stopped PLC - and every output goes off.
    var now = 0.0 + Time.GetTimeMs();   // a float: GetTimeMs is unsigned, and another thread's stamp may be later
    var life = (out & 32768) != 0 ? 1 : 0;
    if (life != evt.GetValue("id('LIFE')/@val")) {
        set(evt, "LIFE", life);
        set(evt, "LIFE_MS", now);
    }
    var fs = (now - evt.GetValue("id('LIFE_MS')/@val")) > 1500 ? 1 : 0;
    if (fs != evt.GetValue("id('RIO_FS')/@val")) {
        set(evt, "RIO_FS", fs);
        evt.Log(4, fs == 1 ? "PLT: remote I/O - no life sign from the PLC for 1.5 s, FAULT STATE: all outputs off"
                           : "PLT: remote I/O - the PLC is back, outputs follow it again");
    }
    if (fs == 1) out = 0;

    var conv  = (out & 1) != 0;
    var valve = (out & 2) != 0;

    var speed = get(evt, "SPEED"), flow = get(evt, "FLOW"), tank = get(evt, "TANK");
    var old = JSON.parse(evt.GetValue("id('BOTTLES')/@val"));
    var bottles = [];
    var pe_fill = 0, pe_exit = 0, full = 0, blvl = 0.0;
    var good = 0, reject = 0, over = 0, spill = 0.0;

    // what the valve lets out this step - only while there is something in the tank
    var amount = 0.0;
    if (valve && tank > 0.0) {
        amount = flow * dt;
        tank = tank - 0.02 * amount;
        if (tank < 0.0) tank = 0.0;
    }
    var caught = false;

    for (var i = 0; i < old.length; i++) {
        var x0 = 0.0 + old[i][0];
        var lvl = 0.0 + old[i][1];
        var o = old[i][2] == 1 ? 1 : 0;
        var x = conv ? x0 + speed * dt : x0;

        // PE_FILL is set up to see a bottle exactly where the nozzle hits its
        // mouth - one test for both, so PE_FILL = 1 always means "the valve
        // would fill this bottle", which is what the PLC's interlock trusts.
        // The first version's beam reached 1 cm further on each side: a bottle
        // stopped the moment the beam saw it was under the nozzle for the PLC
        // and beside it for the product (README, "What it measured").
        var under = Math.abs(x - NOZZLE) < MOUTH;

        if (under && amount > 0.0) {                         // the nozzle is over its mouth
            lvl = lvl + amount;
            caught = true;
            if (lvl > 100.0) {
                if (o == 0) { over = over + 1; o = 1; }
                spill = spill + (lvl - 100.0);
                lvl = 100.0;
            }
        }
        if (under) {                                         // the photo-eye's beam is blocked
            pe_fill = 1;
            blvl = lvl;
            // The level switch sits at 92 %: the PLC closes the valve a scan
            // and a poll later (~0.2 s, 4 % more), so the bottle ends near 96.
            if (lvl >= 92.0) full = 1;
        }
        if (Math.abs(x - EXIT) < 4.0) pe_exit = 1;
        if (x0 < EXIT && x >= EXIT) {                        // a bottle leaves
            if (lvl >= 90.0) good = good + 1; else reject = reject + 1;
        }
        if (x < END) bottles.push([x, lvl, o]);
    }
    if (amount > 0.0 && !caught) spill = spill + amount;     // no bottle: on the floor

    // a new bottle arrives when the last one has moved a pitch along
    if (bottles.length == 0 || bottles[bottles.length - 1][0] >= PITCH)
        bottles.push([0.0, 0.0, 0]);

    // the push buttons spring back half a second after they were pressed
    if (now - evt.GetValue("id('PB_MS')/@val") > 500) {
        if (on(evt, "START_PB")) set(evt, "START_PB", 0);
        if (on(evt, "STOP_PB"))  set(evt, "STOP_PB", 0);
        if (on(evt, "RESET_PB")) set(evt, "RESET_PB", 0);
    }

    // the inputs, as the remote I/O presents them to the PLC
    var inp = 0;
    if (pe_fill == 1)          inp = inp | 1;
    if (full == 1)             inp = inp | 2;
    if (pe_exit == 1)          inp = inp | 4;
    if (!on(evt, "ESTOP"))     inp = inp | 8;      // normally closed: 1 = not pressed
    if (on(evt, "START_PB"))   inp = inp | 16;
    if (!on(evt, "STOP_PB"))   inp = inp | 32;     // normally closed
    if (on(evt, "RESET_PB"))   inp = inp | 64;
    if (tank < 15.0)           inp = inp | 128;

    evt.SetValue("id('R_IN')/@pro", inp);
    evt.SetValue("id('R_BLVL')/@pro", Math.round(blvl * 10.0));
    evt.SetValue("id('R_TANK')/@pro", Math.round(tank * 10.0));

    // the same, for the page
    set(evt, "BOTTLES", JSON.stringify(round_bottles(bottles)));
    set(evt, "TANK", 0.01 * Math.round(tank * 100.0));
    set(evt, "CONV", conv ? 1 : 0);
    set(evt, "VALVE", valve ? 1 : 0);
    set(evt, "LAMP_RUN", (out & 4) != 0 ? 1 : 0);
    set(evt, "LAMP_FLT", (out & 8) != 0 ? 1 : 0);
    set(evt, "PE_FILL", pe_fill);
    set(evt, "PE_EXIT", pe_exit);
    set(evt, "LS_FULL", full);
    if (good > 0)   set(evt, "GOOD", evt.GetValue("id('GOOD')/@val") + good);
    if (reject > 0) {
        set(evt, "REJECT", evt.GetValue("id('REJECT')/@val") + reject);
        evt.Log(4, "PLT: a bottle left under-filled - REJECT");
    }
    if (over > 0) {
        set(evt, "OVERFLOW", evt.GetValue("id('OVERFLOW')/@val") + over);
        evt.Log(4, "PLT: a bottle overflowed");
    }
    if (spill > 0.0) set(evt, "SPILL", 0.01 * Math.round((get(evt, "SPILL") + spill) * 100.0));
    return 0;
}

// one decimal is enough for the picture, and keeps the message short
function round_bottles(b)
{
    var r = [];
    for (var i = 0; i < b.length; i++)
        r.push([0.1 * Math.round(b[i][0] * 10.0), 0.1 * Math.round(b[i][1] * 10.0), b[i][2]]);
    return r;
}

function on_button(evt)
{
    if (evt.valn == 1) {
        set(evt, "PB_MS", Time.GetTimeMs());
        evt.Log(4, "PLT: " + evt.obj.id + (evt.obj.id == "ESTOP" ? " PRESSED" : " pressed"));
    } else if (evt.obj.id == "ESTOP") {
        evt.Log(4, "PLT: ESTOP pulled out");
    }
    return 0;
}
