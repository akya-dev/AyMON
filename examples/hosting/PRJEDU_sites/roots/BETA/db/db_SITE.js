// =====================================================================
// db_SITE.js -- one site: a tank, a pump, and what this root can see.
//
// The same file is in roots\ACME, roots\BETA and templates\site: a root
// is an ordinary project, and every root made from the template runs it.
//
// This script language keeps the LEFT operand's type: 1 / 2.5 is an
// integer. Every sum here starts from a float.
// =====================================================================

var g_seen = "";       // what doc('*') finds from here
var g_host = "";       // what this root gets for HOST.list()
var g_other = "";      // what doc('SITE') of another root gives without a bridge

// ---------------------------------------------------------------------
// Once a second (T_SIM), as the engine, on this document's thread.
// ---------------------------------------------------------------------
function tick(evt)
{
	// the tank: 1 to 2.5 % a second in, 4 % a second out while the pump runs
	var lvl = parseFloat(evt.GetValue("id('LEVEL')/@val"));
	var pump = parseInt(evt.GetValue("id('PUMP')/@val"));
	var hi = parseFloat(evt.GetValue("id('START_AT')/@val"));
	var lo = parseFloat(evt.GetValue("id('STOP_AT')/@val"));
	lvl = lvl + 1.0 + Math.random() * 1.5;
	if (pump) lvl = lvl - 4.0;
	if (lvl < 0.0) lvl = 0.0;
	if (lvl > 100.0) lvl = 100.0;
	if (!pump && lvl >= hi) {
		pump = 1;
		evt.SetValue("id('STARTS')/@val", parseInt(evt.GetValue("id('STARTS')/@val")) + 1);
	}
	if (pump && lvl <= lo) pump = 0;
	evt.SetValue("id('LEVEL')/@val", lvl.toFixed(2));      // text into a 0x0308 attribute: stored as a number
	evt.SetValue("id('PUMP')/@val", pump);

	// the shift, by THIS root's clock: Time.* answers in its xdb_tz
	var h = parseInt(Time.GetTimeStr("%H"));
	var s = "C, 22 to 06";
	if (h >= 6 && h < 14) s = "A, 06 to 14";
	if (h >= 14 && h < 22) s = "B, 14 to 22";
	evt.SetValue("id('SHIFT')/@val", s);

	// the bridge: another root's level, read the way a document on another
	// engine is read (doc('X@CN')), with no network. Unless both roots name
	// each other in root_peers it is refused: the answer is undefined, and
	// one ERROR line in this root's log says why (then one every 10 min).
	var ask = "" + evt.GetValue("id('ASK')/@val");
	var peer = "";
	if (ask != "") {
		try {
			var v = evt.GetValue("doc('SITE@" + ask + "')/id('LEVEL')/@val");
			if (v == null || ("" + v) == "") peer = "nothing came back: this root's log says why";
			else peer = parseFloat(v).toFixed(1) + " %";
		} catch (e) {
			peer = e.message;      // a root that is not there, or being removed
		}
	}
	evt.SetValue("id('PEER')/@val", peer);

	// the boundary, from inside: what this root finds when it looks around.
	// A star answers a list of {doc, val}: every root has a SITE with a
	// LEVEL, and this one finds its own.
	g_seen = "" + evt.GetValue("doc('*')/id('LEVEL')/@val");
	try { HOST.list(); g_host = "allowed"; } catch (e) { g_host = e.message; }
	var o = evt.GetValue("doc('HOST')/@tid");
	g_other = (o == null || ("" + o) == "") ? "nothing" : "" + o;
	return 0;
}

// ---------------------------------------------------------------------
// The page: www\state.ayp asks once a second. It runs as the VISITOR, on
// this root's connection's thread; role = the role the page shows.
// ---------------------------------------------------------------------
function state(evt, role)
{
	var s = {
		tid: "" + evt.GetValue("doc('SITE')/@tid"),
		tz: Time.tz(),
		local: Time.GetTimeStr(20),
		shift: "" + evt.GetValue("id('SHIFT')/@val"),
		level: parseFloat(evt.GetValue("id('LEVEL')/@val")),
		pump: parseInt(evt.GetValue("id('PUMP')/@val")),
		start_at: parseFloat(evt.GetValue("id('START_AT')/@val")),
		stop_at: parseFloat(evt.GetValue("id('STOP_AT')/@val")),
		starts: parseInt(evt.GetValue("id('STARTS')/@val")),
		ask: "" + evt.GetValue("id('ASK')/@val"),
		peer: "" + evt.GetValue("id('PEER')/@val"),
		peers: "" + evt.GetValue("doc('SITE')/@root_peers"),
		seen: g_seen,
		host: g_host,
		other: g_other,
		role: role
	};
	return JSON.stringify(s);
}

// the page's slider: where the pump starts, 50 to 95 %
function set_start(evt, v)
{
	var x = parseFloat(v);
	if (isNaN(x)) return;
	if (x < 50.0) x = 50.0;
	if (x > 95.0) x = 95.0;
	evt.SetValue("id('START_AT')/@val", x);
	evt.Log(4, "PAGE START_AT = " + x);
}
