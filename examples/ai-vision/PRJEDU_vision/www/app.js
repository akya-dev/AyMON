// =====================================================================
// app.js -- the bottle inspection's page.
//
//   IN   VIS/S00/+/+ over MQTT: the counters and the last verdict (val),
//        the reject rate's alarm (sta), the camera connections' own fields
//        - sta, con_cam_rate, con_cam_in, con_cam_info, con_cam_err,
//        con_cam_crop - and the PRO.vision blocks of CN_SEN: their regions
//        (S_*/pro_adr), results (MOVE, GATE, LIGHT, SHIFT_*: val, sta) and
//        the camera device DV_SEN.
//        Pictures come over HTTP: the live view is an MJPEG stream the
//        browser shows by itself; SHOT and REJ0..REJ5 are fetched when
//        their descriptor's seq moves.
//   OUT  VIS/S00/INS_FPS, SPEED, VIEW_FPS, CAM_ON, SRC, RESET /val/set and
//        VIS/S00/SEN_REF/pro/set (a command) - nothing else: xdb_acl
//        refuses the rest.
// =====================================================================
"use strict";

const DOC = "VIS/S00";
const $ = (id) => document.getElementById(id);
const v = {};                                   // last val of every element
const num = (id, d = 0) => { const n = Number(v[id]); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
function alarmOf(sta) {                         // bits 0x000C of sta, as ALM.onlvl keeps them
    const a = parseInt(sta) & 0x000C;
    return a >= 0x0008 ? "alm" : a === 0x0004 ? "wrn" : "";
}

// ---- the live view ----------------------------------------------------------
// An <img> whose source is a multipart/x-mixed-replace stream shows every
// part as it arrives. If the stream ends (engine restarted), start it again.
const live = $("live");
function startLive() { live.src = `/blob/${DOC}/CN_VIEW/frm?stream=1&t=${Date.now()}`; }
live.onload = () => { if (staWord(cams.CN_CAM.sta)[0] !== "off") $("no-live").style.display = "none"; };
live.onerror = () => { $("no-live").style.display = ""; setTimeout(startLive, 2000); };
startLive();

function paintWin(crop) {                        // "x,y,w,h" in the 640 x 480 picture
    const p = String(crop || "").split(",").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return;
    const r = $("w-rect");
    r.setAttribute("x", p[0]); r.setAttribute("y", p[1]);
    r.setAttribute("width", p[2]); r.setAttribute("height", p[3]);
    $("w-text").setAttribute("x", p[0] + 4); $("w-text").setAttribute("y", Math.max(14, p[1] - 6));
}

// ---- the cameras' own fields ---------------------------------------------
// DV_SEN is CN_SEN's camera DEVICE: a device session writes its camera's
// numbers (con_cam_rate ..) on its <dev>, not on the <con>.
const cams = { CN_CAM: {}, CN_INS: {}, CN_VIEW: {}, DV_SEN: {} };
function staWord(sta) {
    const s = parseInt(sta);
    if (!Number.isFinite(s)) return ["", "-"];
    const eng = s & 0x0003, cmd = (s >> 8) & 0x000F;      // 0x000C are alarm bits, not the state
    if (cmd === 0) return ["off", "off"];
    if (eng === 3) return ["ok", "running"];
    if (eng === 2) return ["wrn", "waiting"];
    return ["wrn", "starting"];
}
function paintCam(id) {
    const c = cams[id], row = $("r-" + id);
    if (!row) return;
    const [cls, word] = staWord(c.sta);
    const st = row.querySelector(".st");
    st.textContent = word; st.className = "st " + cls;
    // a connection that is off writes no rate any more: its last one is stale
    const rate = (x) => (cls === "off" || x === undefined) ? "-" : x + "/s";
    row.querySelector(".rate").textContent = rate(c.con_cam_rate);
    row.querySelector(".in").textContent = rate(c.con_cam_in);
    const info = row.querySelector(".info");
    info.textContent = c.con_cam_info || "";
    info.title = c.con_cam_info || "";
    if (id === "CN_CAM") {
        chip("c-cam", cls === "ok" ? "ok" : cls === "off" ? "" : "wrn", "CAMERA " + word);
        // the stream stays open while the camera is off; it just sends nothing
        if (cls === "off") { $("no-live").textContent = "the camera is off - its views wait, idle"; $("no-live").style.display = ""; }
        else if (live.complete && live.naturalWidth) $("no-live").style.display = "none";
        const e = $("cam-err");
        e.hidden = !c.con_cam_err;
        e.textContent = c.con_cam_err ? "CN_CAM: " + c.con_cam_err : "";
    }
    if (id === "CN_INS" && c.con_cam_crop) paintWin(c.con_cam_crop);
    if (id === "DV_SEN") {
        const a = alarmOf(c.sta);                // ALM.devsta's bits on the device
        const el = $("s-DV_SEN");
        el.className = "state " + (a || (cls === "ok" ? "" : "wrn"));
        el.textContent = a ? "device " + (a === "alm" ? "alarm" : "warning") : cls === "ok" ? "" : word;
    }
    paintSpeed();
}

// ---- the line, watched without a script (PRO.vision on CN_SEN) -------------
// The blocks S_* send their region (pro_adr) and state; the results MOVE,
// GATE, LIGHT, SHIFT_* their val and sta (ALM.onlvl's bits).
const SEN = new Set(["S_MOVE", "S_GATE", "S_LIGHT", "S_SHIFT",
                     "MOVE", "GATE", "LIGHT", "SHIFT_SCORE", "SHIFT_DX", "SHIFT_DY"]);
const sen = {};
function senState(id) {                          // "off" = no frames, else alarm class
    const s = parseInt((sen[id] || {}).sta);
    if (!Number.isFinite(s) || (s & 0x0003) !== 3) return "off";
    return alarmOf(s) || "ok";
}
const senNum = (id) => Number((sen[id] || {}).val);
function word(id, cls, text) { const el = $(id); el.className = "word " + cls; el.textContent = text; }
function region(id, adr) {                       // "x,y,w,h" in the 640 x 480 picture
    const p = String(adr || "").split(",").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return;
    const r = $("o-" + id);
    r.setAttribute("x", p[0]); r.setAttribute("y", p[1]);
    r.setAttribute("width", p[2]); r.setAttribute("height", p[3]);
    r.dataset.x = p[0]; r.dataset.y = p[1];
    if (id === "S_SHIFT") paintSen("SHIFT_DX");
}
function paintSen(id) {
    switch (id) {
    case "MOVE": {
        const st = senState("MOVE");
        txt("k-MOVE", st === "off" ? "--" : (100 * senNum("MOVE")).toFixed(1));
        word("w-MOVE", st, st === "off" ? "no frames" : st === "ok" ? "moving" : "the line stands");
        break;
    }
    case "GATE": {
        const st = senState("GATE"), on = st !== "off" && senNum("GATE") >= 0.5;
        txt("k-GATE", st === "off" ? "--" : Math.round(100 * senNum("GATE")));
        $("lamp-GATE").className = "lamp" + (on ? " on" : "");
        $("o-S_GATE").classList.toggle("on", on);
        word("w-GATE", st === "off" ? "off" : "", st === "off" ? "no frames" : on ? "a bottle" : "nothing");
        break;
    }
    case "LIGHT": {
        const st = senState("LIGHT");
        txt("k-LIGHT", st === "off" ? "--" : senNum("LIGHT").toFixed(1));
        $("k-LIGHT").className = "mid " + (st === "wrn" ? "state wrn" : st === "alm" ? "state alm" : "");
        break;
    }
    case "SHIFT_SCORE": case "SHIFT_DX": case "SHIFT_DY": {
        const sts = ["SHIFT_SCORE", "SHIFT_DX", "SHIFT_DY"].map(senState);
        const off = sts.includes("off");
        const dx = senNum("SHIFT_DX"), dy = senNum("SHIFT_DY");
        txt("k-SHIFT_DX", off ? "--" : Math.round(dx));
        txt("k-SHIFT_DY", off ? "--" : Math.round(dy));
        txt("k-SHIFT_SCORE", off ? "--" : senNum("SHIFT_SCORE").toFixed(2));
        const worst = off ? "off" : sts.includes("alm") ? "alm" : sts.includes("wrn") ? "wrn" : "ok";
        word("w-SHIFT", worst, off ? "no frames" : worst === "ok" ? "in place"
            : senState("SHIFT_SCORE") !== "ok" ? "the bolt is not found" : "the camera moved");
        const r = $("o-S_SHIFT");                // the box where the bolt was found
        if (r.dataset.x !== undefined && !off) {
            r.setAttribute("x", Number(r.dataset.x) + dx);
            r.setAttribute("y", Number(r.dataset.y) + dy);
        }
        break;
    }
    }
}
// the light, once a second, the last minute
const spark = [];
setInterval(() => {
    if (senState("LIGHT") === "off") return;
    spark.push(senNum("LIGHT"));
    while (spark.length > 60) spark.shift();
    let lo = Math.min(...spark), hi = Math.max(...spark);
    if (hi - lo < 20) { const m = (hi + lo) / 2; lo = m - 10; hi = m + 10; }
    $("spark-l").setAttribute("points", spark.map((y, i) =>
        (i * 120 / 59).toFixed(1) + "," + (28 - 26 * (y - lo) / (hi - lo)).toFixed(1)).join(" "));
}, 1000);

// ---- how fast: the connections' own rates, bottles counted here ----------
const hist = [];                                // {t, ins, mis} once a second
setInterval(() => {
    hist.push({ t: Date.now(), ins: num("INSPECTED"), mis: num("MISSED") });
    while (hist.length > 6) hist.shift();
    const a = hist[0], b = hist[hist.length - 1], dt = (b.t - a.t) / 1000;
    if (dt <= 0) return;
    const ins = Math.max(0, b.ins - a.ins) / dt, mis = Math.max(0, b.mis - a.mis) / dt;
    txt("k-bpm", Math.round(ins * 60)); txt("k-bps", ins.toFixed(1));
    txt("k-mpm", Math.round(mis * 60));
}, 1000);
function paintSpeed() {
    const off = staWord(cams.CN_CAM.sta)[0] === "off";
    const r = (x) => (off || x === undefined) ? "--" : x;
    txt("k-cam", r(cams.CN_CAM.con_cam_rate));
    txt("k-ins", r(cams.CN_INS.con_cam_rate));
    txt("k-insin", r(cams.CN_INS.con_cam_in));
    txt("k-ask", num("SRC") === 1 ? "what the camera gives" : num("SPEED") + " frames/s");
}

// ---- pictures fetched by their seq ---------------------------------------
// One fetch at a time per picture; the engine always answers with the
// newest, so a slow page skips pictures instead of falling behind.
const pics = {};
function wantPic(id, desc, img, onshown) {
    let d;
    try { d = JSON.parse(desc); } catch (e) { return; }
    if (!d || !d.blob) return;                  // cleared
    const p = pics[id] || (pics[id] = { want: 0, have: -1, busy: false, img, onshown });
    p.want = d.seq;
    if (!p.busy && p.want !== p.have) fetchPic(id);
}
async function fetchPic(id) {
    const p = pics[id];
    p.busy = true;
    const want = p.want;
    try {
        const r = await fetch(`/blob/${DOC}/${id}/val`, { cache: "no-store" });
        if (r.ok) {
            const b = await r.blob();
            if (p.img.dataset.url) URL.revokeObjectURL(p.img.dataset.url);
            p.img.dataset.url = URL.createObjectURL(b);
            p.img.src = p.img.dataset.url;
            p.have = want;
            if (p.onshown) p.onshown();
        }
    } catch (e) { /* the engine went away; the next descriptor tries again */ }
    p.busy = false;
    if (p.want !== p.have) fetchPic(id);
}

// ---- the rejects ------------------------------------------------------------
const slots = [];                               // REJn -> its <img>, made once
function paintGallery() {
    let list = [];
    try { list = JSON.parse(v.REJ_INFO || "[]"); } catch (e) { return; }
    const g = $("gallery");
    g.innerHTML = "";
    if (!list.length) { g.innerHTML = '<div class="muted small">no reject yet</div>'; return; }
    for (const e of list) {
        const fig = document.createElement("figure");
        if (!slots[e.slot]) { slots[e.slot] = document.createElement("img"); slots[e.slot].alt = "reject"; }
        fig.appendChild(slots[e.slot]);
        const cap = document.createElement("figcaption");
        cap.innerHTML = `<b>${e.why}</b> <span class="muted">#${e.no} &middot; ${String(e.at).slice(11, 19)}</span>`;
        fig.appendChild(cap);
        g.appendChild(fig);
    }
}

// ---- painting -------------------------------------------------------------
const COUNTS = ["GOOD", "NOCAP", "WRONGCAP", "CAPHIGH", "LOWFILL", "MISSED"];
function paintCounts() {
    const total = COUNTS.reduce((s, k) => s + num(k), 0) || 1;
    for (const k of COUNTS) $("b-" + k).style.width = (100 * num(k) / total).toFixed(1) + "%";
}
function paint(id) {
    const val = v[id];
    switch (id) {
    case "SHOT":
        wantPic("SHOT", val, $("shot"), () => { $("no-shot").style.display = "none"; });
        break;
    case "LAST": {
        const ok = val === "OK";
        txt("v-LAST", val || "--");
        $("v-LAST").className = "verdict " + (val ? (ok ? "ok" : "bad") : "");
        break;
    }
    case "REJ_PCT":
        txt("v-REJ_PCT", Math.round(num("REJ_PCT")));
        $("rej-fill").style.width = Math.min(100, num("REJ_PCT")) + "%";
        break;
    case "REJ_INFO": paintGallery(); break;
    case "LEVEL": case "CAP_Y": case "FILL_Y_MAX": case "CAP_Y_MIN":
        txt("v-" + id, Math.round(num(id))); break;
    case "MS": txt("v-MS", num("MS")); txt("k-ms", num("MS")); break;
    case "INSPECTED": case "PASSED": txt("v-" + id, val); break;
    case "INS_FPS": case "VIEW_FPS": case "CAM_ON": case "SRC": case "SPEED":
        document.querySelectorAll(`#${id.toLowerCase()} button`).forEach((b) =>
            b.classList.toggle("on", Number(b.dataset.v) === num(id)));
        if (id === "SPEED" || id === "SRC") paintSpeed();
        break;
    default:
        if (COUNTS.includes(id)) { txt("v-" + id, val); paintCounts(); }
        else if (/^REJ[0-5]$/.test(id)) {
            const n = Number(id.slice(3));
            if (!slots[n]) { slots[n] = document.createElement("img"); slots[n].alt = "reject"; }
            wantPic(id, val, slots[n]);
        }
    }
}
function paintSta(id, sta) {
    if (id !== "REJ_PCT") return;
    const a = alarmOf(sta);
    const word = a === "alm" ? "alarm" : a === "wrn" ? "warning" : "";
    const el = $("s-REJ"); el.className = "state " + a; el.textContent = word;
    $("rej-fill").className = a;
    chip("c-rej", a === "alm" ? "bad" : a === "wrn" ? "wrn" : "ok", "REJECTS " + (word || "normal"));
}

// ---- MQTT ------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "vision-" + Math.random().toString(36).slice(2, 8));
mqtt.onstatus = (text, ok) => chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
mqtt.onconnect = () => { mqtt.subscribe(DOC + "/+/+"); };
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");                 // VIS, S00, CN_CAM, con_cam_rate
    const id = p[2], atr = p[3];
    if (cams[id]) { cams[id][atr] = text; paintCam(id); return; }
    if (SEN.has(id)) {
        (sen[id] || (sen[id] = {}))[atr] = text;
        if (atr === "pro_adr" && id.startsWith("S_")) region(id, text);
        else if (atr === "val" || atr === "sta") paintSen(id);
        return;
    }
    if (atr === "val") { v[id] = text; paint(id); }
    else if (atr === "sta") paintSta(id, text);
};
mqtt.connect();

const set = (id, value) => mqtt.publish(`${DOC}/${id}/val/set`, String(value));
for (const id of ["ins_fps", "speed", "view_fps", "cam_on", "src"])
    document.querySelectorAll(`#${id} button`).forEach((b) =>
        b.addEventListener("click", () => set(id.toUpperCase(), b.dataset.v)));
$("reset").addEventListener("click", () => set("RESET", Date.now() % 1000000));
// a command, not a value: PRO.out sends "ref" to the camera device and
// stores nothing - any value does
$("sen_ref").addEventListener("click", () => mqtt.publish(`${DOC}/SEN_REF/pro/set`, String(Date.now() % 1000000)));
