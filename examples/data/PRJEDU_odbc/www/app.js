// =====================================================================
// app.js -- the history page: what HIS/S00 writes and what the database
// says back.
//
//   IN   HIS/S00/+/val      NOW, STATS (JSON), RECENT (JSON), FOUND (JSON)
//   OUT  HIS/S00/FIND/val/set   a tag to count - the only thing the page
//                               may write; main.find binds it
// =====================================================================
"use strict";

const $ = (id) => document.getElementById(id);
const txt = (id, t) => { $(id).textContent = t; };
const json = (id) => { try { return JSON.parse(Kit.get(id) || "null"); } catch (e) { return null; } };

const trend = new Kit.Trend($("trend"), [{ key: "NOW", label: "reading C", color: "--c1", min: 10, max: 30 }]);

function drawStats() {
    const st = json("STATS");
    if (!st) return;
    txt("n", st.n ?? "--");
    txt("mm", st.min === undefined ? "--" : `${st.min} .. ${st.max}`);
    txt("avg", st.avg ?? "--");
    txt("attack", st.attack ?? "--");
    txt("nul", st.nul || "--");
    txt("at", st.time || "--");
    if (st.eng && $("db")) txt("db", st.eng);
}

function drawRows() {
    const r = json("RECENT");
    if (!Array.isArray(r) || !r.length) return;
    // the columns are the SELECT's, whatever it names - drop the element's own keys
    const cols = Object.keys(r[0]).filter((k) => !["xdb_elm", "id", "sta", "xdb_acl"].includes(k) && !k.startsWith("qry_"));
    $("rhead").innerHTML = "<tr>" + cols.map((c) => `<th>${Kit.esc(c)}</th>`).join("") + "</tr>";
    $("rows").innerHTML = r.map((row) => "<tr>" + cols.map((c) => `<td>${Kit.esc(row[c] ?? "")}</td>`).join("") + "</tr>").join("");
}

function drawFound() {
    const f = json("FOUND");
    if (!f || !asked || f.tag !== asked) return;
    $("found").innerHTML = `<b>${Kit.esc(f.n)}</b> rows carry the tag <code>${Kit.esc(f.tag)}</code>`
        + (f.last ? `, the newest at ${Kit.esc(f.last)}` : "")
        + `. The table is intact: the statement was <code>... WHERE tag = ?</code> and the text was a value.`;
}

let asked = null;
function search(t) {
    asked = t;
    $("found").textContent = "asking the database ...";
    Kit.write("HIS/S00", "FIND", "val", t);
}
$("go").onclick = () => search($("tag").value);
document.querySelectorAll(".try").forEach((b) => { b.onclick = () => { $("tag").value = b.dataset.t; search(b.dataset.t); }; });

Kit.start({
    subs: ["HIS/S00/+/val"],
    onmsg: (id, attr, text) => {
        if (id === "NOW") { txt("now", Number(text).toFixed(2)); trend.push("NOW", Number(text)); }
        else if (id === "STATS") drawStats();
        else if (id === "RECENT") drawRows();
        else if (id === "FOUND") drawFound();
    }
});
