// =====================================================================
// UA/S00 - the script side of the OPC UA client.
//
//   init(evt)     our certificate, made once (OPC.cert) - in xdb_init,
//                 which runs BEFORE the connections are configured
//   cmd_s(evt)    the page's requests for the SECURE session (TH_UAS):
//                 setpoint, start/stop, the machine's two methods
//   cmd_a(evt)    the page's one request for the ANONYMOUS session (TH_UA):
//                 start/stop, which the server will refuse
//   age(evt)      how old a value was when it reached the engine
//   browse(evt)   what the machine has: OPC.browse, and an OPC.gen draft
//   status(evt)   the three connections, for the page
//
// Why two command functions: an OPC UA session numbers its messages and
// the numbers must come without a gap, so everything that uses a session
// runs on the thread of that session's <bi>s. A write done from the
// page's MQTT thread would race the poll; the engine refuses it and logs
// "AYNI OTURUM IKI THREAD'DE" (same session on two threads).
// =====================================================================

var NSU = "nsu=urn:aymon:examples:moulding;s=";

function get(evt, adr)   { return evt.GetValue(adr); }
function val(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }

// ---------------------------------------------------------------------
// INIT: our certificate, once, before CN_UAS is configured - it loads
// the certificate then, and a secure connection without one is refused.
// A new certificate on every start would have to be trusted on the
// machine again every time - so it is made only if it is not there.
// ---------------------------------------------------------------------
function init(evt)
{
    var f = File.open("%DB%/pki/aymon_cert.pem", "r");
    if (f) {
        File.close(f);
        evt.Log(4, "UA: our certificate is db/pki/aymon_cert.pem");
    } else {
        evt.Log(4, "UA: no certificate yet - making one");
        OPC.cert("%DB%/pki/aymon_cert.pem", "%DB%/pki/aymon_key.pem",
                 "urn:AyMON:PRJEDU_opcua", "AyMON PRJEDU_opcua", "");     // logs its own line
    }
    return 0;
}

// ---------------------------------------------------------------------
// THE PAGE'S REQUESTS
// REQ = {"id":n,"op":"sp"|"run"|"job"|"reset"|"anon_run","v":...}
// RES = {"id":n,"op":...,"ok":true|false,"text":"...","ms":...}
// ---------------------------------------------------------------------
function pending(evt, anon)
{
    var t = "" + val(evt, "REQ");
    if (t == "" || t == "undefined") return null;
    var r = JSON.parse(t);
    if (!r || !r.op) return null;
    if ((r.op == "anon_run") != anon) return null;       // the other thread's
    var d = "" + val(evt, "RES");
    if (d != "" && d != "undefined") {
        var o = JSON.parse(d);
        if (o && o.id == r.id) return null;               // answered already
    }
    return r;
}

function answer(evt, r, ok, text, t0)
{
    var o = { id: r.id, op: r.op, ok: ok, text: text, ms: Time.GetTimeMs() - t0 };
    set(evt, "RES", JSON.stringify(o));
    evt.Log(4, "UA: request " + r.op + " -> " + (ok ? "OK" : "NOT DONE") + ": " + text);
}

// A write: put the value in the point's 'pro' - PRO.out sends it, here,
// on this thread, and waits for the server's answer. A refused write
// leaves the point WAITING (the low bits of its sta, 3 = RUNNING), which
// is how we know - the server's reason is in the log.
function write(evt, id, v)
{
    evt.SetValue("id('" + id + "')/@pro", v);
    var sta = parseInt("" + evt.GetValue("id('" + id + "')/@sta"));
    var ok = ((sta & 3) == 3) ? true : false;
    return { ok: ok, text: "wrote " + v + (ok ? "" : " - REFUSED by the server (see the log)") };
}

function cmd_s(evt)
{
    var r = pending(evt, false);
    if (!r) return 0;
    var t0 = Time.GetTimeMs();
    if (r.op == "sp") {
        var sp = 0.0 + r.v;
        if (sp < 30.0 || sp > 90.0) { answer(evt, r, false, "setpoint out of 30..90 C", t0); return 0; }
        var w = write(evt, "SP_W", sp);
        answer(evt, r, w.ok, w.text, t0);
    } else if (r.op == "run") {
        var w2 = write(evt, "RUN_W", r.v ? 1 : 0);
        answer(evt, r, w2.ok, w2.text, t0);
    } else if (r.op == "reset") {
        var o = OPC.call("IMMS", NSU + "IMM1", NSU + "IMM1.ResetCounter");
        answer(evt, r, ("" + o).indexOf("\"ok\":true") >= 0 ? true : false, "ResetCounter() -> " + o, t0);
    } else if (r.op == "job") {
        var o2 = OPC.call("IMMS", NSU + "IMM1", NSU + "IMM1.SetJob", "" + r.v);
        answer(evt, r, ("" + o2).indexOf("\"ok\":true") >= 0 ? true : false, "SetJob('" + r.v + "') -> " + o2, t0);
    } else {
        answer(evt, r, false, "unknown request", t0);
    }
    return 0;
}

function cmd_a(evt)
{
    var r = pending(evt, true);
    if (!r) return 0;
    var t0 = Time.GetTimeMs();
    var w = write(evt, "RUN_A", r.v ? 1 : 0);
    answer(evt, r, w.ok, w.text, t0);
    return 0;
}

// ---------------------------------------------------------------------
// HOW OLD - in the point's pro_fnc, after VAL.put. xdb_tim is the
// machine's source timestamp (set before the value, so it is this
// value's); now minus it is how long the value took to get here. The
// machine runs on this computer, so the two clocks are one.
// ---------------------------------------------------------------------
function age(evt)
{
    var id = "" + evt.obj.id;
    var src = evt.GetValue("id('" + id + "')/@xdb_tim");
    if (!src) return 0;
    evt.SetValue("id('" + id + "')/@age", Time.GetTimeMs() - src);
    return 0;
}

// ---------------------------------------------------------------------
// WHAT THE MACHINE HAS - once the anonymous session is up.
// OPC.browse gives the children of a node: this is where the NodeIds in
// pro_adr come from. OPC.gen walks the same tree and writes a draft
// <bi>/<io> block, typed by reading each variable once.
// ---------------------------------------------------------------------
function browse(evt)
{
    var done = "" + val(evt, "BROWSE");
    if (done != "" && done != "undefined") return 0;
    var b = "" + OPC.browse("IMM", NSU + "IMM1");
    if (b.indexOf("[") != 0) return 0;                 // not connected yet: next time
    set(evt, "BROWSE", b);
    evt.Log(4, "UA: IMM1 has " + JSON.parse(b).length + " nodes");
    OPC.gen("IMM", "%PRJ%/log/IMM1_generated.xml", NSU + "IMM1", "TH_UA");  // logs its own line
    return 0;
}

// ---------------------------------------------------------------------
// THE THREE CONNECTIONS, for the page
// ---------------------------------------------------------------------
function num(evt, adr) { var v = get(evt, adr); return (v === undefined || v === null || ("" + v) == "") ? 0 : parseInt("" + v); }

function status(evt)
{
    var o = {
        ua:  { sta: num(evt, "id('IMM')/@sta"),  snd: num(evt, "id('IMM')/@pro_pol_snd"),  rcv: num(evt, "id('IMM')/@pro_pol_rcv") },
        uap: { sta: num(evt, "id('IMMP')/@sta"), snd: num(evt, "id('IMMP')/@pro_pol_snd"), rcv: num(evt, "id('IMMP')/@pro_pol_rcv"),
               lag: num(evt, "id('IMMP')/@pro_pub_lag"), dur: num(evt, "id('IMMP')/@pro_pub_dur"), pub: num(evt, "id('IMMP')/@pro_pub_rcv") },
        uas: { sta: num(evt, "id('IMMS')/@sta"), snd: num(evt, "id('IMMS')/@pro_pol_snd"), rcv: num(evt, "id('IMMS')/@pro_pol_rcv") },
        now: Time.GetTimeMs()
    };
    set(evt, "STATUS", JSON.stringify(o));
    return 0;
}
