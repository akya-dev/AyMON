// =====================================================================
// fleet.js - the fleet centre (FLEET/S00).
//
//   report(exc, msg)   a node's report: POST /report (CN_REP's pro_onreq)
//   tick(evt)          the ring logic, every 5 s (T_FLEET)
//   rows(evt)          the fleet page's node table (www/index.ayp)
//
// A script file is a collection of functions: what would be a constant
// lives inside the function that uses it.
// =====================================================================

// ---------------------------------------------------------------------
// files
// ---------------------------------------------------------------------
function read_text(path)
{
    var f = File.open(path, "rb");
    if (!f) return null;
    var n = File.size(f);
    var b = File.read(f, n);
    File.close(f);
    if (n == 0) return "";
    return "" + b;
}

function write_text(path, text)
{
    var f = File.open(path, "wb");
    if (!f) return 0;
    File.write(f, text);
    File.close(f);
    return 1;
}

// the key=value lines of a job file: {id, targets, ver}
function job_of(text)
{
    var j = { id: "", targets: "", ver: "" };
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.startsWith("job=")) j.id = l.substr(4);
        else if (l.startsWith("targets=")) j.targets = l.substr(8);
        else if (l.startsWith("ver=")) j.ver = l.substr(4);
    }
    return j;
}

// ---------------------------------------------------------------------
// a node's report: {"format":"aymon-report/1","node","svc","platform",
// "time","seq","apps":<its /api/apps>,"upd":<its /api/upd>}, POSTed by
// AySVC with "Authorization: Bearer <upd_report_key>"
// ---------------------------------------------------------------------
function reply(exc, status, body)
{
    body = body.toS08();
    var buf = "".toS08();
    buf += "HTTP/1.1 " + status + "\r\n";
    buf += "Content-Type: text/plain; charset=utf-8\r\n";
    buf += "Connection: close\r\n";
    buf += "Content-Length: " + body.size + "\r\n";
    buf += "\r\n";
    buf += body;
    exc.buf_send.remove();
    exc.buf_send.append(buf);
    exc.send();
    exc.ses.close();
}

function report(exc, msg)
{
    if (!msg.isRequest) return;
    if (msg.method != "POST") { reply(exc, "405 Method Not Allowed", "POST a report"); return; }
    var d = JSON.parse("" + msg.body);
    if (d == null || d.format != "aymon-report/1" || !d.node) { reply(exc, "400 Bad Request", "not an aymon-report/1 document"); return; }
    var node = "" + d.node;
    var at = "id('NODES')/item[@id='" + node + "']";
    var tok = exc.evt.GetValue(at + "/@token");
    if (tok == null || tok == "" || ("" + msg.getHeader("Authorization")) != "Bearer " + tok) {
        exc.evt.Log(4, "report from '" + node + "' REFUSED: unknown node or wrong token");
        reply(exc, "401 Unauthorized", "unknown node or wrong token");
        return;
    }

    // the applications: key, the version it runs, its update state
    var apps = "";
    var list = (d.apps && d.apps.apps) ? d.apps.apps : [];
    for (var i = 0; i < list.length; i++) {
        var a = list[i];
        var v = a.ver_run ? a.ver_run : a.ver;
        apps += (apps == "" ? "" : "; ") + a.key + " " + (v ? v : "-") + (a.upd_state ? " " + a.upd_state : "") + " (" + a.state + ")";
    }
    // the jobs: their state on this node
    var jst = {};
    var jobs = "";
    var jl = (d.upd && d.upd.jobs) ? d.upd.jobs : [];
    for (var k = 0; k < jl.length; k++) {
        jst[jl[k].id] = jl[k].state;
        jobs += (jobs == "" ? "" : "; ") + jl[k].id + " " + jl[k].state;
    }

    exc.evt.SetValue(at + "/@seen", Time.GetTimeStr(0));
    exc.evt.SetValue(at + "/@seen_ms", Time.GetTimeMs());
    exc.evt.SetValue(at + "/@svc", "" + d.svc);
    exc.evt.SetValue(at + "/@apps", apps);
    exc.evt.SetValue(at + "/@jobs", jobs);
    exc.evt.SetValue(at + "/@jst", JSON.stringify(jst));
    exc.evt.SetValue(at + "/@raw", "" + msg.body);   // the whole report (this handler runs with the session's role: no file)
    reply(exc, "200 OK", "ok");
}

// ---------------------------------------------------------------------
// the ring logic
//
// rollout/current.txt names the rollout; rollout/<name>/ring1, ring2, ..
// hold its signed job files and the index.txt aysvc_index.py wrote for
// them. Opening ring k copies its job files into www/repo; every tick
// www/repo/index.txt is made to say the packages' lines (www/repo/
// packages.idx, written by aysvc_index.py) + the job lines of rings 1..k. A ring is done when
// every node its jobs name reports each job DONE; a job FAILED or REFUSED
// on one of them halts the rollout there (no further ring is opened).
// ---------------------------------------------------------------------
function ring_dirs(name)
{
    var out = [];
    var l = FILE.list("%PRJ%/rollout/" + name, "ring*");
    for (var i = 0; i < l.length; i++) if (l[i].dir == 1) out.push(l[i].name);
    return out;
}

function ring_jobs(name, ring)
{
    var out = [];
    var dir = "%PRJ%/rollout/" + name + "/" + ring;
    var l = FILE.list(dir, "*.job");
    for (var i = 0; i < l.length; i++) {
        var t = read_text(dir + "/" + l[i].name);
        if (t == null) continue;
        var j = job_of(t);
        j.file = l[i].name;
        j.text = t;
        out.push(j);
    }
    return out;
}

// what www/repo/index.txt should say: the packages' lines (packages.idx) + the job lines of the rings opened
function index_text(evt)
{
    var idx = "format=aymon-index/1
";
    var p = read_text("%PRJ%/www/repo/packages.idx");
    if (p != null) {
        var pl = p.split("
");
        for (var i = 0; i < pl.length; i++) if (pl[i].trim().startsWith("pkg=")) idx += pl[i].trim() + "
";
    }
    var name = "" + evt.GetValue("id('ROLL')/@val");
    var k = Number(evt.GetValue("id('ROLL')/@ring"));
    if (name == "" || k < 1) return idx;
    var rings = ring_dirs(name);
    for (var r = 0; r < k && r < rings.length; r++) {
        var ri = read_text("%PRJ%/rollout/" + name + "/" + rings[r] + "/index.txt");
        if (ri == null) continue;
        var rl = ri.split("
");
        for (var m = 0; m < rl.length; m++) if (rl[m].trim().startsWith("job=")) idx += rl[m].trim() + "
";
    }
    return idx;
}

// index.txt written when it should say something else (a new package list, a ring opened, a new rollout)
function index_sync(evt)
{
    var want = index_text(evt);
    if (read_text("%PRJ%/www/repo/index.txt") == want) return 0;
    write_text("%PRJ%/www/repo/index.txt.part", want);
    FILE.move("%PRJ%/www/repo/index.txt.part", "%PRJ%/www/repo/index.txt");
    return 1;
}

// a ring opened: its job files next to index.txt (a node fetches a job from the index's directory)
function publish(evt, name, ring)
{
    var jobs = ring_jobs(name, ring);
    for (var k = 0; k < jobs.length; k++) write_text("%PRJ%/www/repo/" + jobs[k].file, jobs[k].text);
    if (read_text("%PRJ%/rollout/" + name + "/" + ring + "/index.txt") == null)
        evt.Log(4, "rollout " + name + ": " + ring + " has no index.txt -- run aysvc_index.py on it");
}

// a ring's state: "done", "wait: <who>" or "halt: <why>"
function ring_state(evt, name, ring)
{
    var jobs = ring_jobs(name, ring);
    if (jobs.length == 0) return "halt: " + ring + " holds no job";
    var wait = "";
    for (var i = 0; i < jobs.length; i++) {
        var t = jobs[i].targets.split(",");
        for (var k = 0; k < t.length; k++) {
            var node = t[k].split("/")[0];
            var at = "id('NODES')/item[@id='" + node + "']";
            var tok = evt.GetValue(at + "/@token");
            if (tok == null) return "halt: " + node + " (job " + jobs[i].id + ") is no node of this centre";
            var jst = JSON.parse("" + evt.GetValue(at + "/@jst"));
            var s = (jst != null && jst[jobs[i].id]) ? "" + jst[jobs[i].id] : "";
            if (s == "FAILED" || s == "REFUSED") return "halt: " + node + " " + jobs[i].id + " " + s;
            if (s != "DONE") wait += (wait == "" ? "" : ", ") + node + " " + jobs[i].id + " " + (s == "" ? "not reported" : s);
        }
    }
    return wait == "" ? "done" : "wait: " + wait;
}

function tick(evt)
{
    rollout(evt);
    index_sync(evt);
    return 0;
}

function rollout(evt)
{
    var cur = read_text("%PRJ%/rollout/current.txt");
    var name = (cur == null) ? "" : cur.trim();
    var was = "" + evt.GetValue("id('ROLL')/@val");
    if (name == "") return 0;
    if (name != was) {                         // a new rollout: ring 1 is opened now
        var rd = ring_dirs(name);
        if (rd.length == 0) {
            evt.SetValue("id('ROLL')/@state", "rollout " + name + ": no ring1/ .. directory");
            return 0;
        }
        evt.SetValue("id('ROLL')/@val", name);
        publish(evt, name, rd[0]);
        evt.SetValue("id('ROLL')/@ring", 1);
        evt.SetValue("id('ROLL')/@state", rd[0] + " open (" + Time.GetTimeStr(0) + ")");
        evt.Log(4, "rollout " + name + ": " + rd[0] + " open");
        return 0;
    }
    var st = "" + evt.GetValue("id('ROLL')/@state");
    if (st.startsWith("HALTED") || st.startsWith("DONE")) return 0;
    var rings = ring_dirs(name);
    var k = Number(evt.GetValue("id('ROLL')/@ring"));
    if (k < 1 || k > rings.length) return 0;
    var rs = ring_state(evt, name, rings[k - 1]);
    if (rs.startsWith("halt: ")) {
        evt.SetValue("id('ROLL')/@state", "HALTED at " + rings[k - 1] + ": " + rs.substr(6));
        evt.Log(4, "rollout " + name + ": HALTED at " + rings[k - 1] + " -- " + rs.substr(6));
        return 0;
    }
    if (rs != "done") {
        evt.SetValue("id('ROLL')/@state", rings[k - 1] + " open -- " + rs);
        return 0;
    }
    if (k == rings.length) {
        evt.SetValue("id('ROLL')/@state", "DONE: every ring (" + Time.GetTimeStr(0) + ")");
        evt.Log(4, "rollout " + name + ": DONE, every ring");
        return 0;
    }
    publish(evt, name, rings[k]);
    evt.SetValue("id('ROLL')/@ring", k + 1);
    evt.SetValue("id('ROLL')/@state", rings[k] + " open (" + rings[k - 1] + " done, " + Time.GetTimeStr(0) + ")");
    evt.Log(4, "rollout " + name + ": " + rings[k - 1] + " done -- " + rings[k] + " open");
    return 0;
}

// ---------------------------------------------------------------------
// the page: one row a node, as an array of objects (index.ayp escapes)
// ---------------------------------------------------------------------
function rows(evt)
{
    var out = [];
    var now = Time.GetTimeMs();
    var n = Number(evt.GetValue("count(id('NODES')/item)"));
    for (var i = 1; i <= n; i++) {
        var at = "id('NODES')/item[" + i + "]";
        var ms = Number(evt.GetValue(at + "/@seen_ms"));
        var age = ms > 0 ? Math.floor((now - ms) / 1000) + " s ago" : "never";
        out.push({ id: "" + evt.GetValue(at + "/@id"), ring: "" + evt.GetValue(at + "/@ring"), seen: age,
                   svc: "" + evt.GetValue(at + "/@svc"), apps: "" + evt.GetValue(at + "/@apps"), jobs: "" + evt.GetValue(at + "/@jobs") });
    }
    return out;
}
