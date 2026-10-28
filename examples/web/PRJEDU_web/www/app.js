// =====================================================================
// app.js -- the page's logic, in three steps:
//
//   1  REST   GET /api/values once, so the page shows numbers straight away
//   2  MQTT   open ws://<this host>/mqtt, subscribe to every val and sta of
//             document PLT/S00, and repaint on each message
//   3  WRITE  moving the slider publishes to PLT/S00/SETPOINT/val/set
//
// Topics are <document>/<element id>/<attribute>. The document name has a
// slash in it, so a topic has four levels: PLT/S00/LEVEL/val.
// =====================================================================
"use strict";

const DOC = "PLT/S00";
const $ = (id) => document.getElementById(id);

// ---- painting -------------------------------------------------------
// 'sta' is a 16-bit field; bits 0x000C are the alarm state ALM.onlvl
// keeps: 0x0004 warning, 0x0008 alarm, 0x000C both (emergency).
function alarmOf(sta) {
    const a = sta & 0x000C;
    return a >= 0x0008 ? "alm" : a === 0x0004 ? "wrn" : "";
}

const trend = [];
let dragging = false;

function paintVal(id, text) {
    const el = $("v-" + id);
    if (!el) return;
    const n = Number(text);
    if (id === "PUMP") { el.textContent = n === 1 ? "RUNNING" : "stopped"; return; }
    el.textContent = Number.isFinite(n) && !Number.isInteger(n) ? n.toFixed(1) : text;

    if (id === "LEVEL" && Number.isFinite(n)) {
        $("water").style.height = Math.max(0, Math.min(100, n)) + "%";
        trend.push(n);
        if (trend.length > 240) trend.shift();
        $("trend-line").setAttribute("points",
            trend.map((v, i) => i + "," + (60 - v * 0.6).toFixed(1)).join(" "));
    }
    if (id === "SETPOINT" && Number.isFinite(n)) {
        $("sp-line").style.bottom = n + "%";
        if (!dragging) { $("sp").value = n; $("sp-out").textContent = n; }
    }
}

function paintSta(id, text) {
    if (id !== "LEVEL") return;
    const cls = alarmOf(parseInt(text));             // parseInt reads "0x0347" too
    $("water").className = "water " + cls;
    const s = $("s-LEVEL");
    s.className = "state " + cls;
    s.textContent = cls === "alm" ? "ALARM" : cls === "wrn" ? "WARNING" : "normal";
}

function chip(id, ok, title) {
    $(id).className = "chip " + (ok ? "ok" : "bad");
    if (title) $(id).title = title;
}

// ---- a small log of what goes over the wire ---------------------------
let count = 0;
function log(cls, text) {
    const li = document.createElement("li");
    li.className = cls;
    li.textContent = new Date().toLocaleTimeString() + "  " + text;
    const ol = $("log");
    ol.prepend(li);
    while (ol.children.length > 200) ol.lastChild.remove();
}
setInterval(() => { $("rate").textContent = "(" + count + " messages in the last 5 s)"; count = 0; }, 5000);

// ---- 1  REST snapshot ---------------------------------------------------
fetch("/api/values", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((all) => {
        chip("st-rest", true, "GET /api/values answered");
        log("sys", "REST  GET /api/values -> " + JSON.stringify(all));
        for (const id in all) {
            paintVal(id, String(all[id].val));
            paintSta(id, String(all[id].sta));
        }
    })
    .catch((e) => { chip("st-rest", false, "GET /api/values failed: " + e); log("sys", "REST failed: " + e); });

// ---- 2  MQTT over WebSocket ---------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "page-" + Math.random().toString(36).slice(2, 8));
if (location.protocol === "https:") {
    $("st-http").textContent = "HTTPS";
    $("st-mqtt").textContent = "MQTT/WSS";
}
log("sys", "MQTT  " + wsUrl);

mqtt.onstatus = (text, ok) => { chip("st-mqtt", ok, text); log("sys", "MQTT  " + text); };
mqtt.onpacket = (dir, name) => { if (name !== "PINGREQ" && name !== "PINGRESP") log(dir === "out" ? "out" : "sys", (dir === "out" ? "-> " : "<- ") + name); };
mqtt.onconnect = () => {
    // '+' matches one level: every element's val, every element's sta.
    mqtt.subscribe(DOC + "/+/val");
    mqtt.subscribe(DOC + "/+/sta");
};
mqtt.onmessage = (topic, text) => {
    count++;
    log("in", "<- " + topic + " = " + text);
    const parts = topic.split("/");                  // PLT, S00, LEVEL, val
    const id = parts[2], atr = parts[3];
    if (atr === "val") paintVal(id, text);
    else if (atr === "sta") paintSta(id, text);
};
mqtt.connect();

// ---- 3  writing a value back ----------------------------------------------
// The engine rounds and clamps it (val_fnc on SETPOINT) and then publishes
// the stored value back to every page -- this one included, which is how
// the slider learns what was really kept.
const sp = $("sp");
sp.addEventListener("input", () => { dragging = true; $("sp-out").textContent = sp.value; });
sp.addEventListener("change", () => {
    dragging = false;
    mqtt.publish(DOC + "/SETPOINT/val/set", sp.value);
});
