// =====================================================================
// app.js -- the robot arm cell's page.
//
//   IN   CEL/S00/+/val and +/sta over MQTT; the connection answers the
//        subscription with every current value (pro_retain).
//   OUT  CEL/S00/CMD, FEED, SPEED - the requests the cell accepts - and
//        ROB/S00/DOOR, BUMP - the world around the robot.
//
// The arm is drawn from the six joint angles only: the page runs the same
// forward kinematics as the robot (UR5e Denavit-Hartenberg parameters) and
// draws the chain of joint frames from above and from the side. The tool
// position the robot reports (TCP_X/Y/Z) is drawn too - a check that the
// two computations agree.
// =====================================================================
"use strict";

const DOC = "CEL/S00";
const $ = (id) => document.getElementById(id);
const v = {};
const s = {};
const num = (id, d = NaN) => { const n = parseFloat(v[id]); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- forward kinematics ------------------------------------------------------
const D = [0.1625, 0, 0, 0.1333, 0.0997, 0.0996];
const A = [0, -0.425, -0.3922, 0, 0, 0];
const AL = [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0];

// Returns the origin of every frame, base first, tool last, in mm.
function chain(qdeg) {
    let T = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    const pts = [[0, 0, 0]];
    for (let i = 0; i < 6; i++) {
        const q = qdeg[i] * Math.PI / 180;
        const ct = Math.cos(q), st = Math.sin(q), ca = Math.cos(AL[i]), sa = Math.sin(AL[i]);
        const M = [[ct, -st * ca, st * sa, A[i] * ct], [st, ct * ca, -ct * sa, A[i] * st], [0, sa, ca, D[i]]];
        const R = [];
        for (let r = 0; r < 3; r++) {
            R.push([0, 1, 2, 3].map((c) =>
                T[r][0] * M[0][c] + T[r][1] * M[1][c] + T[r][2] * M[2][c] + (c === 3 ? T[r][3] : 0)));
        }
        T = R;
        pts.push([T[0][3] * 1000, T[1][3] * 1000, T[2][3] * 1000]);
    }
    return pts;
}

// ---- the drawing ---------------------------------------------------------------
const PICK = [400, -300], PLACE = [400, 300];
const trail = [];                                 // tool positions reported by the robot
let lastTrail = 0;

function drawArm() {
    const q = [0, 1, 2, 3, 4, 5].map((i) => num("J" + i));
    if (q.some((x) => !Number.isFinite(x))) return;
    const p = chain(q);
    const tool = [num("TCP_X", 0), num("TCP_Y", 0), num("TCP_Z", 0)];
    const now = Date.now();
    if (now - lastTrail > 150) {
        lastTrail = now;
        trail.push(tool);
        if (trail.length > 120) trail.shift();
    }
    const grip = num("GRIPPER", 0) === 1;
    const em = num("SAFETY_CODE", 0) !== 0;
    const infeed = num("INFEED", 0);
    const placed = num("PLACED", 0);

    for (const view of ["top", "side"]) {
        const P = view === "top" ? (a) => [a[0], -a[1]] : (a) => [a[0], -a[2]];
        let g = "";
        if (view === "top") {
            g += `<circle class="reach" r="850"/><circle class="reach" r="425"/>`;
            g += `<line class="axis" x1="-780" x2="780" y1="0" y2="0"/><line class="axis" x1="0" x2="0" y1="-680" y2="680"/>`;
            g += station(PICK, "pick", infeed) + station(PLACE, "place", Math.min(placed, 9));
        } else {
            g += `<rect class="table" x="150" y="0" width="600" height="40"/><line class="axis" x1="-780" x2="780" y1="0" y2="0"/>`;
            g += `<rect class="pedestal" x="-70" y="-20" width="140" height="20"/>`;
            if (infeed > 0) g += `<rect class="part" x="${PICK[0] - 20}" y="-60" width="40" height="60"/>`;
            if (placed > 0) g += `<rect class="part done" x="${PLACE[0] - 20}" y="-80" width="40" height="60"/>`;
        }
        g += `<polyline class="trail" points="${trail.map((t) => P(t).map((n) => n.toFixed(0)).join(",")).join(" ")}"/>`;
        g += `<polyline class="link${em ? " em" : ""}" points="${p.map((a) => P(a).map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`;
        for (let i = 0; i < 6; i++) { const [x, y] = P(p[i]); g += `<circle class="joint" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? 45 : 32}"/>`; }
        const [tx, ty] = P(p[6]);
        g += `<circle class="tool${grip ? " closed" : ""}" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${grip ? 22 : 30}"/>`;
        const [rx, ry] = P(tool);
        g += `<circle class="reported" cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="10"><title>the tool position the robot reports</title></circle>`;
        $(view).innerHTML = g;
    }
}

function station(xy, name, n) {
    const [x, y] = [xy[0], -xy[1]];
    let g = `<rect class="station" x="${x - 80}" y="${y - 80}" width="160" height="160" rx="10"/>`;
    g += `<text class="st" x="${x}" y="${y + 115}">${name}</text>`;
    for (let i = 0; i < n; i++) g += `<rect class="part${name === "place" ? " done" : ""}" x="${x - 60 + (i % 3) * 42}" y="${y - 60 + Math.floor(i / 3) * 42}" width="34" height="34" rx="4"/>`;
    return g;
}

// ---- the joints -----------------------------------------------------------------
const JNAMES = ["base", "shoulder", "elbow", "wrist 1", "wrist 2", "wrist 3"];
(function jointRows() {
    $("joints").innerHTML = JNAMES.map((n, i) =>
        `<tr><td>${n}</td><td class="n" id="jd${i}">--</td><td class="n" id="jv${i}">--</td>`
        + `<td class="bar-c"><div class="bar"><i class="mid"></i><i class="val" id="jb${i}"></i></div></td></tr>`).join("");
})();
function drawJoint(i) {
    const d = num("J" + i), w = num("JV" + i);
    txt("jd" + i, Number.isFinite(d) ? d.toFixed(1) : "--");
    txt("jv" + i, Number.isFinite(w) ? w.toFixed(1) : "--");
    if (Number.isFinite(d)) {
        const el = $("jb" + i);
        const f = Math.max(-1, Math.min(1, d / 360));
        el.style.left = (f < 0 ? 50 + f * 50 : 50) + "%";
        el.style.width = Math.abs(f) * 50 + "%";
    }
}

// ---- the values -------------------------------------------------------------------
let drawPending = false;
function redraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; drawArm(); });
}

function paint(id) {
    const val = v[id];
    if (/^J[0-5]$/.test(id) || /^JV[0-5]$/.test(id)) { drawJoint(+id.slice(-1)); redraw(); return; }
    switch (id) {
    case "TCP_X": case "TCP_Y": case "TCP_Z":
        txt("tcp-p", `${num("TCP_X", 0).toFixed(1)}  ${num("TCP_Y", 0).toFixed(1)}  ${num("TCP_Z", 0).toFixed(1)} mm`);
        redraw();
        break;
    case "TCP_RX": case "TCP_RY": case "TCP_RZ":
        txt("tcp-r", `${num("TCP_RX", 0).toFixed(3)}  ${num("TCP_RY", 0).toFixed(3)}  ${num("TCP_RZ", 0).toFixed(3)} rad`);
        break;
    case "LINK": chip("c-link", val === "1" ? "ok" : "bad", val === "1" ? "dashboard" : "no dashboard"); break;
    case "ROBOTMODE":
        txt("mode", val || "--");
        chip("c-mode", val === "RUNNING" ? "ok" : val ? "wrn" : "", val || "robot mode");
        break;
    case "SAFETY": case "SAFETY_CODE": {
        const sv = v.SAFETY || "";
        txt("safety", sv || "--");
        const code = num("SAFETY_CODE", 0);
        chip("c-safety", !sv ? "" : code === 0 ? "ok" : code === 2 ? "wrn" : "bad", sv || "safety");
        $("banner").hidden = !sv || code === 0;
        txt("banner", code === 1 ? "PROTECTIVE STOP - inspect the cause; unlock is refused for 5 s, then play"
            : code === 2 ? "SAFEGUARD STOP - the guard door is open; close it, then play" : sv);
        $("banner").className = "banner " + (code === 2 ? "wrn" : "");
        break;
    }
    case "PSTATE": case "PROGRAM":
        txt("prog", `${v.PSTATE || "--"} ${v.PROGRAM || ""}`);
        chip("c-prog", v.PSTATE === "PLAYING" ? "ok" : v.PSTATE === "PAUSED" ? "wrn" : "", v.PSTATE ? v.PSTATE.toLowerCase() + " " + (v.PROGRAM || "") : "program");
        break;
    case "PSTEP": txt("pstep", val); break;
    case "GRIPPER": txt("grip", val === "1" ? "closed" : "open"); lamp("l130", val === "1"); redraw(); break;
    case "PART_READY": lamp("l128", val === "1"); break;
    case "TAKEN": lamp("l131", val === "1"); break;
    case "INFEED": txt("infeed", val); redraw(); break;
    case "PLACED": txt("placed", val); redraw(); break;
    case "CYCLE_S": txt("cycle", num("CYCLE_S", 0).toFixed(1)); break;
    case "RATE": txt("rate", num("RATE", 0).toFixed(1)); break;
    case "MSG": txt("msg", val); break;
    case "FEED": $("feed").checked = val === "1"; txt("feed-txt", val === "1" ? "runs" : "off"); break;
    case "SPEED": if (!sliding) { $("speed").value = val; txt("speed-out", val); } break;
    case "POLLS": txt("polls", val); break;
    case "TIMEOUTS": txt("tmos", val); break;
    case "DASH_LOG": {
        let log = [];
        try { log = JSON.parse(val); } catch (e) { /* not yet */ }
        $("dlog").innerHTML = log.length ? log.slice().reverse().map((e) =>
            `<tr class="${/^(Failed|could not|Cannot|File not found)/.test(e.reply) ? "bad" : ""}"><td>${esc(e.t)}</td><td><code>${esc(e.cmd)}</code></td><td>${esc(e.reply)}</td></tr>`).join("")
            : `<tr><td colspan="3" class="muted">nothing yet</td></tr>`;
        break;
    }
    }
}
function lamp(id, on) { $(id).className = "lamp" + (on ? " on" : ""); }

// ---- MQTT ------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "cell-" + Math.random().toString(36).slice(2, 8));
mqtt.onstatus = (text, ok) => chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
mqtt.onconnect = () => { mqtt.subscribe(DOC + "/+/val"); mqtt.subscribe(DOC + "/+/sta"); };
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");
    if (p[3] === "val") { v[p[2]] = text; paint(p[2]); }
    else if (p[3] === "sta") s[p[2]] = text;
};
mqtt.connect();

function send(id, value, doc = DOC) { mqtt.publish(doc + "/" + id + "/val/set", String(value)); }

// ---- controls ----------------------------------------------------------------
document.querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = () => send("CMD", b.dataset.cmd); });
$("feed").onchange = () => send("FEED", $("feed").checked ? 1 : 0);
let sliding = false;
$("speed").addEventListener("input", () => { sliding = true; txt("speed-out", $("speed").value); });
$("speed").addEventListener("change", () => { sliding = false; send("SPEED", $("speed").value); });

// The world. The page cannot read ROB/S00 (this MQTT connection publishes
// CEL/S00 only), so the door's state is what we last asked for.
let doorOpen = false;
$("door").onclick = () => {
    doorOpen = !doorOpen;
    send("DOOR", doorOpen ? 1 : 0, "ROB/S00");
    $("door").textContent = doorOpen ? "Close the guard door" : "Open the guard door";
};
$("bump").onclick = () => send("BUMP", 1, "ROB/S00");
