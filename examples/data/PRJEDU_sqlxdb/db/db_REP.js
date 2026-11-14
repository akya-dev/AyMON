// =====================================================================
// REP/S00 -- a history table that holds keys only, and queries that take
// what a point IS (its name, its unit) from the tree while their result
// is built.
//
// The tree (LINE/L1, LINE/L2) knows every point's name and unit, and every
// work order's title and state. The table his knows when a point had which
// value; the table wo knows how many bottles an order made. Neither copies
// the other. A query joins them with two SQL comments the engine reads and
// takes out before the database sees the text:
//
//   /*xdb: col = address */    fills column col of every row; {column} in
//                              the address is that row's cell
//   /*xdb-in: address/@a */    becomes the SQL list 'x','y',.. of the
//                              values the address selects
//
// A {column} may also make a number into an id: {wo_wid:010X} = the key in
// 10 hex digits, {wo_wid>>32:d} = its top 32 bits in decimal. And
// '~ WO{:010X}' after a list reads such ids back into keys.
// =====================================================================

function now_txt(t)
{
    return Time.FmtTimeStr(t, "%Y-%m-%d %H:%M:%S");
}

// A number from whatever SQL or an attribute gave (text, integer, float).
function num(v)
{
    if (v === undefined || v === null || ("" + v) == "") return 0;
    return parseInt("" + v);
}

// The points the sampler writes: document, id, a middle value, a swing.
// The middle values are written with a decimal point on purpose: the left
// operand decides the type of the arithmetic below.
function points()
{
    return [["LINE/L1", "L1_LT1", 62.0, 8.0], ["LINE/L1", "L1_PT1", 3.2, 0.4], ["LINE/L1", "L1_ST1", 480.0, 40.0],
            ["LINE/L2", "L2_TT1", 182.0, 6.0], ["LINE/L2", "L2_TT2", 165.0, 3.0], ["LINE/L2", "L2_PT1", 6.1, 0.3],
            ["LINE/L2", "L2_ST1", 24.0, 4.0]];
}

function exec(con, sql)
{
    var rs = SQL.exec_direct(con, sql);
    if (rs) SQL.close(rs);
}

// =====================================================================
// THE QUERIES. Every text is plain SQL plus comments; an engine older
// than 4.4.2.705 would refuse the templates, and one older than 704 would
// send the comments to the database (see the README).
// =====================================================================

// What every reading query adds to its rows: the point's name and unit.
// The unit is not on the point: the address reads it through the class.
function names()
{
    return "/*xdb: name = doc('{doc}')/id('{rid}')/@desc ;\n" +
           "       unit = doc('{doc}')/id('{rid}')/@val_unt */";
}

function q_his()
{
    return "SELECT tim, doc, rid, val FROM his ORDER BY tim DESC, rid LIMIT 14\n" + names();
}

// The text goes into an XPath literal, not into the SQL: a ' would end the
// literal and a { } would be a placeholder, so they are taken out. The SQL
// list itself is escaped by the engine.
function q_find(txt)
{
    return "SELECT tim, doc, rid, val FROM his\n" +
           " WHERE rid IN (/*xdb-in: doc('LINE/*')//io[contains-ci(@desc, '" + txt + "')]/@id */)\n" +
           " ORDER BY tim DESC, rid LIMIT 14\n" + names();
}

// A row of wo names its order only by a number. The placeholders make the
// order's document and id of it: wo_wid = 4294967298 = 0x0100000002 gives
// doc('LINE/L1') and id('WO0100000002'). title ?= keeps a title the row
// has of its own (the old orders) and fills the others from the tree.
function wo_names()
{
    return "/*xdb: wo     = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@id ;\n" +
           "       line   = doc('LINE/L{wo_wid>>32:d}')/xdb/@desc ;\n" +
           "       title ?= doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@title ;\n" +
           "       state  = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@state */";
}

function q_wo()
{
    return "SELECT wo_wid, title, qty, made FROM wo ORDER BY wo_wid\n" + wo_names();
}

// The other way: which orders the TREE says are open, as keys the table
// can compare. '~ WO{:010X}' reads 'WO0100000002' back as 4294967298,
// written without quotes: the INTEGER column is compared as a number.
function q_open()
{
    return "SELECT wo_wid, title, qty, made FROM wo\n" +
           " WHERE wo_wid IN (/*xdb-in: doc('LINE/*')//order[@state='open']/@id ~ WO{wo_wid:010X} */)\n" +
           " ORDER BY wo_wid\n" + wo_names();
}

// =====================================================================
// START: the tables. IF NOT EXISTS makes it restartable; the work orders
// are written once, as an older program would have written them: the two
// finished ones carry a title of their own, the rest none.
// =====================================================================
function start(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(2, "REP: no database -- is the AyPRO_sqlite driver beside the engine?");
        return 0;
    }
    exec(con, "CREATE TABLE IF NOT EXISTS his (tim TEXT NOT NULL, doc TEXT NOT NULL, rid TEXT NOT NULL, val REAL)");
    exec(con, "CREATE INDEX IF NOT EXISTS his_tim ON his (tim)");
    exec(con, "CREATE TABLE IF NOT EXISTS wo (wo_wid INTEGER PRIMARY KEY, title TEXT," +
              " qty INTEGER NOT NULL, made INTEGER NOT NULL DEFAULT 0)");
    var n = 0;
    var rs = SQL.exec_direct(con, "SELECT count(*) FROM wo");
    if (rs) {
        if (SQL.fetch(rs)) n = num(SQL.getdata(rs, 1));
        SQL.close(rs);
    }
    if (n == 0) {
        // the keys as text: line x 2^32 + order number
        exec(con, "INSERT INTO wo (wo_wid, title, qty, made) VALUES" +
                  " (4294967297, 'Water 0.5 l', 12000, 12000)," +     // WO0100000001, finished
                  " (4294967298, NULL, 8000, 2150)," +                 // WO0100000002
                  " (4294967299, NULL, 20000, 0)," +                   // WO0100000003
                  " (8589934593, NULL, 1300, 410)," +                  // WO0200000001
                  " (8589934594, 'Tray 24 x 0.33 l', 900, 900)");      // WO0200000002, finished
        evt.Log(4, "REP: tables his and wo made in log/plant.db, 5 work orders (two finished, with a title of their own)");
    }
    else evt.Log(4, "REP: tables are there, " + n + " work order(s)");
    SQL.disconnect(con);
    return 0;
}

// =====================================================================
// EVERY 5 s: a value for every point, into the tree (the live value) and
// into the table (its history). The table gets the time, the document,
// the id and the value. Nothing else.
// =====================================================================
function sample(evt)
{
    var t = Time.GetTimeMs();
    var tim = now_txt(t);
    var s = 0.001 * (t % 3600000);
    var con = SQL.attach('CN_SQL');
    if (!con) return 0;
    var p = points();
    for (var i = 0; i < p.length; i++) {
        var v = 1.0 * p[i][2] + Math.sin(s / 47.0 + 1.3 * i) * p[i][3];
        evt.SetValue("doc('" + p[i][0] + "')/id('" + p[i][1] + "')/@val", v);
        var rs = SQL.prepare(con, "INSERT INTO his (tim, doc, rid, val) VALUES (?, ?, ?, ?)");
        if (rs) {
            SQL.parameter(rs, 1, tim);
            SQL.parameter(rs, 2, p[i][0]);
            SQL.parameter(rs, 3, p[i][1]);
            SQL.parameter(rs, 4, v);
            SQL.execute(rs);
            SQL.close(rs);
        }
    }
    made(evt, con, t);
    // an hour of history is enough for the example
    main.nsample = (main.nsample ? main.nsample : 0) + 1;
    if (main.nsample % 12 == 1) {
        var rd = SQL.prepare(con, "DELETE FROM his WHERE tim < ?");
        if (rd) {
            SQL.parameter(rd, 1, now_txt(t - 3600000));
            SQL.execute(rd);
            SQL.close(rd);
        }
    }
    SQL.disconnect(con);
    return 0;
}

// The open orders make bottles. Which ones are open is the tree's word,
// so the script reads the ids there and turns them back into keys by
// hand: the same work '~ WO{:010X}' does in q_open().
function made(evt, con, t)
{
    for (var ln = 1; ln <= 2; ln++) {
        var ids = JSON.parse("" + evt.GetValue("doc('LINE/L" + ln + "')/json(//order[@state='open']/@id)"));
        if (!ids) continue;
        for (var i = 0; i < ids.length; i++) {
            var id = "" + ids[i].id;
            var wid = parseInt(id.substr(2), 16);
            var rs = SQL.prepare(con, "UPDATE wo SET made = MIN(qty, made + ?) WHERE wo_wid = ?");
            if (rs) {
                SQL.parameter(rs, 1, 20 + (t % 37));
                SQL.parameter(rs, 2, wid);
                SQL.execute(rs);
                SQL.close(rs);
            }
        }
    }
}

// =====================================================================
// EVERY SECOND: the four queries. A query is SQL.qry on a <list>: write
// the text, read the rows as JSON from qry_out (qry_jsn: no <item> is
// made), the reason of a refusal from qry_err.
// =====================================================================
function run(evt, id, sql, out, txt)
{
    evt.SetValue("id('" + id + "')/@qry", sql);
    var rows = evt.GetValue("id('" + id + "')/@qry_out");
    evt.SetValue("id('" + out + "')/@val", rows ? "" + rows : "[]");
    var err = evt.GetValue("id('" + id + "')/@qry_err");
    txt[out] = { sql: sql, err: err ? "" + err : "" };
}

function view(evt)
{
    var txt = {};
    var find = "" + evt.GetValue("id('FIND')/@val");
    run(evt, "Q_HIS", q_his(), "HIS", txt);
    run(evt, "Q_FIND", q_find(find), "HITS", txt);
    run(evt, "Q_WO", q_wo(), "WO", txt);
    run(evt, "Q_OPEN", q_open(), "OPEN", txt);
    evt.SetValue("id('SQL')/@val", JSON.stringify(txt));
    return 0;
}

// =====================================================================
// THE PAGE'S ACTIONS. They change the TREE (a name, an order's state) and
// never the tables: the next query shows it anyway.
// =====================================================================
function last(evt, txt)
{
    evt.SetValue("id('LAST')/@val", JSON.stringify({ at: Time.FmtTimeStr(Time.GetTimeMs(), "%H:%M:%S"), txt: txt }));
}

// An order id as the page sends it: WO and 10 hex digits, nothing else.
function wo_ok(id)
{
    if (id.length != 12 || id.substr(0, 2) != "WO") return 0;
    for (var i = 2; i < 12; i++)
        if ("0123456789ABCDEF".indexOf(id.substr(i, 1)) < 0) return 0;
    return 1;
}

function act(evt)
{
    var a = JSON.parse(evt.valn);
    if (!a || !a.cmd) return 0;
    var cmd = "" + a.cmd;
    if (cmd == "find") {
        var t = ("" + a.txt).trim();
        t = t.replace("'", "");
        t = t.replace("{", "");
        t = t.replace("}", "");
        if (t.length > 40) t = t.substr(0, 40);
        evt.SetValue("id('FIND')/@val", t);
        last(evt, "the names are searched for '" + t + "': the table has no name column");
        return 0;
    }
    if (cmd == "rename") {
        var adr = "doc('LINE/L1')/id('L1_PT1')/@desc";
        var d = "" + evt.GetValue(adr);
        var nd = (d == "Filler pressure") ? "Filler pressure, sensor B" : "Filler pressure";
        evt.SetValue(adr, nd);
        last(evt, "L1_PT1 is now called '" + nd + "' -- one write in the tree, every row of it shows the new name");
        return 0;
    }
    if (cmd == "state") {
        var id = "" + a.id;
        if (!wo_ok(id)) { last(evt, "not an order id: " + id); return 0; }
        var sadr = "doc('LINE/L" + parseInt(id.substr(2, 2), 16) + "')/id('" + id + "')/@state";
        var st = evt.GetValue(sadr);
        if (st === undefined || st === null) { last(evt, id + " is not in the tree"); return 0; }
        var ns = ("" + st == "open") ? "closed" : "open";
        evt.SetValue(sadr, ns);
        last(evt, id + " is " + ns + " in the tree -- the table was not told, the open list follows");
        return 0;
    }
    if (cmd == "gone") {
        var con = SQL.attach('CN_SQL');
        if (!con) return 0;
        var rs = SQL.prepare(con, "INSERT INTO his (tim, doc, rid, val) VALUES (?, 'LINE/L1', 'L1_FT9', 0.0)");
        if (rs) {
            SQL.parameter(rs, 1, now_txt(Time.GetTimeMs()));
            SQL.execute(rs);
            SQL.close(rs);
        }
        SQL.disconnect(con);
        last(evt, "a row for L1_FT9, a flow meter taken off the line: the tree has no such point, so its name and unit are null " +
                  "and the log says so once per query");
        return 0;
    }
    return 0;
}
