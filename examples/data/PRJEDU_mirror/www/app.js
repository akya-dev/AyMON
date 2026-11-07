// =====================================================================
// app.js -- the mirror list's page.
//
//   IN   WO/S00/+/val     LIST, TABLE, STATS, LAST: one JSON value each,
//                         written by main.view (and main.act for LAST)
//   OUT  WO/S00/ACT/val/set   {"cmd": new | start | finish | prio | close}
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const json = (id) => { try { return JSON.parse(Kit.get(id) || "null"); } catch (e) { return null; } };
const STATE = ["open", "in progress", "done"];
let seq = 0;

// a time as the table holds it, to the minute: "2026-11-06T14:02:11.000-07:00" -> "11-06 14:02"
const when = (t) => (t ? String(t).replace("T", " ").slice(5, 16) : "");
const act = (cmd, id) => Kit.write("WO/S00", "ACT", "val", JSON.stringify({ cmd, id, n: ++seq }));

function drawList() {
    const rows = json("LIST");
    if (!Array.isArray(rows)) return;
    if (!rows.length) { $("list").innerHTML = `<tr><td colspan="5" class="muted">no open orders</td></tr>`; return; }
    $("list").innerHTML = rows.map((r) => {
        const btn = r.status === 0 ? `<button data-a="start" data-id="${Kit.esc(r.id)}">Start</button>`
                  : r.status === 1 ? `<button data-a="finish" data-id="${Kit.esc(r.id)}">Finish</button>` : "";
        return `<tr><td class="n">${r.no}</td>`
             + `<td>${Kit.esc(r.title)}<div class="muted small">${Kit.esc(r.asset)} &middot; opened ${Kit.esc(when(r.opened))}</div></td>`
             + `<td class="n${r.prio === 1 ? " alm" : ""}">${r.prio}</td>`
             + `<td>${STATE[r.status] || r.status}${r.dirty ? ` <span class="pend">not written yet</span>` : ""}</td>`
             + `<td>${btn}</td></tr>`;
    }).join("");
}

function drawTable() {
    const rows = json("TABLE");
    if (!Array.isArray(rows)) return;
    $("table").innerHTML = rows.map((r) => {
        const st = Number(r.status);
        return `<tr class="${st === 2 ? "off" : ""}"><td class="n">${Kit.esc(r.no)}</td>`
             + `<td>${Kit.esc(r.title)}<div class="muted small">${Kit.esc(r.asset)}</div></td>`
             + `<td class="n">${Kit.esc(r.prio)}</td><td>${STATE[st] || Kit.esc(r.status)}</td>`
             + `<td>${Kit.esc(when(r.opened))}</td><td>${Kit.esc(when(r.done))}</td></tr>`;
    }).join("");
}

function drawStats() {
    const s = json("STATS");
    if (!s || !s.his) return;
    const h = s.his;
    txt("cnt", `${s.open} open, ${s.started} in progress, ${s.done} done`);
    txt("s-rows", h.rows); txt("s-wri", h.written); txt("s-stm", h.statements);
    txt("s-lds", h.loads); txt("s-dirty", h.dirty); txt("s-park", h.parked);
    $("s-park").className = "v" + (h.parked ? " alm" : "");
    txt("s-err", h.err ? "last error: " + h.err : "");
}

function drawLast() {
    const l = json("LAST");
    if (l) txt("last", `${l.at}  ${l.txt}`);
}

$("list").onclick = (e) => { const b = e.target.closest("button"); if (b) act(b.dataset.a, b.dataset.id); };
$("new").onclick = () => act("new");
$("prio").onclick = () => act("prio");
$("close").onclick = () => act("close");

Kit.start({
    subs: ["WO/S00/+/val"],
    onmsg: (id) => {
        if (id === "LIST") drawList();
        else if (id === "TABLE") drawTable();
        else if (id === "STATS") drawStats();
        else if (id === "LAST") drawLast();
    }
});
