// =====================================================================
// PLANT -- the simulator. It stands in for the Modbus, MQTT or OPC UA
// device a real station would have; PRJEDU_modbus shows the real thing.
// Nothing here knows about replication.
//
// NOTE WHERE IT WRITES:
//
//     evt.SetValue("doc('PRC/P01')/id('LEVEL')/@val", lvl)
//
// This script lives in SYS/S00 and writes into PRC/P01, which is a
// different document. Addressing across documents is ordinary -- 'doc(..)'
// picks the document and the rest of the address works as always -- and it
// is what keeps PRC/P01 pure data with no machinery in it. It is also
// exactly what the protocol layer does when a poll answer lands.
// =====================================================================

function start(evt)
{
    evt.Log(4, "PLANT: pumping station P01 -- PRC/P01 is EDGE, this node is the SOURCE");
    evt.Log(4, "PLANT: the centre may connect at any time on 127.0.0.1:9180, path /rep");
    evt.SetValue("doc('PRC/P01')/id('LEVEL')/@val",   55.0);
    evt.SetValue("doc('PRC/P01')/id('TEMP')/@val",    38.0);
    evt.SetValue("doc('PRC/P01')/id('STATE')/@val",   "draining");
    return 0;
}

// Once a second: one step of the process.
function tick(evt)
{
    var n = evt.obj.cnt + 1;
    evt.obj.cnt = n;

    // The document IS the state. Read it back, work on it, write it --
    // there is no second copy of the level kept in the script.
    var lvl = evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val");
    var tmp = evt.GetValue("doc('PRC/P01')/id('TEMP')/@val");
    var pmp = evt.GetValue("doc('PRC/P01')/id('PUMP')/@val");

    // Demand varies through the day. 0.05 * n is a FLOAT multiplication
    // because the LEFT operand is a float; n / 20 would be integer division
    // and would sit at 0 for twenty seconds. The script language takes its
    // arithmetic type from the left operand. (Same trap as PRJEDU_101.)
    var draw = 1.6 + 0.9 * Math.sin(0.05 * n);

    // Hysteresis: start the pump low, stop it high. A real station has
    // exactly this and nothing more.
    if (pmp) {
        lvl = lvl + 3.0 - draw;
        tmp = tmp + 0.35;
        if (lvl > 94.0) {
            pmp = 0;
            evt.SetValue("doc('PRC/P01')/id('STATE')/@val", "draining");
        }
    } else {
        lvl = lvl - draw;
        tmp = tmp - 0.20;
        if (lvl < 18.0) {
            pmp = 1;
            evt.SetValue("doc('PRC/P01')/id('STARTS')/@val",
                         evt.GetValue("doc('PRC/P01')/id('STARTS')/@val") + 1);
            evt.SetValue("doc('PRC/P01')/id('STATE')/@val", "filling");
        }
    }

    if (tmp < 22.0) tmp = 22.0;
    if (tmp > 78.0) tmp = 78.0;

    // Writing LEVEL runs its val_fnc chain: ATR.rou rounds it to val_rou
    // and ALM.onlvl compares it with the four limits and moves the alarm
    // bits inside 'sta'. All of that happens HERE, where the value is born.
    // What crosses the wire is the finished value and the finished 'sta'.
    evt.SetValue("doc('PRC/P01')/id('LEVEL')/@val", lvl);
    evt.SetValue("doc('PRC/P01')/id('TEMP')/@val",  Math.round(tmp * 10.0) / 10.0);
    evt.SetValue("doc('PRC/P01')/id('PUMP')/@val",  pmp);

    // Every ten seconds, say locally what the plant is doing. The centre
    // prints the same numbers out of the mirror -- putting the two logs
    // side by side IS the test.
    if ((n % 10) == 0)
        evt.Log(4, "PLANT:  [source] level " + evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val")
                 + " %, temp " + evt.GetValue("doc('PRC/P01')/id('TEMP')/@val")
                 + " C, pump " + (pmp ? "on" : "off")
                 + ", starts " + evt.GetValue("doc('PRC/P01')/id('STARTS')/@val")
                 + ", level sta " + alm_txt(evt.GetValue("doc('PRC/P01')/id('LEVEL')/@sta")));

    return 0;
}

// The alarm state of a value lives in the low bits of its 'sta':
//   0x0000 normal   0x0004 warning   0x0008 alarm   0x000C emergency
// An alarm in AyMON is not a separate object; it is state on the value
// that raised it -- so it travels with the value, for free.
function alm_txt(sta)
{
    var a = sta & 0x000C;
    if (a == 0x0004) return "WARNING";
    if (a == 0x0008) return "ALARM";
    if (a == 0x000C) return "EMERGENCY";
    return "normal";
}

// ---------------------------------------------------------------------
// FOR THE PAGE: PRC/P01 - the source - as one JSON value in this
// document's VIEW, next to the state of the replication link. The page
// cannot subscribe to PRC/P01 itself: an MQTT connection publishes the
// document it belongs to, and CN_LIVE belongs to SYS/S00.
// ---------------------------------------------------------------------
function view(evt)
{
    var o = {
        qty:    evt.GetValue("doc('PRC/P01')/count(data/var)"),
        level:  evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val"),
        lsta:   evt.GetValue("doc('PRC/P01')/id('LEVEL')/@sta"),
        temp:   evt.GetValue("doc('PRC/P01')/id('TEMP')/@val"),
        pump:   evt.GetValue("doc('PRC/P01')/id('PUMP')/@val"),
        starts: evt.GetValue("doc('PRC/P01')/id('STARTS')/@val"),
        state:  evt.GetValue("doc('PRC/P01')/id('STATE')/@val"),
        unit:   evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val_unt"),
        hi:     evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val_alm_onlhi_alm"),
        link:   evt.GetValue("id('CN_PLANT')/@sta")
    };
    evt.SetValue("id('VIEW')/@val", JSON.stringify(o));
    return 0;
}
