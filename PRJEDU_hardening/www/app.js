// =====================================================================
// app.js -- the plant's page: log in, see the plant as that person, run
// the self-check and the access test.
//
//   IN   PLT/S00/+/val   what THIS session may read (the engine filters
//                        every value by the session's role)
//   OUT  PLT/S00/<id>/val/set   a write - the engine takes it or refuses
//                        it; MQTT has no "refused" answer, so the page
//                        looks whether the value changed
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const URL_MQTT = `ws://${location.host || "127.0.0.1:8101"}/mqtt`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The demo accounts. In a plant nobody writes a password into a page;
// here the access test needs them, and they are in the README anyway.
const ACCOUNTS = { mon: "mon123", opr: "opr123", eng: "eng123" };

// ---- the person at the page ----------------------------------------
let me = null;               // the page's own session
let v = {};                  // what it can see

function connect(user, pwd) {
    if (me) me.close();
    v = {}; drawPlant(); drawSelf();
    me = new MqttLite(URL_MQTT, "page-" + Math.random().toString(36).slice(2, 8));
    me.username = user || ""; me.password = pwd || "";
    me.onstatus = (t, ok) => {
        const c = $("c-link"); c.textContent = ok ? "live" : t; c.className = "chip " + (ok ? "ok" : (me.refused ? "bad" : ""));
        txt("c-who", ok ? (user ? "logged in as " + user : "no user name") : (me.refused ? "login refused" : "not connected"));
        $("who").innerHTML = me.refused
            ? `<b class="bad">Refused</b> - CONNACK ${me.refused} (${me.refused === 4 ? "bad user name or password" : "not authorised - locked out?"})`
            : ok ? `Connected ${user ? "as <b>" + esc(user) + "</b>" : "<b>without a user name</b>"}. What you see below is what this session may read.` : "";
    };
    me.onconnect = () => me.subscribe("PLT/S00/+/val");
    me.onmessage = (topic, text) => {
        v[topic.split("/")[2]] = text;
        drawPlant();
        if (topic.endsWith("/SELF_CHECK/val")) drawSelf();
    };
    me.connect();
}

$("login").onsubmit = (e) => { e.preventDefault(); connect($("user").value.trim(), $("pwd").value); };
$("anon").onclick = () => connect("", "");
$("logout").onclick = () => { if (me) me.close(); me = null; v = {}; drawPlant(); drawSelf(); txt("c-who", "not connected"); txt("c-link", "--"); $("who").innerHTML = ""; };

// ---- the plant --------------------------------------------------------
const num = (k) => v[k] === undefined ? null : Number(v[k]);
function drawPlant() {
    const lv = num("LEVEL");
    txt("seen", lv === null ? "(nothing visible to this session)" : "");
    txt("level", lv === null ? "--" : lv.toFixed(1) + " %");
    $("t-level").style.height = (lv === null ? 0 : Math.min(100, lv)) + "%";
    txt("valve", v.VALVE === undefined ? "--" : v.VALVE === "1" ? "open" : "closed");
    txt("pump", v.PUMP === undefined ? "--" : v.PUMP === "1" ? "running" : "stopped");
    txt("tripped", v.TRIPPED === undefined ? "--" : v.TRIPPED === "1" ? "TRIPPED - inlet closed" : "no");
    txt("overflow", v.OVERFLOW === undefined ? "--" : Number(v.OVERFLOW).toFixed(1) + " %");
    $("overflow").className = Number(v.OVERFLOW) > 0 ? "bad" : "";
    txt("pcmd", v.PUMP_CMD === undefined ? "--" : v.PUMP_CMD);
    txt("recipe", v.RECIPE === undefined ? (lv === null ? "--" : "not visible to this session") : v.RECIPE);
    txt("msg", v.MSG || "");
    for (const k of ["SETPOINT", "TRIP_LEVEL"]) {
        const r = document.querySelector(`[data-w="${k}"]`);
        if (!r.matches(":active") && v[k] !== undefined) { r.value = v[k]; txt("v-" + k, Number(v[k]).toFixed(0)); }
    }
    const trip = num("TRIP_LEVEL"), sp = num("SETPOINT");
    $("t-trip").style.bottom = (trip === null ? -10 : Math.min(100, trip)) + "%";
    $("t-sp").style.bottom = (sp === null ? -10 : sp) + "%";
}

// A write, and whether the plant took it: MQTT answers nothing, so look.
async function write(id, value) {
    if (!me || !me.connected) { txt("wmsg", "not connected"); return; }
    me.publish(`PLT/S00/${id}/val/set`, String(value));
    txt("wmsg", `${id} = ${value} ...`);
    await sleep(1500);
    const took = v[id] !== undefined && String(v[id]) === String(value) || (v[id] !== undefined && Number(v[id]) === Number(value));
    $("wmsg").innerHTML = took ? `${esc(id)} = ${esc(value)}: <b class="ok">taken</b>`
        : `${esc(id)} = ${esc(value)}: <b class="bad">not taken</b> - this session may not write it (the engine logs the refusal)`;
}
document.querySelectorAll("[data-w]").forEach((r) => {
    r.addEventListener("input", () => txt("v-" + r.dataset.w, r.value));
    r.addEventListener("change", () => write(r.dataset.w, r.value));
});
document.querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = () => write("PUMP_CMD", b.dataset.cmd); });

// ---- the self-check ---------------------------------------------------
function drawSelf() {
    let f = [];
    try { f = JSON.parse(v.SELF_CHECK || "[]"); } catch (e) { /* not yet */ }
    $("self").innerHTML = f.length ? f.map((x) =>
        `<tr><td class="${x.ok ? "ok" : "bad"}">${x.ok ? "OK" : "WEAK"}</td><td><b>${x.id}</b></td><td>${esc(x.what)}<div class="small muted">${esc(x.detail)}</div></td></tr>`).join("")
        : `<tr><td class="muted">${me && me.connected ? "not visible to this session" : "log in to see it"}</td></tr>`;
}

// ---- the access test --------------------------------------------------
// One session as one identity: resolves {vals, m} once it has read for a
// while, or {refused} if the login was turned down.
function session(user, pwd, readMs = 1500) {
    return new Promise((resolve) => {
        const m = new MqttLite(URL_MQTT, "test-" + (user || "anon") + "-" + Math.random().toString(36).slice(2, 6));
        m.retry = false;
        m.username = user || ""; m.password = pwd || "";
        const vals = {};
        let done = false;
        const finish = (r) => { if (!done) { done = true; resolve(r); } };
        m.onstatus = () => { if (m.refused) { m.close(); finish({ refused: m.refused }); } };
        m.onconnect = () => { m.subscribe("PLT/S00/+/val"); setTimeout(() => finish({ m, vals }), readMs); };
        m.onmessage = (t, x) => { vals[t.split("/")[2]] = x; };
        setTimeout(() => { m.close(); finish({ refused: "no answer" }); }, readMs + 4000);
        m.connect();
    });
}

async function tryWrite(user, id, value) {
    const s = await session(user, ACCOUNTS[user]);
    if (s.refused) return { ok: false, note: "login refused" };
    const old = s.vals[id];
    s.m.onmessage = (t, x) => { s.vals[t.split("/")[2]] = x; };
    s.m.publish(`PLT/S00/${id}/val/set`, String(value));
    await sleep(1500);
    const now = s.vals[id];
    const ok = now !== undefined && Number(now) === Number(value);
    if (ok && old !== undefined) { s.m.publish(`PLT/S00/${id}/val/set`, old); await sleep(800); }
    s.m.close();
    return { ok, note: `was ${old}, wrote ${value}, read back ${now}` + (ok ? " - put back" : "") };
}

async function canConnect(user, pwd) {
    const s = await session(user, pwd, 300);
    if (s.refused) return { ok: false, note: "refused (CONNACK " + s.refused + ")" };
    s.m.close();
    return { ok: true, note: "accepted" };
}
async function sees(user, id) {
    const s = await session(user, ACCOUNTS[user]);
    if (s.refused) return { ok: false, note: "login refused" };
    s.m.close();
    return { ok: s.vals[id] !== undefined, note: s.vals[id] !== undefined ? "visible" : "not visible" };
}

// [finding, who tries what, should it work, the try]
const TESTS = [
    [2, "someone connects without a user name", false, () => canConnect("", "")],
    [2, "opr logs in with a wrong password", false, () => canConnect("opr", "wrong")],
    [3, "mon (monitor) changes the setpoint", false, () => tryWrite("mon", "SETPOINT", 42)],
    [0, "opr (operator) changes the setpoint", true, () => tryWrite("opr", "SETPOINT", 44)],
    [4, "opr (operator) changes the trip level", false, () => tryWrite("opr", "TRIP_LEVEL", 93)],
    [0, "eng (engineer) changes the trip level", true, () => tryWrite("eng", "TRIP_LEVEL", 94)],
    [5, "mon (monitor) reads the recipe", false, () => sees("mon", "RECIPE")],
    [0, "eng (engineer) reads the recipe", true, () => sees("eng", "RECIPE")]
];

$("run").onclick = async () => {
    $("run").disabled = true;
    const rows = TESTS.map(() => null);
    const draw = () => {
        $("test").innerHTML = TESTS.map((t, i) => {
            const r = rows[i];
            const pass = r && r.ok === t[2];
            return `<tr><td>${t[0] || ""}</td><td>${esc(t[1])}</td><td>${t[2] ? "works" : "refused"}</td>`
                 + `<td>${r ? (r.ok ? "worked" : "refused") + `<div class="small muted">${esc(r.note)}</div>` : "..."}</td>`
                 + `<td class="${r ? (pass ? "ok" : "bad") : ""}">${r ? (pass ? "PASS" : "FAIL") : ""}</td></tr>`;
        }).join("");
    };
    draw();
    for (let i = 0; i < TESTS.length; i++) { rows[i] = await TESTS[i][3](); draw(); }
    const n = rows.filter((r, i) => r.ok === TESTS[i][2]).length;
    txt("score", `${n} of ${TESTS.length} as they should be. The numbers in the first column are the weaknesses in the README; 0 = a check that the fix did not lock out the people who need the access.`);
    $("run").disabled = false;
};
