// =====================================================================
// app.js -- the ADS-B map.
//
//   IN   TRK/S00/+/val over MQTT; the connection answers the subscription
//        with every current value (pro_retain), so a page opened late
//        still has the whole sky at once.
//   OUT  nothing. TRK/S00 is read-only for a page.
//
// SNAP is the tracker's picture: once a second, every <ac> element under
// SKY with all its attributes, as JSON. The page draws it; the only thing
// it keeps itself is the trails - the positions it has seen - because the
// tracker holds where an aircraft IS, not where it was.
// =====================================================================
"use strict";

const DOC = "TRK/S00";
const $ = (id) => document.getElementById(id);
const v = {};
const num = (x, d = NaN) => { const n = parseFloat(x); return Number.isFinite(n) ? n : d; };
function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
function chip(id, cls, text) { const el = $(id); el.className = "chip " + cls; if (text) el.textContent = text; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EMERGENCY = { 7500: "hijack", 7600: "radio failure", 7700: "emergency" };

// ---- where things are ---------------------------------------------------------
// The same flat earth as the tracker: fine within a few hundred km.
function xy(lat, lon) {
    const lat0 = num(v.HOME_LAT, 0), lon0 = num(v.HOME_LON, 0);
    const k = R / num($("zoom").value, 260);               // km -> map units
    const dy = (lat - lat0) * 110.57, dx = (lon - lon0) * 111.32 * Math.cos(lat0 * Math.PI / 180);
    return [dx * k, -dy * k];
}

// ---- the grid: range rings, compass --------------------------------------
const R = 262;                   // the range, in map units (the map is -300..300: room for labels)
function drawGrid() {
    const range = num($("zoom").value, 260);
    const k = R / range;
    const step = range > 300 ? 100 : range > 150 ? 50 : 25;
    let g = "";
    for (let r = step; r <= range; r += step)
        g += `<circle r="${(r * k).toFixed(1)}"/><text class="ring" x="3" y="${(-r * k + 11).toFixed(1)}">${r}</text>`;
    g += `<line x1="-300" x2="300" y1="0" y2="0"/><line x1="0" x2="0" y1="-300" y2="300"/>`;
    g += `<text class="cmp" x="0" y="-286">N</text><text class="cmp" x="288" y="4">E</text>`;
    g += `<text class="cmp" x="0" y="296">S</text><text class="cmp" x="-288" y="4">W</text>`;
    g += `<path class="home" d="M0,-7 L6,5 L-6,5 Z"><title>the receiver</title></path>`;
    $("m-grid").innerHTML = g;
}
$("zoom").onchange = () => { drawGrid(); draw(); };

// ---- the sky ---------------------------------------------------------------
let sky = [];                    // the last SNAP
const trails = new Map();        // hex -> [[lat, lon], ...] up to TRAIL points
const TRAIL = 60;
let selected = null;             // hex

function band(a) {
    if (EMERGENCY[a.sq]) return "em";
    return a.alt < 10000 ? "lo" : a.alt < 25000 ? "mid" : "hi";
}

function useSnap(text) {
    let list;
    try { list = JSON.parse(text); } catch (e) { return; }
    if (!Array.isArray(list)) return;
    // SNAP carries attributes as the engine holds them: text, apart from
    // the XDB fields (val, sta). Numbers here, once.
    sky = list.map((e) => ({
        hex: e.hex, cs: e.cs || "", alt: num(e.alt), gs: num(e.gs), trk: num(e.trk), vr: num(e.vr),
        lat: num(e.lat), lon: num(e.lon), dist: num(e.dist), brg: num(e.brg),
        sq: parseInt(e.val) || 0, sta: parseInt(e.sta) || 0, msgs: parseInt(e.msgs) || 0, seen: num(e.seen, 0),
    }));
    const alive = new Set();
    for (const a of sky) {
        alive.add(a.hex);
        if (!Number.isFinite(a.lat)) continue;
        let t = trails.get(a.hex);
        if (!t) trails.set(a.hex, (t = []));
        const last = t[t.length - 1];
        if (!last || last[0] !== a.lat || last[1] !== a.lon) t.push([a.lat, a.lon]);
        if (t.length > TRAIL) t.splice(0, t.length - TRAIL);
    }
    for (const hex of [...trails.keys()]) if (!alive.has(hex)) trails.delete(hex);   // the tracker forgot it
    if (selected && !alive.has(selected)) selected = null;
    draw();
}

function draw() {
    let tr = "", pl = "";
    for (const a of sky) {
        if (!Number.isFinite(a.lat)) continue;                   // heard, but no position yet
        const b = band(a);
        const t = trails.get(a.hex) || [];
        if (t.length > 1)
            tr += `<polyline class="${b}" points="${t.map((p) => xy(p[0], p[1]).map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`;
        const [x, y] = xy(a.lat, a.lon);
        const rot = Number.isFinite(a.trk) ? a.trk : 0;
        const sel = a.hex === selected ? " sel" : "";
        const fl = Number.isFinite(a.alt) ? "FL" + String(Math.round(a.alt / 100)).padStart(3, "0") : "";
        pl += `<g class="ac ${b}${sel}" data-hex="${esc(a.hex)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`
            + `<path transform="rotate(${rot.toFixed(0)})" d="M0,-9 L2,-2 L9,2 L9,4 L2,2 L1.5,7 L4,9 L4,10 L0,9 L-4,10 L-4,9 L-1.5,7 L-2,2 L-9,4 L-9,2 L-2,-2 Z"/>`
            + (x > 170   // on the right edge the label goes to the left of the aircraft
                ? `<text class="l" x="-11" y="-2">${esc(a.cs || a.hex)}</text><text class="fl l" x="-11" y="9">${fl}</text>`
                : `<text x="11" y="-2">${esc(a.cs || a.hex)}</text><text class="fl" x="11" y="9">${fl}</text>`)
            + `<title>${esc(a.cs || a.hex)} ${fl} ${Number.isFinite(a.gs) ? a.gs + " kt" : ""}</title></g>`;
    }
    $("m-trails").innerHTML = tr;
    $("m-planes").innerHTML = pl;
    drawTable();
    drawSelected();
}

function drawTable() {
    // age: against the newest message in the snapshot, not the page's clock -
    // the engine's clock and the browser's need not agree
    const newest = Math.max(0, ...sky.map((a) => a.seen));
    const rows = [...sky].sort((p, q) => (Number.isFinite(p.dist) ? p.dist : 1e9) - (Number.isFinite(q.dist) ? q.dist : 1e9));
    const f = (x, n = 0) => (Number.isFinite(x) ? x.toFixed(n) : "");
    let h = "";
    for (const a of rows) {
        const cls = (EMERGENCY[a.sq] ? "em" : "") + (a.hex === selected ? " sel" : "");
        const vr = !Number.isFinite(a.vr) || a.vr === 0 ? "" : (a.vr > 0 ? "&uarr; " : "&darr; ") + Math.abs(a.vr);
        h += `<tr class="${cls}" data-hex="${esc(a.hex)}"><td>${esc(a.cs)}</td><td><code>${esc(a.hex)}</code></td>`
           + `<td class="n">${Number.isFinite(a.alt) ? Math.round(a.alt / 100) : ""}</td><td class="n">${f(a.gs)}</td><td class="n">${f(a.trk)}</td>`
           + `<td class="n">${vr}</td><td class="n">${f(a.dist, 1)}</td><td class="n">${f(a.brg)}</td>`
           + `<td class="n">${a.sq ? String(a.sq).padStart(4, "0") : ""}</td><td class="n">${a.msgs}</td>`
           + `<td class="n">${((newest - a.seen) / 1000).toFixed(0)}</td></tr>`;
    }
    $("rows").innerHTML = h || `<tr><td colspan="11" class="muted">no aircraft in range</td></tr>`;
}

function drawSelected() {
    const a = sky.find((p) => p.hex === selected);
    if (!a) { $("sel").innerHTML = "click an aircraft or a row"; $("sel").className = "muted small"; return; }
    const em = EMERGENCY[a.sq] ? ` <b class="emt">${a.sq} ${EMERGENCY[a.sq]}</b>` : "";
    $("sel").className = "small";
    $("sel").innerHTML = `<b>${esc(a.cs || "?")}</b> <code>${esc(a.hex)}</code>${em}<br>`
        + `${Number.isFinite(a.alt) ? a.alt + " ft" : ""} &middot; ${Number.isFinite(a.gs) ? a.gs + " kt" : ""} &middot; track ${Number.isFinite(a.trk) ? a.trk + "&deg;" : "?"}<br>`
        + `${Number.isFinite(a.dist) ? a.dist + " km" : ""} at ${Number.isFinite(a.brg) ? a.brg + "&deg;" : "?"} from the receiver<br>`
        + `<code>id('AC_${esc(a.hex)}')</code> <span class="muted">sta 0x${a.sta.toString(16).toUpperCase().padStart(4, "0")}</span>`;
}

function pick(ev) {
    const el = ev.target.closest("[data-hex]");
    if (!el) return;
    selected = el.dataset.hex === selected ? null : el.dataset.hex;
    draw();
}
$("m-planes").addEventListener("click", pick);
$("rows").addEventListener("click", pick);

// ---- the counters -------------------------------------------------------------
function paint(id) {
    const val = v[id];
    switch (id) {
    case "SNAP": useSnap(val); break;
    case "COUNT": txt("count", val); break;
    case "RATE": {
        txt("rate", val);
        const r = parseInt(val) || 0;
        chip("c-feed", r > 0 ? "ok" : "bad", r > 0 ? `feed ${r}/s` : "no feed");
        break;
    }
    case "LINES": txt("lines", val); break;
    case "BAD": txt("bad", val); break;
    case "SEEN": txt("seen", val); break;
    case "MAXR": txt("maxr", num(val, 0).toFixed(1)); break;
    case "LOST_S": txt("lost", val); break;
    case "HOME_LAT": case "HOME_LON":
        txt("home", `${num(v.HOME_LAT, 0).toFixed(4)}, ${num(v.HOME_LON, 0).toFixed(4)}`);
        draw();
        break;
    case "EMERG": {
        const on = !!val;
        chip("c-emerg", on ? "bad" : "", on ? "EMERGENCY" : "no emergency");
        $("banner").hidden = !on;
        txt("banner", val);
        break;
    }
    }
}

// ---- MQTT ------------------------------------------------------------------
const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const mqtt = new MqttLite(wsUrl, "map-" + Math.random().toString(36).slice(2, 8));
mqtt.onstatus = (text, ok) => {
    chip("c-mqtt", ok ? "ok" : "bad", "MQTT");
    if (!ok) chip("c-feed", "bad", "no feed");
};
mqtt.onconnect = () => mqtt.subscribe(DOC + "/+/val");
mqtt.onmessage = (topic, text) => {
    const p = topic.split("/");
    if (p[3] === "val") { v[p[2]] = text; paint(p[2]); }
};
drawGrid();
mqtt.connect();
