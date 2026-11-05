// =====================================================================
// The scope an address may call. A remote call takes 0.1-0.2 ms, so asking
// for five values one by one costs five of them. This is ONE call, it runs
// on the node that has the document and answers with all of them:
//
//     var s = evt.GetValue("doc('LINE/L1')/api.snap()");
//
// It is called the same way when the document is in the caller's own engine.
// =====================================================================

function hex4(v)
{
    var d = "0123456789ABCDEF", s = "";
    for (var i = 3; i >= 0; i--) s = s + d.charAt((v >> (4 * i)) & 15);
    return "0x" + s;
}

function val(evt, id) { return "" + evt.GetValue("id('" + id + "')/@val"); }

function snap(evt, idx, qry, rsp)
{
    var sta = evt.GetValue("/xdb/@sta");
    var state = (sta >> 12) & 3;
    return JSON.stringify({
        node:  "" + evt.GetValue("doc('XDB')/@tid"),    // the node's name: never replicated
        sta:   hex4(sta),
        role:  ["plain", "master", "spare", "transit"][state],
        count: val(evt, "COUNT"),
        rate:  val(evt, "RATE"),
        by:    val(evt, "BY"),
        seq:   val(evt, "SEQ"),
        seq_by: val(evt, "SEQ_BY")
    });
}
