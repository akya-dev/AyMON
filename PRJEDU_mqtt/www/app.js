// =====================================================================
// app.js -- the MQTT page: MON/S00's four points, and a set point that
// goes to the field and comes back.
//
//   IN   MON/S00/+/val, MON/S00/+/sta
//   OUT  MON/S00/SETPOINT/pro/set   (the one thing the page may write)
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };

const trend = new Kit.Trend($("trend"), [
    { key: "LEVEL",    label: "level %",     color: "--c1", min: 0, max: 100 },
    { key: "SETPOINT", label: "set point %", color: "--c2", min: 0, max: 100 },
    { key: "TEMP",     label: "temp C",      color: "--c3", min: 0, max: 40 }
]);

function draw() {
    for (const [id, d] of [["LEVEL", 1], ["SETPOINT", 0], ["TEMP", 1]]) txt("v-" + id, Kit.num(id, d));
    txt("v-PUMP", Kit.get("PUMP") === undefined ? "--" : Kit.get("PUMP") === "1" ? "running" : "stopped");
    for (const id of ["LEVEL", "SETPOINT", "TEMP", "PUMP"]) {
        const h = Kit.health(Kit.get(id, "sta"));
        $("s-" + id).textContent = h.text; $("s-" + id).className = "s " + h.cls;
        $("t-" + id).className = "tile " + (h.level > 0 ? h.cls : "");
    }
}

// ---- the round trip -------------------------------------------------------
let trip = null;              // {asked, t0, rows}
function row(t, what) {
    trip.rows.push(`<tr><td class="n">${t} ms</td><td>${what}</td></tr>`);
    $("trip").innerHTML = trip.rows.join("");
}
$("sp").oninput = () => txt("sp-v", $("sp").value);
$("send").onclick = () => {
    const sp = Number($("sp").value);
    trip = { asked: sp, t0: performance.now(), rows: [] };
    row(0, `page &rarr; <code>MON/S00/SETPOINT/pro/set</code> = ${sp}`);
    Kit.write("MON/S00", "SETPOINT", "pro", sp);
};

Kit.start({
    subs: ["MON/S00/+/val", "MON/S00/+/sta"],
    onmsg: (id, attr, text) => {
        if (attr === "val" && ["LEVEL", "SETPOINT", "TEMP"].includes(id)) trend.push(id, Number(text));
        if (trip && id === "SETPOINT" && attr === "val" && Number(text) === trip.asked) {
            row(Math.round(performance.now() - trip.t0),
                `MON/S00 took it (<code>SETPOINT.val</code> = ${Kit.esc(text)}) and its <code>PRO.out</code> published <code>FLD/S00/SETPOINT/val/set</code>`);
            trip.asked = null; trip.pump = Kit.get("PUMP");
        }
        if (trip && trip.asked === null && id === "PUMP" && attr === "val" && text !== trip.pump) {
            row(Math.round(performance.now() - trip.t0), `the field's pump ${text === "1" ? "started" : "stopped"} - the field is following the new set point`);
            trip.pump = text;
        }
        draw();
    }
});
