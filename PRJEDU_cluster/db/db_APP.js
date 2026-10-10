// =====================================================================
// APP/S00 - the job. The same script on both nodes; it runs where the
// document runs, i.e. on the master.
// =====================================================================

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function inum(evt, id)   { return parseInt("" + get(evt, id)); }
function tid(evt)        { return "" + evt.GetValue("doc('XDB')/@tid"); }

// xdb_start runs when the document STARTS - on the node that becomes
// master, at boot or at a failover. A spare never gets here.
function start(evt)
{
    evt.Log(4, "APP: running on " + tid(evt) + " - carrying on from unit " + get(evt, "COUNT")
               + ", batch " + get(evt, "BATCH"));
    return 0;
}

// new_elm_new_eval of LOG: 'evt.obj' is the new <item>, not yet in the
// list; 'evt.valn' is what main.step wrote into @new. Returning 1 lets
// ELM.new add it (0 would drop it).
function fill_item(evt)
{
    var d = JSON.parse("" + evt.valn);
    evt.obj.batch = d.batch;
    evt.obj.by = d.by;
    evt.obj.at = d.at;
    evt.obj.units = d.units;
    return 1;
}

// Keep nine finished batches, so the new one is the tenth.
//  * WHY HERE: ELM.new would cut the list itself, but only AFTER it has
//    picked an id - with ten items all ten ids of the pool are taken, the
//    eleventh item gets none, and an item without an id never reaches the
//    spare.
//  * WHY BY BATCH NUMBER, NOT POSITION: the spare's copy of the list is not
//    in the master's order (see README). After a failover 'the last item'
//    on the new master is not the oldest batch.
// evt.DelElement is replicated: the spare deletes the same item.
function keep_nine(evt)
{
    var s = "" + evt.GetValue("json(id('LOG')/item)");
    if (!s || s == "undefined") return;
    var list = JSON.parse(s);
    var left = list.length;
    while (left >= 10) {
        var old = -1;
        for (var i = 0; i < list.length; i++)
            if (list[i] && (old < 0 || parseInt(list[i].batch) < parseInt(list[old].batch))) old = i;
        evt.DelElement("id('" + list[old].id + "')");
        list[old] = null;
        left--;
    }
}

function step(evt)
{
    if (inum(evt, "RUN") != 1) return 0;
    var me = tid(evt);
    var count = inum(evt, "COUNT") + inum(evt, "RATE");
    set(evt, "COUNT", count);
    set(evt, "BY", me);
    set(evt, "LAST_MS", 0.0 + Time.GetTimeMs());

    // a batch is finished: ELM.new on LOG makes its <item> (see db_APP.xml)
    var batch = inum(evt, "BATCH"), size = inum(evt, "BATCH_SIZE");
    if (count >= batch * size) {
        keep_nine(evt);
        evt.SetValue("id('LOG')/@new", JSON.stringify({
            batch: batch, by: me, at: Time.GetTimeStr(0).substring(11, 19), units: size }));
        set(evt, "BATCH", batch + 1);
        evt.Log(4, "APP: batch " + batch + " finished on " + me);
    }
    return 0;
}
