// =====================================================================
// app.js -- the plant as a person beside the assistant sees it.
//
//   IN  PLT/S00/+/val, PLT/S00/+/sta   (read only)
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const WATCH = ["SETPOINT", "PUMP", "MAINT"];            // the changes worth a line
const VARS = ["LEVEL", "SETPOINT", "PUMP", "MAINT", "COUNT", "VENDOR_NOTE"];
const seen = {};
const log = [];

const trend = new Kit.Trend($("trend"), [
    { key: "LEVEL",    label: "level %",     color: "--c1", min: 0, max: 100 },
    { key: "SETPOINT", label: "set point %", color: "--c2", min: 0, max: 100 }
]);

const onoff = (v) => v === undefined ? "--" : v === "1" ? "on" : "off";

function draw() {
    txt("v-LEVEL", Kit.num("LEVEL"));
    txt("v-SETPOINT", Kit.num("SETPOINT", 0));
    txt("v-PUMP", onoff(Kit.get("PUMP")));
    txt("v-MAINT", onoff(Kit.get("MAINT")));
    txt("v-COUNT", Kit.get("COUNT") ?? "--");
    const h = Kit.health(Kit.get("LEVEL", "sta"));
    $("s-LEVEL").textContent = h.text; $("s-LEVEL").className = "s " + h.cls;
    $("t-LEVEL").className = "tile " + (h.level > 0 ? h.cls : "");
    $("seen").innerHTML = VARS.map((id) => `<tr><td><code>${id}</code></td><td class="${seen[id] ? "ok" : "alm"}">`
        + (seen[id] ? "visible" : "never arrived") + "</td></tr>").join("");
    if (log.length) $("log").innerHTML = log.map((l) => `<tr><td class="n">${l.t}</td><td><code>${l.id}</code></td><td>${Kit.esc(l.was)} &rarr; <b>${Kit.esc(l.now)}</b></td></tr>`).join("");
}

Kit.start({
    subs: ["PLT/S00/+/val", "PLT/S00/+/sta"],
    onmsg: (id, attr, text) => {
        if (attr !== "val") { draw(); return; }
        if (WATCH.includes(id) && seen[id] && seen[id] !== text) {
            log.unshift({ t: new Date().toLocaleTimeString(), id, was: seen[id], now: text });
            log.length = Math.min(log.length, 12);
        }
        seen[id] = text;
        if (id === "LEVEL" || id === "SETPOINT") trend.push(id, Number(text));
        draw();
    }
});
draw();
