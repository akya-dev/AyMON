// =====================================================================
// app.js -- the MES's page.
//
//   IN   OEE/S00/+/val   LIVE (the running shift, JSON), STOPS, PARETO,
//                        PARETO_ALL, SHIFTS, CATALOG, LINE_CFG, MSG
//   OUT  OEE/S00/REASON_SET/val/set    {"sid": .., "reason": .., "n": ..}
//        LINE/S00/<id>/val/set         the world buttons and settings
//
// Everything the page shows is computed by the MES (db_OEE.js); the page
// only draws it. The two OEE numbers in the check line come from two
// different formulas there: equal when the shift made one product, a
// little apart when it made both (Q counts parts, the time formula
// weighs them by their ideal cycle).
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (r) => (100 * r).toFixed(1) + " %";
const s1 = (v) => Number(v).toFixed(1);
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

const v = {};                         // the last value of every OEE/S00 variable
let parAll = false;                   // Pareto: this shift or the last ten

// ---- the catalogue: reason code -> {name, loss, by} ------------------
function catalog() { try { return JSON.parse(v.CATALOG || "{}"); } catch (e) { return {}; } }
function reason(code) {
    const r = (catalog().reasons || []).find((x) => Number(x.code) === Number(code));
    return r || { code: code, name: "reason " + code, loss: "other", by: "machine" };
}
function operatorReasons() { return (catalog().reasons || []).filter((x) => x.by === "operator"); }

const LOSS = {                         // loss -> [label, css class]
    planned: ["planned break", "l-planned"], breakdown: ["breakdowns", "l-breakdown"],
    setup: ["changeover", "l-setup"], waiting: ["waiting", "l-waiting"], other: ["other", "l-other"],
    unassigned: ["not assigned yet", "l-unassigned"], minor: ["minor stops", "l-minor"],
    speed: ["running slow", "l-speed"], quality: ["bad parts", "l-quality"], good: ["fully productive", "l-good"]
};

// ---- live ------------------------------------------------------------
const mqtt = new MqttLite(`ws://${location.host || "127.0.0.1:8100"}/mqtt`, "oee-" + Math.random().toString(36).slice(2, 8));
mqtt.onstatus = (t, ok) => { const c = $("c-link"); c.textContent = ok ? "live" : t; c.className = "chip " + (ok ? "ok" : "bad"); };
mqtt.onconnect = () => mqtt.subscribe("OEE/S00/+/val");
mqtt.onmessage = (topic, text) => {
    const id = topic.split("/")[2];
    v[id] = text;
    if (id === "LIVE") drawLive();
    else if (id === "STOPS") { drawStops(); drawLive(); }
    else if (id === "PARETO" || id === "PARETO_ALL") drawPareto();
    else if (id === "SHIFTS") drawHistory();
    else if (id === "LINE_CFG") drawWorld();
    else if (id === "MSG") txt("msg", text);
    else if (id === "CATALOG") { drawLegend(); drawStops(); }
};
mqtt.connect();

function send(doc, id, value) { mqtt.publish(`${doc}/${id}/val/set`, String(value)); }
function giveReason(sid, code) { send("OEE/S00", "REASON_SET", JSON.stringify({ sid: sid, reason: Number(code), n: Date.now() })); }

// ---- the running shift -----------------------------------------------
function live() { try { return JSON.parse(v.LIVE || "{}"); } catch (e) { return {}; } }

function drawLive() {
    const L = live();
    if (!L.shift) return;
    const s = L.shift, ln = L.line, t = L.t, n = L.n;

    txt("c-shift", `shift ${s.name} #${s.no}`);
    txt("c-left", `${mmss(s.len - s.el)} left`);
    const st = $("c-state");
    const stName = !ln.comm ? "NO SIGNAL" : ln.state === 1 ? "RUNNING" : ln.state === 2 ? "HELD" : "STOPPED";
    st.textContent = stName;
    st.className = "chip " + (!ln.comm ? "bad" : ln.state === 1 ? "ok" : ln.state === 2 ? "wrn" : "bad");

    // the four numbers - with no parts yet there is nothing to divide
    const has = n.total > 0;
    kpi("a", t.planned > 0 ? L.a : null);
    kpi("p", has ? L.p : null);
    kpi("q", has ? L.q : null);
    kpi("oee", has ? L.oee : null);
    $("check").innerHTML = has
        ? `Check: fully productive time / planned time = ${s1(t.good_ideal)} s / ${s1(t.planned)} s = <b>${pct(L.oee2)}</b>`
          + (Math.abs(L.oee - L.oee2) < 0.0005 ? " - the same as A &times; P &times; Q."
             : ` - ${(100 * (L.oee2 - L.oee)).toFixed(2)} points off A &times; P &times; Q: this shift made both products, and Q counts parts`
               + " while this weighs each by its ideal cycle - a bad part of the slower product costs more time.")
          + (L.p > 1.0 ? " Performance over 100 %: parts started in the last shift were counted in this one - it evens out." : "")
        : "No parts yet in this shift.";

    drawFall(L);

    // why: what the MES has for the stop (the operator may have said), else what the machine says
    const why = L.open && !L.open.plan ? L.open.reason : ln.reason;
    $("state").textContent = stName + (ln.comm && ln.state !== 1 ? " - " + reason(why).name + (why === 0 ? " (the machine does not know)" : "") : "");
    $("state").className = "state " + (!ln.comm ? "bad" : ln.state === 1 ? "ok" : ln.state === 2 ? "wrn" : "bad");
    drawOpen(L);

    const prod = (catalog().products || []).find((p) => Number(p.code) === ln.product);
    txt("product", prod ? prod.name : String(ln.product));
    txt("ideal", ln.ideal_ms ? (ln.ideal_ms / 1000).toFixed(1) + " s a part" : "unknown product");
    txt("parts", `${n.total} (${n.good} good)`);
    txt("bad", `${n.scrap} (${n.su})`);
    txt("minors", `${n.minor}, ${s1(t.minor)} s`);
    txt("raw", `${ln.raw_total} / ${ln.raw_scrap}`);
    drawTimeline(L);
}

function kpi(k, r) {
    txt("k-" + k, r === null ? "--" : pct(r));
    $("b-" + k).style.width = r === null ? "0" : Math.max(0, Math.min(100, 100 * r)) + "%";
}

// the stop going on, and - if the machine cannot name it - the question
// The box is rebuilt only when what it asks changes - rebuilding it twice
// a second would swap the buttons under the operator's finger - and in
// between only its clock moves.
function drawOpen(L) {
    const box = $("open");
    const o = L.open;
    const key = !o ? "" : [o.plan, o.reason, o.minor, o.by].join("|");
    if (key === box.dataset.key && box.querySelector(".secs")) { box.querySelector(".secs").textContent = s1(o.s); return; }
    box.dataset.key = key;
    if (!o || o.plan) { box.innerHTML = o ? `<div class="small muted">planned break, <span class="secs">${s1(o.s)}</span> s</div>` : ""; return; }
    let h = `<div>stopped for <b><span class="secs">${s1(o.s)}</span> s</b>` + (o.minor ? " <span class='muted'>(a minor stop, so far)</span>" : "") + "</div>";
    if (o.reason === 0 && !o.minor) {
        h += `<div class="ask">Why? ` + operatorReasons().map((r) =>
            `<button data-open="${esc(r.code)}">${esc(r.name)}</button>`).join(" ") + "</div>";
    } else if (o.reason !== 0) {
        h += `<div class="small muted">${esc(reason(o.reason).name)} - ${esc(o.by)}</div>`;
    }
    box.innerHTML = h;
    box.querySelectorAll("[data-open]").forEach((b) => { b.onclick = () => giveReason("open", b.dataset.open); });
}

// ---- where the time went: a waterfall, in seconds --------------------
function drawFall(L) {
    const t = L.t, loss = L.loss;
    const full = Math.max(t.shift, 1);
    const rows = [];
    const total = (name, val, cls) => rows.push({ name, val, off: 0, cls, total: true });
    let level = t.shift;
    const minus = (name, val, cls) => { val = Math.max(0, val); rows.push({ name, val, off: level - val, cls }); level -= val; };

    total("shift so far", t.shift, "l-base");
    minus("planned break", t.plan, "l-planned");
    total("planned production time", t.planned, "l-base"); level = t.planned;
    for (const k of ["breakdown", "setup", "waiting", "other", "unassigned"])
        if (loss[k] > 0) minus(LOSS[k][0], loss[k], LOSS[k][1]);
    total("run time", t.run, "l-base"); level = t.run;
    minus("minor stops", t.minor, "l-minor");
    minus("running slow", t.speed, "l-speed");
    total("ideal time of all parts", t.ideal, "l-base"); level = t.ideal;
    minus("bad parts", t.qual, "l-quality");
    total("fully productive time", t.good_ideal, "l-good");

    $("fall").innerHTML = rows.map((r) => {
        const w = Math.max(0, Math.min(100, 100 * r.val / full)), o = Math.max(0, Math.min(100, 100 * r.off / full));
        return `<div class="frow${r.total ? " tot" : ""}"><span class="fname">${esc(r.name)}</span>`
             + `<span class="ftrack"><i class="${r.cls}" style="left:${o}%;width:${w}%"></i></span>`
             + `<span class="fval">${r.total ? "" : "&minus;"}${s1(r.val)}</span></div>`;
    }).join("");
}

// ---- the shift on a line ---------------------------------------------
function lossOf(s) { return s.kind === "minor" ? "minor" : s.kind === "planned" ? "planned" : reason(s.reason).loss; }

function drawTimeline(L) {
    const s = L.shift, len = Math.max(s.len, 1) * 1000;
    const X = (ms) => 1000 * ms / len;
    let h = `<rect x="0" y="8" width="${X(s.el * 1000)}" height="28" class="l-good" opacity="0.35"/>`;
    h += `<rect x="${X(s.brk_at * 1000)}" y="4" width="${X((s.brk_end - s.brk_at) * 1000)}" height="36" class="brk"/>`;
    let stops = [];
    try { stops = JSON.parse(v.STOPS || "[]"); } catch (e) { /* not yet */ }
    for (const st of stops) {
        const l = lossOf(st);
        h += `<rect x="${X(st.at)}" y="${l === "minor" ? 20 : 8}" width="${Math.max(X(st.ms), 1.5)}" height="${l === "minor" ? 16 : 28}" class="${(LOSS[l] || LOSS.other)[1]}"/>`;
    }
    if (L.open) {
        const d = L.open.s * 1000, l = L.open.plan ? "planned" : L.open.minor ? "minor" : reason(L.open.reason).loss;
        h += `<rect x="${X(s.el * 1000 - d)}" y="8" width="${Math.max(X(d), 1.5)}" height="28" class="${(LOSS[l] || LOSS.other)[1]}" opacity="0.7"/>`;
    }
    h += `<line x1="${X(s.el * 1000)}" x2="${X(s.el * 1000)}" y1="0" y2="44" class="now"/>`;
    $("timeline").innerHTML = h;
}

function drawLegend() {
    $("legend").innerHTML = ["breakdown", "setup", "waiting", "other", "unassigned", "minor", "planned"].map((k) =>
        `<span><i class="sw ${LOSS[k][1]}"></i>${LOSS[k][0]}</span>`).join("");
}

// ---- the stops of this shift, newest first ----------------------------
function drawStops() {
    // a select the operator has open is not pulled away from under them
    if (document.activeElement && document.activeElement.matches && document.activeElement.matches("#stops select")) return;
    let stops = [];
    try { stops = JSON.parse(v.STOPS || "[]"); } catch (e) { /* not yet */ }
    const rows = stops.filter((s) => s.kind !== "minor").reverse();
    $("stops").innerHTML = rows.length ? rows.map((s) => {
        let why;
        if (s.kind === "down" && s.reason === 0)
            why = `<select data-sid="${s.sid}"><option value="">why?</option>` + operatorReasons().map((r) =>
                `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join("") + "</select>";
        else why = `<i class="sw ${(LOSS[lossOf(s)] || LOSS.other)[1]}"></i>${esc(reason(s.reason).name)}` + (s.by === "operator" ? " <span class='muted'>(operator)</span>" : "");
        return `<tr><td>${s.sid}</td><td>${mmss(s.at / 1000)}</td><td class="n">${s1(s.ms / 1000)}</td><td>${why}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="muted">none yet</td></tr>`;
    $("stops").querySelectorAll("select[data-sid]").forEach((sel) => {
        sel.onchange = () => { if (sel.value) giveReason(Number(sel.dataset.sid), sel.value); sel.blur(); };
    });
}

// ---- Pareto: the few reasons that cost the most ------------------------
$("par-now").onclick = () => { parAll = false; $("par-now").className = "on"; $("par-all").className = ""; drawPareto(); };
$("par-all").onclick = () => { parAll = true; $("par-all").className = "on"; $("par-now").className = ""; drawPareto(); };

function drawPareto() {
    let rows = [];
    try { rows = JSON.parse((parAll ? v.PARETO_ALL : v.PARETO) || "[]"); } catch (e) { /* not yet */ }
    rows = rows.map((r) => ({ ...r, s: Number(r.s), n: Number(r.n) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
    const svg = $("pareto");
    if (!rows.length) { svg.innerHTML = `<text x="260" y="120" text-anchor="middle" class="axis">no downtime yet</text>`; return; }
    const sum = rows.reduce((a, r) => a + r.s, 0), max = rows[0].s;
    const W = 520, H = 240, L0 = 36, B = 170, T = 16, bw = (W - L0 - 10) / rows.length;
    let h = `<line x1="${L0}" x2="${W - 6}" y1="${B}" y2="${B}" class="axis-l"/>`;
    h += `<line x1="${L0}" x2="${W - 6}" y1="${B - 0.8 * (B - T)}" y2="${B - 0.8 * (B - T)}" class="p80"/>`;
    h += `<text x="${W - 8}" y="${B - 0.8 * (B - T) - 4}" text-anchor="end" class="axis">80 %</text>`;
    let cum = 0, pts = [];
    rows.forEach((r, i) => {
        const x = L0 + i * bw, bh = (B - T) * r.s / max;
        cum += r.s;
        pts.push(`${x + bw / 2},${B - (B - T) * cum / sum}`);
        h += `<rect x="${x + 4}" y="${B - bh}" width="${bw - 8}" height="${bh}" class="${(LOSS[r.loss] || LOSS.other)[1]}"/>`;
        h += `<text x="${x + bw / 2}" y="${B - bh - 4}" text-anchor="middle" class="axis">${Math.round(r.s)} s</text>`;
        const name = r.name.length > 16 ? r.name.slice(0, 15) + "..." : r.name;
        h += `<text x="${x + bw / 2}" y="${B + 14}" text-anchor="middle" class="axis">${esc(name)}</text>`;
        h += `<text x="${x + bw / 2}" y="${B + 27}" text-anchor="middle" class="axis muted">${r.n}&times;</text>`;
    });
    h += `<polyline points="${pts.join(" ")}" class="cum"/>`;
    h += pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3" class="cumdot"/>`).join("");
    h += `<text x="${L0 - 4}" y="${T + 4}" text-anchor="end" class="axis">100%</text><text x="${L0 - 4}" y="${B}" text-anchor="end" class="axis">0</text>`;
    svg.innerHTML = h;
}

// ---- finished shifts ---------------------------------------------------
function shifts() { try { return JSON.parse(v.SHIFTS || "[]"); } catch (e) { return []; } }

function drawHistory() {
    const rows = shifts();
    $("hist").innerHTML = rows.length ? rows.map((r) =>
        `<tr><td>${esc(r.name)} #${esc(r.no)}</td><td>${esc(String(r.start).slice(11))}</td>`
        + `<td class="n">${pct(r.a)}</td><td class="n">${pct(r.p)}</td><td class="n">${pct(r.q)}</td>`
        + `<td class="n"><b>${pct(r.oee)}</b></td><td class="n">${esc(r.good)} / ${esc(r.total)}</td></tr>`).join("")
        : `<tr><td colspan="7" class="muted">none yet - the first shift ends ${mmss((live().shift || {}).len - (live().shift || {}).el)} from now</td></tr>`;
}

$("csv").onclick = () => {
    const rows = shifts();
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = keys.join(",") + "\n" + rows.map((r) => keys.map((k) => /[",\n]/.test(r[k]) ? `"${String(r[k]).replace(/"/g, '""')}"` : r[k]).join(",")).join("\n") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "oee_shifts_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
};

// ---- the world ---------------------------------------------------------
document.querySelectorAll("[data-now]").forEach((b) => { b.onclick = () => send("LINE/S00", b.dataset.now, 1); });
const sliding = {};
document.querySelectorAll("[data-cfg]").forEach((r) => {
    const id = r.dataset.cfg;
    r.addEventListener("input", () => { sliding[id] = true; txt("v-" + id, r.value); });
    r.addEventListener("change", () => { sliding[id] = false; send("LINE/S00", id, r.value); });
});

function drawWorld() {
    let c = {};
    try { c = JSON.parse(v.LINE_CFG || "{}"); } catch (e) { return; }
    document.querySelectorAll("[data-cfg]").forEach((r) => {
        const id = r.dataset.cfg;
        if (sliding[id] || c[id] === undefined) return;
        r.value = c[id];
        txt("v-" + id, Number(c[id]) + "");
    });
    txt("made", c.MADE);
    txt("madebad", c.MADE_BAD);
}

drawLegend();
