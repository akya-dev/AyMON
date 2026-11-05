// =====================================================================
// app.js -- the page of PRJEDU_remote.
//
//   IN   OPS/S00/VIEW/val     one JSON text, five times a second
//   OUT  OPS/S00/REQ/val/set  {doc, id, val}, carried out by main.on_req
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const esc = Kit.esc;

const ROUTES = [
    ["list", "LINE/L1",        "the list"],
    ["s01",  "LINE/L1@CN_S01", "this connection only"],
    ["s02",  "LINE/L1@CN_S02", "this connection only"],
    ["here", "LINE/L2",        "in this engine"]
];

function row(key, doc, what, r) {
    if (!r || !r.node) {
        return `<tr><td><code>${esc(doc)}</code><div class="note">${what}</div></td>`
             + `<td class="off">--</td><td class="off">--</td><td class="n off">--</td><td class="n off">--</td><td class="n off">--</td>`
             + `<td class="small">${esc(r && r.why ? r.why : "")}</td></tr>`;
    }
    const cls = r.role === "master" ? "ok" : r.role === "spare" ? "wrn" : "";
    return `<tr><td><code>${esc(doc)}</code><div class="note">${what}</div></td>`
         + `<td><b>${esc(r.node)}</b></td><td class="${cls}">${esc(r.role)}</td>`
         + `<td class="n">${esc(r.count)}</td><td class="n">${esc(r.rate)}</td><td class="n">${esc(r.seq)}</td><td></td></tr>`;
}

function chip(id, name, r) {
    const up = r && r.node;
    $(id).textContent = name + " " + (up ? r.role : "not answering");
    $(id).className = "chip " + (!up ? "bad" : r.role === "master" ? "ok" : "wrn");
}

function show(v) {
    $("rows").innerHTML = ROUTES.map(([k, d, w]) => row(k, d, w, v[k])).join("");
    chip("c-s01", "S01", v.s01);
    chip("c-s02", "S02", v.s02);
    txt("ack", v.ack);
    txt("ref", v.ref);
    $("t-ref").className = "tile" + (v.down > 0 ? " alm" : "");
    txt("gap", (Number(v.gap) / 1000).toFixed(1));
    txt("took", v.list && v.list.seq_by ? v.list.seq_by : "--");
    txt("lus", Number(v.lus) > 0 ? Number(v.lus).toFixed(1) : "--");
    txt("rus", Number(v.rus) > 0 ? Number(v.rus).toFixed(0) : "--");
    txt("all", v.all || "--");
    $("notes").innerHTML = (v.notes || []).map((n) => `<div><code>${esc(n)}</code></div>`).join("") || `<span class="off">nothing yet</span>`;
    if (v.list && v.list.rate && document.activeElement !== $("r1")) { $("r1").value = v.list.rate; txt("r1v", v.list.rate); }
    if (v.here && v.here.rate && document.activeElement !== $("r2")) { $("r2").value = v.here.rate; txt("r2v", v.here.rate); }
}

function req(doc, id, val) { Kit.write("OPS/S00", "REQ", "val", JSON.stringify({ doc, id, val })); }

$("r1").addEventListener("change", () => req("LINE/L1", "RATE", Number($("r1").value)));
$("r2").addEventListener("change", () => req("LINE/L2", "RATE", Number($("r2").value)));
$("r1").addEventListener("input", () => txt("r1v", $("r1").value));
$("r2").addEventListener("input", () => txt("r2v", $("r2").value));
$("max1").addEventListener("click", () => req("LINE/L1", "RATE_MAX", 10));
$("max2").addEventListener("click", () => req("LINE/L2", "RATE_MAX", 10));

Kit.start({
    subs: ["OPS/S00/VIEW/val"],
    onmsg: (id, attr, text) => { if (id === "VIEW" && text) show(JSON.parse(text)); }
});
