// =====================================================================
// app.js -- the record pipeline's page.
//
//   IN   HIS/S00/+/val   TANK, ALARMS, EVENTS, VALUES, TREND, RUNS, STATS:
//                        one JSON value each, written by main.view
//   OUT  HIS/S00/SET_SP/opr/set   the set point; main.set_sp audits it
//        HIS/S00/HOLD/val/set     1 = stop the connection that writes rows
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const json = (id) => { try { return JSON.parse(Kit.get(id) || "null"); } catch (e) { return null; } };

const live = [];       // [ms, level]: what the tank did while this page was open
const WINDOW = 180000; // ms on the chart

function drawTank() {
    const t = json("TANK");
    if (!t) return;
    const h = Kit.health(t.sta);
    $("fill").style.height = Math.max(0, Math.min(100, t.level)) + "%";
    txt("lvl", t.level.toFixed(1));
    txt("lvl-h", h.text);
    $("lvl-h").className = "s " + h.cls;
    $("t-lvl").className = "tile " + (h.level === 1 ? "wrn" : h.level >= 2 ? "alm" : "");
    txt("tmp", t.temp.toFixed(1));
    txt("pump", t.pump ? "on" : "off");
    txt("sp", t.sp);
    live.push([Date.now(), t.level]);
    while (live.length && live[0][0] < Date.now() - WINDOW) live.shift();
    drawChart();
}

function drawStats() {
    const s = json("STATS");
    if (!s) return;
    txt("made", s.made);
    txt("wait", s.wait);
    txt("n-alm", s.alm); txt("n-evt", s.evt); txt("n-val", s.val);
    $("hold").textContent = s.hold ? "Start the writer" : "Stop the writer";
    $("hold").dataset.on = s.hold ? "1" : "0";
    txt("hold-t", s.hold ? "stopped: the journal holds the rows" : "the rows are written once a second");
    $("hold-t").className = "small " + (s.hold ? "wrn" : "muted");
    if (s.his) txt("dbd", `${s.his.dbd} of the changes so far were held back and made no row`);
}

// the columns are the SELECT's, whatever it names: drop the element's own keys
function drawRows(name, key) {
    const r = json(name);
    if (!Array.isArray(r) || !r.length) {
        $("b-" + key).innerHTML = `<tr><td class="muted">no rows yet</td></tr>`;
        return;
    }
    const cols = Object.keys(r[0]).filter((k) => !["xdb_elm", "id", "sta", "xdb_acl"].includes(k) && !k.startsWith("qry_"));
    $("h-" + key).innerHTML = "<tr>" + cols.map((c) => `<th>${Kit.esc(c)}</th>`).join("") + "</tr>";
    $("b-" + key).innerHTML = r.map((row) => "<tr>" + cols.map((c) => `<td>${Kit.esc(row[c] ?? "")}</td>`).join("") + "</tr>").join("");
}

function drawRuns() {
    const r = json("RUNS");
    if (!Array.isArray(r)) return;
    $("runs").innerHTML = r.map((x) => {
        const whole = Number(x.first) === 1 && Number(x.cnt) === Number(x.last);
        return `<tr><td>${Kit.esc(x.at)}</td><td class="n">${Kit.esc(x.cnt)}</td>`
             + `<td>${Kit.esc(x.first)} .. ${Kit.esc(x.last)}</td>`
             + `<td class="${whole ? "ok" : "alm"}">${whole ? "no gap" : "GAP"}</td></tr>`;
    }).join("");
}

function drawChart() {
    const c = $("chart"), w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d"), css = getComputedStyle(document.documentElement), now = Date.now();
    const X = (t) => w * (1 - (now - t) / WINDOW), Y = (v) => 8 + (h - 26) * (1 - v / 100);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = "11px system-ui, sans-serif"; g.lineWidth = 1;
    g.strokeStyle = css.getPropertyValue("--grid"); g.fillStyle = css.getPropertyValue("--muted");
    [0, 25, 50, 75, 100].forEach((v) => { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); g.fillText(v, 2, Y(v) - 2); });
    g.fillText(`-${WINDOW / 1000} s`, 24, h - 3); g.fillText("now", w - 24, h - 3);

    g.strokeStyle = css.getPropertyValue("--c1"); g.lineWidth = 2; g.beginPath();
    live.forEach(([t, v], i) => { i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v)); });
    g.stroke();

    const rows = json("TREND");
    if (!Array.isArray(rows)) return;
    g.fillStyle = css.getPropertyValue("--c2");
    rows.forEach((r) => {
        const t = Number(r.ms);
        if (t < now - WINDOW) return;
        g.beginPath(); g.arc(X(t), Y(Number(r.val)), 3.5, 0, 6.3); g.fill();
    });
}

document.querySelectorAll(".sp").forEach((b) => { b.onclick = () => Kit.write("HIS/S00", "SET_SP", "opr", b.dataset.v); });
$("hold").onclick = () => Kit.write("HIS/S00", "HOLD", "val", $("hold").dataset.on === "1" ? 0 : 1);

Kit.start({
    subs: ["HIS/S00/+/val"],
    onmsg: (id) => {
        if (id === "TANK") drawTank();
        else if (id === "STATS") drawStats();
        else if (id === "ALARMS") drawRows("ALARMS", "alm");
        else if (id === "EVENTS") drawRows("EVENTS", "evt");
        else if (id === "VALUES") drawRows("VALUES", "val");
        else if (id === "RUNS") drawRuns();
        else if (id === "TREND") drawChart();
    }
});
