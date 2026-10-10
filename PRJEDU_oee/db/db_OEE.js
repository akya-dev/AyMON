// =====================================================================
// OEE/S00 - the MES: registers in, time and OEE out.
//
//   start(evt)    the database tables, and which shift comes next
//   on_poll(evt)  the machine answered (the block's pro_fnc)
//   tick(evt)     twice a second: the shift clock, the counters, the
//                 stops, the operator's reasons, OEE for the page
//
// Every time is kept in whole MILLISECONDS (integers) and every count as
// an integer; ratios are taken once, at the end, with 0.0 + on the left.
// In this script language the LEFT operand decides the type of an
// expression, so 750 / 1000 is 0 and 0.0 + 750 / 1000 is still 0 - it
// has to be (0.0 + 750) / 1000. Math.round answers an INTEGER, so
// Math.round(x) / 10.0 is an integer division too (see sec()).
//
// SQL: one SQL.attach per function that needs it, handed to the helpers
// it calls (a second attach inside would take a second pool slot).
// =====================================================================

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function geti(evt, id)   { return parseInt("" + get(evt, id)); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function sec(ms)         { return (0.0 + Math.round((0.0 + ms) / 100.0)) / 10.0; }  // ms -> s, one decimal
function pct(r)          { return (0.0 + Math.round(r * 1000.0)) / 10.0; }       // 0.8123 -> 81.2
function ratio(a, b)     { return b > 0 ? (0.0 + a) / b : 0.0; }

function sql_do(con, sql)
{
    var rs = SQL.exec_direct(con, sql);
    if (rs) SQL.close(rs);
}

// ---------------------------------------------------------------------
// the catalogue: REASONS and PRODUCTS, as JSON, once
// ---------------------------------------------------------------------
function items(evt, list)
{
    var s = "" + evt.GetValue("json(id('" + list + "')/item)");
    return (s && s != "undefined") ? JSON.parse(s) : [];
}

function reason_of(evt, code)
{
    var rs = items(evt, "REASONS");
    for (var i = 0; i < rs.length; i++)
        if (parseInt(rs[i].code) == code) return rs[i];
    return { code: "" + code, name: "reason " + code, loss: "other", by: "machine" };
}

function ideal_ms(evt, product)
{
    var ps = items(evt, "PRODUCTS");
    for (var i = 0; i < ps.length; i++)
        if (parseInt(ps[i].code) == product) return parseInt(ps[i].ideal_ms);
    return 0;                      // unknown product: its parts earn no ideal time
}

// ---------------------------------------------------------------------
// START: the tables, the next shift number, what the database remembers
// ---------------------------------------------------------------------
function start(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(2, "OEE: no database - is AyPRO_sqlite.dll next to AyPRO.dll?");
        return 0;
    }
    sql_do(con, "CREATE TABLE IF NOT EXISTS shift (" +
        " no INTEGER PRIMARY KEY, name TEXT, start TEXT, end TEXT, length_s REAL," +
        " planned_s REAL, run_s REAL, down_s REAL, minor_s REAL, ideal_s REAL, good_ideal_s REAL," +
        " total INTEGER, good INTEGER, scrap INTEGER, scrap_su INTEGER," +
        " a REAL, p REAL, q REAL, oee REAL)");
    sql_do(con, "CREATE TABLE IF NOT EXISTS stop (" +
        " sid INTEGER PRIMARY KEY, shift INTEGER, start TEXT, dur_s REAL," +
        " reason INTEGER, kind TEXT, by TEXT)");

    var last = 0, n = 0;
    var rs = SQL.exec_direct(con, "SELECT coalesce(max(no), 0), count(*) FROM shift");
    if (rs) {
        if (SQL.fetch(rs)) { last = parseInt("" + SQL.getdata(rs, 1)); n = parseInt("" + SQL.getdata(rs, 2)); }
        SQL.close(rs);
    }
    set(evt, "SHIFT_NO", last);          // tick begins shift last + 1
    history(evt, con);

    var cat = { reasons: items(evt, "REASONS"), products: items(evt, "PRODUCTS") };
    set(evt, "CATALOG", JSON.stringify(cat));

    evt.Log(4, "OEE: " + n + " shifts in log\\oee.db; the line is on Modbus 127.0.0.1:1505; page http://127.0.0.1:8100/");
    return 0;
}

// The block's pro_fnc, after PRO.inp has put the registers into the <io>s.
function on_poll(evt)
{
    set(evt, "POLL_MS", Time.GetTimeMs());
    return 0;
}

// ---------------------------------------------------------------------
// SHIFTS
// ---------------------------------------------------------------------
function acc_new()
{
    return { plan: 0, down: 0, minor: 0, minor_n: 0, down_by: {}, n_by: {},
             total: 0, good: 0, scrap: 0, su: 0, ideal: 0, good_ideal: 0 };
}

function shift_begin(evt, at)
{
    var no = geti(evt, "SHIFT_NO") + 1;
    var name = ["A", "B", "C"][(no - 1) % 3];
    set(evt, "SHIFT_NO", no);
    set(evt, "SHIFT_NAME", name);
    set(evt, "SHIFT_START_MS", at);
    set(evt, "SHIFT_START_TS", Time.FmtTimeStr(at, 0));
    set(evt, "ACC", JSON.stringify(acc_new()));
    set(evt, "STOPS", "[]");
    evt.Log(4, "OEE: shift " + name + " #" + no + " begins");
}

// The shift is over at 'at': its row goes into the database.
function shift_end(evt, con, acc, at)
{
    var len = at - get(evt, "SHIFT_START_MS");
    var planned = len - acc.plan;
    var run = planned - acc.down;
    var a = ratio(run, planned), p = ratio(acc.ideal, run), q = ratio(acc.good, acc.total);
    var oee = a * p * q;

    var rs = SQL.prepare(con, "INSERT INTO shift (no, name, start, end, length_s, planned_s, run_s, down_s," +
        " minor_s, ideal_s, good_ideal_s, total, good, scrap, scrap_su, a, p, q, oee)" +
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    if (rs) {
        var v = [geti(evt, "SHIFT_NO"), "" + get(evt, "SHIFT_NAME"), "" + get(evt, "SHIFT_START_TS"),
                 Time.FmtTimeStr(at, 0), sec(len), sec(planned), sec(run), sec(acc.down),
                 sec(acc.minor), sec(acc.ideal), sec(acc.good_ideal),
                 acc.total, acc.good, acc.scrap, acc.su, a, p, q, oee];
        for (var i = 0; i < v.length; i++) SQL.parameter(rs, i + 1, v[i]);
        SQL.execute(rs);
        SQL.close(rs);
    }
    evt.Log(4, "OEE: shift " + get(evt, "SHIFT_NAME") + " #" + get(evt, "SHIFT_NO") + " ends - A "
               + pct(a) + " %, P " + pct(p) + " %, Q " + pct(q) + " %, OEE " + pct(oee)
               + " % (" + acc.good + " good of " + acc.total + ")");
    history(evt, con);
}

// the last ten shifts, and downtime by reason over them, for the page
function history(evt, con)
{
    var out = [];
    var rs = SQL.exec_direct(con, "SELECT no, name, start, planned_s, run_s, down_s, minor_s, ideal_s," +
        " good_ideal_s, total, good, scrap, a, p, q, oee FROM shift ORDER BY no DESC LIMIT 10");
    if (rs) {
        while (SQL.fetch(rs)) {
            out.push({ no: SQL.getdata(rs, 1), name: SQL.getdata(rs, 2), start: SQL.getdata(rs, 3),
                       planned_s: SQL.getdata(rs, 4), run_s: SQL.getdata(rs, 5), down_s: SQL.getdata(rs, 6),
                       minor_s: SQL.getdata(rs, 7), ideal_s: SQL.getdata(rs, 8), good_ideal_s: SQL.getdata(rs, 9),
                       total: SQL.getdata(rs, 10), good: SQL.getdata(rs, 11), scrap: SQL.getdata(rs, 12),
                       a: SQL.getdata(rs, 13), p: SQL.getdata(rs, 14), q: SQL.getdata(rs, 15), oee: SQL.getdata(rs, 16) });
        }
        SQL.close(rs);
    }
    set(evt, "SHIFTS", JSON.stringify(out));

    var par = [];
    rs = SQL.exec_direct(con, "SELECT reason, round(sum(dur_s), 1), count(*) FROM stop" +
        " WHERE kind = 'down' AND shift > (SELECT coalesce(max(no), 0) - 10 FROM shift)" +
        " GROUP BY reason ORDER BY 2 DESC");
    if (rs) {
        while (SQL.fetch(rs)) {
            var code = parseInt("" + SQL.getdata(rs, 1));
            var r = reason_of(evt, code);
            par.push({ reason: code, name: r.name, loss: r.loss, s: SQL.getdata(rs, 2), n: SQL.getdata(rs, 3) });
        }
        SQL.close(rs);
    }
    set(evt, "PARETO_ALL", JSON.stringify(par));
}

// ---------------------------------------------------------------------
// STOPS
// ---------------------------------------------------------------------
// A stop is over at 'at'. It is PLANNED (the break), MINOR (shorter than
// MINOR_S: stays in run time) or DOWN (downtime, by reason). Every one is
// a row in the database. 'cut': the stop is not over, the shift or the
// break cut it - a piece of a stop that goes on is never a minor stop,
// however short the piece (and neither is the piece that goes on, .cont).
function stop_close(evt, con, acc, open, at, cut)
{
    var dur = at - open.start;
    var kind = (open.plan || open.reason == 90) ? "planned"
             : ((dur < 1000 * geti(evt, "MINOR_S") && !cut && !open.cont) ? "minor" : "down");
    if (dur <= 0) return;
    if (kind == "planned") acc.plan = acc.plan + dur;
    else if (kind == "minor") { acc.minor = acc.minor + dur; acc.minor_n = acc.minor_n + 1; }
    else {
        var k = "" + open.reason;
        acc.down = acc.down + dur;
        acc.down_by[k] = (acc.down_by[k] ? acc.down_by[k] : 0) + dur;
        acc.n_by[k] = (acc.n_by[k] ? acc.n_by[k] : 0) + 1;
    }

    var sid = 0;
    var rs = SQL.prepare(con, "INSERT INTO stop (shift, start, dur_s, reason, kind, by) VALUES (?,?,?,?,?,?)");
    if (rs) {
        SQL.parameter(rs, 1, geti(evt, "SHIFT_NO"));
        SQL.parameter(rs, 2, Time.FmtTimeStr(open.start, 0));
        SQL.parameter(rs, 3, sec(dur));
        SQL.parameter(rs, 4, open.reason);
        SQL.parameter(rs, 5, kind);
        SQL.parameter(rs, 6, open.by);
        SQL.execute(rs);
        SQL.close(rs);
        rs = SQL.exec_direct(con, "SELECT last_insert_rowid()");
        if (rs) { if (SQL.fetch(rs)) sid = parseInt("" + SQL.getdata(rs, 1)); SQL.close(rs); }
    }

    var list = JSON.parse("" + get(evt, "STOPS"));
    list.push({ sid: sid, at: (open.start - get(evt, "SHIFT_START_MS")), ms: dur,
                reason: open.reason, kind: kind, by: open.by });
    set(evt, "STOPS", JSON.stringify(list));

    if (kind != "minor")
        evt.Log(4, "OEE: stop #" + sid + " " + sec(dur) + " s - " + kind + ", reason " + open.reason
                   + " (" + reason_of(evt, open.reason).name + ", " + open.by + ")");
}

// The operator's answer to "why did it stop?" (REASON_SET). Only stops
// the machine could not name (reason 0), only reasons marked
// by="operator" in the catalogue.
function reason_apply(evt, con, acc, open)
{
    var req = "" + get(evt, "REASON_SET");
    if (req == "" || req == "" + get(evt, "REASON_DONE")) return open;
    set(evt, "REASON_DONE", req);

    var q = null;
    try { q = JSON.parse(req); } catch (e) { q = null; }
    if (!q || q.reason == null || q.sid == null) { set(evt, "MSG", "a reason request is {\"sid\": .., \"reason\": ..}"); return open; }
    var code = parseInt("" + q.reason);
    var r = reason_of(evt, code);
    if (r.by != "operator") { set(evt, "MSG", "reason " + code + " is not the operator's to give"); return open; }

    if ("" + q.sid == "open") {
        if (!open || open.reason != 0) { set(evt, "MSG", "no unnamed stop going on"); return open; }
        open.reason = code;
        open.by = "operator";
        set(evt, "MSG", "the stop going on: " + r.name);
        return open;
    }

    var sid = parseInt("" + q.sid);
    var list = JSON.parse("" + get(evt, "STOPS"));
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s.sid != sid) continue;
        if (s.reason != 0 || s.kind != "down") { set(evt, "MSG", "stop #" + sid + " already has a reason"); return open; }
        var rs = SQL.prepare(con, "UPDATE stop SET reason = ?, by = 'operator' WHERE sid = ? AND reason = 0");
        if (rs) { SQL.parameter(rs, 1, code); SQL.parameter(rs, 2, sid); SQL.execute(rs); SQL.close(rs); }
        // move its time from 'not assigned' to the reason given
        var k = "" + code;
        acc.down_by["0"] = acc.down_by["0"] - s.ms;
        acc.n_by["0"] = acc.n_by["0"] - 1;
        acc.down_by[k] = (acc.down_by[k] ? acc.down_by[k] : 0) + s.ms;
        acc.n_by[k] = (acc.n_by[k] ? acc.n_by[k] : 0) + 1;
        s.reason = code;
        s.by = "operator";
        set(evt, "STOPS", JSON.stringify(list));
        set(evt, "MSG", "stop #" + sid + ": " + r.name);
        evt.Log(4, "OEE: stop #" + sid + " - the operator says: " + r.name);
        return open;
    }
    set(evt, "MSG", "stop #" + sid + " is not in this shift");
    return open;
}

// ---------------------------------------------------------------------
// THE TICK
// ---------------------------------------------------------------------
function tick(evt)
{
    var now = Time.GetTimeMs();
    var con = SQL.attach('CN_SQL');
    if (!con) return 0;

    if (get(evt, "SHIFT_START_MS") == 0) shift_begin(evt, now);
    var acc = JSON.parse("" + get(evt, "ACC"));
    var os = "" + get(evt, "OPEN");
    var open = (os != "") ? JSON.parse(os) : null;

    // is the machine there, and what does it say?
    var comm = get(evt, "POLL_MS") > 0 && now - get(evt, "POLL_MS") < 1000 * geti(evt, "POLL_LOST_S");
    var st = geti(evt, "I_STATE"), rr = geti(evt, "I_REASON");
    var running = comm && st == 1;

    // ---- the shift is over: close it at its exact end, open the next ----
    var len_ms = 1000 * geti(evt, "SHIFT_S");
    var s0 = get(evt, "SHIFT_START_MS");
    if (now - s0 >= len_ms) {
        var at = s0 + len_ms;
        if (open) stop_close(evt, con, acc, open, at, true);
        shift_end(evt, con, acc, at);
        shift_begin(evt, at);
        acc = acc_new();
        if (open) open = { start: at, reason: open.reason, mr: open.mr, by: open.by, plan: open.plan, cont: true };   // a stop across the change goes on in the new shift
        s0 = at;
    }
    var el = now - s0;

    // ---- the planned break: hold the line through register 6 ----
    var b0 = 1000 * geti(evt, "BREAK_AT_S"), b1 = b0 + 1000 * geti(evt, "BREAK_S");
    var hold = (el >= b0 && el < b1) ? 1 : 0;
    if (comm && parseInt("" + evt.GetValue("id('Q_HOLD')/@pro")) != hold) {
        evt.SetValue("id('Q_HOLD')/@pro", hold);                 // PRO.out -> Modbus function 6
        evt.Log(4, "OEE: " + (hold ? "planned break - holding the line" : "break over - releasing the line"));
    }

    // ---- the counters: the difference since the last poll, modulo 65536 ----
    if (comm) {
        var t = geti(evt, "I_TOTAL"), sc = geti(evt, "I_SCRAP"), su = geti(evt, "I_SCRAP_SU");
        var ls = "" + get(evt, "LAST_CNT");
        if (ls != "") {
            var l = JSON.parse(ls);
            var dt = (t - l.t) & 0xFFFF, ds = (sc - l.s) & 0xFFFF, du = (su - l.u) & 0xFFFF;
            var mx = geti(evt, "CNT_MAX");
            if (dt > mx || ds > mx || du > mx || ds > dt) {
                evt.Log(3, "OEE: counters jumped (total +" + dt + ", scrap +" + ds + ") - reset at the machine? not counted");
            }
            else if (dt > 0) {
                var id_ms = ideal_ms(evt, geti(evt, "I_PRODUCT"));
                acc.total = acc.total + dt;
                acc.scrap = acc.scrap + ds;
                acc.su = acc.su + du;
                acc.good = acc.good + dt - ds;
                acc.ideal = acc.ideal + dt * id_ms;
                acc.good_ideal = acc.good_ideal + (dt - ds) * id_ms;
            }
        }
        set(evt, "LAST_CNT", JSON.stringify({ t: t, s: sc, u: su }));
    }

    // ---- the planned break: the PLAN decides, not the machine ----
    // From BREAK_AT_S to its end the time is planned, whatever the machine
    // does - broken down, held, or running anyway. A stop that is going on
    // when the break begins is closed at that moment; the break is one
    // planned stop; after it, the machine's state counts again.
    var bs = s0 + b0, be = s0 + b1;
    if (now >= bs && now < be) {
        if (!open || !open.plan) {
            if (open) stop_close(evt, con, acc, open, bs > open.start ? bs : open.start, true);
            open = { start: bs > s0 ? bs : s0, reason: 90, mr: -1, by: "plan", plan: true };
        }
    }
    else if (open && open.plan && now >= be) {
        stop_close(evt, con, acc, open, be, false);
        open = null;
        if (!running) open = { start: be, reason: comm ? rr : 99, mr: comm ? rr : 99,
                               by: comm ? (rr != 0 ? "machine" : "") : "mes", cont: true };
    }

    // ---- stops ----
    // 'mr' is the reason the MACHINE gave when the stop began. When it
    // reports another one while still stopped - a breakdown that ends
    // straight into a missing pallet, an unnamed stop that the machine
    // later names - that is a second stop: the first is closed and the
    // second begins. Taking the new reason for the whole stop would book
    // one loss as the other.
    if (open && !open.plan && !running && comm && rr != open.mr) {
        stop_close(evt, con, acc, open, now, false);
        open = null;
    }
    if (!running && !open) {
        var r0 = comm ? rr : 99;
        open = { start: now, reason: r0, mr: r0, by: comm ? (r0 != 0 ? "machine" : "") : "mes" };
    }
    else if (open && !open.plan && running) {
        stop_close(evt, con, acc, open, now, false);
        open = null;
    }

    open = reason_apply(evt, con, acc, open);

    set(evt, "ACC", JSON.stringify(acc));
    set(evt, "OPEN", open ? JSON.stringify(open) : "");
    live(evt, acc, open, now, s0, len_ms, b0, b1, comm, st, rr);
    return 0;
}

// ---------------------------------------------------------------------
// OEE, live - the running shift as the page shows it
// ---------------------------------------------------------------------
function live(evt, acc, open, now, s0, len_ms, b0, b1, comm, st, rr)
{
    var el = now - s0;
    var minor_ms = 1000 * geti(evt, "MINOR_S");

    // the stop going on counts as what it will be if it ended now
    var plan = acc.plan, down = acc.down, minor = acc.minor;
    var by = {};
    for (var k in acc.down_by) by[k] = acc.down_by[k];
    var open_s = null;
    if (open) {
        var d = now - open.start;
        if (open.plan || open.reason == 90) plan = plan + d;
        else if (d < minor_ms && !open.cont) minor = minor + d;
        else { down = down + d; var ok = "" + open.reason; by[ok] = (by[ok] ? by[ok] : 0) + d; }
        var ro = reason_of(evt, open.reason);
        open_s = { s: sec(d), reason: open.reason, name: ro.name, by: open.by, plan: open.plan ? true : false,
                   minor: d < minor_ms && !open.plan && !open.cont && open.reason != 90 };
    }

    var planned = el - plan;
    var run = planned - down;
    var speed = run - acc.ideal - minor;              // performance loss that was not a minor stop
    var qual = acc.ideal - acc.good_ideal;
    var a = ratio(run, planned), p = ratio(acc.ideal, run), q = ratio(acc.good, acc.total);

    // downtime by kind of loss, and by reason (this shift's Pareto)
    var loss = { breakdown: 0, setup: 0, waiting: 0, other: 0, unassigned: 0 };
    var par = [];
    for (var c in by) {
        var r = reason_of(evt, parseInt(c));
        var l = (r.loss == "planned") ? "other" : r.loss;
        loss[l] = (loss[l] ? loss[l] : 0) + by[c];
        if (by[c] > 0) par.push({ reason: parseInt(c), name: r.name, loss: r.loss, s: sec(by[c]),
                                  n: acc.n_by[c] ? acc.n_by[c] : 0 });
    }
    // longest first - an insertion sort, the list is a handful of reasons
    for (var i1 = 1; i1 < par.length; i1++)
        for (var j1 = i1; j1 > 0 && par[j1].s > par[j1 - 1].s; j1--) {
            var tmp = par[j1]; par[j1] = par[j1 - 1]; par[j1 - 1] = tmp;
        }
    set(evt, "PARETO", JSON.stringify(par));

    var pn = geti(evt, "I_PRODUCT");
    var out = {
        shift: { no: geti(evt, "SHIFT_NO"), name: "" + get(evt, "SHIFT_NAME"), start: "" + get(evt, "SHIFT_START_TS"),
                 el: sec(el), len: sec(len_ms), brk_at: sec(b0), brk_end: sec(b1) },
        line: { comm: comm, state: comm ? st : -1, reason: rr, product: pn, ideal_ms: ideal_ms(evt, pn),
                raw_total: geti(evt, "I_TOTAL"), raw_scrap: geti(evt, "I_SCRAP"), hold: parseInt("" + evt.GetValue("id('Q_HOLD')/@pro")) },
        open: open_s,
        t: { shift: sec(el), plan: sec(plan), planned: sec(planned), down: sec(down), run: sec(run),
             minor: sec(minor), speed: sec(speed), ideal: sec(acc.ideal), qual: sec(qual), good_ideal: sec(acc.good_ideal) },
        loss: { breakdown: sec(loss.breakdown), setup: sec(loss.setup), waiting: sec(loss.waiting),
                other: sec(loss.other), unassigned: sec(loss.unassigned) },
        n: { total: acc.total, good: acc.good, scrap: acc.scrap, su: acc.su, minor: acc.minor_n },
        a: a, p: p, q: q, oee: a * p * q, oee2: ratio(acc.good_ideal, planned)
    };
    set(evt, "LIVE", JSON.stringify(out));

    // the line's settings, for the page's world buttons (the page reads
    // this document only)
    var cfg = {};
    var names = ["SCRAP_PCT", "SLOW_PCT", "FAULT_EVERY_S", "JAM_EVERY_S", "MATERIAL_EVERY_S", "LOT", "LOT_LEFT", "MADE", "MADE_BAD"];
    for (var i = 0; i < names.length; i++) cfg[names[i]] = evt.GetValue("doc('LINE/S00')/id('" + names[i] + "')/@val");
    set(evt, "LINE_CFG", JSON.stringify(cfg));
}
