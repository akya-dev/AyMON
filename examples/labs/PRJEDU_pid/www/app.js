// =====================================================================
// app.js -- the PID lab page.
//
//   IN   CTL/S00/+/val and +/sta over MQTT; the connection answers the
//        subscription with every current value (pro_retain).
//   OUT  the controller's requests - SP, MODE, MV_MAN, KP, TI, TD, AW,
//        TUNE - and the plant's fan, PLT/S00/FAN. Everything else is
//        refused by the engine (xdb_acl on CTL/S00).
//
// The page computes nothing about the loop. Rise time, overshoot and the
// suggested tuning are the controller's; the page keeps a copy of every
// sample for the trend and for the CSV a report is written from.
// =====================================================================
"use strict";

const DOC = "CTL/S00";
const $ = (id) => document.getElementById(id);
const v = {};
const s = {};
const num = (id, d = 0) => { const n = Number(v[id]); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
function alarmOf(sta) {
    const a = parseInt(sta) & 0x000C;
    return a >= 0x0008 ? "alm" : a === 0x0004 ? "wrn" : "";
}
const fmt = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "--");

// ---- samples: twice a second, what the controller last published ---------
const samples = [];                              // {t, sp, pv, mv, p, i, d, kp, ti, td, mode}
let t0 = null;
setInterval(() => {
    if (v.PV === undefined) return;
    if (t0 === null) t0 = Date.now();
    samples.push({
        t: (Date.now() - t0) / 1000, sp: num("SP"), pv: num("PV"), mv: num("MV"),
        p: num("P_TERM"), i: num("I_TERM"), d: num("D_TERM"),
        kp: num("KP"), ti: num("TI"), td: num("TD"), mode: num("MODE"), fan: num("FAN_SEEN"),
    });
    if (samples.length > 20000) samples.shift();
    drawTrend();
}, 500);

// ---- the trend ------------------------------------------------------------
const W = 800, H = 260;
const yT = (c) => (H - 10 - (c - 20) / 70 * (H - 20)).toFixed(1);   // 20..90 C
const yM = (m) => (H - 10 - m / 100 * (H - 20)).toFixed(1);         // 0..100 %
(function grid() {
    let g = "";
    for (let c = 20; c <= 90; c += 10) g += `<line x1="0" x2="${W}" y1="${yT(c)}" y2="${yT(c)}"/>`;
    g += `<line class="wrn" x1="0" x2="${W}" y1="${yT(80)}" y2="${yT(80)}"/>`;
    g += `<line class="alm" x1="0" x2="${W}" y1="${yT(90)}" y2="${yT(90)}"/>`;
    $("t-grid").innerHTML = g;
})();
function drawTrend() {
    const span = Number($("window").value);
    if (!samples.length) return;
    const tEnd = samples[samples.length - 1].t;
    const x = (t) => (W - (tEnd - t) / span * W).toFixed(1);
    const vis = samples.filter((p) => tEnd - p.t <= span);
    $("t-pv").setAttribute("points", vis.map((p) => `${x(p.t)},${yT(p.pv)}`).join(" "));
    $("t-sp").setAttribute("points", vis.map((p) => `${x(p.t)},${yT(p.sp)}`).join(" "));
    $("t-mv").setAttribute("points", vis.map((p) => `${x(p.t)},${yM(p.mv)}`).join(" "));
}
$("window").addEventListener("change", drawTrend);

// CSV for a report: every sample since the page was opened
$("csv").addEventListener("click", () => {
    const head = "t_s,SP_C,PV_C,MV_pct,P,I,D,Kp,Ti_s,Td_s,MODE,FAN";
    const rows = samples.map((p) => [p.t.toFixed(1), p.sp, p.pv, p.mv, p.p, p.i, p.d, p.kp, p.ti, p.td, p.mode, p.fan].join(","));
    const blob = new Blob([head + "\n" + rows.join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pid_lab_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
});

// ---- painting -------------------------------------------------------------
let stepWasOn = null;
const editing = new Set();                       // inputs the user is typing in

function paint(id) {
    const val = v[id];
    switch (id) {
    case "PV": txt("v-PV", fmt(num("PV"))); break;
    case "SP":
        txt("v-SP", fmt(num("SP"), 1));
        if (!editing.has("sp")) { $("sp").value = num("SP"); txt("sp-out", Math.round(num("SP"))); }
        break;
    case "MV": txt("v-MV", fmt(num("MV"), 1)); break;
    case "MODE": {
        const auto = num("MODE") === 1;
        $("m-auto").classList.toggle("on", auto);
        $("m-man").classList.toggle("on", !auto);
        $("mvman").disabled = auto;
        chip("c-mode", auto ? "ok" : "wrn", auto ? "AUTO" : "MANUAL");
        break;
    }
    case "MV_MAN":
        if (!editing.has("mvman")) { $("mvman").value = num("MV_MAN"); txt("mvman-out", Math.round(num("MV_MAN"))); }
        break;
    case "P_TERM": case "I_TERM": case "D_TERM": txt("v-" + id, fmt(num(id), 1)); break;
    case "KP": case "TI": case "TD": {
        const inp = $(id.toLowerCase());
        if (document.activeElement !== inp) inp.value = num(id);
        break;
    }
    case "AW": $("aw").checked = num("AW") === 1; break;
    case "FAN_SEEN":
        $("fan").checked = num("FAN_SEEN") === 1;
        chip("c-fan", num("FAN_SEEN") === 1 ? "wrn" : "", num("FAN_SEEN") === 1 ? "fan ON" : "fan off");
        break;
    case "TUNE": $("tune").textContent = num("TUNE") === 1 ? "Stop the step test" : "Run step test"; break;
    case "TUNE_STATE": txt("v-TUNE_STATE", val || "-"); break;
    case "ID_K": case "ID_TAU": case "ID_THETA": case "SUG_KP": case "SUG_TI":
        txt("v-" + id, num(id) ? fmt(num(id)) : "--");
        $("use").disabled = !(num("SUG_KP") > 0);
        break;
    case "STEP_FROM": case "STEP_TO": txt("v-STEP", `${fmt(num("STEP_FROM"), 1)} → ${fmt(num("STEP_TO"), 1)}`); break;
    case "STEP_T": txt("v-STEP_T", fmt(num("STEP_T"), 1)); break;
    case "RISE": case "SETTLE": txt("v-" + id, num(id) < 0 ? "--" : fmt(num(id), 1)); break;
    case "OVERSHOOT": txt("v-OVERSHOOT", fmt(num("OVERSHOOT"), 1)); break;
    case "IAE": txt("v-IAE", fmt(num("IAE"), 0)); break;
    case "STEP_ON": {
        const on = num("STEP_ON") === 1;
        // a step that ran its 180 s: a row for the comparison table
        if (stepWasOn === true && !on && num("STEP_T") >= 180) addStepRow();
        stepWasOn = on;
        break;
    }
    case "MSG": {
        if (!val) break;
        const li = document.createElement("li");
        const t = document.createElement("time");
        t.textContent = Date.now() - connectedAt < 1500 ? "earlier" : new Date().toLocaleTimeString();
        li.append(t, val);
        if (/TRIP|gave up/.test(val)) li.className = "bad";
        $("msgs").prepend(li);
        while ($("msgs").children.length > 100) $("msgs").lastChild.remove();
        break;
    }
    }
}

function addStepRow() {
    const tr = document.createElement("tr");
    const cells = [`${fmt(num("STEP_FROM"), 1)} → ${fmt(num("STEP_TO"), 1)}`,
        fmt(num("KP")), fmt(num("TI"), 1), fmt(num("TD"), 1),
        num("RISE") < 0 ? "--" : fmt(num("RISE"), 1) + " s",
        fmt(num("OVERSHOOT"), 1) + " %",
        num("SETTLE") >= 170 ? "> 180 s" : fmt(num("SETTLE"), 1) + " s",
        fmt(num("IAE"), 0)];
    for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.append(td); }
    $("steps").querySelector("tbody").prepend(tr);
}

function paintSta(id) {
    if (id !== "PV") return;
    const a = alarmOf(s.PV);
    const el = $("s-PV"); el.className = "state " + a; el.textContent = a === "alm" ? "alarm" : a === "wrn" ? "warning" : "";
    chip("c-pv", a === "alm" ? "bad" : a === "wrn" ? "wrn" : "ok", "PV " + (a === "alm" ? "alarm" : a === "wrn" ? "warning" : "normal"));
}

// ---- MQTT ------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "lab-" + Math.random().toString(36).slice(2, 8));
let connectedAt = 0;
mqtt.onstatus = (text, ok) => chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
mqtt.onconnect = () => {
    connectedAt = Date.now();
    mqtt.subscribe(DOC + "/+/val");
    mqtt.subscribe(DOC + "/+/sta");
};
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");
    if (p[3] === "val") { v[p[2]] = text; paint(p[2]); }
    else if (p[3] === "sta") { s[p[2]] = text; paintSta(p[2]); }
};
mqtt.connect();

function send(id, value, doc = DOC) { mqtt.publish(doc + "/" + id + "/val/set", String(value)); }

// ---- controls ----------------------------------------------------------------
function slider(id, out, element) {
    const el = $(id);
    el.addEventListener("input", () => { editing.add(id); txt(out, el.value); });
    el.addEventListener("change", () => { editing.delete(id); send(element, el.value); });
}
slider("sp", "sp-out", "SP");
slider("mvman", "mvman-out", "MV_MAN");
$("sp-step10").onclick = () => send("SP", Math.min(85, num("SP") + 10));
$("sp-stepm10").onclick = () => send("SP", Math.max(20, num("SP") - 10));
$("m-auto").onclick = () => send("MODE", 1);
$("m-man").onclick = () => send("MODE", 0);
$("fan").onchange = () => send("FAN", $("fan").checked ? 1 : 0, "PLT/S00");
$("aw").onchange = () => send("AW", $("aw").checked ? 1 : 0);
$("apply").onclick = () => { send("KP", $("kp").value); send("TI", $("ti").value); send("TD", $("td").value); };
$("tune").onclick = () => send("TUNE", num("TUNE") === 1 ? 0 : 1);
$("use").onclick = () => {
    $("kp").value = num("SUG_KP"); $("ti").value = num("SUG_TI"); $("td").value = 0;
    send("KP", num("SUG_KP")); send("TI", num("SUG_TI")); send("TD", 0);
};
