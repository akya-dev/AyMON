// =====================================================================
// HIS/S00 -- the only SQL in this example, and none of it writes a row:
// the tables are made here, and read back for the page.
// =====================================================================

// Called once from xdb_start, before the tank starts. IF NOT EXISTS makes it
// restartable. PRIMARY KEY (id) is not decoration: the engine skips a key that
// is already there, so a record read back from the journal after its row was
// written stays one row. A table with no unique key takes every repeat.
function start(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(2, "HIS: no database -- is the AyPRO_sqlite driver beside the engine?");
        return 0;
    }
    var ddl = [
        "CREATE TABLE IF NOT EXISTS alm (id INTEGER PRIMARY KEY, tim TEXT, ms INTEGER, doc TEXT, rid TEXT," +
        " atr TEXT, fnc TEXT, valp TEXT, valn TEXT, stap INTEGER, stan INTEGER, why TEXT)",
        "CREATE TABLE IF NOT EXISTS evt (id INTEGER PRIMARY KEY, tim TEXT, ms INTEGER, knd TEXT, doc TEXT, rid TEXT," +
        " txt TEXT, rol INTEGER, sta INTEGER, run INTEGER, n INTEGER)",
        "CREATE TABLE IF NOT EXISTS val (id INTEGER PRIMARY KEY, tim TEXT, ms INTEGER, doc TEXT, rid TEXT," +
        " val REAL, sta INTEGER)"
    ];
    for (var i = 0; i < ddl.length; i++) {
        var rs = SQL.exec_direct(con, ddl[i]);
        if (rs) SQL.close(rs);
    }
    evt.Log(4, "HIS: tables ready in log/history.db -- the engine writes the rows from here on");
    return 0;
}

// One number from the reading connection.
function one(con, sql)
{
    var v = 0;
    var rs = SQL.exec_direct(con, sql);
    if (rs) {
        if (SQL.fetch(rs)) v = SQL.getdata(rs, 1);
        SQL.close(rs);
    }
    return (v == null) ? 0 : v;
}

// Writing SQL into a <list>'s @qry is the whole call: each row becomes an
// <item>, and json() gives them to the page as one value. 'id' would fight
// with the element's own id and 'sta' with its state, so neither is selected
// under its own name.
function rows(evt, list, target, sql)
{
    evt.SetValue("id('" + list + "')/@qry", sql);
    evt.SetValue("id('" + target + "')/@val", "" + evt.GetValue("json(id('" + list + "')/item)"));
}

function view(evt)
{
    var tank = "doc('TANK/S00')/id('";
    var run  = 0 + evt.GetValue(tank + "RUN')/@val");
    var made = 0 + evt.GetValue(tank + "DOSES')/@val");

    evt.SetValue("id('TANK')/@val", JSON.stringify({
        level: 0.0 + evt.GetValue(tank + "LEVEL')/@val"),
        sta:   0   + evt.GetValue(tank + "LEVEL')/@sta"),
        temp:  0.0 + evt.GetValue(tank + "TEMP')/@val"),
        pump:  0   + evt.GetValue(tank + "PUMP')/@val"),
        sp:    0.0 + evt.GetValue(tank + "SP')/@val")
    }));

    rows(evt, "L_ALM", "ALARMS",
        "SELECT substr(tim,12,8) AS at, rid, fnc, valn, printf('0x%04X',stan) AS state FROM alm ORDER BY id DESC LIMIT 6");
    rows(evt, "L_EVT", "EVENTS",
        "SELECT substr(tim,12,8) AS at, knd, txt, rol, printf('0x%04X',sta) AS state FROM evt WHERE n IS NULL ORDER BY id DESC LIMIT 6");
    rows(evt, "L_VAL", "VALUES",
        "SELECT substr(tim,12,8) AS at, rid, val AS value FROM val ORDER BY id DESC LIMIT 6");
    rows(evt, "L_TREND", "TREND",
        "SELECT ms, val FROM val WHERE rid='LEVEL' ORDER BY id DESC LIMIT 120");
    // A gap inside a run would make 'cnt' smaller than 'last'.
    rows(evt, "L_RUNS", "RUNS",
        "SELECT substr(min(tim),12,8) AS at, count(*) AS cnt, min(n) AS first, max(n) AS last FROM evt WHERE n IS NOT NULL GROUP BY run ORDER BY run DESC LIMIT 6");

    var con = SQL.attach('CN_READ');
    if (!con) return 0;
    var written = one(con, "SELECT count(*) FROM evt WHERE run=" + run);
    evt.SetValue("id('STATS')/@val", JSON.stringify({
        alm:  one(con, "SELECT count(*) FROM alm"),
        evt:  one(con, "SELECT count(*) FROM evt"),
        val:  one(con, "SELECT count(*) FROM val"),
        run:  run,
        made: made,
        wait: made - written,
        his:  HIS.valstat(),
        hold: 0 + evt.GetValue("id('HOLD')/@val")
    }));
    return 0;
}

// The page changes the set point. The audit line goes through the same
// pipeline as everything else.
function set_sp(evt)
{
    var sp = 0.0 + evt.valn;
    if (!(sp >= 45.0 && sp <= 95.0)) {
        evt.Log(2, "HIS: set point " + sp + " refused, 45 .. 95 only");
        return 0;
    }
    evt.SetValue("doc('TANK/S00')/id('SP')/@val", sp);
    HIS.rec(evt, "aud", { txt: "set point changed to " + sp + " %" });
    return 0;
}

// Stop the connection that writes, or start it again. With it stopped the
// records keep coming, the rows wait and the journal holds them.
function hold(evt)
{
    var on = 0 + evt.valn;
    evt.SetValue("id('CN_SQL')/@sta", on ? 0x0000 : 0x0303);
    evt.Log(4, on ? "HIS: the writer is stopped, the rows wait" : "HIS: the writer runs again");
    return 0;
}
