// =====================================================================
// PLC/S00 -- the simulated process behind the slave.
//
// Everything a master can read is an <io> in db_PLC.xml. This file only
// moves the numbers; serving them is the engine's job, not script's.
//
// TRAP -- ARITHMETIC IS TYPED, AND THE LEFT OPERAND DECIDES.
// g_tick/20.0 is INTEGER division, because g_tick is an integer: it gives
// 0 for the first twenty seconds and the sine never moves. Put the float
// on the LEFT (0.05 * g_tick) and it is a float multiplication. There is
// no error and no log line; the value is simply wrong.
// =====================================================================

var g_tick  = 0;
var g_hours = 0;

function start(evt)
{
    evt.Log(4, "PLC: Modbus TCP slave on 127.0.0.1:1502, unit 1, holding registers 0..3");
    return 0;
}

function tick(evt)
{
    g_tick = g_tick + 1;

    // 0.05 rad per second -> a level cycle of about two minutes.
    var level = 500 + Math.round(450.0 * Math.sin(0.05 * g_tick));
    var temp  = 250 + Math.round(90.0  * Math.sin(0.14 * g_tick));

    // The pump runs while the tank is filling, the valve while it drains.
    var rising = Math.sin(0.05 * g_tick) > Math.sin(0.05 * (g_tick - 1));

    // One register, three bits: bit0 pump, bit1 valve, bit2 high temperature.
    // The monitoring side reads them with pro_adr="2.0" / "2.1" / "2.2" -- no
    // script, no masking: a bit address inside the block.
    var flags = 0;
    if (rising)  flags = flags | 0x0001;
    if (!rising) flags = flags | 0x0002;
    if (temp > 320) flags = flags | 0x0004;

    if (rising) g_hours = g_hours + 1;

    evt.SetValue("id('SIM_LEVEL')/@pro", level);
    evt.SetValue("id('SIM_TEMP')/@pro",  temp);
    evt.SetValue("id('SIM_FLAGS')/@pro", flags);
    evt.SetValue("id('SIM_HOURS')/@pro", g_hours);
    return 0;
}
