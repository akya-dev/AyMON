// =====================================================================
// app.js - the dashboard of PRJPER_phone.
//
// It subscribes to the val and sta of every element of PHN/S00 and draws
// one card per phone from them. A phone's elements are named after it -
// P_k3x9q, P_k3x9q_VIB, P_k3x9q_TILT ... - so the topic alone says which
// phone and which quantity:  PHN/S00/P_k3x9q_VIB/sta  =  "0x034B".
// LIST says which phones there are (the engine rewrites it when one comes
// or goes), LIMITS_NOW the limits in force.
//
// The page knows no limit and decides no alarm: a colour here is a 'sta'
// word the engine published.
// =====================================================================
"use strict";

const DOC = "PHN/S00";
const $ = (id) => document.getElementById(id);

// On this PC (127.0.0.1:8111) the session is role 3 and may write; through
// the phones' door (8110) it is role 0 and the engine refuses the writes.
// The page only mirrors that, so nobody presses a button that cannot work.
const OPERATOR = location.port === "8111";

const vals = {};           // element id -> last val text
const stas = {};           // element id -> last sta number
const hist = {};           // phone id -> VIB values, one per half second
let phones = [];           // [{id, name, kind}] from LIST
let limits = null;         // {"VIB":[w,a], ...} from LIMITS_NOW

const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const m = new MqttLite(url, "dash-" + Math.random().toString(36).slice(2, 8), 20);

m.onstatus = (text, ok) => {
    const c = $("c-live");
    c.textContent = ok ? "live" : text;
    c.className = "chip " + (ok ? "ok" : "bad");
};
m.onconnect = () => {
    m.subscribe(`${DOC}/+/val`);
    m.subscribe(`${DOC}/+/sta`);
    m.subscribe(`${DOC}/+/chg`);
};
m.onmessage = (topic, text) => {
    const p = topic.split("/");
    if (p.length < 4) return;
    const id = p[2], attr = p[3];
    if (attr === "sta") stas[id] = Number(text);
    else if (attr === "chg") vals[id + "/chg"] = text;
    else vals[id] = text;

    if (id === "LIST" && attr === "val") {
        try { phones = JSON.parse(text); } catch (e) { phones = []; }
        build();
    } else if (id === "LIMITS_NOW" && attr === "val") {
        try { limits = JSON.parse(text); showLimits(); } catch (e) { /* not yet */ }
    } else if (id === "MSG" && attr === "val" && text) {
        addMsg(text);
    } else if (id === "COUNT" && attr === "val") {
        const c = $("c-count");
        c.textContent = text + (text === "1" ? " phone" : " phones");
        c.className = "chip" + (Number(text) > 0 ? " ok" : "");
    }
};

// ---- helpers ---------------------------------------------------------------------
function level(id) {
    const s = stas[id];
    if (s === undefined || isNaN(s)) return -1;
    if ((s & 3) !== 3) return -1;            // not running: no data
    return (s >> 2) & 3;
}
const cls = (l) => (l >= 2 ? "alm" : l === 1 ? "wrn" : l === 0 ? "ok" : "");
function num(id, d) {
    const t = vals[id];
    return t === undefined || t === "" || isNaN(Number(t)) ? "--" : Number(t).toFixed(d);
}
function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- the phone cards ------------------------------------------------------------------
function build() {
    const box = $("phones");
    const want = new Set(phones.map((p) => p.id));
    for (const el of Array.from(box.children)) if (!want.has(el.dataset.id)) el.remove();
    for (const p of phones) {
        let card = box.querySelector(`[data-id="${p.id}"]`);
        if (!card) {
            card = document.createElement("section");
            card.className = "card ph";
            card.dataset.id = p.id;
            card.innerHTML = `
              <div class="ph-head"><span class="ph-name"></span><span class="ph-id">${esc(p.id)}</span></div>
              <canvas class="spark" width="600" height="112"></canvas>
              <div class="ph-grid">
                <div class="cell" data-q="VIB"><div class="k">vibration</div><div class="v">--</div></div>
                <div class="cell" data-q="TILT"><div class="k">tilt °</div><div class="v">--</div></div>
                <div class="cell" data-q="HEAD"><div class="k">heading °</div><div class="v">--</div></div>
                <div class="cell" data-q="BAT"><div class="k">battery %</div><div class="v">--</div></div>
                <div class="cell" data-q="DROP"><div class="k">drops</div><div class="v">--</div></div>
                <div class="cell" data-q="LINK"><div class="k">link</div><div class="v">--</div></div>
              </div>
              <div class="ph-foot"><span class="pos"></span>
                <span class="btns"><button class="small buzz">buzz</button><button class="small reset">reset drops</button></span></div>`;
            card.querySelector(".buzz").addEventListener("click", () => write("BUZZ", p.id + " " + Date.now()));
            card.querySelector(".reset").addEventListener("click", () => write("RESET", p.id + " " + Date.now()));
            card.querySelectorAll("button").forEach((b) => { b.disabled = !OPERATOR; });
            box.appendChild(card);
        }
        card.querySelector(".ph-name").textContent = (p.name || "a phone") + (p.kind ? ` (${p.kind})` : "");
    }
}

function drawCard(card) {
    const id = card.dataset.id;
    const set = (q, text, l) => {
        const c = card.querySelector(`[data-q="${q}"]`);
        c.querySelector(".v").textContent = text;
        c.className = "cell " + cls(l);
    };
    set("VIB", num(id + "_VIB", 2), level(id + "_VIB"));
    set("TILT", num(id + "_TILT", 0), level(id + "_TILT"));
    set("HEAD", num(id + "_HEAD", 0), -1);
    set("BAT", vals[id + "_BAT"] === undefined ? "n/a" : num(id + "_BAT", 0) + (vals[id + "/chg"] ? " ⚡" : ""), level(id + "_BAT"));
    set("DROP", num(id + "_DROP", 0), level(id + "_DROP"));
    const up = vals[id] === "1";
    set("LINK", up ? "up" : "down", up ? 0 : 2);

    // the card's edge: the worst of its elements
    let worst = 0;
    for (const q of ["", "_VIB", "_TILT", "_BAT", "_DROP"]) worst = Math.max(worst, level(id + q));
    card.className = "card ph " + cls(worst) + (up ? "" : " off");

    const pos = vals[id + "_POS"];
    const pe = card.querySelector(".pos");
    if (pos) {
        const [lat, lon, acc] = pos.split(",");
        pe.innerHTML = `<a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&amp;mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}"
                         target="_blank" rel="noopener">${esc(lat)}, ${esc(lon)}</a> ±${esc(acc)} m`;
    } else pe.textContent = "position not shared";

    spark(card.querySelector(".spark"), hist[id] || []);
}

// VIB over the last minute, with the two limits as lines.
function spark(cv, h) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, W, H);
    const lim = limits && limits.VIB ? limits.VIB : [1.5, 4];
    const top = Math.max(lim[1] * 1.5, ...h.map((v) => v || 0), 1);
    const y = (v) => H - 4 - (v / top) * (H - 8);
    ctx.lineWidth = 2;
    for (const [v, c] of [[lim[0], "--wrn"], [lim[1], "--alm"]]) {
        ctx.strokeStyle = css.getPropertyValue(c);
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(0, y(v)); ctx.lineTo(W, y(v)); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = css.getPropertyValue("--accent");
    ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 120;
    h.forEach((v, i) => {
        const x = W - (h.length - 1 - i) * (W / (n - 1));
        if (i === 0) ctx.moveTo(x, y(v)); else ctx.lineTo(x, y(v));
    });
    ctx.stroke();
}

// Twice a second: take the latest VIB of every phone into its history and
// redraw. Values arrive only when they change, so the history carries the
// last one forward.
setInterval(() => {
    for (const p of phones) {
        const a = hist[p.id] || (hist[p.id] = []);
        const v = Number(vals[p.id + "_VIB"]);
        a.push(vals[p.id] === "1" && Number.isFinite(v) ? v : null);
        if (a.length > 120) a.shift();
    }
    document.querySelectorAll("#phones .ph").forEach(drawCard);
}, 500);

// ---- writing: three requests, and only on this PC ---------------------------------------
function write(id, value) {
    if (m.connected) m.publish(`${DOC}/${id}/val/set`, String(value));
}

function showLimits() {
    for (const k of ["VIB", "TILT", "BAT"]) {
        if (!limits[k]) continue;
        for (const i of [0, 1]) {
            const el = $(`l-${k}-${i}`);
            if (document.activeElement !== el) el.value = limits[k][i];
        }
    }
}

// Only the pairs that changed: the engine checks each on its own and says
// what it did with it.
$("l-apply").addEventListener("click", () => {
    const req = {};
    for (const k of ["VIB", "TILT", "BAT"]) {
        const pair = [Number($(`l-${k}-0`).value), Number($(`l-${k}-1`).value)];
        if (!limits || !limits[k] || pair[0] !== limits[k][0] || pair[1] !== limits[k][1]) req[k] = pair;
    }
    const n = Object.keys(req).length;
    if (n) write("LIMITS", JSON.stringify(req));
    $("l-note").textContent = n ? "sent - the engine answers in the list below" : "nothing changed";
    setTimeout(() => { $("l-note").textContent = ""; }, 4000);
});

// ---- the engine's messages -----------------------------------------------------------------
function addMsg(text) {
    const li = document.createElement("li");
    const t = new Date();
    li.innerHTML = `<time>${t.toTimeString().slice(0, 8)}</time>`;
    li.appendChild(document.createTextNode(text));
    const ul = $("msgs");
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 40) ul.lastChild.remove();
}

// ---- start ---------------------------------------------------------------------------------
const role = $("c-role");
role.textContent = OPERATOR ? "operator (role 3)" : "read-only (role 0)";
role.className = "chip " + (OPERATOR ? "ok" : "wrn");
if (!OPERATOR) {
    $("ro-note").hidden = false;
    document.querySelectorAll(".limits input, .limits button").forEach((e) => { e.disabled = true; });
}
if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
    $("phone-url").textContent = `https://${location.hostname}:8110/phone.html`;
    $("phone-url-note").textContent = "";
}
m.connect();
