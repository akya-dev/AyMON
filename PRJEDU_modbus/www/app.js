// =====================================================================
// app.js -- the Modbus page: MON/S00's points, raw and scaled.
//
//   IN  MON/S00/+/val   what each point means
//   IN  MON/S00/+/pro   what the device sent (the register, the bit)
//   IN  MON/S00/+/sta   running? warning? alarm?
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };

// What the page shows about each point - the same facts as db_MON.xml.
const POINTS = [
    { id: "TANK_LEVEL", reg: "0",   scale: "x 0.1", unit: "%", d: 1 },
    { id: "TANK_TEMP",  reg: "1",   scale: "x 0.1", unit: "C", d: 1 },
    { id: "PUMP_RUN",   reg: "2.0", scale: "bit",   unit: "",  d: 0 },
    { id: "VALVE_OPEN", reg: "2.1", scale: "bit",   unit: "",  d: 0 },
    { id: "TEMP_HIGH",  reg: "2.2", scale: "bit",   unit: "",  d: 0 },
    { id: "PUMP_HOURS", reg: "3",   scale: "-",     unit: "h", d: 0 }
];
const LIMITS = { lo_alm: 5, lo_wrn: 15, hi_wrn: 85, hi_alm: 95 };   // TANK_LEVEL val_alm_*

const trend = new Kit.Trend($("trend"), [
    { key: "TANK_LEVEL", label: "level %", color: "--c1", min: 0, max: 100 },
    { key: "TANK_TEMP",  label: "temp C",  color: "--c2", min: 0, max: 40 }
]);

// the limit marks on the gauge
for (const [k, cls] of [["lo_alm", "a"], ["lo_wrn", ""], ["hi_wrn", ""], ["hi_alm", "a"]]) {
    const b = document.createElement("b"); b.className = cls; b.style.bottom = LIMITS[k] + "%"; $("g").appendChild(b);
}

function draw() {
    const lv = Kit.get("TANK_LEVEL");
    $("g-fill").style.height = (lv === undefined ? 0 : Math.max(0, Math.min(100, Number(lv)))) + "%";
    for (const [id, el, tile] of [["TANK_LEVEL", "level", "t-level"], ["TANK_TEMP", "temp", "t-temp"]]) {
        txt(el, Kit.num(id));
        const h = Kit.health(Kit.get(id, "sta"));
        $("s-" + el).textContent = h.text; $("s-" + el).className = "s " + h.cls;
        $(tile).className = "tile " + (h.level > 0 ? h.cls : "");
    }
    txt("hours", Kit.num("PUMP_HOURS", 0));
    $("l-pump").classList.toggle("on", Kit.get("PUMP_RUN") === "1");
    $("l-valve").classList.toggle("on", Kit.get("VALVE_OPEN") === "1");
    $("l-hot").classList.toggle("on", Kit.get("TEMP_HIGH") === "1");

    $("rows").innerHTML = POINTS.map((p) => {
        const h = Kit.health(Kit.get(p.id, "sta"));
        return `<tr><td><b>${p.id}</b></td><td><code>${p.reg}</code></td><td class="n">${Kit.get(p.id, "pro") ?? "--"}</td>`
             + `<td>${p.scale}</td><td class="n">${Kit.num(p.id, p.d)} ${p.unit}</td><td class="${h.cls}">${h.text}</td></tr>`;
    }).join("");

    const d = Kit.health(Kit.get("TANK_LEVEL", "sta"));
    $("c-dev").textContent = d.run ? "device answers" : "device --";
    $("c-dev").className = "chip " + (d.run ? "ok" : "bad");
}

Kit.start({
    subs: ["MON/S00/+/val", "MON/S00/+/pro", "MON/S00/+/sta"],
    onmsg: (id, attr, text) => {
        if (attr === "val" && (id === "TANK_LEVEL" || id === "TANK_TEMP")) trend.push(id, Number(text));
        draw();
    }
});
