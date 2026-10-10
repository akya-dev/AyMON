// =====================================================================
// app.js -- the filling line HMI.
//
// Two MQTT connections, because there are two documents and each
// publishes only its own changes:
//   plc   ws://<host>:8093/mqtt  CTL/S00  the program, the I/O image.
//                                         Read only (xdb_acl).
//   mach  ws://<host>:8094/mqtt  PLT/S00  the line, the panel. The page
//                                         presses its buttons here.
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const c = {};                                   // CTL/S00 values
const p = {};                                   // PLT/S00 values
const cs = {};                                  // CTL/S00 sta
const n = (o, id, d = 0) => { const x = Number(o[id]); return Number.isFinite(x) ? x : d; };
function txt(id, v) { const el = $(id); if (el) el.textContent = v; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
function alarmOf(sta) { const a = parseInt(sta) & 0x000C; return a >= 8 ? "alm" : a === 4 ? "wrn" : ""; }

// ---- the line: 1 cm = 5 px, x = 20 + 5 * cm ----------------------------------
const px = (cm) => 20 + 5 * cm;
function drawLine() {
    let g = "";
    let bottles = [];
    try { bottles = JSON.parse(p.BOTTLES || "[]"); } catch (e) { /* half a message */ }
    for (const b of bottles) {
        const x = px(b[0]) - 20, lvl = Math.max(0, Math.min(100, b[1]));
        const h = 64 * lvl / 100;
        const bad = b[0] > 150 && lvl < 90;               // past the exit eye, under-filled
        g += `<rect class="fill${bad ? " bad" : ""}" x="${x + 2}" y="${213 - h}" width="36" height="${h}"/>`;
        g += `<path class="glass" d="M${x},213 V160 Q${x},150 ${x + 12},148 V140 H${x + 28} V148 Q${x + 40},150 ${x + 40},160 V213 Z"/>`;
    }
    $("bottles").innerHTML = g;
    const tank = Math.max(0, Math.min(100, n(p, "TANK")));
    $("tank-lvl").setAttribute("y", 8 + 56 * (1 - tank / 100));
    $("tank-lvl").setAttribute("height", 56 * tank / 100);
    txt("t-tank", tank.toFixed(0));
    $("valve").classList.toggle("on", n(p, "VALVE") === 1);
    $("stream").classList.toggle("on", n(p, "VALVE") === 1 && n(p, "TANK") > 0);
    $("beam-fill").classList.toggle("on", n(p, "PE_FILL") === 1);
    $("beam-exit").classList.toggle("on", n(p, "PE_EXIT") === 1);
    $("belt").classList.toggle("on", n(p, "CONV") === 1);
    $("lamp-run").classList.toggle("on", n(p, "LAMP_RUN") === 1);
    $("lamp-flt").classList.toggle("on", n(p, "LAMP_FLT") === 1);
    $("estop").classList.toggle("in", n(p, "ESTOP") === 1);
    $("rio-fs").style.display = n(p, "RIO_FS") === 1 ? "" : "none";
    $("estop").innerHTML = n(p, "ESTOP") === 1 ? "PRESSED<br><small>pull out</small>" : "EMERGENCY<br>STOP";
    for (const id of ["GOOD", "REJECT", "OVERFLOW"]) txt("v-" + id, p[id] ?? "--");
    txt("v-SPILL", p.SPILL !== undefined ? n(p, "SPILL").toFixed(0) : "--");
    $("speed").value = String(Math.round(n(p, "SPEED", 10)));
}

// ---- the PLC --------------------------------------------------------------------
const INPUTS = [["I_PE_FILL", "0.0 PE_FILL", "bottle under the nozzle"], ["I_LS_FULL", "0.1 LS_FULL", "bottle full"],
                ["I_PE_EXIT", "0.2 PE_EXIT", "bottle at the exit"], ["I_ESTOP_OK", "0.3 ESTOP_OK", "NC - 1 is safe"],
                ["I_START", "0.4 START", ""], ["I_STOP_OK", "0.5 STOP_OK", "NC - 1 is not pressed"],
                ["I_RESET", "0.6 RESET", ""], ["I_TANK_LOW", "0.7 TANK_LOW", "below 15 %"]];
const OUTPUTS = [["Q_CONV", "3.0 CONVEYOR", ""], ["Q_VALVE", "3.1 VALVE", "interlocked with PE_FILL"],
                 ["Q_LRUN", "3.2 RUN lamp", "flashes after STOP"], ["Q_LFLT", "3.3 FAULT lamp", ""]];
function bitList(ul, list) {
    $(ul).innerHTML = list.map(([id, name, note]) =>
        `<li id="b-${id}"><i></i>${name} <small>${note}</small></li>`).join("");
}
bitList("inputs", INPUTS);
bitList("outputs", OUTPUTS);

function paintPlc(id) {
    const val = c[id];
    const row = $("b-" + id);
    if (row) { row.classList.toggle("on", n(c, id) === 1); return; }
    switch (id) {
    case "STEP": {
        const s = n(c, "STEP");
        document.querySelectorAll("#sfc li").forEach((li) => {
            const on = Number(li.dataset.s) === s;
            li.classList.toggle("on", on);
            li.classList.toggle("flt", on && s >= 8);
        });
        break;
    }
    case "STEP_NAME": {
        const s = n(c, "STEP");
        chip("c-step", s >= 8 ? "bad" : s >= 1 ? "ok" : "", val);
        break;
    }
    case "STEP_T": txt("v-STEP_T", n(c, "STEP_T").toFixed(1)); break;
    case "STOP_REQ": txt("v-STOP_REQ", n(c, "STOP_REQ") === 1 ? "yes - after this bottle" : "no"); break;
    case "FAULT": txt("v-FAULT", val || "-"); break;
    case "COMM_OK": chip("c-comm", n(c, "COMM_OK") === 1 ? "ok" : "bad", n(c, "COMM_OK") === 1 ? "fieldbus" : "fieldbus LOST"); break;
    case "I_BLVL": txt("v-I_BLVL", n(c, "I_BLVL").toFixed(1)); break;
    case "I_TANK": txt("v-I_TANK", n(c, "I_TANK").toFixed(1)); break;
    case "FILLED": txt("v-FILLED", val); break;
    case "CABLE": paintCable(); break;
    case "CYCLE": txt("v-CYCLE", n(c, "CYCLE") ? n(c, "CYCLE").toFixed(1) : "--"); break;
    case "MSG": {
        if (!val) break;
        const li = document.createElement("li");
        const t = document.createElement("time");
        t.textContent = Date.now() - plcAt < 1500 ? "earlier" : new Date().toLocaleTimeString();
        li.append(t, val);
        if (/FAULT|EMERGENCY|refused/.test(val)) li.className = "bad";
        $("msgs").prepend(li);
        while ($("msgs").children.length > 100) $("msgs").lastChild.remove();
        break;
    }
    }
}
function paintPlcSta(id) {
    if (id !== "I_TANK") return;
    const a = alarmOf(cs.I_TANK);
    const el = $("s-I_TANK"); el.className = "state " + a; el.textContent = a === "alm" ? "alarm" : a === "wrn" ? "low" : "";
}

// ---- the two connections -------------------------------------------------------
const scheme = location.protocol === "https:" ? "wss://" : "ws://";
const plc = new MqttLite(scheme + location.host + "/mqtt", "hmi-plc-" + Math.random().toString(36).slice(2, 7));
const mach = new MqttLite(scheme + location.hostname + ":8094/mqtt", "hmi-mach-" + Math.random().toString(36).slice(2, 7));
let plcAt = 0;
plc.onstatus = (t, ok) => chip("c-plc", ok ? "ok" : "bad", "PLC");
mach.onstatus = (t, ok) => chip("c-mach", ok ? "ok" : "bad", "machine");
plc.onconnect = () => { plcAt = Date.now(); plc.subscribe("CTL/S00/+/val"); plc.subscribe("CTL/S00/+/sta"); };
mach.onconnect = () => mach.subscribe("PLT/S00/+/val");
plc.onmessage = (topic, text) => {
    const q = topic.split("/");
    if (q[3] === "val") { c[q[2]] = text; paintPlc(q[2]); }
    else if (q[3] === "sta") { cs[q[2]] = text; paintPlcSta(q[2]); }
};
let drawQueued = false;
mach.onmessage = (topic, text) => {
    const q = topic.split("/");
    if (q[3] !== "val") return;
    p[q[2]] = text;
    if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawLine(); }); }
};
plc.connect();
mach.connect();

// ---- the panel: everything it does is a publish to the MACHINE -------------------
const press = (id, v = 1) => mach.publish("PLT/S00/" + id + "/val/set", String(v));
document.querySelectorAll("button[data-pb]").forEach((b) => b.addEventListener("click", () => press(b.dataset.pb)));
$("estop").onclick = () => press("ESTOP", n(p, "ESTOP") === 1 ? 0 : 1);
$("refill").onclick = () => press("TANK_REFILL");
$("speed").onchange = () => press("SPEED", $("speed").value);

// "Pulling the cable" is the one request the page may make of the PLC:
// CTL/S00/CABLE. The PLC stops its Modbus connection; neither end knows
// why the other went quiet - only that it did.
$("cable").onclick = () => plc.publish("CTL/S00/CABLE/val/set", n(c, "CABLE", 1) === 1 ? "0" : "1");
function paintCable() {
    const out = n(c, "CABLE", 1) === 0;
    $("cable").textContent = out ? "plug the fieldbus cable back in" : "pull the fieldbus cable";
    $("cable").classList.toggle("on", out);
}
