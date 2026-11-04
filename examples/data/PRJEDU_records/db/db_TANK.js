// =====================================================================
// TANK/S00 -- the process. Nothing here names a table: a value written to
// LEVEL, TEMP or PUMP runs that point's chain, and the chain makes the
// record. The one record a script makes itself is the dose, with HIS.rec.
// =====================================================================

function start(evt)
{
    // Unique for every start, and needs no database. A run killed a moment
    // after it started may have no row yet when the next one begins, so
    // "the largest run in the table + 1" could hand out the same number.
    evt.SetValue("id('RUN')/@val", Time.GetTimeMs());
    return 0;
}

function step(evt)
{
    var n = evt.obj.cnt + 1;
    evt.obj.cnt = n;

    // Fill to the set point, then drain to 40 %.
    var lvl  = 0.0 + evt.GetValue("id('LEVEL')/@val");
    var pump = 0   + evt.GetValue("id('PUMP')/@val");
    var sp   = 0.0 + evt.GetValue("id('SP')/@val");
    if (pump == 1 && lvl >= sp)   pump = 0;
    if (pump == 0 && lvl <= 40.0) pump = 1;
    lvl = lvl + ((pump == 1) ? 1.5 : -1.0) + 0.2 * (Math.random() - 0.5);

    evt.SetValue("id('PUMP')/@val", pump);
    evt.SetValue("id('LEVEL')/@val", lvl);

    // A slow drift and a wobble bigger than a useful reading.
    evt.SetValue("id('TEMP')/@val", 20.0 + 3.0 * Math.sin(0.01 * n) + 1.5 * (Math.random() - 0.5));

    // One event of our own. Its fields are ours; tim, uid, src and knd are the
    // engine's, and rol is the role this script runs with. run and n reach the
    // table only because his_col on the sink names them.
    var run = 0 + evt.GetValue("id('RUN')/@val");
    HIS.rec(evt, "evt", { txt: "dose", run: run, n: n });
    evt.SetValue("id('DOSES')/@val", n);
    return 0;
}
