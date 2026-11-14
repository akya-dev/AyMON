// =====================================================================
// SQL/S00 -- the history table and the one query the page cannot send.
//
// The page writes XDB SQL itself (to Q/@qry) and gets the rows back: this
// script has no part in that. It only
//   * keeps the points moving and writes every reading into the table his
//     (a time, a document, a point's id, a value: no name, no unit -- those
//     are in the tree, and a query takes them from there), and
//   * runs Q_X every 5 s: a query in SQLite's OWN SQL that takes a table of
//     the tree in, xdb('SELECT .. FROM "LINE/*".io') AS x. That one is
//     database SQL, so a page must not send it; the page only shows it.
// =====================================================================

function now_txt(t)
{
    return Time.FmtTimeStr(t, "%Y-%m-%d %H:%M:%S");
}

// The points the sampler writes: document, id, a middle value, a swing.
// Written with a decimal point on purpose: the left operand decides the type
// of the arithmetic below. Some swings reach over the point's hi now and
// then: "over their limit" on the page has something to show.
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
// START: the table. IF NOT EXISTS makes it restartable.
// =====================================================================
function start(evt)
{
    var con = SQL.attach('CN_HIS');
    if (!con) {
        evt.Log(2, "SQL: no database -- is the AyPRO_sqlite driver beside the engine?");
        return 0;
    }
    exec(con, "CREATE TABLE IF NOT EXISTS his (tim TEXT NOT NULL, doc TEXT NOT NULL, rid TEXT NOT NULL, val REAL)");
    exec(con, "CREATE INDEX IF NOT EXISTS his_tim ON his (tim)");
    exec(con, "CREATE INDEX IF NOT EXISTS his_rid ON his (rid, tim)");
    evt.Log(4, "SQL: table his in log/plant.db; the page is http://127.0.0.1:8119/, PostgreSQL clients 127.0.0.1:15432 (Engineer) and 15433 (Monitor)");
    SQL.disconnect(con);
    return 0;
}

// =====================================================================
// EVERY 2 s: a value for every point, into the tree (the live value) and
// into the table (its history). An hour of history is kept.
// =====================================================================
function sample(evt)
{
    var t = Time.GetTimeMs();
    var tim = now_txt(t);
    var s = 0.001 * (t % 3600000);
    var con = SQL.attach('CN_HIS');
    if (!con) return 0;
    var p = points();
    for (var i = 0; i < p.length; i++) {
        var v = 1.0 * p[i][2] + Math.sin(s / 37.0 + 1.3 * i) * p[i][3];
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
    main.nsample = (main.nsample ? main.nsample : 0) + 1;
    if (main.nsample % 30 == 1) {
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

// =====================================================================
// EVERY 5 s: Q_X. The text is SQLite's; the xdb('..') in it is XDB SQL,
// which the engine runs first (with this query's role) and hands to SQLite
// as an inline table (json_each over one JSON text). The names and units
// in the result were never in the database.
// =====================================================================
function q_x()
{
    return "SELECT x.line, x.name, x.unit, COUNT(*) AS n, ROUND(AVG(h.val), 2) AS mean, ROUND(MAX(h.val), 2) AS top\n" +
           "  FROM his h\n" +
           "  JOIN xdb('SELECT _doc AS line, id, desc AS name, val_unt AS unit FROM \"LINE/*\".io') AS x ON x.id = h.rid\n" +
           " WHERE h.tim >= datetime('now', 'localtime', '-10 minutes')\n" +
           " GROUP BY x.line, x.name, x.unit\n" +
           " ORDER BY x.line, x.name";
}

function view(evt)
{
    var sql = q_x();
    evt.SetValue("id('Q_X')/@qry", sql);
    var rows = evt.GetValue("id('Q_X')/@qry_out");
    evt.SetValue("id('XIN')/@val", rows ? "" + rows : "[]");
    var err = evt.GetValue("id('Q_X')/@qry_err");
    evt.SetValue("id('XSQL')/@val", JSON.stringify({ sql: sql, err: err ? "" + err : "" }));
    return 0;
}
