// =====================================================================
// OPS/S00 - the script that asks. Read ask() and write() first: neither of
// them knows where a document is. LINE/L1 is on S01 or S02, LINE/L2 is in
// this engine; the name is all the difference.
// =====================================================================

var g_seq   = 0;     // the number written next
var g_ack   = 0;     // writes the far node answered with 1
var g_ref   = 0;     // writes that failed
var g_last  = 0;     // when the last write went through, ms
var g_down  = 0;     // writes refused since then
var g_gap   = 0;     // the longest time without an acknowledged write, ms
var g_notes = [];    // what the caller saw
var g_tick  = 0;
var g_lus   = 0;     // a local read, microseconds
var g_rus   = 0;     // a remote read, microseconds

function note(text)
{
    g_notes.unshift(Time.GetTimeStr(0).substring(11, 19) + "  " + text);
    if (g_notes.length > 12) g_notes.pop();
}

// READ. One call, however many values: api.snap() runs on the node that has the
// document. Outside a try a failed call is just undefined; inside one it throws,
// and e.message says why.
function ask(evt, doc)
{
    try {
        var s = "" + evt.GetValue("doc('" + doc + "')/api.snap()");
        if (s == "") return { why: "no such function, or no answer" };
        return JSON.parse(s);
    }
    catch (e) {
        return { why: "" + e.message };
    }
}

// WRITE. 1 = done. 0 without a throw = the far node's xdb_acl said no, and its
// log says who and what. A throw = it never got there, or nobody knows.
function write(evt, doc, id, val)
{
    try {
        if (evt.SetValue("doc('" + doc + "')/id('" + id + "')/@val", val)) return "";
        return "refused by xdb_acl on the node that has it";
    }
    catch (e) {
        return "" + e.message;
    }
}

// The caller writes SEQ five times a second and counts. Nothing here knows about
// the failover: the list in rpc_con does the walking.
function count_write(evt)
{
    g_seq = g_seq + 1;
    var now = 0 + Time.GetTimeMs();
    var why = write(evt, "LINE/L1", "SEQ", g_seq);
    if (why == "") {
        if (g_last > 0) {
            var gap = now - g_last;
            if (gap > g_gap) g_gap = gap;
            if (g_down > 0 || gap > 1000) note("writes go through again: " + g_down + " refused, " + gap + " ms without one");
        }
        else if (g_down > 0) note("the first write went through, " + g_down + " refused until there was a master");
        g_down = 0;
        g_ack = g_ack + 1;
        g_last = now;
    }
    else {
        if (g_down == 0) note("write refused: " + why);
        g_down = g_down + 1;
        g_ref = g_ref + 1;
    }
    write(evt, "LINE/L2", "SEQ", g_seq);
}

// What the page asked for: the chain of REQ, queued onto TH_CALL (db_OPS.xml).
// evt.valn is what was written. The chain is SYSTEM on this engine; a write to
// another node is cut to that link's con_role there.
function on_req(evt)
{
    var r = JSON.parse("" + evt.valn);
    var why = write(evt, r.doc, r.id, r.val);
    note(r.id + " = " + r.val + " on " + r.doc + ": " + (why == "" ? "done" : why));
    return 0;
}

// How long a read takes, here and over there.
function speed(evt)
{
    var i, t0, n = 100, m = 5000;
    t0 = Time.GetTimeMs();
    for (i = 0; i < n; i++) evt.GetValue("doc('LINE/L1')/id('COUNT')/@val");
    g_rus = (0.0 + (Time.GetTimeMs() - t0)) * 1000.0 / n;
    t0 = Time.GetTimeMs();
    for (i = 0; i < m; i++) evt.GetValue("doc('LINE/L2')/id('COUNT')/@val");
    g_lus = (0.0 + (Time.GetTimeMs() - t0)) * 1000.0 / m;
}

function tick(evt)
{
    count_write(evt);

    // the same call four times: the list, each connection by name, this engine
    var list = ask(evt, "LINE/L1");
    var s01  = ask(evt, "LINE/L1@CN_S01");
    var s02  = ask(evt, "LINE/L1@CN_S02");
    var here = ask(evt, "LINE/L2");

    g_tick = g_tick + 1;
    if (g_tick % 10 == 0 && list.node) speed(evt);

    // A '*' covers the documents here and, after them, the ones on other nodes.
    var all = "";
    try { all = "" + evt.GetValue("doc('LINE/*')/id('COUNT')/@val"); }
    catch (e) { all = "" + e.message; }

    evt.SetValue("id('VIEW')/@val", JSON.stringify({
        list: list, s01: s01, s02: s02, here: here, all: all,
        seq: g_seq, ack: g_ack, ref: g_ref, gap: g_gap, down: g_down,
        lus: g_lus, rus: g_rus, notes: g_notes
    }));
    return 0;
}
