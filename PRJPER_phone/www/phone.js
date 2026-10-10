// =====================================================================
// phone.js - the phone's side of PRJPER_phone.
//
// THREE JOBS
//   1. Read the motion sensors. 'devicemotion' arrives 60-100 times a
//      second; each event is added to a small window: the sum of squares
//      of the acceleration WITHOUT gravity (for the RMS), and the smallest
//      and largest acceleration WITH gravity (free fall, impact).
//   2. Five times a second, turn the window into ONE line and publish it
//      to PHN/S00/IN/val/set:
//          S,<id>,<seq>,<vib>,<gmin>,<gmax>,<tilt>,<pitch>,<roll>,<heading>
//      A hundred numbers become ten. The engine gets features, not samples.
//   3. Listen. The engine publishes the 'sta' of this phone's elements;
//      the banner is coloured by it and the phone vibrates when one goes
//      into alarm. The page itself knows no limit.
//
// WHO THIS PHONE IS: a random id of six characters, kept in the browser
// (localStorage), so a reload is the same phone. The simulated phone keeps
// it in sessionStorage instead: every tab is another phone.
// =====================================================================
"use strict";

const DOC = "PHN/S00";
const SIM = new URLSearchParams(location.search).has("sim");
const PERIOD_MS = 200;

const $ = (id) => document.getElementById(id);

// ---- who am I ---------------------------------------------------------------
function store() {
    try { return SIM ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
}
function loadId() {
    const s = store();
    let id = null;
    try { id = s && s.getItem("aymon_phone_id"); } catch (e) { /* private mode */ }
    if (!id || !/^[a-z0-9]{4,10}$/.test(id)) {
        const b = new Uint8Array(6);
        crypto.getRandomValues(b);
        id = Array.from(b, (x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
        try { s && s.setItem("aymon_phone_id", id); } catch (e) { /* then a new id each load */ }
    }
    return id;
}
const ID = loadId();
const PID = "P_" + ID;

function platform() {
    if (SIM) return "sim";
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
}
const KIND = platform();

function defaultName() {
    if (SIM) return "Simulated " + ID.slice(0, 3);
    return { ios: "iPhone", android: "Android phone" }[KIND] || "Browser";
}

// ---- the link to the engine --------------------------------------------------
// The same host and port that served this page: wss:// under https (8110,
// the phones' door), ws:// under http (8111, this PC only).
const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/mqtt";
const m = new MqttLite(url, "phone-" + ID, 20);

let started = false;
let seq = 0, sent = 0;
const sta = {};            // "VIB" -> the sta word the engine published
let lastLevel = 0;
let buzzSeen;              // undefined until the first (retained) value
let batSend = null;        // sends the battery line, once getBattery answered

function send(line) {
    if (!m.connected) return;
    m.publish(`${DOC}/IN/val/set`, line);
    sent++;
    $("sent").textContent = sent;
}

function hello() {
    // the name last: it is everything after the third comma
    send(`H,${ID},${KIND},${$("name").value.replace(/[,|<>&"']/g, " ").trim() || defaultName()}`);
    if (batSend) batSend();
}

m.onstatus = (text, ok) => {
    const c = $("c-live");
    c.textContent = ok ? "live" : text;
    c.className = "chip " + (ok ? "ok" : "bad");
    render();
};
m.onconnect = () => {
    // every element's sta: few enough (a handful per phone) to filter here
    m.subscribe(`${DOC}/+/sta`);
    m.subscribe(`${DOC}/${PID}/buzz`);
    m.subscribe(`${DOC}/${PID}_DROP/val`);
    m.subscribe(`${DOC}/MSG/val`);
    if (started) hello();
};
m.onmessage = (topic, text) => {
    const p = topic.split("/");
    if (p.length < 4) return;
    const id = p[2], attr = p[3];
    if (attr === "sta" && id.startsWith(PID + "_")) {
        sta[id.slice(PID.length + 1)] = Number(text);
        render();
    } else if (id === PID && attr === "buzz") {
        if (buzzSeen !== undefined && text !== buzzSeen) buzz();
        buzzSeen = text;
    } else if (id === PID + "_DROP" && attr === "val") {
        $("v-drop").textContent = Math.round(Number(text));
    } else if (id === "MSG") {
        $("msg").textContent = text || "--";
    }
};

// ---- what the engine thinks of us ------------------------------------------------
// sta, the low byte: bits 0-1 = 3 while the element runs, bits 2-3 the alarm
// level (1 warning, 2 alarm). The same word on every element.
const NAMES = { VIB: "vibration", TILT: "tilt", DROP: "dropped", BAT: "battery" };

function level(word) { return word === undefined || isNaN(word) ? 0 : (word >> 2) & 3; }

function render() {
    const b = $("banner");
    if (!started) { b.className = "banner"; b.innerHTML = "not started<small>press Start</small>"; return; }
    if (!m.connected) { b.className = "banner"; b.innerHTML = "no link to the engine<small>retrying…</small>"; return; }
    let worst = 0;
    const said = [];
    for (const k of Object.keys(NAMES)) {
        const l = level(sta[k]);
        if (l > worst) worst = l;
        if (l > 0) said.push(NAMES[k] + (l >= 2 ? " ALARM" : " warning"));
        const cell = $("cell-" + k.toLowerCase());
        if (cell) cell.className = "cell" + (l >= 2 ? " alm" : l === 1 ? " wrn" : "");
    }
    b.className = "banner " + (worst >= 2 ? "alm" : worst === 1 ? "wrn" : "ok");
    b.innerHTML = (worst >= 2 ? "ALARM" : worst === 1 ? "WARNING" : "normal")
                + "<small>" + (said.length ? said.join(", ") : "the engine sees nothing wrong") + "</small>";
    // the engine raised an alarm: say it with the phone, not only the page
    if (worst >= 2 && lastLevel < 2 && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    lastLevel = worst;
}

let buzzes = 0;
function buzz() {
    if (navigator.vibrate) navigator.vibrate(600);
    const b = $("banner");
    b.classList.remove("flash");
    void b.offsetWidth;                      // restart the animation
    b.classList.add("flash");
    $("buzzes").textContent = ++buzzes;
}

// ---- the sensors ------------------------------------------------------------------
let win = null;
function newWindow() { win = { n: 0, sumsq: 0, gmin: Infinity, gmax: 0 }; }
newWindow();

let grav = null;           // gravity, the slow part of accelerationIncludingGravity
const ori = { pitch: 0, roll: 0, head: 0 };
let events = 0, absHeading = false;

function onMotion(e) {
    const ag = e.accelerationIncludingGravity;
    if (!ag || ag.x === null || ag.x === undefined) return;
    events++;
    const gx = ag.x, gy = ag.y, gz = ag.z;
    // a low-pass filter keeps what changes slowly: the direction of gravity
    if (!grav) grav = { x: gx, y: gy, z: gz };
    else { grav.x += 0.1 * (gx - grav.x); grav.y += 0.1 * (gy - grav.y); grav.z += 0.1 * (gz - grav.z); }
    // the shaking is what is left; most phones also give it directly
    const a = e.acceleration;
    let dx, dy, dz;
    if (a && a.x !== null && a.x !== undefined) { dx = a.x; dy = a.y; dz = a.z; }
    else { dx = gx - grav.x; dy = gy - grav.y; dz = gz - grav.z; }
    win.sumsq += dx * dx + dy * dy + dz * dz;
    win.n++;
    const g = Math.hypot(gx, gy, gz);        // ~9.8 at rest, ~0 while falling
    if (g < win.gmin) win.gmin = g;
    if (g > win.gmax) win.gmax = g;
}

function onOrientation(e) {
    if (e.beta !== null && e.beta !== undefined) ori.pitch = e.beta;
    if (e.gamma !== null && e.gamma !== undefined) ori.roll = e.gamma;
    // a compass heading: iOS gives it by name; elsewhere alpha is one only
    // when the event says it is absolute (deviceorientationabsolute)
    if (typeof e.webkitCompassHeading === "number") { ori.head = e.webkitCompassHeading; absHeading = true; }
    else if (e.alpha !== null && e.alpha !== undefined && (e.absolute || !absHeading)) {
        ori.head = (360 - e.alpha) % 360;
        if (e.absolute) absHeading = true;
    }
}

// degrees away from lying flat (face up or face down)
function tilt() {
    if (!grav) return 0;
    const g = Math.hypot(grav.x, grav.y, grav.z);
    if (g < 1) return 0;
    return Math.acos(Math.min(1, Math.abs(grav.z) / g)) * 180 / Math.PI;
}

// ---- the simulated phone ------------------------------------------------------------
// Made-up windows with the shape a real phone produces: a little noise at
// rest; a shake; a tilt; and a drop - a window of free fall (the total
// acceleration near 0) followed by one with a hard impact.
const sim = { shakeUntil: 0, tilted: false, drop: 0, head: 0 };
function simWindow() {
    const now = Date.now(), r = Math.random;
    const t = sim.tilted ? 45 : 2;
    const rad = t * Math.PI / 180;
    grav = { x: 0.2, y: 9.81 * Math.sin(rad), z: 9.81 * Math.cos(rad) };
    ori.pitch = t; ori.roll = 1; sim.head = (sim.head + 0.4) % 360; ori.head = sim.head;
    let rms = 0.04 + 0.03 * r(), gmin = 9.75, gmax = 9.87;
    if (now < sim.shakeUntil) { rms = 4.5 + 2.5 * r(); gmin = 3.5 + r(); gmax = 18 + 6 * r(); }
    if (sim.drop === 2) { rms = 1.2; gmin = 0.6; gmax = 9.8; sim.drop = 1; }
    else if (sim.drop === 1) { rms = 9; gmin = 0.4; gmax = 34 + 8 * r(); sim.drop = 0; }
    events++;
    return { rms, gmin, gmax };
}

// ---- five times a second --------------------------------------------------------------
const f = (x, d) => (Number.isFinite(x) ? x : 0).toFixed(d);

function period() {
    let rms, gmin, gmax;
    if (SIM) ({ rms, gmin, gmax } = simWindow());
    else {
        rms = win.n ? Math.sqrt(win.sumsq / win.n) : 0;
        gmin = win.n ? win.gmin : 9.81;
        gmax = win.n ? win.gmax : 9.81;
    }
    newWindow();
    const tl = tilt();

    $("v-vib").textContent = f(rms, 2);
    $("v-tilt").textContent = f(tl, 0);
    $("v-head").textContent = f(ori.head, 0);
    if (grav) {
        const g = Math.hypot(grav.x, grav.y, grav.z) || 9.81;
        const clamp = (v) => Math.max(-40, Math.min(40, v));
        $("bubble").setAttribute("cx", f(clamp(grav.x / g * 40), 1));
        $("bubble").setAttribute("cy", f(clamp(-grav.y / g * 40), 1));
    }
    const c = $("c-sens");
    c.textContent = events ? (SIM ? "simulated" : "sensors on") : "no sensor";
    c.className = "chip " + (events ? "ok" : "bad");

    // A real phone in the background gets no sensor events: it said goodbye
    // (see visibilitychange below) and sends nothing until it is back. The
    // simulated phone needs no sensor and goes on.
    if (!started || (!SIM && document.visibilityState === "hidden")) return;
    seq++;
    const line = `S,${ID},${seq},${f(rms, 2)},${f(gmin, 2)},${f(gmax, 2)},${f(tl, 1)},`
               + `${f(ori.pitch, 1)},${f(ori.roll, 1)},${f(ori.head, 0)}`;
    $("last").textContent = line;
    send(line);
}

// ---- start / stop --------------------------------------------------------------------
let wakeLock = null;
async function keepAwake() {
    if (!$("keep-awake").checked || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* not granted: fine */ }
}

async function askSensors() {
    // iPhone: permission, and only from a tap. Elsewhere these do not exist.
    const ask = async (cls) => {
        if (typeof cls === "undefined" || typeof cls.requestPermission !== "function") return true;
        try { return (await cls.requestPermission()) === "granted"; } catch (e) { return false; }
    };
    const okM = await ask(window.DeviceMotionEvent);
    const okO = await ask(window.DeviceOrientationEvent);
    if (!okM || !okO) note("The phone said no to the motion sensors. Allow them for this site and reload.", true);
    window.addEventListener("devicemotion", onMotion);
    if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);
}

function note(text, bad) { const n = $("start-note"); n.textContent = text; n.className = "note" + (bad ? " bad" : ""); }

async function start() {
    if (started) { stop(); return; }
    try { localStorage.setItem("aymon_phone_name", $("name").value); } catch (e) { /* fine */ }
    if (!SIM) await askSensors();
    started = true;
    $("start").textContent = "Stop";
    hello();
    keepAwake();
    if ($("share-pos").checked) watchPos(true);
    render();
    setTimeout(() => {
        if (!SIM && !events)
            note("No motion events from this device. A PC has no such sensor: open phone.html?sim=1 for the simulated phone.", true);
    }, 2500);
}

function stop() {
    send(`X,${ID}`);
    started = false;
    $("start").textContent = "Start";
    watchPos(false);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    render();
}

// ---- battery and position: sent only when they change -------------------------------------
if (SIM) {
    batSend = () => send(`B,${ID},77,0`);
} else if (navigator.getBattery) {
    navigator.getBattery().then((bat) => {
        batSend = () => send(`B,${ID},${Math.round(bat.level * 100)},${bat.charging ? 1 : 0}`);
        bat.addEventListener("levelchange", () => started && batSend());
        bat.addEventListener("chargingchange", () => started && batSend());
        if (started) batSend();
    }).catch(() => {});
}

// Position only when the owner ticks the box: it is the one reading here
// that says where a person is. The engine keeps the last one in memory,
// with the phone, and forgets it with the phone.
let posWatch = null, posLast = 0;
function watchPos(on) {
    if (!on || !started || SIM || !navigator.geolocation) {
        if (posWatch !== null) { navigator.geolocation.clearWatch(posWatch); posWatch = null; }
        return;
    }
    if (posWatch !== null) return;
    posWatch = navigator.geolocation.watchPosition((p) => {
        if (Date.now() - posLast < 5000) return;            // at most every 5 s
        posLast = Date.now();
        send(`G,${ID},${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)},${Math.round(p.coords.accuracy)}`);
    }, (err) => note("Position: " + err.message, true), { enableHighAccuracy: false, maximumAge: 10000 });
}

// ---- wiring ---------------------------------------------------------------------------
$("pid").textContent = PID;
let savedName = null;
try { savedName = SIM ? null : localStorage.getItem("aymon_phone_name"); } catch (e) { /* fine */ }
$("name").value = savedName || defaultName();
$("start").addEventListener("click", start);
$("share-pos").addEventListener("change", (e) => watchPos(e.target.checked));
$("keep-awake").addEventListener("change", keepAwake);

if (SIM) {
    $("sim-card").hidden = false;
    $("share-pos").disabled = true;
    $("sim-shake").addEventListener("click", () => { sim.shakeUntil = Date.now() + 3000; });
    $("sim-tilt").addEventListener("click", (e) => {
        sim.tilted = !sim.tilted;
        e.target.textContent = sim.tilted ? "lay it flat" : "tilt 45°";
    });
    $("sim-drop").addEventListener("click", () => { sim.drop = 2; });
    note("A simulated phone: press Start, then shake, tilt or drop it with the buttons below.");
} else if (!window.isSecureContext) {
    note("This page came over plain http from another machine, so the browser hides the motion sensors. "
       + "Open https://" + location.hostname + ":8110/phone.html instead.", true);
}

// A page in the background gets no sensor events: say goodbye rather than
// leave the engine waiting, and come back with the next line.
document.addEventListener("visibilitychange", () => {
    if (!started || SIM) return;
    if (document.visibilityState === "hidden") send(`X,${ID}`);
    else { hello(); keepAwake(); }
});
window.addEventListener("pagehide", () => { if (started) send(`X,${ID}`); });   // closed, reloaded

m.connect();
setInterval(period, PERIOD_MS);
render();
