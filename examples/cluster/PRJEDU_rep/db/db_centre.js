// =====================================================================
// CENTRE -- read the mirror out loud.
//
// There is nothing about replication here either. PRC/P01 is an ordinary
// document at this end too; the only difference is that nothing in this
// node writes to it.
//
// THE ONE THING WORTH NOTICING: the centre has no file for PRC/P01. Its
// declaration in AyXDB_centre.xml is four attributes and no src. Every
// element this script reads was created by the engine out of what the
// plant sent, with its type, its unit and its alarm limits intact.
// =====================================================================

function start(evt)
{
    evt.Log(4, "CENTRE: PRC/P01 is HUB -- the mirror. There is no db file for it;");
    evt.Log(4, "CENTRE: the tree arrives from the plant at 127.0.0.1:9180 /rep");
    return 0;
}

// Every three seconds.
function show(evt)
{
    var n = evt.obj.cnt + 1;
    evt.obj.cnt = n;

    // How many elements does the mirror hold? Before the plant connects
    // this is 0 -- the document exists, and it is empty.
    // NOTE THE SHAPE OF THE ADDRESS: doc(..) comes FIRST and the function
    // after it. count(doc(..)/data/var) is not the same expression and
    // quietly answers 0.
    var qty = evt.GetValue("doc('PRC/P01')/count(data/var)");

    var lvl = evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val");

    // An address that does not resolve gives back nothing -- and 'nothing'
    // is undefined, not "" and not 0. (v == null) catches it; (v == "")
    // does NOT, which is the habit that hides this kind of bug.
    if (lvl == null) {
        evt.Log(4, "CENTRE: the mirror is still empty (" + qty
                 + " elements) -- waiting for the plant");
        return 0;
    }

    evt.Log(4, "CENTRE: [mirror, " + qty + " elements] level " + lvl
             + " %, temp " + evt.GetValue("doc('PRC/P01')/id('TEMP')/@val")
             + " C, pump " + (evt.GetValue("doc('PRC/P01')/id('PUMP')/@val") ? "on" : "off")
             + ", starts " + evt.GetValue("doc('PRC/P01')/id('STARTS')/@val")
             + ", " + evt.GetValue("doc('PRC/P01')/id('STATE')/@val")
             + ", level sta " + alm_txt(evt.GetValue("doc('PRC/P01')/id('LEVEL')/@sta")));

    // Every fifth report, read something the plant NEVER SENDS AGAIN after
    // the first bulk sync: the unit and the alarm limits. They came with
    // the initial pull and they are still here. The mirror is a document,
    // not a message queue.
    if ((n % 5) == 0)
        evt.Log(4, "CENTRE: LEVEL is in '" + evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val_unt")
                 + "', high alarm at " + evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val_alm_onlhi_alm")
                 + " -- read from the mirror, not sent since the first sync");

    return 0;
}

function alm_txt(sta)
{
    var a = sta & 0x000C;
    if (a == 0x0004) return "WARNING";
    if (a == 0x0008) return "ALARM";
    if (a == 0x000C) return "EMERGENCY";
    return "normal";
}

// ---------------------------------------------------------------------
// FOR THE PAGE: PRC/P01 - the mirror - as one JSON value in this
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

// ---------------------------------------------------------------------
// THE PAGE'S SWITCH - the val_fnc of LINK: 0 switches the replication
// link off (CN_PLANT sta 0x0000), 1 switches it on again (0x0303). While
// it is off the mirror keeps the last values it had; when the link comes
// back the bulk sync brings it up to date.
// ---------------------------------------------------------------------
function link(evt)
{
    var on = (evt.valn == 1);
    evt.SetValue("id('CN_PLANT')/@sta", on ? 0x0303 : 0x0000);
    evt.Log(4, "CENTRE: the page switched the replication link " + (on ? "ON" : "OFF"));
    return 0;
}
