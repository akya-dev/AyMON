// =====================================================================
// HIS/S00 -- writing and reading the plant history.
//
// THE SHAPE OF EVERY SQL CALL IN AyMON
//
//     var con = SQL.attach('CN_SQL');     // borrow from the <con>'s pool
//     var rs  = SQL.exec_direct(con, sql) // or prepare/parameter/execute
//     ... SQL.fetch(rs) / SQL.getdata(rs, n) ...
//     SQL.close(rs);                      // ALWAYS
//
// You do not disconnect 'con'. It belongs to the <con> element's pool and
// is handed back by itself; closing the RESULT SET is what you owe.
//
// TWO THINGS THAT BITE EVERYONE ONCE:
//   * SQL.getdata(rs, n) counts columns FROM 1, not from 0.
//   * an SQL NULL comes back as UNDEFINED -- not "", not 0. See note() below.
// =====================================================================

// Called once, from xdb_start in db_HIS.xml, after the document is up.
function start(evt)
{
    var con = SQL.attach('CN_SQL');
    if (!con) {
        evt.Log(2, "HIS: no database -- is AyPRO_sqlite.dll next to AyPRO.dll?");
        return 0;
    }

    // "IF NOT EXISTS" is what makes this example restartable: the table is
    // created the first time and found every time after that.
    var rs = SQL.exec_direct(con,
        "CREATE TABLE IF NOT EXISTS reading (" +
        "  rowid_    INTEGER PRIMARY KEY," +
        "  ts        TEXT    NOT NULL," +
        "  tag       TEXT    NOT NULL," +
        "  val       REAL    NOT NULL," +
        "  note      TEXT)");            // usually NULL -- that is deliberate
    if (rs) SQL.close(rs);

    // What survived the last run? A fixed query with no values in it, so
    // exec_direct is the right tool.
    rs = SQL.exec_direct(con, "SELECT count(*), min(ts), max(ts) FROM reading");
    if (rs) {
        // getrowqty() answers BEFORE the first fetch -- the driver has
        // already materialised the result. Field scripts lean on this to ask
        // "did anything come back?" without fetching.
        if (SQL.fetch(rs)) {
            var n = SQL.getdata(rs, 1);
            if (n > 0)
                evt.Log(4, "HIS: " + n + " readings already in the file, "
                         + SQL.getdata(rs, 2) + " .. " + SQL.getdata(rs, 3));
            else
                evt.Log(4, "HIS: empty database, starting fresh");
        }
        SQL.close(rs);
    }

    evt.Log(4, "HIS: writing one reading a second into log\\plant.db");
    return 0;
}

// Once a second: one reading, written with a PREPARED STATEMENT.
function read(evt)
{
    var n = evt.obj.cnt + 1;
    evt.obj.cnt = n;

    // Left operand decides the type -- 0.05 * n is a float multiplication,
    // n / 20.0 would be integer division. (Same trap as PRJEDU_101.)
    var val = 20.0 + 8.0 * Math.sin(0.05 * n);
    var tag = "TANK_TEMP";

    // Most rows carry no note. 'null' binds an SQL NULL, and that is what
    // note() below reads back.
    var nte = (val > 27.0) ? "high" : null;

    // Every tenth reading pretends to come from a device whose name is an
    // SQL injection. It is stored, and it changes nothing: a BOUND VALUE IS
    // DATA, never part of the statement. This is the whole reason to use
    // prepare/parameter/execute instead of building SQL with + .
    if ((n % 10) == 0) tag = "x'; DROP TABLE reading; --";

    var con = SQL.attach('CN_SQL');
    if (!con) return 0;

    var rs = SQL.prepare(con, "INSERT INTO reading (ts,tag,val,note) VALUES (?,?,?,?)");
    if (rs) {
        SQL.parameter(rs, 1, Time.GetTimeStr(0));   // 0 = "2026-09-20 22:31:04"
        SQL.parameter(rs, 2, tag);
        SQL.parameter(rs, 3, val);
        SQL.parameter(rs, 4, nte);
        SQL.execute(rs);
        SQL.close(rs);
    }
    evt.SetValue("id('NOW')/@val", val);                // for the page
    return 0;
}

// Every ten seconds: what does the database say?
function summary(evt)
{
    var st = {};                            // what the page shows, as JSON
    var con = SQL.attach('CN_SQL');
    if (!con) return 0;

    var rs = SQL.exec_direct(con,
        "SELECT count(*), round(min(val),2), round(max(val),2), round(avg(val),2) " +
        "FROM reading WHERE tag = 'TANK_TEMP'");
    if (rs) {
        if (SQL.fetch(rs)) {
            st.n = SQL.getdata(rs, 1); st.min = SQL.getdata(rs, 2);
            st.max = SQL.getdata(rs, 3); st.avg = SQL.getdata(rs, 4);
            evt.Log(4, "HIS: " + st.n + " readings, " + st.min + " .. " + st.max
                     + " C, mean " + st.avg + " C");
        }
        SQL.close(rs);
    }

    // The table is still there, with the injection-shaped tag sitting in it
    // as an ordinary string. Proof that the bound value never became SQL.
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

// WHAT AN SQL NULL LOOKS LIKE IN SCRIPT.
// It is UNDEFINED. Not "", not 0, not "NULL". The check that works is
// (v == null), which is true for both null and undefined; (v == "") is NOT
// true, so the habit of testing for an empty string silently misses it.
function note(evt, con)
{
    var rs = SQL.exec_direct(con,
        "SELECT note FROM reading WHERE note IS NULL LIMIT 1");
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

// THE QUERY THAT BECOMES ELEMENTS.
// Writing the SQL into @qry is the entire call. SQL.qry runs it and replaces
// the <item> children of L_RECENT; after that the rows are part of the
// document and are read by ADDRESS, not by fetching.
function recent(evt)
{
    evt.SetValue("id('L_RECENT')/@qry",
        "SELECT ts, tag, round(val,2) AS val FROM reading ORDER BY rowid_ DESC LIMIT 5");

    var qty = evt.GetValue("count(id('L_RECENT')/item)");
    evt.Log(4, "HIS: L_RECENT now holds " + qty + " <item> elements; newest is "
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
