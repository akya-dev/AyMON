// =====================================================================
// app.js -- a site's page. Asks state.ayp once a second; the slider
// posts a=start&v=.. to the same page. Every root runs this file.
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const port = location.port || "80";
const site = location.hostname.split(".")[0].toUpperCase();
let moving = false;          // the slider is being dragged: do not overwrite it

$("name").textContent = site;
$("port").textContent = location.hostname + ":" + port;
document.title = site + " - one root of the engine";

const names = ["acme", "beta", "gamma", "copy"];
$("links").innerHTML = `<a href="http://127.0.0.1:${port}/">127.0.0.1:${port}</a> is the host's page &middot; ` +
    names.filter((n) => n.toUpperCase() !== site)
         .map((n) => `<a href="http://${n}.localhost:${port}/">${n}.localhost:${port}</a>`).join(" &middot; ") +
    `<br>A name no root has is the host's. A root that is not there (GAMMA and COPY until the host's page makes them) is the host's too.`;

function show(s) {
    $("lvl").textContent = s.level.toFixed(1);
    $("fill").style.height = Math.max(0, Math.min(100, s.level)) + "%";
    $("m-hi").style.bottom = s.start_at + "%";
    $("m-lo").style.bottom = s.stop_at + "%";
    $("starts").textContent = s.starts;
    $("pump").className = "lamp" + (s.pump ? " on" : "");
    if (!moving) $("hi").value = s.start_at;
    $("hiv").textContent = s.start_at.toFixed(0);

    $("local").textContent = s.local;
    $("shift").textContent = s.shift;
    $("c-zone").textContent = s.tz;

    $("ask1").textContent = s.ask || "..";
    $("ask2").textContent = s.ask || "--";
    const ok = /%$/.test(s.peer);
    $("peer").textContent = s.peer || "--";
    $("peer").style.fontSize = ok ? "24px" : "13px";
    $("peer").className = "v" + (ok ? "" : " alm");
    $("peers").textContent = s.peers || "(none)";

    $("seen").textContent = s.seen;
    $("other").textContent = s.other;
    $("host").textContent = s.host;
    $("role").textContent = s.role + (s.role == 0 ? " (Guest)" : "");
}

function live(ok, text) {
    const c = $("c-live");
    c.textContent = text;
    c.className = "chip " + (ok ? "ok" : "bad");
}

async function poll() {
    try {
        const r = await fetch("state.ayp", { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        show(await r.json());
        live(true, "live");
    } catch (e) {
        live(false, e.message === "HTTP 503" ? "stopped by the host" : "no answer");
    }
}

$("hi").addEventListener("input", () => { moving = true; $("hiv").textContent = $("hi").value; });
$("hi").addEventListener("change", async () => {
    const body = new URLSearchParams({ a: "start", v: $("hi").value });
    try { show(await (await fetch("state.ayp", { method: "POST", body })).json()); } catch (e) { /* the next poll says */ }
    moving = false;
});

poll();
setInterval(poll, 1000);
