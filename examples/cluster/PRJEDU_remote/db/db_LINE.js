// =====================================================================
// LINE/L1, LINE/L2 - the line itself: both documents' script. It runs
// where the document runs: on the cluster's master, or in the OPS engine
// for L2. A parked copy runs nothing here, replication keeps its values.
// =====================================================================

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function inum(evt, id)   { return parseInt("" + get(evt, id)); }
function tid(evt)        { return "" + evt.GetValue("doc('XDB')/@tid"); }

function start(evt)
{
    evt.Log(4, "LINE: running on " + tid(evt) + ", carrying on from unit " + get(evt, "COUNT"));
    return 0;
}

function step(evt)
{
    var rate = inum(evt, "RATE"), top = inum(evt, "RATE_MAX");
    if (rate > top) rate = top;
    set(evt, "COUNT", inum(evt, "COUNT") + rate);
    set(evt, "BY", tid(evt));
    return 0;
}

// The chain of SEQ runs where the write was applied, so this says which node took it.
function on_seq(evt)
{
    set(evt, "SEQ_BY", tid(evt));
    return 0;
}
