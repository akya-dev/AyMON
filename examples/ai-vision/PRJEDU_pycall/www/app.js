// =====================================================================
// app.js -- the pump's vibration, and the two calls into Python.
//
//   IN   VIB/S00/+/val, VIB/S00/+/sta
//   OUT  VIB/S00/SERVICE/val/set   (the only value this page may write)
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const WARN = 2.8, ALARM = 4.5, BAND = [80, 100], WIN = 300000;
const rmsHist = [];                    // [ms, rms] - the last five minutes this page saw
const tookHist = [];                   // analyse() run times, the last 30
let pyN = 0, lastPy = null;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const parse = (id) => { try { return JSON.parse(Kit.get(id) || "null"); } catch (e) { return null; } };

function canvas2d(c) {
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = "11px system-ui, sans-serif"; g.lineWidth = 1;
    return { g, w, h };
}
function hline(g, w, y, color, dash) {
    g.strokeStyle = color; g.setLineDash(dash || []); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]);
}

function drawWave() {
    const blk = parse("WAVE"); const { g, w, h } = canvas2d($("wave"));
    hline(g, w, h / 2, css("--grid"));
    if (!blk || !blk.x) return;
    const x = blk.x, lim = Math.max(3, ...x.map(Math.abs)) * 1.05;
    g.strokeStyle = css("--c1"); g.lineWidth = 1.2; g.beginPath();
    x.forEach((v, i) => { const X = w * i / (x.length - 1), Y = h / 2 - (h / 2 - 8) * v / lim; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
    g.stroke();
    g.fillStyle = css("--muted");
    g.fillText(`+${lim.toFixed(1)} mm/s`, 4, 12); g.fillText("0", 4, h / 2 - 3);
    g.fillText(`${(1000 * x.length / blk.fs).toFixed(0)} ms`, w - 44, h - 4);
}

function drawSpec() {
    const sp = parse("SPEC"); const { g, w, h } = canvas2d($("spec"));
    const fmax = 400, X = (f) => 30 + (w - 36) * f / fmax, base = h - 18;
    g.fillStyle = css("--grid"); g.fillRect(X(BAND[0]), 6, X(BAND[1]) - X(BAND[0]), base - 6);
    g.fillStyle = css("--muted");
    [0, 100, 200, 300].forEach((f) => g.fillText(String(f), X(f) - 8, h - 4));
    g.textAlign = "right"; g.fillText("400 Hz", w - 2, h - 4); g.textAlign = "left";
    hline(g, w, base, css("--line"));
    if (!sp || !sp.a) return;
    const top = Math.max(2, ...sp.a) * 1.1, Y = (a) => base - (base - 10) * a / top;
    sp.a.forEach((a, k) => {
        const f = k * sp.df, inBand = f >= BAND[0] && f <= BAND[1];
        g.strokeStyle = inBand ? css("--alm") : css("--c1"); g.lineWidth = 3;
        g.beginPath(); g.moveTo(X(f), base); g.lineTo(X(f), Y(a)); g.stroke();
    });
    g.fillStyle = css("--muted"); g.fillText(`${top.toFixed(1)} mm/s`, 2, 12);
    const lbl = [[25, "1x speed"], [50, "2x"], [90, "bearing"]];
    lbl.forEach(([f, t]) => { const k = Math.round(f / sp.df); if (sp.a[k] > top * 0.08) { g.fillStyle = f === 90 ? css("--alm") : css("--ink"); g.fillText(t, X(f) + 4, Y(sp.a[k]) - 2); } });
}

function drawRms() {
    const { g, w, h } = canvas2d($("rms")), now = Date.now(), top = 7;
    const X = (t) => 34 + (w - 40) * (1 - (now - t) / WIN) * 0.8, Y = (v) => 8 + (h - 26) * (1 - v / top);
    // the right fifth is the future: where the forecast goes
    g.fillStyle = css("--grid"); g.fillRect(X(now), 4, w - X(now), h - 22);
    g.fillStyle = css("--muted");
    for (let v = 0; v <= top; v++) g.fillText(String(v), 4, Y(v) + 4);
    g.fillText("-5 min", 30, h - 4); g.fillText("now", X(now) - 10, h - 4); g.fillText("+75 s", w - 34, h - 4);
    hline(g, w, Y(WARN), css("--wrn"), [5, 4]); hline(g, w, Y(ALARM), css("--alm"), [5, 4]);
    while (rmsHist.length && rmsHist[0][0] < now - WIN) rmsHist.shift();
    g.strokeStyle = css("--c1"); g.lineWidth = 2; g.beginPath();
    rmsHist.forEach(([t, v], i) => i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v)));
    g.stroke();
    const fc = parse("FORECAST");
    if (fc && fc.per_min !== undefined && rmsHist.length) {
        const [t0, v0] = rmsHist[rmsHist.length - 1], t1 = now + WIN / 4, v1 = fc.now + fc.per_min * (t1 - now) / 60000;
        g.strokeStyle = css("--c2"); g.setLineDash([6, 4]); g.beginPath(); g.moveTo(X(t0), Y(v0));
        g.lineTo(X(t1), Y(Math.max(0, Math.min(top, v1)))); g.stroke(); g.setLineDash([]);
    }
}

function eta(fc) {
    if (!fc) return ["--", "forecast by Python"];
    if (fc.eta_s === 0) return ["now", "the RMS is above the limit"];
    if (fc.eta_s === undefined) return ["-", fc.n < 5 ? "not enough data yet" : `not rising (${fc.per_min} mm/s a minute)`];
    const s = fc.eta_s;
    return [s >= 120 ? `${Math.round(s / 60)} min` : `${s} s`, `at +${fc.per_min} mm/s a minute`];
}

function draw() {
    ["RMS", "BPFO", "PEAK"].forEach((id) => txt("v-" + id, Kit.num(id, 2)));
    txt("v-CREST", Kit.num("CREST", 2)); txt("v-FREQ", Kit.num("FREQ", 0));
    let worst = -1;
    ["RMS", "BPFO"].forEach((id) => {
        const hl = Kit.health(Kit.get(id, "sta"));
        $("s-" + id).textContent = hl.text; $("s-" + id).className = "s " + hl.cls;
        $("t-" + id).className = "tile " + (hl.level > 0 ? hl.cls : "");
        worst = Math.max(worst, hl.run ? hl.level : -1);
    });
    const c = $("c-state");
    c.textContent = worst < 0 ? "--" : ["bearing ok", "bearing: WARNING", "bearing: ALARM", "bearing: ALARM"][worst];
    c.className = "chip " + (worst < 0 ? "" : ["ok", "wrn", "alm", "alm"][worst]);

    const fc = parse("FORECAST"), [e1, e2] = eta(fc);
    txt("v-ETA", e1); txt("s-ETA", e2);
    if (lastPy) {
        txt("py-wait", lastPy.waited_ms); txt("py-took", lastPy.took_ms); txt("py-n", pyN);
        const a = tookHist.slice().sort((p, q) => p - q);
        txt("py-range", `${a[0]} .. ${a[a.length - 1]} ms, median ${a[a.length >> 1]}`);
    }
    const js = parse("JS_CALL");
    if (js) { txt("js-q", js.returned); txt("js-ms", js.ms); }
    if (fc) {
        txt("fc-wait", fc.waited_ms); txt("fc-took", fc.took_ms);
        txt("fc-text", fc.per_min === undefined ? `${fc.n} points - not enough yet`
            : `RMS ${fc.now} now, ${fc.per_min > 0 ? "+" : ""}${fc.per_min} a minute (${fc.n} blocks)`);
    }
}

$("service").onclick = () => {
    Kit.write("VIB/S00", "SERVICE", "val", Number(Kit.get("SERVICE") || 0) + 1);
    $("service").disabled = true; setTimeout(() => { $("service").disabled = false; }, 3000);
};

Kit.start({
    subs: ["VIB/S00/+/val", "VIB/S00/+/sta"],
    onmsg: (id, attr, text) => {
        if (attr === "val" && id === "RMS" && text !== "") rmsHist.push([Date.now(), Number(text)]);
        if (attr === "val" && id === "PY_CALL") {
            try {
                const c = JSON.parse(text); pyN++;
                txt("py-skip", c.skipped ?? 0);
                if (c.took_ms > 0 || c.waited_ms <= 4000) {        // a dropped block ran for 0 ms: not a run time
                    lastPy = c; tookHist.push(c.took_ms); if (tookHist.length > 30) tookHist.shift();
                }
            } catch (e) { }
        }
        if (attr === "val" && id === "WAVE") drawWave();
        if (attr === "val" && id === "SPEC") drawSpec();
        draw();
    }
});
setInterval(drawRms, 1000);
window.addEventListener("resize", () => { drawWave(); drawSpec(); drawRms(); });
draw();
