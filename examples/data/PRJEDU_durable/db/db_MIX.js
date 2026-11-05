// PRJEDU_durable: the mixer.

// xdb_init: the kept values are already back when this runs - the engine puts
// them back before anything in the document reads a value.
function init(evt)
{
    evt.Log(4, "MIX: came back with " + evt.GetValue("id('BATCHES')/@val") + " batches, "
        + parseFloat("" + Math.round(evt.GetValue("id('HOURS')/@val") * 1000)) / 1000 + " h, set point " + evt.GetValue("id('SP')/@val")
        + " kg, " + evt.GetValue("count(id('JOBS')/item)") + " rows in the job list, shift "
        + evt.GetValue("id('SHIFT')/@val") + "; not kept: " + evt.GetValue("id('SINCE')/@val"));
    return 0;
}

// x rounded to a tenth. Math.round answers an INTEGER and arithmetic keeps the left operand's type,
// so 'Math.round(x * 10) / 10' would divide as integers (61.5 -> 61): make it a double first.
function tenth(x)
{
    return parseFloat("" + Math.round(x * 10)) / 10;
}

// a row of the job list, made at run time
function job(evt, n, kg)
{
    var t = "<item id=\"J" + n + "\" n=\"" + n + "\" n_typ=\"0x0108\" kg=\"" + kg + "\" kg_typ=\"0x0308\""
          + " tim=\"" + Time.GetTimeMs() + "\" tim_typ=\"0x0108\"/>";
    var x = new XML(t, -1);
    var e = x["item"];
    x.removeChild(e);
    return evt.AddElement("id('JOBS')", e);
}

function batch(evt)
{
    var n = evt.GetValue("id('BATCHES')/@val") + 1;
    var sp = evt.GetValue("id('SP')/@val");
    // a little off the set point. Arithmetic keeps the LEFT operand's type: n is an unsigned counter,
    // so (n % 11 - 5) would wrap around; parseFloat makes it a double first.
    var off = parseFloat("" + ((n * 7) % 11)) - 5;
    var kg = tenth(sp + off / 10);
    evt.SetValue("id('BATCHES')/@val", n);
    evt.SetValue("id('SINCE')/@val", evt.GetValue("id('SINCE')/@val") + 1);
    evt.SetValue("id('HOURS')/@val", evt.GetValue("id('HOURS')/@val") + 1.0 / 3600);   // 1.0: 1 / 3600 is 0 in integers
    evt.SetValue("id('LAST')/@val", "batch " + n + ": " + kg + " kg");
    job(evt, n, kg);
    // the last ten rows stay; by the row's own number, not by a counter kept elsewhere
    if (n > 10) evt.DelElement("id('JOBS')/item[@n<" + (n - 9) + "]");

    // Every 20 batches a shift is closed. That is an answer someone acts on,
    // so wait until it is on the disk: xdb.sync() answers 1 when every kept
    // value written before it is there (0 = not in time, or the disk fails).
    if (n % 20 == 0) {
        evt.SetValue("id('SHIFT')/@val", n / 20);
        var r = xdb.sync();
        evt.Log(4, "MIX: shift " + (n / 20) + " closed at batch " + n
            + (r == 1 ? ", on the disk" : ", NOT on the disk yet (xdb.sync answered " + r + ")"));
    }
    return 0;
}

// the durable log's state, for the page (xdb.dur() needs the Engineer role)
function dur(evt)
{
    var d = xdb.dur();
    if (d == null) return 0;
    var k = ["writes", "segments", "log_kb", "commits", "fsyncs", "checkpoints", "fsync_max_ms", "wait_max_ms", "free_mb"];
    for (var i = 0; i < k.length; i++) {
        var v = d[k[i]];
        evt.SetValue("id('DUR')/@" + k[i], v == null ? -1 : v);
    }
    evt.SetValue("id('DUR')/@failed", d.failed == null ? "" : d.failed);
    var age = -1;
    if (d.docs != null && d.docs.length > 0) age = d.docs[0].ckp_age_s;
    evt.SetValue("id('DUR')/@ckp_age_s", age);
    // the root's health: the alarm level is bits 2-3 of its sta (0 normal, 1 warning, 2 alarm, 3 emergency)
    var s = evt.GetValue("doc('XDB')/@sta");
    evt.SetValue("id('DUR')/@health", (s >> 2) & 3);
    return 0;
}

// the page: one place that reads the values, for the HTML and the JSON alike
function state(evt)
{
    var o = {
        batches: evt.GetValue("id('BATCHES')/@val"),
        since:   evt.GetValue("id('SINCE')/@val"),
        hours:   parseFloat("" + Math.round(evt.GetValue("id('HOURS')/@val") * 1000)) / 1000,
        sp:      evt.GetValue("id('SP')/@val"),
        last:    "" + evt.GetValue("id('LAST')/@val"),
        shift:   evt.GetValue("id('SHIFT')/@val"),
        jobs:    [],
        log:     {}
    };
    var n = evt.GetValue("count(id('JOBS')/item)");
    var now = Time.GetTimeMs();
    for (var i = 1; i <= n; i++) {
        var p = "id('JOBS')/item[" + i + "]";
        o.jobs.push({ n: evt.GetValue(p + "/@n"), kg: evt.GetValue(p + "/@kg"),
                      ago: Math.round((now - evt.GetValue(p + "/@tim")) / 1000) });
    }
    var k = ["writes", "failed", "segments", "log_kb", "commits", "fsyncs", "checkpoints", "ckp_age_s", "fsync_max_ms", "wait_max_ms", "free_mb", "health"];
    for (var j = 0; j < k.length; j++) o.log[k[j]] = evt.GetValue("id('DUR')/@" + k[j]);
    return o;
}

// the page's form: a new set point, checked here, on the server
function set_point(evt, txt)
{
    var v = parseFloat("" + txt);
    if (isNaN(v) || v < 10 || v > 100) return "a set point is 10 .. 100 kg";
    evt.SetValue("id('SP')/@val", tenth(v));
    return "";
}
