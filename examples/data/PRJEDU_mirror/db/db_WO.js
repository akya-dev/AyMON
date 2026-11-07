// =====================================================================
// WO/S00 -- a maintenance board. The open work orders are the list
// ORDERS, and the list is the live window of table wo: no function here
// writes SQL for an order. The SQL in this file makes the table, plays
// another program that writes to it, and reads it back for the page.
// =====================================================================

// What a new order is about. A script file is a set of functions: a
// constant list lives in one.
function titles()
{
    return ["Replace the filter", "Check the belt tension", "Grease the bearings",
            "Calibrate the level sensor", "Tighten the flange", "Clean the heat exchanger",
            "Replace a worn seal", "Inspect the valve actuator"];
}
function assets()
{
    return ["PUMP-1", "PUMP-2", "CONVEYOR-A", "TANK-3", "VALVE-7", "FAN-2", "MIXER-1"];
}

function now_txt()
{
    return Time.FmtTimeStr(Time.GetTimeMs(), "%Y-%m-%d %H:%M:%S%z");
}

// A number from whatever SQL or an attribute gave (text, integer, float).
function num(v)
{
    if (v === undefined || v === null || ("" + v) == "") return 0;
    return parseInt("" + v);
}

// Called once from xdb_start. IF NOT EXISTS makes it restartable: the table
// is the record, the list is only its window, and it is still there after a
// restart. The CHECK is the database's own rule; the mirror cannot break it.
// The first orders are written here, the way any program would: the list
// gets them by loading the table.
function start(evt)
{
    var con = SQL.attach('CN_OTHER');
    if (!con) {
        evt.Log(2, "WO: no database -- is the AyPRO_sqlite driver beside the engine?");
        return 0;
    }
    var rs = SQL.exec_direct(con,
        "CREATE TABLE IF NOT EXISTS wo (wo_id INTEGER PRIMARY KEY, title TEXT NOT NULL, asset TEXT," +
        " prio INTEGER NOT NULL CHECK (prio BETWEEN 1 AND 5), status INTEGER NOT NULL DEFAULT 0," +
        " opened TEXT, started TEXT, done TEXT)");
    if (rs) SQL.close(rs);
    var n = 0;
    rs = SQL.exec_direct(con, "SELECT count(*) FROM wo");
    if (rs) {
        if (SQL.fetch(rs)) n = num(SQL.getdata(rs, 1));
        SQL.close(rs);
    }
    if (n == 0) {
        var t = Time.GetTimeMs();
        var seed = [
            [1, "Replace the filter", "PUMP-1", 3, 2, 26],
            [2, "Check the belt tension", "CONVEYOR-A", 2, 1, 5],
            [3, "Grease the bearings", "FAN-2", 4, 0, 3],
            [4, "Calibrate the level sensor", "TANK-3", 2, 0, 1]
        ];
        for (var i = 0; i < seed.length; i++) {
            var s = seed[i];
            // the text the mirror writes for a ':dtm' column on SQLite
            var fmt = "%Y-%m-%dT%H:%M:%S.000%z";
            var t0 = t - s[5] * 3600000;
            var opened = "'" + Time.FmtTimeStr(t0, fmt) + "'";
            var started = (s[4] >= 1) ? "'" + Time.FmtTimeStr(t0 + 1800000, fmt) + "'" : "NULL";
            var done = (s[4] == 2) ? "'" + Time.FmtTimeStr(t0 + 7200000, fmt) + "'" : "NULL";
            var sql = "INSERT INTO wo (wo_id, title, asset, prio, status, opened, started, done) VALUES (" +
                s[0] + ", '" + s[1] + "', '" + s[2] + "', " + s[3] + ", " + s[4] + ", " +
                opened + ", " + started + ", " + done + ")";
            rs = SQL.exec_direct(con, sql);
            if (rs) SQL.close(rs);
        }
        evt.Log(4, "WO: table wo made in log/orders.db, with " + seed.length + " orders (one of them done)");
    }
    else evt.Log(4, "WO: table wo is there, " + n + " order(s): the list loads the open ones");
    SQL.disconnect(con);
    return 0;
}

// ELM.new's hook: one new order. The key comes from the mirror (HIS.key,
// his_keygen="max": the table's largest key + 1), and the element's id is
// what his_rid would make of it, so that the next load finds this element
// and does not make a second one. Answer 1 = keep the element; the mirror
// writes it as a new row within a second.
function new_wo(evt)
{
    var o = JSON.parse(evt.valn);
    if (!o) return 0;
    var k = HIS.key(evt, "id('ORDERS')");
    if (!k) {
        evt.Log(3, "WO: no key yet -- the table has not been loaded");
        return 0;
    }
    evt.obj.xdb_cls = "cls_WO";
    evt.obj.id = "WO" + k;
    evt.obj.wo_id = k;
    evt.obj.title = o.title;
    evt.obj.asset = o.asset;
    evt.obj.prio = o.prio;
    evt.obj.status = 0;
    evt.obj.opened = now_txt();
    return 1;
}

function last(evt, txt)
{
    evt.SetValue("id('LAST')/@val", JSON.stringify({ at: Time.FmtTimeStr(Time.GetTimeMs(), "%H:%M:%S"), txt: txt }));
}

// One order picked by SQL, for the other program.
function pick(con, where)
{
    var id = 0;
    var rs = SQL.exec_direct(con, "SELECT wo_id FROM wo WHERE " + where + " ORDER BY wo_id LIMIT 1");
    if (rs) {
        if (SQL.fetch(rs)) id = num(SQL.getdata(rs, 1));
        SQL.close(rs);
    }
    return id;
}

// An action from the page. The engine runs it (a val chain), so it may
// change the list. A change to a row is all it does: the mirror writes it.
function act(evt)
{
    var a = JSON.parse(evt.valn);
    if (!a || !a.cmd) return 0;
    var cmd = "" + a.cmd;
    if (cmd == "new") {
        main.made = (main.made ? main.made : 0) + 1;
        var m = main.made + num(evt.GetValue("count(id('ORDERS')/item)"));
        var tl = titles(), al = assets();
        var o = { title: tl[m % tl.length], asset: al[(m * 3) % al.length], prio: 1 + (m % 5) };
        evt.SetValue("id('ORDERS')/@new", JSON.stringify(o));
        last(evt, "a new order: " + o.title + " on " + o.asset + " -- the mirror writes it as a new row");
        return 0;
    }
    if (cmd == "start" || cmd == "finish") {
        var id = "" + a.id;
        var st = evt.GetValue("id('" + id + "')/@status");
        if (st === undefined || st === null) { last(evt, id + " is not in the list"); return 0; }
        if (cmd == "start" && num(st) == 0) {
            evt.SetValue("id('" + id + "')/@status", 1);
            evt.SetValue("id('" + id + "')/@started", now_txt());
            last(evt, id + " started -- one row changed, written within a second");
        }
        else if (cmd == "finish" && num(st) < 2) {
            evt.SetValue("id('" + id + "')/@status", 2);
            evt.SetValue("id('" + id + "')/@done", now_txt());
            last(evt, id + " done -- written, and the next load leaves it out (his_load: status < 2)");
        }
        return 0;
    }
    // ANOTHER PROGRAM. CN_OTHER writes the table directly, as a planning
    // tool or a terminal at the machine would. Nothing tells the engine:
    // the next load (his_ref, every 3 s) finds it.
    if (cmd == "prio" || cmd == "close") {
        var con = SQL.attach('CN_OTHER');
        if (!con) return 0;
        var n = 0, rs = null;
        if (cmd == "prio") {
            n = pick(con, "status < 2 AND prio > 1");
            if (n) rs = SQL.exec_direct(con, "UPDATE wo SET prio = 1 WHERE wo_id = " + n);
            last(evt, n ? "another program set WO" + n + "'s priority to 1 in the table -- the list sees it within 3 s"
                        : "no open order with a priority above 1");
        }
        else {
            n = pick(con, "status = 1");
            if (!n) n = pick(con, "status = 0");
            if (n) rs = SQL.exec_direct(con, "UPDATE wo SET status = 2, done = '" + now_txt() + "' WHERE wo_id = " + n);
            last(evt, n ? "another program closed WO" + n + " in the table -- it leaves the list within 3 s"
                        : "no open order to close");
        }
        if (rs) SQL.close(rs);
        SQL.disconnect(con);
        return 0;
    }
    return 0;
}

// Once a second: the list as the engine holds it, the table as the database
// holds it, and what the mirror has done.
function view(evt)
{
    var items = JSON.parse("" + evt.GetValue("json(id('ORDERS')/item)"));
    var list = [];
    if (items) {
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            list.push({ id: it.id, no: num(it.wo_id), title: it.title, asset: it.asset, prio: num(it.prio),
                        status: num(it.status), opened: "" + it.opened, started: it.started ? "" + it.started : "",
                        dirty: HIS.dirty(evt, "id('ORDERS')", "" + it.id) });
        }
    }
    evt.SetValue("id('LIST')/@val", JSON.stringify(list));

    // SQL.qry turns the rows into <item>s of L_TABLE; 'id' and 'sta' are left
    // out of the SELECT (they would be the element's own id and state).
    evt.SetValue("id('L_TABLE')/@qry",
        "SELECT wo_id AS no, title, asset, prio, status, opened, done FROM wo ORDER BY wo_id DESC LIMIT 12");
    evt.SetValue("id('TABLE')/@val", "" + evt.GetValue("json(id('L_TABLE')/item)"));

    var s = HIS.stat(evt, "id('ORDERS')");
    var con = SQL.attach('CN_READ');
    var cnt = [0, 0, 0];
    if (con) {
        var rs = SQL.exec_direct(con, "SELECT status, count(*) FROM wo GROUP BY status");
        if (rs) {
            while (SQL.fetch(rs)) {
                var k = num(SQL.getdata(rs, 1));
                if (k >= 0 && k <= 2) cnt[k] = num(SQL.getdata(rs, 2));
            }
            SQL.close(rs);
        }
        SQL.disconnect(con);
    }
    evt.SetValue("id('STATS')/@val", JSON.stringify({ his: s, open: cnt[0], started: cnt[1], done: cnt[2] }));
    return 0;
}
