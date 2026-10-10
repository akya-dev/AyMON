// =====================================================================
// HIS/S00 -- writing and reading the plant history, on whichever
// database the root document's ConnStr names.
//
// THE SHAPE OF EVERY SQL CALL IN AyMON (the same for every driver)
//
//     var con = SQL.attach('CN_SQL');     // borrow from the <con>'s pool
//     var rs  = SQL.exec_direct(con, sql) // or prepare/parameter/execute
//     ... SQL.fetch(rs) / SQL.getdata(rs, n) ...
//     SQL.close(rs);                      // ALWAYS
//
// ONE SCRIPT, THREE DATABASES. Every statement below is written once, in
// SQL that SQLite, SQL Server and PostgreSQL all accept. That rules out a
// few habits, and each place that had to avoid one says so:
//   * no LIMIT / TOP          -- SQLite and PostgreSQL say LIMIT, SQL Server TOP
//   * no round(x, 2) in SQL   -- PostgreSQL has no round() for a float
//   * no auto-increment       -- AUTOINCREMENT, IDENTITY, SERIAL: three spellings
//   * no TIMESTAMP column     -- in SQL Server TIMESTAMP is not a time at all
// The one thing that cannot be written once is "does this table exist?";
// the answer comes from main.sql_eng, the eng="" of the ConnStr entry.
// =====================================================================

// ---------------------------------------------------------------------
// xdb_init: runs BEFORE CN_SQL is created. The connection string is put
// into con_host here, so it is what CON.sql reads when it starts.
// (The same four lines stand in every document of a real plant that
// shares one database -- only the root document knows where it is.)
// ---------------------------------------------------------------------
function init(evt)
{
    main.con_str = evt.GetValue("doc('XDB')/id('ConnStr')/@val");
    main.sql_eng = evt.GetValue("doc('XDB')/id('ConnStr')/@eng");

    if (main.con_str == null || main.con_str == "") {
        evt.Log(2, "HIS: no <var id=\"ConnStr\"> in AyXDB.xml -- nothing to connect to");
        return 0;
    }

    // con_host is handed to the driver as written; the path macros are
    // ours to expand. xdb.normalizePath('%PRJ%') answers this project's
    // directory. Only the macros are replaced -- normalizePath() on the
    // whole string would also turn every '/' into '\', and a password may
    // contain one.
    var str = main.con_str;
    var mac = ["%PRJ%", "%DB%", "%ROOT%", "%BIN%"];
    for (var i = 0; i < mac.length; i++)
        str = str.replace(mac[i], xdb.normalizePath(mac[i]));

    evt.SetValue("id('CN_SQL')/@con_host", str);

    // The log never shows a password: the engine prints PWD=*** in every
    // line that carries a connection string. We only name the engine.
    evt.Log(4, "HIS: database engine " + main.sql_eng + ", connection string from ConnStr");
    return 0;
}

// xdb_start: the document is up. The database may not be -- a server can
// come up after the engine -- so the table is looked for here AND on every
// tick until it is found (see read()).
function start(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(4, "HIS: database not reachable yet; CN_SQL keeps trying every con_rct seconds");
        return 0;
    }
    setup(evt, con);
    return 0;
}

// Find the table or create it, and learn the last sequence number.
// Returns 1 when the plant can write.
function setup(evt, con)
{
    // THE ONE ENGINE-SPECIFIC STATEMENT. SQLite keeps its catalogue in
    // sqlite_master; SQL Server and PostgreSQL answer the standard
    // information_schema. Asking the catalogue, instead of trying a SELECT
    // and seeing it fail, keeps the log free of an expected ERROR line.
    //
    // TRAP: INFORMATION_SCHEMA.TABLES and TABLE_NAME are in CAPITALS on
    // purpose. On a SQL Server installed with a Turkish collation
    // (Turkish_CI_AS) a lower-case 'i' is not the same letter as 'I', so
    // information_schema.tables is "Invalid object name". PostgreSQL folds
    // unquoted names to lower case, so the capitals work there too. The
    // same rule holds for our own names: write them in ONE case everywhere.
    var ask = (main.sql_eng == "SQLITE3")
        ? "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'reading'"
        : "SELECT count(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'reading'";

    var rs = SQL.exec_direct(con, ask);
    if (!rs) return 0;
    var have = 0;
    if (SQL.fetch(rs)) have = SQL.getdata(rs, 1);
    SQL.close(rs);

    if (have == 0) {
        // Portable types only. DOUBLE PRECISION is a 64-bit float in all
        // three (FLOAT is 32-bit in some databases). The time is kept as
        // text 'YYYY-MM-DD hh:mm:ss', which sorts correctly as text.
        rs = SQL.exec_direct(con,
            "CREATE TABLE reading (" +
            "  seq   INTEGER          NOT NULL PRIMARY KEY," +
            "  ts    VARCHAR(19)      NOT NULL," +
            "  tag   VARCHAR(64)      NOT NULL," +
            "  val   DOUBLE PRECISION NOT NULL," +
            "  note  VARCHAR(16))");          // usually NULL -- that is deliberate
        if (!rs) return 0;
        SQL.close(rs);
        evt.Log(4, "HIS: created table 'reading'");
    }

    // What survived the last run? max(seq) of an EMPTY table is SQL NULL,
    // and an SQL NULL reaches script as undefined -- (last == null) is the
    // test that catches it.
    rs = SQL.exec_direct(con, "SELECT count(*), max(seq), min(ts), max(ts) FROM reading");
    if (!rs) return 0;
    var last = 0;
    if (SQL.fetch(rs)) {
        var n = SQL.getdata(rs, 1);
        last  = SQL.getdata(rs, 2);
        if (last == null) {
            last = 0;
            evt.Log(4, "HIS: empty table, starting fresh");
        }
        else
            evt.Log(4, "HIS: " + n + " readings already stored, "
                     + SQL.getdata(rs, 3) + " .. " + SQL.getdata(rs, 4));
    }
    SQL.close(rs);

    // The script owns the sequence number instead of the database: no
    // AUTOINCREMENT / IDENTITY / SERIAL to spell three ways. The price is
    // that only ONE writer may use the table -- two plants writing into it
    // would collide on seq. A shared table wants the database's own counter.
    //
    // TRAP: what getdata() hands back depends on the DRIVER. The embedded
    // SQLite answers max(seq) as TEXT, so (last + 1) here would be "11",
    // not 2. Writing it into cnt -- an attribute with a numeric type
    // (cnt_typ) -- converts it; read the attribute back, not the variable.
    evt.SetValue("id('T_READ')/@cnt", last);
    evt.SetValue("id('T_READ')/@rdy", 1);
    evt.Log(4, "HIS: writing one reading a second, next seq "
             + (evt.GetValue("id('T_READ')/@cnt") + 1));
    return 1;
}

// Once a second: one reading, written with a PREPARED STATEMENT.
function read(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) return 0;
    if (evt.obj.rdy == 0 && !setup(evt, con)) return 0;

    var n = evt.obj.cnt + 1;

    // Left operand decides the type -- 0.05 * n is a float multiplication.
    // Rounded HERE, not in SQL: PostgreSQL has no round(float, 2).
    var val = 0.01 * Math.round(100.0 * (20.0 + 8.0 * Math.sin(0.05 * n)));
    var tag = "TANK_TEMP";
    var nte = (val > 27.0) ? "high" : null;     // null binds an SQL NULL

    // Every tenth reading pretends to come from a device whose name is an
    // SQL injection. Bound as a parameter it is DATA, whatever the database.
    if ((n % 10) == 0) tag = "x'; DROP TABLE reading; --";

    var rs = SQL.prepare(con, "INSERT INTO reading (seq,ts,tag,val,note) VALUES (?,?,?,?,?)");
    if (!rs) return 0;
    SQL.parameter(rs, 1, n);
    SQL.parameter(rs, 2, Time.GetTimeStr(0));   // 0 = "2026-09-22 10:31:04"
    SQL.parameter(rs, 3, tag);
    SQL.parameter(rs, 4, val);
    SQL.parameter(rs, 5, nte);
    var ok = SQL.execute(rs);                   // 1 = stored, 0 = refused
    SQL.close(rs);

    // Count a reading only once the database has it. A refused insert (the
    // server went away) leaves its reason in the log and is tried again
    // with the same seq on the next tick.
    if (ok) evt.obj.cnt = n;
    if (ok) evt.SetValue("id('NOW')/@val", val);        // for the page
    return 0;
}

// Every ten seconds: what does the database say?
function summary(evt)
{
    var st = { eng: main.sql_eng };         // what the page shows, as JSON
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(4, "HIS: database not reachable");
        return 0;
    }
    if (evt.GetValue("id('T_READ')/@rdy") == 0) return 0;

    var rs = SQL.exec_direct(con,
        "SELECT count(*), min(val), max(val), avg(val) FROM reading WHERE tag = 'TANK_TEMP'");
    if (rs) {
        if (SQL.fetch(rs)) {
            st.n = SQL.getdata(rs, 1); st.min = r2(SQL.getdata(rs, 2));
            st.max = r2(SQL.getdata(rs, 3)); st.avg = r2(SQL.getdata(rs, 4));
            evt.Log(4, "HIS: " + st.n + " readings, " + st.min + " .. " + st.max
                     + " C, mean " + st.avg + " C");
        }
        SQL.close(rs);
    }

    // The table is still there, with the injection-shaped tag sitting in it
    // as an ordinary string.
    rs = SQL.exec_direct(con, "SELECT count(*) FROM reading WHERE tag LIKE '%DROP%'");
    if (rs) {
        if (SQL.fetch(rs)) {
            st.attack = SQL.getdata(rs, 1);
            evt.Log(4, "HIS: " + st.attack
                     + " rows whose TAG looks like an attack, stored as text");
        }
        SQL.close(rs);
    }

    st.nul = note(evt, con);
    st.time = Time.GetTimeStr(0);
    evt.SetValue("id('STATS')/@val", JSON.stringify(st));     // for the page
    recent(evt);
    return 0;
}

// Two decimals, for the log. Done in script because PostgreSQL has no
// round(float, 2), and because a float the database stored as 20.4 may come
// back as 20.400000000000002 -- the driver prints every digit it has.
// 100.0 * v first: the LEFT operand decides the type, so this multiplies
// as a float even when getdata() handed back text.
function r2(v)
{
    return 0.01 * Math.round(100.0 * v);
}

// WHAT AN SQL NULL LOOKS LIKE IN SCRIPT -- the same through every driver.
// It is UNDEFINED. (v == null) catches it; (v == "") does NOT.
function note(evt, con)
{
    // "the first row with no note" without LIMIT/TOP: a subquery.
    var rs = SQL.exec_direct(con,
        "SELECT note FROM reading WHERE seq = (SELECT min(seq) FROM reading WHERE note IS NULL)");
    if (!rs) return "";
    var txt = "";
    if (SQL.fetch(rs)) {
        var v = SQL.getdata(rs, 1);
        txt = "typeof=" + (typeof v)
            + ", (v == null)=" + ((v == null) ? "true" : "false")
            + ", (v == '')="   + ((v == "")   ? "true" : "false");
        evt.Log(4, "HIS: an SQL NULL reads back as " + txt);
    }
    SQL.close(rs);
    return txt;
}

// THE QUERY THAT BECOMES ELEMENTS. Writing the SQL into @qry is the entire
// call; afterwards the rows are read by ADDRESS.
// "The last five" without LIMIT/TOP: every row whose seq is within five of
// the newest. Nothing is pasted into the statement -- it asks the table.
// Each cell becomes an attribute AS THE DRIVER PRINTS IT: SQL Server hands
// a float 25.45 over as "25.449999999999999". CAST(.. AS DECIMAL(6,2)) --
// accepted by all three -- makes the database print two decimals.
function recent(evt)
{
    evt.SetValue("id('L_RECENT')/@qry",
        "SELECT seq, ts, tag, CAST(val AS DECIMAL(6,2)) AS val FROM reading " +
        "WHERE seq > (SELECT max(seq) - 5 FROM reading) ORDER BY seq DESC");

    var qty = evt.GetValue("count(id('L_RECENT')/item)");
    evt.Log(4, "HIS: L_RECENT now holds " + qty + " <item> elements; newest is #"
             + evt.GetValue("id('L_RECENT')/item[1]/@seq") + ", "
             + evt.GetValue("id('L_RECENT')/item[1]/@val") + " C at "
             + evt.GetValue("id('L_RECENT')/item[1]/@ts"));

    // The same rows for the page, as one JSON value: json() turns the
    // <item> elements into an array of objects, attribute by attribute.
    evt.SetValue("id('RECENT')/@val", "" + evt.GetValue("json(id('L_RECENT')/item)"));
}

// ---------------------------------------------------------------------
// THE PAGE'S SEARCH - the val_fnc of FIND: the page writes a tag, this
// counts its rows. The tag is BOUND, never pasted into the statement, so
// typing  x'; DROP TABLE reading; --  finds the rows that carry that
// text and drops nothing. (evt.valn is the value being written.)
// ---------------------------------------------------------------------
function find(evt)
{
    var tag = "" + evt.valn;
    var out = { tag: tag, n: 0, last: "" };
    var con = SQL.attach('CN_SQL');
    if (con) {
        var rs = SQL.prepare(con, "SELECT count(*), max(ts) FROM reading WHERE tag = ?");
        if (rs) {
            SQL.parameter(rs, 1, tag);
            SQL.execute(rs);
            if (SQL.fetch(rs)) {
                out.n = SQL.getdata(rs, 1);
                var t = SQL.getdata(rs, 2);
                out.last = (t == null) ? "" : t;      // max() of no rows is NULL
            }
            SQL.close(rs);
        }
    }
    evt.SetValue("id('FOUND')/@val", JSON.stringify(out));
    return 0;
}
