// =====================================================================
// app.js -- both nodes of the cluster, side by side.
//
// One MqttLite connection per node. A node that is stopped simply does
// not answer: its column says so and MqttLite keeps trying (every 3 s),
// so a node that comes back reappears by itself.
//
//   IN   SYS/S00/+/val from each node - its view of the cluster (ROLE,
//        MASTER, TERM, PEER_UP) and of the job (A_COUNT, A_BATCH, ...)
//   OUT  SYS/S00/CLT_CMD/val/set   'standdown' / 'takeover' on that node
//        APP/S00/RUN|RATE/val/set  the job's switches, on that node
// =====================================================================
"use strict";

const NODES = [{ nid: "S01", port: 9201 }, { nid: "S02", port: 9202 }];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function makeNode(n) {
    const el = document.getElementById("node-tpl").content.firstElementChild.cloneNode(true);
    document.getElementById("nodes").appendChild(el);
    const q = (c) => el.querySelector("." + c);
    q("nid").textContent = n.nid;
    q("addr").innerHTML = `<a href="http://127.0.0.1:${n.port}/">127.0.0.1:${n.port}</a>`;
    const node = { ...n, el, q, v: {}, up: false, mqtt: null, sliding: false };

    q("standdown").onclick = () => send(node, "SYS/S00/CLT_CMD", "standdown");
    q("takeover").onclick = () => send(node, "SYS/S00/CLT_CMD", "takeover");
    q("run").onchange = () => send(node, "APP/S00/RUN", q("run").checked ? 1 : 0);
    q("rate-in").addEventListener("input", () => { node.sliding = true; q("rate").textContent = q("rate-in").value; });
    q("rate-in").addEventListener("change", () => { node.sliding = false; send(node, "APP/S00/RATE", q("rate-in").value); });
    connect(node);
    return node;
}

function send(node, adr, value) {
    if (node.mqtt && node.up) node.mqtt.publish(adr + "/val/set", String(value));
}

function connect(node) {
    const m = new MqttLite(`ws://127.0.0.1:${node.port}/mqtt`, "cl-" + node.nid + "-" + Math.random().toString(36).slice(2, 7));
    node.mqtt = m;
    m.onstatus = (text, ok) => {
        node.up = ok;
        if (!ok) node.v = {};       // what a stopped node said is no longer true
        paint(node);
    };
    m.onconnect = () => m.subscribe("SYS/S00/+/val");
    m.onmessage = (topic, text) => { node.v[topic.split("/")[2]] = text; paint(node); };
    m.connect();
}

function paint(node) {
    const { q, v } = node;
    const link = q("link");
    link.className = "chip link " + (node.up ? "ok" : "bad");
    link.textContent = node.up ? "connected" : "not answering";
    node.el.classList.toggle("down", !node.up);
    const role = node.up ? (v.ROLE || "--") : "DOWN";
    q("role").textContent = role;
    q("role").className = "role is-" + role.toLowerCase();
    node.el.dataset.role = role;
    const peer = q("peer");
    peer.className = "chip peer " + (!node.up ? "" : v.PEER_UP === "1" ? "ok" : "wrn");
    peer.textContent = !node.up ? "peer --" : v.PEER_UP === "1" ? `hears ${v.PEER || "peer"}` : `does not hear ${v.PEER || "peer"}`;
    q("master").textContent = v.MASTER || (node.up ? "not proven yet" : "--");
    q("term").textContent = v.TERM || "--";
    q("appsta").textContent = v.APP_STA ? `${v.APP_STA} ${staWord(v.APP_STA)}` : "--";
    q("count").textContent = v.A_COUNT !== undefined ? v.A_COUNT : "--";
    q("batch").textContent = v.A_BATCH || "--";
    q("by").textContent = v.A_BY || "--";
    const age = parseFloat(v.A_AGE_MS);
    q("age").textContent = Number.isFinite(age) && age >= 0 ? (age / 1000).toFixed(1) : "--";
    if (!node.sliding) { q("rate").textContent = v.A_RATE || "--"; if (v.A_RATE) q("rate-in").value = v.A_RATE; }
    q("run").checked = v.A_RUN === "1";
    const master = role === "MASTER", spare = role === "SPARE";
    q("standdown").disabled = !master;
    q("takeover").disabled = !spare;
    q("run").disabled = q("rate-in").disabled = !(master || spare);

    let list = [];
    try { list = JSON.parse(v.A_LOG || "[]"); } catch (e) { /* not yet */ }
    // The list's order on a mirror is not the master's: sort by the batch.
    list.sort((a, b) => parseInt(b.batch) - parseInt(a.batch));
    q("batches").querySelector("tbody").innerHTML = list.length
        ? list.map((b) => `<tr><td>${esc(b.batch)}</td><td><code>${esc(b.id)}</code></td><td>${esc(b.by)}</td><td>${esc(b.at)}</td></tr>`).join("")
        : `<tr><td colspan="4" class="muted">none yet - a batch is 100 units</td></tr>`;

    let roles = [];
    try { roles = JSON.parse(v.ROLES || "[]"); } catch (e) { /* not yet */ }
    q("roles").innerHTML = roles.length ? roles.map((r) => `${esc(r.t)} <b>${esc(r.role)}</b> (term ${esc(r.term)})`).join("<br>") : "--";
    header();
}

function staWord(s) {
    const x = parseInt(s, 16), st = (x >> 12) & 3, cmd = (x >> 8) & 15, eng = x & 3;
    const cl = ["alone", "CL-MASTER", "CL-SPARE", "TRANSIT"][st];
    return `(${cl}, ${eng === 3 ? "running" : cmd === 2 ? "parked" : "waiting"})`;
}

function header() {
    const masters = nodes.filter((n) => n.up && n.v.ROLE === "MASTER").map((n) => n.nid);
    const cm = document.getElementById("c-master");
    cm.textContent = masters.length ? "master: " + masters.join(", ") : "master: none";
    cm.className = "chip " + (masters.length === 1 ? "ok" : masters.length > 1 ? "bad" : "wrn");
    const terms = nodes.filter((n) => n.up && n.v.TERM).map((n) => n.v.TERM);
    document.getElementById("c-term").textContent = "term " + (terms.length ? Math.max(...terms.map(Number)) : "--");
}

const nodes = [];
for (const n of NODES) nodes.push(makeNode(n));
