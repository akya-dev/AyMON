// =====================================================================
// PLT/S00 - the heater block, ten steps a second.
//
// Euler integration of  tau * dT/dt = K * u(t - theta) - (T - T_AMB) * loss
// with a fixed step of 0.1 s. The dead time is a queue: every step the
// controller's MV goes in at the back, and what comes out at the front is
// the power that reached the sensor DEAD seconds later.
// =====================================================================

function start(evt)
{
    evt.Log(4, "PLT: heater block - K " + get(evt, "K_GAIN") + " C/%, tau " + get(evt, "TAU")
               + " s, dead time " + get(evt, "DEAD") + " s, room " + get(evt, "T_AMB") + " C");
    return 0;
}

// Every number read here is turned into a float: in this script language
// the LEFT operand decides the arithmetic - an integer on the left makes
// 3 / 10 come out as 0, and a text on the left makes + a concatenation.
function get(evt, id) { return parseFloat("" + evt.GetValue("id('" + id + "')/@val")); }

// a normally distributed number, mean 0, standard deviation 1 (Box-Muller)
function gauss()
{
    var u1 = Math.random();
    if (u1 < 1e-9) u1 = 1e-9;
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.283185307179586 * Math.random());
}

function step(evt)
{
    var dt   = 0.1;
    var k    = get(evt, "K_GAIN");
    var tau  = get(evt, "TAU");
    var amb  = get(evt, "T_AMB");
    var loss = (evt.GetValue("id('FAN')/@val") == 1) ? get(evt, "FAN_LOSS") : 1.0;
    var t    = get(evt, "T");

    // the controller's output; before the controller has written one, 0
    var mv = evt.GetValue("doc('CTL/S00')/id('MV')/@val");
    mv = (mv == null) ? 0.0 : parseFloat("" + mv);

    // the dead time: DEAD seconds of MV on their way to the sensor
    var n = Math.round(get(evt, "DEAD") / dt);
    var pipe = JSON.parse(evt.GetValue("id('PIPE')/@val"));
    pipe.push(mv);
    var u = 0.0 + pipe[0];                       // until the queue is full: the oldest
    if (pipe.length > n) {
        var rest = [];
        for (var i = 1; i < pipe.length; i++) rest.push(pipe[i]);
        pipe = rest;
    }

    if (tau < dt) tau = dt;
    t = t + dt / tau * (k * u - (t - amb) * loss);

    var tm = t + get(evt, "NOISE") * gauss();
    tm = 0.01 * Math.round(tm * 100.0);          // the sensor's 0.01 C steps

    evt.SetValue("id('T')/@val", t);
    evt.SetValue("id('TM')/@val", tm);
    evt.SetValue("id('U')/@val", u);
    evt.SetValue("id('PIPE')/@val", JSON.stringify(pipe));
    return 0;
}

function on_fan(evt)
{
    evt.Log(4, "PLT: fan " + (evt.valn == 1 ? "ON - the block loses heat faster" : "off"));
    return 0;
}
