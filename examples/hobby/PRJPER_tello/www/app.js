// =====================================================================
// app.js -- the ground station page.
//
//   IN   subscribe to TEL/S00/+/val and TEL/S00/+/sta. The connection
//        answers the subscription with every current value at once
//        (pro_retain), then sends each change.
//   OUT  three request elements, and nothing else:
//          TEL/S00/CMD/val/set      "takeoff", "cw 90", ...
//          TEL/S00/MISSION/val/set  "square", ...
//          TEL/S00/RC/val/set       "a b c d", the sticks
//        Publishing anywhere else is refused by the engine (xdb_acl).
//
// The page decides nothing. It does not know the height limit or the
// battery rule; it shows what the engine publishes, including the
// engine's own verdicts in MSG.
// =====================================================================
"use strict";

const DOC = "TEL/S00";
const $ = (id) => document.getElementById(id);
const v = {};                                   // last val of every element
const s = {};                                   // last sta of every element

// ---- alarms: bits 0x000C of sta, as ALM.onlvl / ALM.onin keep them ----
function alarmOf(sta) {
    const a = parseInt(sta) & 0x000C;           // parseInt reads "0x0347" too
    return a >= 0x0008 ? "alm" : a === 0x0004 ? "wrn" : "";
}
const num = (id, d = 0) => { const n = Number(v[id]); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }

// ---- the top view ---------------------------------------------------------
// The Tello does not report where it is, only how fast it goes (vgx, vgy
// in dm/s). The page adds the speed up ten times a second: dead
// reckoning. The simulator's speeds are exact, so the path closes; a
// real drone's are not, so the path wanders - which is the lesson.
let pos = { x: 0, y: 0 };                       // cm: x forward at takeoff, y left
let path = [[0, 0]];
let wasFlying = false;

setInterval(() => {
    if (num("FLYING") !== 1) return;
    pos.x += num("VGX") * 10 * 0.1;
    pos.y += num("VGY") * 10 * 0.1;
    const last = path[path.length - 1];
    if (Math.hypot(pos.x - last[0], pos.y - last[1]) > 2) {
        path.push([pos.x, pos.y]);
        if (path.length > 2000) path.shift();
    }
    drawMap();
}, 100);

function drawMap() {
    let ext = 150;                              // cm the view must hold
    for (const p of path) ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]));
    const k = 170 / ext;                        // px per cm; the view is -200..200
    const step = ext > 400 ? 100 : 50;
    txt("grid-cm", step);

    let g = "";
    for (let c = -Math.floor(ext / step) * step; c <= ext; c += step) {
        const p = (c * k).toFixed(1), cls = c === 0 ? ' class="axis"' : "";
        g += `<line x1="${p}" y1="-200" x2="${p}" y2="200"${cls}/><line x1="-200" y1="${p}" x2="200" y2="${p}"${cls}/>`;
    }
    $("grid").innerHTML = g;
    // screen: up = +x (forward), left = +y (left)
    $("path").setAttribute("points", path.map((p) => `${(-p[1] * k).toFixed(1)},${(-p[0] * k).toFixed(1)}`).join(" "));
    $("drone").setAttribute("transform",
        `translate(${(-pos.y * k).toFixed(1)},${(-pos.x * k).toFixed(1)}) rotate(${num("YAW")})`);
    $("drone").setAttribute("class", num("FLYING") === 1 ? "flying" : "");
}
$("clear-path").onclick = () => { path = [[pos.x, pos.y]]; drawMap(); };

// ---- painting ------------------------------------------------------------------
function paint(id) {
    const val = v[id];
    switch (id) {
    case "PITCH": case "ROLL":
        txt("v-" + id, Math.round(num(id)));
        $("h-pitch").setAttribute("transform", `translate(0,${(num("PITCH") * 1.5).toFixed(1)})`);
        $("h-rot").setAttribute("transform", `rotate(${-num("ROLL")})`);
        break;
    case "YAW":
        txt("v-YAW", Math.round(num("YAW")));
        $("rose").setAttribute("transform", `rotate(${-num("YAW")})`);
        // the letters turn with the rose but stay upright
        document.querySelectorAll("#rose text").forEach((t) =>
            t.setAttribute("transform", `rotate(${num("YAW")} ${t.getAttribute("x") || 0} ${t.getAttribute("y") - 4})`));
        drawMap();
        break;
    case "H": case "MAX_H": {
        txt("v-H", Math.round(num("H"))); txt("v-MAX_H", Math.round(num("MAX_H")));
        const full = Math.max(1, num("MAX_H") * 1.2);
        $("hbar-fill").style.width = Math.min(100, num("H") / full * 100) + "%";
        $("hbar-max").style.left = (num("MAX_H") / full * 100) + "%";
        break;
    }
    case "BAT": case "BAT_LAND":
        txt("v-BAT", Math.round(num("BAT"))); txt("v-BAT_LAND", Math.round(num("BAT_LAND")));
        $("bat-fill").style.width = Math.max(0, Math.min(100, num("BAT"))) + "%";
        $("bat-land").style.left = num("BAT_LAND") + "%";
        break;
    case "VGX": case "VGY": case "VGZ":
        txt("v-SPD", Math.round(Math.hypot(num("VGX"), num("VGY"), num("VGZ")) * 10));
        break;
    case "LINK":
        chip("c-link", num("LINK") === 1 ? "ok" : "bad", num("LINK") === 1 ? "LINK" : "NO LINK");
        break;
    case "SDK":
        chip("c-sdk", num("SDK") === 1 ? "ok" : "", "SDK");
        break;
    case "FLYING": {
        const f = num("FLYING") === 1;
        chip("c-flying", f ? "wrn" : "", f ? "FLYING" : "ON GROUND");
        if (f && !wasFlying) { pos = { x: 0, y: 0 }; path = [[0, 0]]; }   // a new flight
        wasFlying = f;
        drawMap();
        break;
    }
    case "BUSY": txt("v-BUSY", val || "-"); break;
    case "REPLY": txt("v-REPLY", val || "-"); break;
    case "QUEUE": {
        const ol = $("queue");
        ol.innerHTML = "";
        for (const c of (val ? val.split("|") : [])) {
            const li = document.createElement("li"); li.textContent = c; ol.append(li);
        }
        break;
    }
    case "MSG": {
        if (!val) break;
        const li = document.createElement("li");
        const t = document.createElement("time");
        // the first message is the retained one: it happened before the page
        t.textContent = Date.now() - connectedAt < 1500 ? "earlier" : new Date().toLocaleTimeString();
        li.append(t, val);
        if (/refused|LOST|LANDING|no answer|emergency/i.test(val)) li.className = "bad";
        $("msgs").prepend(li);
        while ($("msgs").children.length > 100) $("msgs").lastChild.remove();
        break;
    }
    case "TEMPH": txt("v-TEMPH", Math.round(num("TEMPH"))); break;
    case "TOF": txt("v-TOF", Math.round(num("TOF"))); break;
    case "TIME": txt("v-TIME", Math.round(num("TIME"))); break;
    case "BARO": txt("v-BARO", num("BARO").toFixed(2)); break;
    case "BAT_TAKEOFF": txt("v-BAT_TAKEOFF", Math.round(num("BAT_TAKEOFF"))); break;
    }
}

// sta: the engine's alarm verdict on H, BAT, TEMPH and LINK
function paintSta(id) {
    const a = alarmOf(s[id]);
    const word = a === "alm" ? "alarm" : a === "wrn" ? "warning" : "";
    if (id === "H" || id === "BAT") {
        $(id === "H" ? "hbar-fill" : "bat-fill").className = a;
        const el = $("s-" + id); el.className = "state " + a; el.textContent = word;
    }
    if (id === "TEMPH") { const el = $("s-TEMPH"); el.className = "state " + a; el.textContent = word; }
}

// ---- MQTT ------------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "gs-" + Math.random().toString(36).slice(2, 8));
mqtt.onstatus = (text, ok) => chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
let connectedAt = 0;
mqtt.onconnect = () => {
    connectedAt = Date.now();
    mqtt.subscribe(DOC + "/+/val");
    mqtt.subscribe(DOC + "/+/sta");
};
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");                 // TEL, S00, H, val
    const id = p[2], atr = p[3];
    if (atr === "val") { v[id] = text; paint(id); }
    else if (atr === "sta") { s[id] = text; paintSta(id); }
};
mqtt.connect();
drawMap();

function send(element, text) { mqtt.publish(DOC + "/" + element + "/val/set", text); }

// ---- buttons ------------------------------------------------------------------------
document.querySelectorAll("button[data-cmd]").forEach((b) =>
    b.addEventListener("click", () => send("CMD", b.dataset.cmd)));
document.querySelectorAll("button[data-mission]").forEach((b) =>
    b.addEventListener("click", () => send("MISSION", b.dataset.mission)));
$("free").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("free-cmd").value.trim();
    if (c) send("CMD", c);
    $("free-cmd").select();
});

// ---- sticks: the keyboard ------------------------------------------------------------
// Held keys become 'a b c d' (each -60..60) and are published five times
// a second while any is held; letting go sends 0 0 0 0 once. The engine
// sends rc to the drone at once, clamped by the height rule.
const held = new Set();
const KEYS = "wasdrfqe";
let lastRc = "0 0 0 0";

function rcNow() {
    const k = (c) => (held.has(c) ? 60 : 0);
    return [k("d") - k("a"), k("w") - k("s"), k("r") - k("f"), k("e") - k("q")].join(" ");
}
function rcSend(force) {
    const rc = rcNow();
    if (rc === lastRc && !force) return;
    lastRc = rc;
    txt("rc-now", "rc " + rc);
    send("RC", rc);
}
function keyFlags() {
    document.querySelectorAll(".keys kbd").forEach((el) =>
        el.classList.toggle("on", held.has(el.textContent.toLowerCase())));
}
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.repeat) return;
    const c = e.key.toLowerCase();
    if (!KEYS.includes(c) || c.length !== 1) return;
    held.add(c); keyFlags(); rcSend(false);
});
document.addEventListener("keyup", (e) => {
    const c = e.key.toLowerCase();
    if (!held.delete(c)) return;
    keyFlags(); rcSend(false);
});
window.addEventListener("blur", () => { if (held.size) { held.clear(); keyFlags(); rcSend(false); } });
setInterval(() => { if (held.size) rcSend(true); }, 200);
