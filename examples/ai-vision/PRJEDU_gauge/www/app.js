// =====================================================================
// app.js -- the gauge reader's page.
//
//   IN   GAU/S00/+/val and GAU/S00/+/sta over MQTT: the reader's findings
//        (ANGLE, CX, CY, CONF), its verdict (READ), and the picture's way
//        here, one of two (PATH, the page chooses):
//          PATH 1, 2  PIC is a blob: MQTT brings only its descriptor,
//                     {"blob":1,"len":13890,"fmt":"jpeg","seq":24,"tim":0},
//                     and the page fetches the bytes over HTTP,
//                     GET /blob/GAU/S00/PIC/val, when the seq has moved.
//          PATH 0     IMG is a PNG in a data: URL, the whole picture in
//                     the MQTT message (the old way).
//   OUT  GAU/S00/NOISE, METHOD, PATH and SIZE /val/set, and nothing
//        else - xdb_acl refuses the rest.
//
// The overlay is drawn from the reader's findings, not worked out here:
// if the green line is off the needle in the picture, the reader was off.
// =====================================================================
"use strict";

const DOC = "GAU/S00";
const $ = (id) => document.getElementById(id);
const v = {};                                   // last val of every element
const s = {};                                   // last sta
const num = (id, d = 0) => { const n = Number(v[id]); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
function alarmOf(sta) {                         // bits 0x000C of sta, as ALM.onlvl keeps them
    const a = parseInt(sta) & 0x000C;
    return a >= 0x0008 ? "alm" : a === 0x0004 ? "wrn" : "";
}
const okOf = (read) => (read || "").startsWith("ok");

// ---- what a picture costs: counted here, shown once a second -------------
// window.gauge is also what a test script reads (bytes so far, one row per
// picture shown).
const cost = window.gauge = { mqttBytes: 0, httpBytes: 0, shown: [] };
try { performance.setResourceTimingBufferSize(100000); } catch (e) { /* older browsers */ }
new PerformanceObserver((list) => {             // HTTP: headers + body of every /blob/ answer
    for (const e of list.getEntries())
        if (e.name.includes("/blob/")) cost.httpBytes += e.transferSize || e.encodedBodySize || 0;
    performance.clearResourceTimings();
}).observe({ type: "resource", buffered: true });
const history = [];                             // {t, mqtt, http} once a second
setInterval(() => {
    const now = Date.now();
    history.push({ t: now, mqtt: cost.mqttBytes, http: cost.httpBytes });
    while (history.length > 11) history.shift();
    const a = history[0], b = history[history.length - 1], dt = (b.t - a.t) / 1000;
    if (dt > 0) {
        txt("k-mqtt", ((b.mqtt - a.mqtt) / dt / 1024).toFixed(1));
        txt("k-http", ((b.http - a.http) / dt / 1024).toFixed(1));
    }
    const last = cost.shown.filter((r) => now - r.t < 10000);
    txt("k-fps", last.length ? (last.length / 10).toFixed(1) : "0");
    const ages = last.map((r) => r.age).filter(Number.isFinite).sort((x, y) => x - y);
    txt("k-age", ages.length ? Math.round(ages[ages.length >> 1]) : "--");
    if (last.length) txt("k-pic", (last[last.length - 1].bytes / 1024).toFixed(1));
}, 1000);

// ---- the overlay: what the reader found in the frame being shown ---------
let shownSnap = null;                           // the reader's findings for the picture on screen
function snap() {                               // taken when a frame is done, kept with its picture
    return { angle: num("ANGLE"), cx: num("CX", 120), cy: num("CY", 120), ok: okOf(v.READ),
             rx: num("ROI_X"), ry: num("ROI_Y"), cap: num("CAP"), t: num("SEEN"), r: num("PRESS") };
}
function overlay() {
    const f = shownSnap;
    if (!f) return;
    const cx = f.rx + f.cx, cy = f.ry + f.cy, R = num("CAL_R", 100);
    const pt = (deg, r) => {
        const a = deg * Math.PI / 180;          // clockwise from 12 o'clock
        return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    };
    const a0 = num("CAL_A0", -135), a1 = num("CAL_A1", 135), ra = R * 0.93;
    const [x0, y0] = pt(a0, ra), [x1, y1] = pt(a1, ra);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    $("o-arc").setAttribute("d", `M${x0.toFixed(1)},${y0.toFixed(1)} A${ra},${ra} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`);
    const [nx, ny] = pt(f.angle, R * 0.82);
    const n = $("o-needle");
    n.setAttribute("x1", cx); n.setAttribute("y1", cy);
    n.setAttribute("x2", nx.toFixed(1)); n.setAttribute("y2", ny.toFixed(1));
    n.setAttribute("class", f.ok ? "" : "bad");
    $("o-centre").setAttribute("transform", `translate(${cx},${cy})`);
}
$("show").addEventListener("change", () => $("overlay").classList.toggle("off", !$("show").checked));

// ---- the trend: two minutes, one point a second ---------------------------
const trend = [];                               // {t: true, r: read, ok}
const W = 600, H = 200, KEEP = 120;
const ty = (bar) => (H - 10 - bar * 17.5).toFixed(1);  // 0..10 bar -> 190..15
(function grid() {
    let g = "";
    for (let b = 0; b <= 10; b += 2)
        g += `<line x1="0" x2="${W}" y1="${ty(b)}" y2="${ty(b)}"/><text x="4" y="${ty(b) - 3}">${b}</text>`;
    g += `<line class="wrn" x1="0" x2="${W}" y1="${ty(8.5)}" y2="${ty(8.5)}"/>`;
    g += `<line class="alm" x1="0" x2="${W}" y1="${ty(9)}" y2="${ty(9)}"/>`;
    $("t-grid").innerHTML = g;
})();
let trendAt = 0, trendBad = false;
function addTrend(f) {                          // ten frames a second: one point a second,
    trendBad = trendBad || !f.ok;               // marked if any frame in it was not used
    const now = Date.now();
    if (now - trendAt < 900) return;
    trendAt = now;
    trend.push({ t: f.t, r: f.r, ok: !trendBad });
    trendBad = false;
    if (trend.length > KEEP) trend.shift();
    const x = (i) => (W - (trend.length - 1 - i) * (W / (KEEP - 1))).toFixed(1);
    $("t-true").setAttribute("points", trend.map((p, i) => `${x(i)},${ty(p.t)}`).join(" "));
    $("t-read").setAttribute("points", trend.map((p, i) => `${x(i)},${ty(p.r)}`).join(" "));
    $("t-bad").innerHTML = trend.map((p, i) => p.ok ? "" : `<text x="${x(i)}" y="${ty(p.r) - 4}">&times;</text>`).join("");
}

// ---- the picture ------------------------------------------------------------
// A frame is done when its picture is written (the last thing Python does):
// IMG on PATH 0, PIC's descriptor on PATH 1 and 2. Its findings are taken
// then, and shown with its picture.
let connectedAt = 0;
function show(url, f, bytes, path, seq) {
    const img = $("img");
    img.onload = () => {
        const age = Date.now() - f.cap;
        if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
        img.dataset.url = url.startsWith("blob:") ? url : "";
        const w = img.naturalWidth, h = img.naturalHeight;
        $("frame").style.aspectRatio = w + " / " + h;
        $("overlay").setAttribute("viewBox", `0 0 ${w} ${h}`);
        $("no-img").style.display = "none";
        shownSnap = f;
        overlay();
        // the frame that comes with the subscription (retain) is an old one
        if (Date.now() - connectedAt < 1500) return;
        cost.shown.push({ t: Date.now(), age, bytes, path, seq, w });
        if (cost.shown.length > 5000) cost.shown.shift();
        addTrend(f);
    };
    img.src = url;
}

// PATH 1, 2: fetch the bytes when the descriptor says there is a new frame.
// One fetch at a time: a frame that arrives meanwhile is fetched next, and
// the engine always answers with the newest - a slow page skips frames, it
// does not fall behind.
const frames = new Map();                       // seq -> findings, until its picture is shown
let wantSeq = 0, busy = false;
function onPic(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return; }
    if (!d || !d.blob || !d.seq) return;        // cleared (null), or not numbered
    frames.set(d.seq, snap());
    wantSeq = d.seq;
    txt("src", `GET /blob/${DOC}/PIC/val - ${d.fmt}, ${(d.len / 1024).toFixed(1)} KB, seq ${d.seq}`);
    if (!busy) fetchPic();
}
async function fetchPic() {
    busy = true;
    const want = wantSeq;
    try {
        const r = await fetch(`/blob/${DOC}/PIC/val`, { cache: "no-store" });
        if (r.ok) {
            const seq = Number(r.headers.get("X-Blob-Seq"));
            const b = await r.blob();
            const f = frames.get(seq) || snap();
            for (const k of frames.keys()) if (k <= seq) frames.delete(k);
            show(URL.createObjectURL(b), f, b.size, num("PATH"), seq);
        }
    } catch (e) { /* the engine went away; the next descriptor tries again */ }
    busy = false;
    if (wantSeq !== want) fetchPic();
}

// PATH 0: the picture is the message.
function onImg(text) {
    if (!text) return;
    txt("src", `${DOC}/IMG/val over MQTT - a PNG in a data: URL, ${(text.length / 1024).toFixed(1)} KB of text`);
    show(text, snap(), text.length, 0, num("FRAMES"));
}

// ---- painting -------------------------------------------------------------
function paint(id) {
    const val = v[id];
    switch (id) {
    case "PIC": onPic(val); break;
    case "IMG": onImg(val); break;
    case "PRESS": txt("v-PRESS", num("PRESS").toFixed(2)); break;
    // SEEN, not TRUE: the true pressure when this frame was taken. TRUE
    // itself moves on twice a second and would not match the picture.
    case "SEEN":  txt("v-SEEN", num("SEEN").toFixed(2)); break;
    case "ERR": {
        const e = num("ERR");
        txt("v-ERR", (e >= 0 ? "+" : "") + e.toFixed(2));
        break;
    }
    case "ANGLE": txt("v-ANGLE", num("ANGLE").toFixed(1)); break;
    case "CAL_R": case "CAL_A0": case "CAL_A1": overlay(); break;
    case "COMP": txt("v-COMP", num("COMP") === 1 ? "running" : "stopped"); break;
    case "CONF": case "CONF_MIN":
        txt("v-CONF", num("CONF").toFixed(2)); txt("v-CONF_MIN", num("CONF_MIN").toFixed(2));
        $("conf-fill").style.width = Math.min(100, num("CONF") * 100) + "%";
        $("conf-min").style.left = num("CONF_MIN") * 100 + "%";
        break;
    case "READ": {
        const ok = okOf(val);
        txt("v-READ", val || "-");
        $("v-READ").className = "read mono" + (ok ? "" : " bad");
        chip("c-read", ok ? "ok" : "bad", ok ? "READ ok" : "NOT USED");
        break;
    }
    case "FRAMES": txt("v-FRAMES", val); break;
    case "REJECTS": txt("v-REJECTS", val); break;
    case "MS": txt("v-MS", num("MS").toFixed(1)); break;
    case "LIGHT": txt("v-LIGHT", num("PATH") === 0 ? "-" : num("LIGHT").toFixed(1)); break;
    case "FRAME_AT": txt("v-FRAME_AT", val || "--"); break;
    case "SAME": txt("v-SAME", num("SAME") === 1 ? "the same address" : "somewhere else"); break;
    case "NOISE": case "METHOD": case "PATH": case "SIZE": {
        const key = { NOISE: "n", METHOD: "m", PATH: "p", SIZE: "s" }[id];
        document.querySelectorAll(`#${id.toLowerCase()} button`).forEach((b) =>
            b.classList.toggle("on", Number(b.dataset[key]) === Math.round(num(id))));
        if (id === "PATH" && num("PATH") === 0) {
            txt("v-LIGHT", "-"); txt("v-FRAME_AT", "not a blob on PATH 0"); txt("v-SAME", "its own array");
        } else if (id === "PATH") {             // back to a blob: these did not change, so no message repaints them
            paint("LIGHT"); paint("FRAME_AT"); paint("SAME");
        }
        break;
    }
    }
}

function paintSta(id) {
    const a = alarmOf(s[id]);
    const word = a === "alm" ? "alarm" : a === "wrn" ? "warning" : "";
    if (id === "PRESS") {
        const el = $("s-PRESS"); el.className = "state " + a; el.textContent = word;
        chip("c-press", a === "alm" ? "bad" : a === "wrn" ? "wrn" : "ok", "PRESS " + (word || "normal"));
    }
    if (id === "CONF") {
        const el = $("s-CONF"); el.className = "state " + a; el.textContent = word ? "low" : "";
        $("conf-fill").className = a;
    }
}

// ---- MQTT ------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "gauge-" + Math.random().toString(36).slice(2, 8));
const receive = mqtt._receive.bind(mqtt);       // count every byte MQTT brings
mqtt._receive = (bytes) => { cost.mqttBytes += bytes.length; receive(bytes); };
mqtt.onstatus = (text, ok) => chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
mqtt.onconnect = () => {
    connectedAt = Date.now();
    mqtt.subscribe(DOC + "/+/val");
    mqtt.subscribe(DOC + "/+/sta");
};
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");                 // GAU, S00, PRESS, val
    if (p[3] === "val") { v[p[2]] = text; paint(p[2]); }
    else if (p[3] === "sta") { s[p[2]] = text; paintSta(p[2]); }
};
mqtt.connect();

for (const [id, key] of [["noise", "n"], ["method", "m"], ["path", "p"], ["size", "s"]])
    document.querySelectorAll(`#${id} button`).forEach((b) =>
        b.addEventListener("click", () => mqtt.publish(`${DOC}/${id.toUpperCase()}/val/set`, b.dataset[key])));
