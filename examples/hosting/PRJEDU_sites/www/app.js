// =====================================================================
// app.js -- the host's page. Asks state.ayp once a second; a button
// posts a=<what>&id=<root> to the same page.
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const port = location.port || "80";
const HLT = ["normal", "warning", "ALARM", "EMERGENCY"];
const OWN = ["ACME", "BETA"];       // this example's own roots: the page does not remove them

function cell(text, cls) { return `<td${cls ? ` class="${cls}"` : ""}>${text}</td>`; }

function row(r) {
    const link = r.host ? `<a href="http://${r.host}:${port}/" target="_blank">${r.host}:${port}</a>` : "";
    const run = r.hold ? "held" : (r.run ? "yes" : "no");
    const btns = [
        r.run ? `<button data-a="stop" data-id="${r.id}">Stop</button>` : `<button data-a="start" data-id="${r.id}">Start</button>`,
        `<button data-a="backup" data-id="${r.id}">Backup</button>`,
        OWN.includes(r.id) ? "" : `<button data-a="remove" data-id="${r.id}">Remove with its data</button>`
    ].join(" ");
    return "<tr>" +
        cell(`<b>${r.id}</b><br><span class="muted small">${r.desc}</span>`) +
        cell(link) +
        cell(run, r.run ? "ok" : "wrn") +
        cell(HLT[r.hlt] || "--", r.hlt >= 2 ? "alm" : (r.hlt == 1 ? "wrn" : "")) +
        cell(r.docs, "n") + cell(r.cons, "n") + cell(r.thrs, "n") + cell(r.ses, "n") +
        cell(r.fail + " / " + r.pnc, "n") +
        cell(btns) + "</tr>";
}

function show(s) {
    $("rows").innerHTML = s.rows.map(row).join("") || `<tr><td colspan="10">no roots</td></tr>`;
    $("peek-doc").textContent = s.peek_doc;
    $("peek-star").textContent = s.peek_star;
    $("peek-bridge").textContent = s.peek_bridge;
    $("notes").textContent = s.notes.length ? s.notes.slice().reverse().join("\n") : "nothing yet";
    $("backup").textContent = s.backup || "none yet";
    $("restore").disabled = !s.backup;
    $("c-zone").textContent = s.tz;
}

function live(ok, text) {
    const c = $("c-live");
    c.textContent = text;
    c.className = "chip " + (ok ? "ok" : "bad");
}

async function call(a, id) {
    const body = new URLSearchParams({ a, id: id || "" });
    const r = await fetch("state.ayp", { method: "POST", body, cache: "no-store" });
    show(await r.json());
}

async function poll() {
    try {
        const r = await fetch("state.ayp", { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        show(await r.json());
        live(true, "live");
    } catch (e) {
        live(false, "no answer");
    }
}

document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-a]");
    if (b) call(b.dataset.a, b.dataset.id).catch(() => {});
});
$("add").addEventListener("click", () => call("add").catch(() => {}));
$("restore").addEventListener("click", () => call("restore").catch(() => {}));

poll();
setInterval(poll, 1000);
