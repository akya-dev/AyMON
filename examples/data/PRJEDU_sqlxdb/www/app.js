// =====================================================================
// app.js -- the page of PRJEDU_sqlxdb.
//
//   IN   REP/S00/+/val    HIS, HITS, WO, OPEN: the rows of one query each
//                         (SQL.qry's qry_out, JSON), SQL: the texts, FIND:
//                         the search, LAST: what the last action did
//   OUT  REP/S00/ACT/val/set   {"cmd": find | rename | state | gone}
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const json = (id) => { try { return JSON.parse(Kit.get(id) || "null"); } catch (e) { return null; } };
let seq = 0, mode = "WO";

const act = (o) => Kit.write("REP/S00", "ACT", "val", JSON.stringify(Object.assign(o, { n: ++seq })));
// a cell: an SQL NULL or a value the tree did not have comes as null
const cell = (v, cls = "") => (v === null || v === undefined)
    ? `<td class="null ${cls}">null</td>` : `<td class="${cls}">${Kit.esc(v)}</td>`;
const val = (v) => (v === null || v === undefined || isNaN(Number(v))) ? `<td class="n null">null</td>`
    : `<td class="n">${Number(v).toFixed(1)}</td>`;
const time = (t) => (t ? String(t).slice(11, 19) : "");

function drawHis() {
    const rows = json("HIS");
    if (!Array.isArray(rows)) return;
    $("his").innerHTML = rows.map((r) => `<tr><td>${time(r.tim)}</td>${cell(r.doc)}${cell(r.rid)}`
        + `${cell(r.name, "tree")}${val(r.val)}${cell(r.unit, "tree")}</tr>`).join("");
}

function drawHits() {
    const rows = json("HITS");
    if (!Array.isArray(rows)) return;
    if (!rows.length) { $("hits").innerHTML = `<tr><td colspan="5" class="muted">no point's name holds it</td></tr>`; return; }
    $("hits").innerHTML = rows.map((r) => `<tr><td>${time(r.tim)}</td>${cell(r.rid)}`
        + `${cell(r.name, "tree")}${val(r.val)}${cell(r.unit, "tree")}</tr>`).join("");
}

function drawWo() {
    const rows = json(mode);
    if (!Array.isArray(rows)) return;
    if (!rows.length) { $("wo").innerHTML = `<tr><td colspan="6" class="muted">no order is open in the tree</td></tr>`; return; }
    $("wo").innerHTML = rows.map((r) => {
        const open = r.state === "open";
        const btn = r.wo ? `<button data-id="${Kit.esc(r.wo)}">${open ? "Close" : "Reopen"}</button>` : "";
        return `<tr class="${open ? "" : "off"}"><td class="n">${Kit.esc(r.wo_wid)}</td>`
             + `<td class="tree">${r.wo == null ? "null" : Kit.esc(r.wo)}<div class="muted small">${Kit.esc(r.line || "")}</div></td>`
             + `${cell(r.title)}<td class="n">${Kit.esc(r.made)} / ${Kit.esc(r.qty)}</td>`
             + `${cell(r.state, "tree")}<td>${btn}</td></tr>`;
    }).join("");
}

// the query text, with its /*xdb comments marked
function drawSql() {
    const s = json("SQL");
    if (!s) return;
    const names = { HIS: "Q_HIS - the latest readings", HITS: "Q_FIND - search the names",
                    WO: "Q_WO - every work order", OPEN: "Q_OPEN - the orders open in the tree" };
    $("sql").innerHTML = Object.keys(names).filter((k) => s[k]).map((k) => {
        const q = Kit.esc(s[k].sql).replace(/(\/\*xdb[\s\S]*?\*\/)(?=\n|\)|$)/g, `<span class="x">$1</span>`);
        return `<div class="small muted" style="margin-top:10px">${names[k]}</div><pre>${q}</pre>`
             + (s[k].err ? `<div class="err">qry_err: ${Kit.esc(s[k].err)}</div>` : "");
    }).join("");
}

function drawLast() {
    const l = json("LAST");
    if (l) txt("last", `${l.at}  ${l.txt}`);
}

$("rename").onclick = () => act({ cmd: "rename" });
$("gone").onclick = () => act({ cmd: "gone" });
$("f-find").onsubmit = (e) => { e.preventDefault(); act({ cmd: "find", txt: $("find").value }); };
$("wo").onclick = (e) => { const b = e.target.closest("button"); if (b) act({ cmd: "state", id: b.dataset.id }); };
$("m-all").onclick = () => { mode = "WO"; $("m-all").className = "on"; $("m-open").className = ""; drawWo(); };
$("m-open").onclick = () => { mode = "OPEN"; $("m-open").className = "on"; $("m-all").className = ""; drawWo(); };

Kit.start({
    subs: ["REP/S00/+/val"],
    onmsg: (id) => {
        if (id === "HIS") drawHis();
        else if (id === "HITS") drawHits();
        else if (id === mode) drawWo();
        else if (id === "SQL") drawSql();
        else if (id === "LAST") drawLast();
        else if (id === "FIND") {
            const f = Kit.get("FIND") || "";
            txt("find-now", `now: '${f}'`);
            if (document.activeElement !== $("find")) $("find").value = f;
        }
    }
});
