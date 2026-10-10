// =====================================================================
// app.js -- the tank and its mail.
//
//   IN   PLT/S00/+/val, PLT/S00/+/sta, PLT/S00/MAIL/pro
//   OUT  PLT/S00/OVERFILL/val/set   1 = overfill once
//        PLT/S00/TEST/val/set       any new value = a test mail
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const PHASE = ["normal", "filling up", "full", "draining"];

for (const [pct, cls] of [[80, ""], [90, "a"]]) {
    const b = document.createElement("b"); b.className = cls; b.style.bottom = pct + "%"; $("g").appendChild(b);
}

$("b-over").onclick = () => Kit.write("PLT/S00", "OVERFILL", "val", 1);
$("b-test").onclick = () => Kit.write("PLT/S00", "TEST", "val", Date.now());
$("b-report").onclick = () => Kit.write("PLT/S00", "REPORT", "val", Date.now());

function list(id) {
    try { return JSON.parse(Kit.get(id) || "[]"); } catch (e) { return []; }
}

function draw() {
    const lv = Kit.get("LEVEL");
    $("g-fill").style.height = (lv === undefined ? 0 : Math.max(0, Math.min(100, Number(lv)))) + "%";
    txt("level", Kit.num("LEVEL"));
    const h = Kit.health(Kit.get("LEVEL", "sta"));
    $("s-level").textContent = h.text; $("s-level").className = "s " + h.cls;
    $("t-level").className = "tile " + (h.level > 0 ? h.cls : "");
    const ph = Number(Kit.get("PHASE"));
    txt("phase", isNaN(ph) ? "--" : PHASE[ph] || "--");
    $("b-over").disabled = ph > 0;

    txt("mails", Kit.num("MAILS", 0));
    txt("sent", Kit.num("SENT", 0));
    txt("failed", Kit.num("FAILED", 0));
    $("failed").className = "v " + (Number(Kit.get("FAILED")) > 0 ? "alm" : "");
    txt("last", Kit.get("MAIL", "pro") || "--");

    const out = list("OUTBOX");
    $("out").innerHTML = out.length ? out.map((r) =>
        `<tr><td>${Kit.esc(r.at)}</td><td><code>${Kit.esc(r.id)}</code></td><td>${Kit.esc(r.subject)}</td>`
      + `<td class="n ${r.code == 250 ? "ok" : "alm"}">${r.code}</td><td class="n">${r.ok}</td><td><code>${Kit.esc(r.text)}</code></td></tr>`
    ).join("") : `<tr><td colspan="6" class="muted">no mail yet</td></tr>`;

    txt("reports", Kit.num("REPORTS", 0));
    const files = list("FTP_FILES");
    txt("nfiles", files.length);
    $("files").innerHTML = files.length ? files.map((f) =>
        `<tr><td><code>${Kit.esc(f.name)}</code></td><td class="n">${f.size ?? "--"}</td>`
      + `<td>${/\.zip$/i.test(f.name) ? "ZIP archive" : ""}</td></tr>`
    ).join("") : `<tr><td colspan="3" class="muted">nothing yet</td></tr>`;
    const ftp = list("FTP_OUT");
    $("ftp").innerHTML = ftp.length ? ftp.map((r) =>
        `<tr><td>${Kit.esc(r.at)}</td><td><code>${Kit.esc(r.id)}</code></td><td>${Kit.esc(r.cmd)}</td>`
      + `<td class="n ${r.ok == 1 ? "ok" : "alm"}">${r.code}</td><td class="n">${r.ok}</td><td class="n">${r.bytes ?? ""}</td>`
      + `<td><code>${Kit.esc(r.text)}</code></td></tr>`
    ).join("") : `<tr><td colspan="7" class="muted">no transfer yet</td></tr>`;

    const inbox = list("INBOX");
    if (inbox.length) $("inbox").innerHTML = inbox.map((m) =>
        `<div class="mail"><div class="hd"><b>${Kit.esc(m.subject)}</b><span class="muted">#${m.no} - ${Kit.esc(m.at)} - ${m.bytes} bytes</span></div>`
      + `<div class="muted small">from ${Kit.esc(m.from)} to ${Kit.esc(m.to)}</div>`
      + `<pre>${Kit.esc(m.body)}</pre></div>`
    ).join("");

    $("c-mail").textContent = Number(Kit.get("SENT")) > 0 ? "mail works" : "mail --";
    $("c-mail").className = "chip " + (Number(Kit.get("SENT")) > 0 ? "ok" : "");
}

Kit.start({
    subs: ["PLT/S00/+/val", "PLT/S00/+/sta", "PLT/S00/MAIL/pro"],
    onmsg: () => draw()
});
