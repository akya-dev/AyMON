// =====================================================================
// app.js -- the replication page: the source and the mirror side by side.
//
//   centre (this port):   SYS/S00/VIEW/val   the mirror, JSON
//                         SYS/S00/LINK/val   the link switch - the page
//                                            writes it (LINK/val/set)
//   plant (9180/mqtt):    SYS/S00/VIEW/val   the source, JSON
// Both nodes call their system document SYS/S00; the connection says
// which node a message came from.
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const view = { src: null, mir: null };

const trend = new Kit.Trend($("trend"), [
    { key: "src", label: "plant (source)", color: "--c1", min: 0, max: 100 },
    { key: "mir", label: "centre (mirror)", color: "--c2", min: 0, max: 100 }
]);

function tiles(v) {
    if (!v || v.level == null) return `<div class="muted">nothing yet${v ? " - the mirror is empty until the plant connects" : ""}</div>`;
    const h = Kit.health(v.lsta);
    const t = (name, value, unit = "", cls = "") => `<div class="tile ${cls}"><div class="t">${name}</div><div class="v">${Kit.esc(value)}<span class="u">${unit}</span></div></div>`;
    return t("level", Number(v.level).toFixed(1), " %", h.level > 0 ? h.cls : "")
         + t("temperature", Number(v.temp).toFixed(1), " C")
         + t("pump", v.pump == 1 ? "on" : "off")
         + t("starts", v.starts)
         + t("state", v.state)
         + t("level alarm", h.run ? h.text : "--", "", h.level > 0 ? h.cls : "");
}

function draw() {
    $("src").innerHTML = tiles(view.src);
    $("mir").innerHTML = tiles(view.mir);
    const m = view.mir;
    if (m) {
        txt("qty", m.qty ?? "--"); txt("unit", m.unit ?? "--"); txt("hi", m.hi ?? "--");
        const up = (Number(m.link) & 3) === 3;
        txt("link", up ? "up" : "down");
        $("link").className = up ? "ok" : "alm";
        $("c-link").textContent = "link " + (up ? "up" : "down");
        $("c-link").className = "chip " + (up ? "ok" : "bad");
    }
}

function take(which, text) {
    try { view[which] = JSON.parse(text); } catch (e) { return; }
    if (view[which] && view[which].level != null) trend.push(which, Number(view[which].level));
    draw();
}

// the centre: the page's own server
Kit.start({ subs: ["SYS/S00/VIEW/val"], onmsg: (id, attr, text) => { if (id === "VIEW") take("mir", text); } });

// the plant: a second connection, to the other engine
const plant = new MqttLite(`ws://${location.hostname}:9180/mqtt`, "page-p-" + Math.random().toString(36).slice(2, 8));
plant.onstatus = (t, ok) => { $("c-plant").textContent = ok ? "plant live" : "plant " + t; $("c-plant").className = "chip " + (ok ? "ok" : "bad"); };
plant.onconnect = () => plant.subscribe("SYS/S00/VIEW/val");
plant.onmessage = (topic, text) => { if (topic.endsWith("/VIEW/val")) take("src", text); };
plant.connect();

$("off").onclick = () => Kit.write("SYS/S00", "LINK", "val", 0);
$("on").onclick = () => Kit.write("SYS/S00", "LINK", "val", 1);
