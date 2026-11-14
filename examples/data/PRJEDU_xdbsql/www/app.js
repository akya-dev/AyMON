// =====================================================================
// app.js -- the page of PRJEDU_xdbsql.
//
//   OUT  SQL/S00/Q/qry/set      XDB SQL; the engine runs it with the page's
//                               role (a Guest) on CN_XQL
//   IN   SQL/S00/Q/qry_out      the rows, JSON
//        SQL/S00/Q/qry_err      why a query was refused ("" = it ran)
//        SQL/S00/+/val          XIN, XSQL: SQLite's query with xdb() inside
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const json = (t) => { try { return JSON.parse(t || "null"); } catch (e) { return null; } };
let seq = 0, sent = 0;

// Each example: a title, why it is there, the XDB SQL.
const PRESETS = [
    ["Both lines", "Every point of both documents as one table. _doc names the document a row came from; "
        + "val_unt is not on the point, it comes from the point's class.",
     `SELECT _doc AS line, id, desc, val, val_unt AS unit, hi\n  FROM "LINE/*".io\n ORDER BY line, id`],
    ["Over their limit", "A WHERE across two documents. val and hi are numbers (their classes type them), so the "
        + "comparison is numeric. The values swing: run it again in a while.",
     `SELECT _doc AS line, id, desc, val, hi\n  FROM "LINE/*".io\n WHERE val > hi`],
    ["Per line", "GROUP BY over the tree.",
     `SELECT _doc AS line, count(*) AS points, round(avg(val), 1) AS mean\n  FROM "LINE/*".io\n GROUP BY _doc\n ORDER BY line`],
    ["Named query", "The SQL of HIS_LAST is in the engine (db_SQL.xml); the page gives the name and two values, "
        + "which are bound, never written into SQL. Its xdb_acl lets a Guest run it.",
     `SELECT * FROM sqlq('HIS_LAST', 'L1_PT1', 5) h`],
    ["The tree + the history", "A join: the points of the tree with a named query over the table his "
        + "(the last 10 minutes of every point). One query, two sources.",
     `SELECT i.id, i.desc, i.val, s.n AS readings, s.lo, s.top, s.mean\n  FROM "LINE/*".io i\n  JOIN sqlq('HIS_STATS', 10) s ON s.rid = i.id\n ORDER BY i.id`],
    ["Raw SQL (refused)", "sql('CN_HIS', ..) sends a text to the database as it is: only from the role Engineer up "
        + "(the PostgreSQL port 15432 has it). The page is a Guest.",
     `SELECT * FROM sql('CN_HIS', 'SELECT count(*) AS n FROM his') h`],
    ["A write (refused)", "XDB SQL writes too, every value through the point's own write path, which asks the role. "
        + "The lines let a Guest read, not write (xdb_acl): the statement runs and writes 0 rows, and the log names "
        + "the refused value. From 15432 (an Engineer) the same statement changes the limit.",
     `UPDATE "LINE/L1".io SET hi = 70 WHERE id = 'L1_LT1'`],
];

function drawPresets() {
    $("presets").innerHTML = PRESETS.map((p, i) => `<button data-i="${i}">${Kit.esc(p[0])}</button>`).join("");
}

function pick(i) {
    const p = PRESETS[i];
    $("sql").value = p[2];
    $("why").textContent = p[1];
    [...$("presets").children].forEach((b, k) => { b.className = k === i ? "on" : ""; });
    run();
}

// A text the page sent before is still the same value in @qry; a line comment
// with a number makes every run a new text, so the engine runs it again.
function run() {
    const q = $("sql").value.trim();
    if (!q) return;
    sent = ++seq;
    $("state").className = "ok";
    $("state").textContent = "running ..";
    Kit.write("SQL/S00", "Q", "qry", q + "\n-- run " + sent);
}

// a number with a fraction: three decimals at most (the engine sends full doubles)
const cell = (v) => (v === null || v === undefined) ? `<td class="null">null</td>`
    : (typeof v === "number" ? `<td class="n">${Kit.esc(Number.isInteger(v) ? v : Number(v.toFixed(3)))}</td>`
                             : `<td>${Kit.esc(v)}</td>`);

// The engine sends qry_out, then qry_err ("" when the query ran), at every run.
let nrows = 0;
function drawRows(text) {
    const rows = json(text);
    if (!Array.isArray(rows)) return;
    nrows = rows.length;
    const cols = rows.length ? Object.keys(rows[0]).filter((k) => k !== "qry_idx" && k !== "qry_doc") : [];
    $("head").innerHTML = cols.length ? `<tr>${cols.map((c) => `<th>${Kit.esc(c)}</th>`).join("")}</tr>` : "";
    $("rows").innerHTML = rows.map((r) => `<tr>${cols.map((c) => cell(r[c])).join("")}</tr>`).join("");
}

function drawErr(text) {
    if (text) {
        $("state").className = "err";
        $("state").textContent = text;
        $("head").innerHTML = ""; $("rows").innerHTML = "";
    } else {
        $("state").className = "ok";
        $("state").textContent = `${nrows} row(s)`;
    }
}

// qry_cnt comes last: for UPDATE / INSERT / DELETE it is the number of rows written
const writes = () => /^\s*(UPDATE|INSERT|DELETE)\b/i.test($("sql").value);
function drawCnt(text) {
    if (!writes() || $("state").className === "err") return;
    $("state").textContent = `${text || 0} row(s) written`;
}

function drawXin() {
    const rows = json(Kit.get("XIN"));
    if (!Array.isArray(rows)) return;
    const num = (v) => (v === null || v === undefined || isNaN(Number(v))) ? `<td class="n null">null</td>`
        : `<td class="n">${Number(v).toFixed(2)}</td>`;
    $("xin").innerHTML = rows.length ? rows.map((r) => `<tr><td class="tree">${Kit.esc(r.line)}</td>`
        + `<td class="tree">${Kit.esc(r.name)}</td><td class="tree">${Kit.esc(r.unit)}</td>`
        + `<td class="n">${Kit.esc(r.n)}</td>${num(r.mean)}${num(r.top)}</tr>`).join("")
        : `<tr><td colspan="6" class="muted">no readings yet</td></tr>`;
}

function drawXsql() {
    const s = json(Kit.get("XSQL"));
    if (!s) return;
    $("xsql").textContent = s.sql + (s.err ? "\n\nqry_err: " + s.err : "");
}

$("presets").onclick = (e) => { const b = e.target.closest("button"); if (b) pick(Number(b.dataset.i)); };
$("f-run").onsubmit = (e) => { e.preventDefault(); run(); };
drawPresets();

Kit.start({
    subs: ["SQL/S00/Q/qry_out", "SQL/S00/Q/qry_err", "SQL/S00/Q/qry_cnt", "SQL/S00/+/val"],
    onmsg: (id, attr, text) => {
        if (id === "Q" && attr === "qry_err") drawErr(text);
        else if (id === "Q" && attr === "qry_out") drawRows(text);
        else if (id === "Q" && attr === "qry_cnt") drawCnt(text);
        else if (id === "XIN") drawXin();
        else if (id === "XSQL") drawXsql();
    }
});
setTimeout(() => pick(0), 600);
