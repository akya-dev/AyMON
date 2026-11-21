// =====================================================================
// db_HOST.js -- the host's script.
//
// It never sees a root's request: the door hands those over first. What
// it sees of a root is HOST.list(), a summary -- running or not, health,
// how many documents, connections, sessions, FAIL / PANIC lines -- never
// a root's values. HOST.* runs in the process root's documents only, and
// only for role Engineer (6) and above: the door gives this page's
// visitors con_role="6".
// =====================================================================

var g_notes = [];      // what the buttons did, oldest first
var g_backup = "";     // the last HOST.backup's directory, for Restore

function note(evt, t)
{
	g_notes.push(Time.GetTimeStr("%H:%M:%S") + "  " + t);
	if (g_notes.length > 12) g_notes.shift();
	evt.Log(4, "PAGE " + t);
}

// ---------------------------------------------------------------------
// www\state.ayp asks once a second: the roots, and what the host gets
// when it tries to look inside one.
// ---------------------------------------------------------------------
function state(evt)
{
	var rows = [];
	var l = HOST.list();
	for (var i = 0; i < l.length; i++) {
		var r = l[i];
		rows.push({
			id: r.id, run: r.run, hold: r.hold, hlt: r.hlt,
			docs: r.docs, cons: r.cons, thrs: r.thrs, ses: r.ses,
			fail: r.fail, pnc: r.pnc,
			// the host's own fields, on the root's <doc> in this file
			host: "" + evt.GetValue("id('" + r.id + "')/@root_host"),
			desc: "" + evt.GetValue("id('" + r.id + "')/@desc")
		});
	}

	// the boundary, from the host's side. Every root has a document SITE;
	// none of them is in the host's tree, and a star stops at the roots too.
	// The bridge is refused because ACME's root_peers does not name HOST:
	// the answer is undefined, and the host's log has one ERROR line.
	var a = evt.GetValue("doc('SITE')/id('LEVEL')/@val");
	var s = "" + evt.GetValue("doc('*')/id('LEVEL')/@val");
	var b = "";
	try {
		var v = evt.GetValue("doc('SITE@ACME')/id('LEVEL')/@val");
		b = (v == null || ("" + v) == "") ? "nothing came back: the host's log says why" : "" + v;
	} catch (e) {
		b = e.message;
	}

	return JSON.stringify({
		rows: rows,
		notes: g_notes,
		backup: g_backup,
		local: Time.GetTimeStr(20),
		tz: Time.tz(),
		peek_doc: (a == null || ("" + a) == "") ? "nothing" : "" + a,
		peek_star: s,
		peek_bridge: b
	});
}

// ---------------------------------------------------------------------
// The page's buttons. Every HOST.* call that cannot do what it is asked
// throws with the reason (inside a try): e.message goes on the page.
// add, remove, backup and restore run in the background, one at a time;
// the call answers at once and this log says when each ends.
// ---------------------------------------------------------------------
function act(evt, a, id)
{
	var r = "";
	try {
		if (a == "stop") {
			r = "HOST.stop('" + id + "') = " + HOST.stop(id);
		} else if (a == "start") {
			r = "HOST.start('" + id + "') = " + HOST.start(id);
		} else if (a == "backup") {
			var p = HOST.backup(id);
			if (p) g_backup = "" + p;
			r = "HOST.backup('" + id + "') = " + p;
		} else if (a == "add") {
			r = "HOST.add('GAMMA', '%PRJ%/templates/site', {root_host: 'gamma.localhost'}) = " +
				HOST.add("GAMMA", "%PRJ%/templates/site", { root_host: "gamma.localhost", desc: "made from templates/site" });
		} else if (a == "restore") {
			if (g_backup == "") r = "nothing to restore: back a root up first";
			else r = "HOST.restore('COPY', '" + g_backup + "', {root_host: 'copy.localhost'}) = " +
				HOST.restore("COPY", g_backup, { root_host: "copy.localhost", desc: "restored from a backup" });
		} else if (a == "remove") {
			// this example's own roots stay: removing one with its data would
			// delete roots\ACME from your copy of the example
			if (id == "ACME" || id == "BETA") r = "the page does not remove " + id + ", one of this example's own roots: Stop it instead";
			else r = "HOST.remove('" + id + "', 1) = " + HOST.remove(id, 1);
		} else {
			r = "no such button: " + a;
		}
	} catch (e) {
		r = e.message;
	}
	note(evt, r);
}
