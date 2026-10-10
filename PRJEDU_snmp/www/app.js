// =====================================================================
// app.js -- the SNMP page: MON/S00's points, raw and converted.
//
//   IN  MON/S00/+/val, MON/S00/+/pro, MON/S00/+/sta
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const BASE = "1.3.6.1.4.1.99999";

// the same facts as db_MON.xml
const POINTS = [
    { id: "LEVEL",  oid: "2.1.0", type: "Gauge32",      d: 1, unit: "%" },
    { id: "TEMP",   oid: "2.2.0", type: "INTEGER, 1/10", d: 1, unit: "C" },
    { id: "PUMP",   oid: "2.3.0", type: "INTEGER",      d: 0, unit: "" },
    { id: "STARTS", oid: "2.4.0", type: "Counter32",    d: 0, unit: "" },
    { id: "UPTIME", oid: "1.2.0", type: "TimeTicks",    d: 0, unit: "1/100 s" },
    { id: "DESCR",  oid: "1.1.0", type: "OCTET STRING", d: -1, unit: "" }
];
const LIMITS = [[10, "a"], [20, ""], [80, ""], [90, "a"]];      // LEVEL val_alm_*

const trend = new Kit.Trend($("trend"), [
    { key: "LEVEL", label: "level %", color: "--c1", min: 0, max: 100 },
    { key: "TEMP",  label: "temp C",  color: "--c2", min: 0, max: 40 }
]);
for (const [pct, cls] of LIMITS) { const b = document.createElement("b"); b.className = cls; b.style.bottom = pct + "%"; $("g").appendChild(b); }

function ticks(t) {
    const s = Math.floor(Number(t) / 100);
    if (isNaN(s)) return "--";
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + " h " : "") + (h || m ? m + " min " : "") + (s % 60) + " s";
}

function draw() {
    const lv = Kit.get("LEVEL");
    $("g-fill").style.height = (lv === undefined ? 0 : Math.max(0, Math.min(100, Number(lv)))) + "%";
    txt("level", Kit.num("LEVEL"));
    const h = Kit.health(Kit.get("LEVEL", "sta"));
    $("s-level").textContent = h.text; $("s-level").className = "s " + h.cls;
    $("t-level").className = "tile " + (h.level > 0 ? h.cls : "");
    txt("temp", Kit.num("TEMP"));
    txt("pump", Kit.get("PUMP") === undefined ? "--" : Kit.get("PUMP") === "1" ? "on" : "off");
    txt("starts", Kit.num("STARTS", 0));
    txt("descr", Kit.get("DESCR") || "--");
    txt("uptime", ticks(Kit.get("UPTIME")));

    $("rows").innerHTML = POINTS.map((p) => {
        const hs = Kit.health(Kit.get(p.id, "sta"));
        const val = p.d < 0 ? Kit.esc(Kit.get(p.id) ?? "--") : Kit.num(p.id, p.d) + " " + p.unit;
        return `<tr><td><b>${p.id}</b></td><td><code>${BASE}.${p.oid}</code></td><td>${p.type}</td>`
             + `<td class="n">${Kit.esc(Kit.get(p.id, "pro") ?? "--")}</td><td class="n">${val}</td><td class="${hs.cls}">${hs.text}</td></tr>`;
    }).join("");

    $("c-dev").textContent = h.run ? "agent answers" : "agent --";
    $("c-dev").className = "chip " + (h.run ? "ok" : "bad");
}

Kit.start({
    subs: ["MON/S00/+/val", "MON/S00/+/pro", "MON/S00/+/sta"],
    onmsg: (id, attr, text) => {
        if (attr === "val" && (id === "LEVEL" || id === "TEMP")) trend.push(id, Number(text));
        draw();
    }
});
