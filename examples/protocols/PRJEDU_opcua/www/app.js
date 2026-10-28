// =====================================================================
// app.js -- the moulding machine's page.
//
//   IN   UA/S00/+/val       what the engine read from the machine, and
//                           its own STATUS / BROWSE / RES
//   IN   UA/S00/+/age       how old a value was when it reached the
//                           engine: now minus the machine's source
//                           timestamp (ms), written by main.age
//   OUT  UA/S00/REQ/val/set a request: {"id":n,"op":...,"v":...}. The
//                           engine carries it out on the right OPC UA
//                           session and answers in RES with the same id.
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const URL_MQTT = `ws://${location.host || "127.0.0.1:8102"}/mqtt`;
const STATES = ["STOPPED", "HEATING", "RUNNING"];

const v = {};                       // UA/S00/<id>/val
const trace = { P: [], S: [] };     // arrivals of MOULD_P / MOULD_S: {t, v}
const ages = { P: [], S: [] };      // their ages at the engine: {t, ms}
const WINDOW = 60000;

const m = new MqttLite(URL_MQTT, "page-" + Math.random().toString(36).slice(2, 8));
m.onstatus = (t, ok) => { const c = $("c-live"); c.textContent = ok ? "page live" : "page " + t; c.className = "chip " + (ok ? "ok" : "bad"); };
m.onconnect = () => { m.subscribe("UA/S00/+/val"); m.subscribe("UA/S00/+/age"); };
m.onmessage = (topic, text) => {
    const [, , id, attr] = topic.split("/");
    const k = id === "MOULD_P" ? "P" : id === "MOULD_S" ? "S" : null;
    if (attr === "age") { if (k) keep(ages[k], { t: Date.now(), ms: Number(text) }); return; }
    v[id] = text;
    if (k) keep(trace[k], { t: Date.now(), v: Number(text) });
    if (id === "STATUS") drawStatus();
    else if (id === "BROWSE") drawBrowse();
    else if (id === "RES") answered();
    else drawMachine();
};
m.connect();

// ---- the machine --------------------------------------------------------
const num = (k, d = 1) => v[k] === undefined || v[k] === "" ? "--" : Number(v[k]).toFixed(d);
function drawMachine() {
    const s = Number(v.STATE);
    const st = $("state");
    st.textContent = v.STATE === undefined ? "--" : STATES[s] || ("state " + s);
    st.className = "state s" + s;
    txt("job", v.JOB || "--");
    txt("mould", num("MOULD_S") + " C");
    txt("sp", num("SP") + " C");
    txt("cycle", v.CYCLE === undefined || Number(v.CYCLE) === 0 ? "--" : num("CYCLE", 2) + " s");
    txt("count", v.COUNT === undefined ? "--" : v.COUNT);
    // ZONES is the array as JSON text: "[185.2,194.3,203.4,212.5]"
    let zs = [];
    try { zs = JSON.parse(v.ZONES || "[]"); } catch (e) { /* not yet */ }
    $("zones").innerHTML = [0, 1, 2, 3].map((i) => {
        const z = zs[i], h = z === undefined ? 0 : Math.max(0, Math.min(100, Number(z) / 2.5));
        return `<div class="zone"><div class="bar"><i style="height:${h}%"></i></div><b>${z === undefined ? "--" : Number(z).toFixed(0)}</b><span>Z${i + 1}</span></div>`;
    }).join("");
    txt("z4", v.Z4 === undefined ? "--" : num("Z4") + " C");
}

// ---- one value, two ways ------------------------------------------------
function keep(list, item) {
    list.push(item);
    while (list.length && list[0].t < item.t - WINDOW) list.shift();
}

function stats(k) {
    const since = Date.now() - 30000;
    const a = ages[k].filter((p) => p.t >= since && p.ms >= 0).map((p) => p.ms).sort((x, y) => x - y);
    return { n: trace[k].filter((p) => p.t >= since).length,
             med: a.length ? a[Math.floor(a.length / 2)] : null, max: a.length ? a[a.length - 1] : null };
}

function drawChart() {
    const c = $("chart"), w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const all = trace.P.concat(trace.S);
    const now = Date.now();
    let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
    if (!all.length) { lo = 20; hi = 80; }
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const X = (t) => 40 + (w - 50) * (1 - (now - t) / WINDOW), Y = (y) => 10 + (h - 30) * (1 - (y - lo) / (hi - lo));
    g.strokeStyle = css.getPropertyValue("--grid"); g.fillStyle = css.getPropertyValue("--muted");
    g.font = "11px system-ui, sans-serif"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = lo + (hi - lo) * i / 4;
        g.beginPath(); g.moveTo(40, Y(y)); g.lineTo(w - 10, Y(y)); g.stroke();
        g.fillText(y.toFixed(1), 2, Y(y) + 4);
    }
    g.fillText("-60 s", 40, h - 4); g.fillText("now", w - 32, h - 4);
    // the subscription as a line, the poll as dots
    g.strokeStyle = css.getPropertyValue("--sub"); g.lineWidth = 2; g.beginPath();
    trace.S.forEach((p, i) => { i ? g.lineTo(X(p.t), Y(p.v)) : g.moveTo(X(p.t), Y(p.v)); });
    g.stroke();
    g.fillStyle = css.getPropertyValue("--poll");
    trace.P.forEach((p) => { g.beginPath(); g.arc(X(p.t), Y(p.v), 3, 0, 7); g.fill(); });
}

function drawCompare() {
    const ms = (x) => x === null ? "--" : x + " ms";
    for (const k of ["P", "S"]) {
        const s = stats(k), p = k.toLowerCase();
        txt(p + "-n", s.n);
        txt(p + "-age", s.med === null ? "--" : `median ${ms(s.med)}, max ${ms(s.max)}`);
    }
    let st = {};
    try { st = JSON.parse(v.STATUS || "{}"); } catch (e) { /* not yet */ }
    if (st.ua) {
        txt("p-eng", `${st.ua.snd} read requests, ${st.ua.rcv} answered`);
        txt("s-eng", `${st.uap.pub} notifications; the last one took ${st.uap.lag} ms from the server to the engine`);
    }
}
setInterval(() => { drawChart(); drawCompare(); }, 500);

// ---- the three connections ----------------------------------------------
// sta: the two low bits are the engine state, 3 = RUNNING (connected)
function drawStatus() {
    let st;
    try { st = JSON.parse(v.STATUS); } catch (e) { return; }
    const up = (s) => (s & 3) === 3;
    for (const [k, chip, cell, rq, name] of [["ua", "c-ua", "ua-st", "ua-rq", "CN_UA"], ["uap", "c-uap", "uap-st", "uap-rq", "CN_UAP"], ["uas", "c-uas", "uas-st", "uas-rq", "CN_UAS"]]) {
        const ok = up(st[k].sta);
        $(chip).textContent = name + (ok ? " connected" : " not connected");
        $(chip).className = "chip " + (ok ? "ok" : "bad");
        $(cell).innerHTML = ok ? '<span class="ok">connected</span>' : '<span class="bad">not connected</span>';
        txt(rq, `${st[k].snd} sent, ${st[k].rcv} answered`);
    }
    $("hint").innerHTML = up(st.uas.sta) ? "" :
        "CN_UAS is not connected. Is the machine running (run_machine.bat)? If its window says <b>CERT ... REFUSED</b>, "
        + "the machine does not trust this engine yet: move the file it names from <code>sim/pki/rejected/</code> to "
        + "<code>sim/pki/trusted/</code>. The engine tries again every 5 seconds.";
}

// ---- what the machine has ------------------------------------------------
function drawBrowse() {
    let b;
    try { b = JSON.parse(v.BROWSE); } catch (e) { return; }
    $("browse").innerHTML = b.map((n) => `<tr><td><code>${esc(n.id)}</code></td><td>${esc(n.name)}</td><td>${esc(n.cls)}</td></tr>`).join("");
}

// ---- requests -------------------------------------------------------------
let waiting = null;                 // {id, timer}
function request(op, value) {
    if (!m.connected) { txt("res", "the page is not connected"); return; }
    const id = Date.now();
    document.querySelectorAll("[data-op]").forEach((b) => { b.disabled = true; });
    waiting = { id, timer: setTimeout(() => done(`${op}: no answer in 8 s - is the engine running?`, false), 8000) };
    $("res").innerHTML = `${esc(op)} ...`;
    m.publish("UA/S00/REQ/val/set", JSON.stringify({ id, op, v: value }));
}
function done(text, ok) {
    if (waiting) clearTimeout(waiting.timer);
    waiting = null;
    document.querySelectorAll("[data-op]").forEach((b) => { b.disabled = false; });
    $("res").innerHTML = `<b class="${ok ? "ok" : "bad"}">${ok ? "done" : "not done"}</b> - ${esc(text)}`;
}
function answered() {
    let r;
    try { r = JSON.parse(v.RES); } catch (e) { return; }
    if (waiting && r.id === waiting.id) done(`${r.op}: ${r.text} (${r.ms} ms)`, r.ok);
}
document.querySelectorAll("[data-op]").forEach((b) => {
    b.onclick = () => {
        const op = b.dataset.op;
        if (op === "sp") request(op, Number($("in-sp").value));
        else if (op === "job") request(op, $("in-job").value);
        else if (op === "run" || op === "anon_run") request(op, b.dataset.v === "1");
        else request(op, null);
    };
});
