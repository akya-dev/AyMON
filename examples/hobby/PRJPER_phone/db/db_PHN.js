// =====================================================================
// PHN/S00 - the phones.
//
//   on_in(evt)    val_fnc of IN: a phone's line arrived. It only FILES the
//                 line in INBOX and returns (MQTT threads - one per door)
//   drain(evt)    every 0.1 s on TH_PHN: takes INBOX and does the work,
//                 every phone's lines in the order they came
//   on_buzz(evt)  val_fnc of BUZZ: the dashboard wants a phone to vibrate
//   on_limits     val_fnc of LIMITS: the dashboard moves an alarm limit
//   on_reset      val_fnc of RESET: the dashboard clears a phone's drops
//   tick(evt)     once a second on TH_PHN: links, forgetting, the list
//
// WHY THE INBOX. Two doors, so two MQTT threads write IN, while tick
// changes and removes phones on TH_PHN. Doing the work where it arrives
// would mean three threads creating, writing and deleting the same
// elements. Filing the line is one short step under one lock; everything
// after it runs on ONE thread, in order - no race left to think about.
// (Engines before 4.3.4.513 had one more reason: an alarm raised inside a
// write from a network client, or inside a write a script made in that
// write's val_fnc, was computed but its 'sta' was not stored. Work done by
// a timer was not affected. 4.3.4.513 stores it. See the README.)
//
// A phone is an element, P_<its id>, made the first time it speaks. What
// the engine remembers about it lives in that element's attributes (seen,
// msgs, ff, buzz), not in script variables: a script file is a collection
// of functions, and the element is where the dashboard can see it too.
// =====================================================================

function start(evt)
{
    evt.SetValue("id('LIMITS_NOW')/@val", limits_json(evt));
    evt.Log(4, "PHN: phones on https://<this PC's address>:8110/phone.html (run.bat printed it)");
    evt.Log(4, "PHN: dashboard on http://127.0.0.1:8111/ - a simulated phone on http://127.0.0.1:8111/phone.html?sim=1");
    return 0;
}

// ---- small helpers ----------------------------------------------------------

function num(evt, adr)   { return parseFloat("" + evt.GetValue(adr)); }
function rule(evt, id)   { return num(evt, "id('" + id + "')/@val"); }

// GetTimeMs is an unsigned integer: in a float before any subtraction,
// or "now - later" wraps round to four billion.
function now_ms()        { return 0.0 + Time.GetTimeMs(); }

function say(evt, txt)
{
    evt.SetValue("id('MSG')/@val", txt);
    evt.Log(4, "PHN: " + txt);
}

// The one lock every thread that touches INBOX takes. Any object with a
// script lock would do; the phones' connection is simply always there.
function inbox_lock() { return xdb.con["CN_LIVES"]; }

// A phone names itself: 4 to 10 of a-z and 0-9, made up by the page and
// kept in the phone's browser. Anything else is refused before it can
// become part of an element id or an XPath.
function ok_id(s)
{
    if (s.length < 4 || s.length > 10) return false;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57))) return false;
    }
    return true;
}

// A name is only shown, never parsed - but it still goes through a page, so
// the characters that mean something in HTML or in this protocol go.
function clean_name(s)
{
    var out = "";
    for (var i = 0; i < s.length && out.length < 24; i++) {
        var ch = s.charAt(i);
        if ("<>&\"',|".indexOf(ch) < 0) out = out + ch;
    }
    out = out.trim();
    return out ? out : "a phone";
}

// Parse an XML fragment with the XDB fields on (-1) and add it under
// 'parent'. AddElement takes a node that belongs to no document, so it is
// taken out of the little document it was parsed into first. Without the
// -1 the element is added but id() does not find it.
function add_xml(evt, parent, text, tag)
{
    var x = new XML(text, -1);
    var n = x[tag];
    x.removeChild(n);
    return evt.AddElement(parent, n);
}

// One <var> of a phone. No xdb_acl of its own: it takes the nearest one
// above it - the <phone>'s, 0xFF111111, read-only for every role. A
// phone's measurement is written by main, never by a page.
function var_xml(pid, what, cls, val)
{
    return "<var id=\"" + pid + "_" + what + "\" xdb_cls=\"" + cls + "\""
         + " sta=\"0x0303\" val=\"" + val + "\"/>";
}

// The first line of a phone we do not know: its element, then its <var>s.
// Returns false if there is no room.
//
// ONE AddElement PER ELEMENT. The <var>s are not written inside the
// <phone> text because engines before 4.3.4.512 moved only the added
// element into this document: a child that arrived inside its parent stayed
// tied to the little document it was parsed in, so it found no class (no
// val_fnc, no unit, no limits) and a write of @val left two 'val' in its
// XML. From 4.3.4.512 on the whole subtree joins, and the <var>s could be
// written inside the <phone> text; added one by one they work on every
// engine, so the example keeps it that way.
function make_phone(evt, pid)
{
    var have = parseInt("" + evt.GetValue("count(id('PHONES')/phone)"));
    if (have >= rule(evt, "MAX_PHONES")) {
        say(evt, "refused " + pid + ": already " + have + " phones (MAX_PHONES)");
        return false;
    }
    var t = Math.round(now_ms());           // an integer, so the XML text has no ".0"
    // seen, msgs and ff change with every line: their types carry 0x4000,
    // LOCAL, so MQTT does not send them to every page five times a second.
    // name, kind, chg and buzz are published - buzz is how a phone hears
    // that it should vibrate.
    var xml = "<phone id=\"" + pid + "\" name=\"\" kind=\"\" chg=\"\" buzz=\"0\""
            + " first_typ=\"0x4308\" first=\"" + t + "\" seen_typ=\"0x4308\" seen=\"" + t + "\""
            + " msgs_typ=\"0x4104\" msgs=\"0\" ff_typ=\"0x4308\" ff=\"0\""
            + " xdb_acl=\"0xFF111111\" sta=\"0x0303\" sta_typ=\"0x1142\""
            + " val=\"1\" val_typ=\"0x1104\" val_fnc=\"[ALM.onin]\" val_alm_onin_alm=\"[0]\"/>";
    if (!add_xml(evt, "id('PHONES')", xml, "phone")) {
        evt.Log(3, "PHN: could not add " + pid);
        return false;
    }
    var adr = "id('" + pid + "')";
    add_xml(evt, adr, var_xml(pid, "VIB",   "cls_VIB",  "0"), "var");
    add_xml(evt, adr, var_xml(pid, "TILT",  "cls_TILT", "0"), "var");
    add_xml(evt, adr, var_xml(pid, "PITCH", "cls_ANG",  "0"), "var");
    add_xml(evt, adr, var_xml(pid, "ROLL",  "cls_ANG",  "0"), "var");
    add_xml(evt, adr, var_xml(pid, "HEAD",  "cls_ANG",  "0"), "var");
    add_xml(evt, adr, var_xml(pid, "DROP",  "cls_DROP", "0"), "var");
    return true;
}

// The dashboard's list: id, name and kind of every phone.
function update_list(evt)
{
    var all = JSON.parse(evt.GetValue("json(id('PHONES')/phone)"));
    var out = [];
    for (var i = 0; i < all.length; i++)
        out.push({ id: all[i].id, name: all[i].name, kind: all[i].kind });
    evt.SetValue("id('LIST')/@val", JSON.stringify(out));
}

// ---- a line arrives: file it --------------------------------------------------------

// val_fnc of IN. Inside a *_fnc the attribute still holds the OLD value;
// the line being written is evt.valn. Only the kinds a phone may send get
// in: R (reset) is the dashboard's, and arrives through on_reset.
function on_in(evt)
{
    var line = ("" + evt.valn).trim();
    var k = line.substring(0, 2);
    if (k != "S," && k != "H," && k != "B," && k != "G," && k != "X,") return 0;
    file_line(evt, line);
    return 0;
}

// val_fnc of RESET (the dashboard, role 3): "<element id> <anything>".
function on_reset(evt)
{
    var pid = ("" + evt.valn).split(" ")[0];
    if (pid.substring(0, 2) == "P_" && ok_id(pid.substring(2)))
        file_line(evt, "R," + pid.substring(2));
    return 0;
}

// INBOX holds the lines not yet worked on, '|' between them - so a line
// that holds one is refused. If drain falls behind by more than INBOX_MAX
// characters - a phone gone mad, or a page sending far faster than it
// should - new lines are thrown away and counted in LOST, rather than
// letting the inbox grow without end.
function file_line(evt, line)
{
    if (line.length > 200 || line.indexOf("|") >= 0) return;
    var con = inbox_lock();
    con.lock(1000);
    try {
        var box = "" + evt.GetValue("id('INBOX')/@val");
        if (box.length > rule(evt, "INBOX_MAX"))
            evt.SetValue("id('LOST')/@val", parseInt("" + evt.GetValue("id('LOST')/@val")) + 1);
        else
            evt.SetValue("id('INBOX')/@val", box ? box + "|" + line : line);
    } catch (e) {
        evt.Log(3, "PHN: file_line: " + e.message);
    } finally {
        con.unlock();
    }
}

// ---- ... and work on it, on TH_PHN ------------------------------------------------------

// Timer T_IN, every 0.1 s. Take the whole inbox under the lock, leave it
// empty, and work outside the lock - the MQTT threads never wait for us.
function drain(evt)
{
    var con = inbox_lock();
    var box = "";
    con.lock(1000);
    try {
        box = "" + evt.GetValue("id('INBOX')/@val");
        if (box) evt.SetValue("id('INBOX')/@val", "");
    } catch (e) {
        evt.Log(3, "PHN: drain: " + e.message);
    } finally {
        con.unlock();
    }
    if (!box) return 0;
    var lines = box.split("|");
    for (var i = 0; i < lines.length; i++) use_line(evt, lines[i]);
    return 0;
}

function use_line(evt, line)
{
    var f = line.split(",");
    if (f.length < 2) return;
    var kind = f[0];
    if (!ok_id(f[1])) return;
    var pid = "P_" + f[1];
    var adr = "id('" + pid + "')";
    var known = evt.GetValue(adr + "/@seen") != null;

    if (kind == "R") {                                  // the dashboard's reset
        if (known) {
            evt.SetValue("id('" + pid + "_DROP')/@val", 0.0);
            evt.SetValue(adr + "/@ff", 0.0);
            say(evt, evt.GetValue(adr + "/@name") + " (" + pid + ") drop count reset");
        }
        return;
    }
    if (kind == "X") {                                  // goodbye
        if (known && parseInt("" + evt.GetValue(adr + "/@val")) == 1) {
            evt.SetValue(adr + "/@val", 0);
            say(evt, evt.GetValue(adr + "/@name") + " (" + pid + ") closed its page");
        }
        return;
    }
    if (!known) {
        if (!make_phone(evt, pid)) return;
        say(evt, "new phone " + pid);
        update_list(evt);
    }

    var t = now_ms();
    if (kind == "H" && f.length >= 4) {
        // the name is everything after the third comma
        var name = clean_name(f.slice(3).join(" "));
        evt.SetValue(adr + "/@name", name);
        evt.SetValue(adr + "/@kind", clean_name(f[2]));
        say(evt, pid + " is " + name + " (" + f[2] + ")");
        update_list(evt);
    }
    else if (kind == "S" && f.length >= 10) {
        sample(evt, pid, f, t);
    }
    else if (kind == "B" && f.length >= 4) {
        // made on the first B line: see cls_BAT
        if (evt.GetValue("id('" + pid + "_BAT')/@val") == null)
            add_xml(evt, adr, var_xml(pid, "BAT", "cls_BAT", "0"), "var");
        evt.SetValue("id('" + pid + "_BAT')/@val", parseFloat(f[2]));
        evt.SetValue(adr + "/@chg", f[3] == "1" ? "charging" : "");
    }
    else if (kind == "G" && f.length >= 5) {
        var pos = f[2] + "," + f[3] + "," + f[4];
        if (evt.GetValue("id('" + pid + "_POS')/@val") == null)
            add_xml(evt, adr, var_xml(pid, "POS", "cls_POS", ""), "var");
        evt.SetValue("id('" + pid + "_POS')/@val", pos);
    }

    // the link: seen now, and back up if it was down
    evt.SetValue(adr + "/@seen", t);
    evt.SetValue(adr + "/@msgs", parseInt("" + evt.GetValue(adr + "/@msgs")) + 1);
    if (parseInt("" + evt.GetValue(adr + "/@val")) == 0) {
        evt.SetValue(adr + "/@val", 1);
        say(evt, evt.GetValue(adr + "/@name") + " (" + pid + ") link up");
    }
}

// S,<phone>,<seq>,<vib>,<gmin>,<gmax>,<tilt>,<pitch>,<roll>,<heading>
function sample(evt, pid, f, t)
{
    var p = "id('" + pid + "_";
    evt.SetValue(p + "VIB')/@val",   parseFloat(f[3]));
    evt.SetValue(p + "TILT')/@val",  parseFloat(f[6]));
    evt.SetValue(p + "PITCH')/@val", parseFloat(f[7]));
    evt.SetValue(p + "ROLL')/@val",  parseFloat(f[8]));
    evt.SetValue(p + "HEAD')/@val",  parseFloat(f[9]));

    // A DROP is two things in order: a moment of free fall - the total
    // acceleration falls towards 0, because a falling phone feels no
    // weight - and then, soon after, a hard impact. Each alone is common:
    // a phone tossed up and caught falls freely without hitting anything;
    // a phone slapped on the table hits without falling. The engine sees
    // only the smallest and the largest value of each fifth of a second,
    // and that is enough: the order is kept by 'ff', the time the fall was
    // seen, on the phone's element.
    var gmin = parseFloat(f[4]), gmax = parseFloat(f[5]);
    var adr = "id('" + pid + "')";
    var ff = num(evt, adr + "/@ff");
    if (gmin < rule(evt, "DROP_FREE") && ff == 0.0) {
        ff = t;
        evt.SetValue(adr + "/@ff", t);
    }
    if (ff > 0.0) {
        if (gmax > rule(evt, "DROP_HIT")) {
            var n = Math.round(num(evt, p + "DROP')/@val")) + 1;
            evt.SetValue(p + "DROP')/@val", n);
            evt.SetValue(adr + "/@ff", 0.0);
            // the time is only as fine as the windows: a fifth of a second
            say(evt, evt.GetValue(adr + "/@name") + " (" + pid + ") was DROPPED - free fall, then "
                + Math.round(gmax) + " m/s2 about " + Math.round(t - ff) + " ms later (drop " + n + ")");
        }
        else if (t - ff > rule(evt, "DROP_MS")) {
            evt.SetValue(adr + "/@ff", 0.0);         // it fell, but nothing hit: caught
        }
    }
}

// ---- the limits ----------------------------------------------------------------------

// Where each limit lives: the class, and the attribute ALM.onlvl reads.
// Warning first, alarm second. VIB and TILT are high limits (warning below
// alarm), BAT a low one (warning above alarm).
function limit_map()
{
    return {
        VIB:  { cls: "cls_VIB",  wrn: "val_alm_onlhi_wrn", alm: "val_alm_onlhi_alm", hi: true,  max: 100 },
        TILT: { cls: "cls_TILT", wrn: "val_alm_onlhi_wrn", alm: "val_alm_onlhi_alm", hi: true,  max: 180 },
        BAT:  { cls: "cls_BAT",  wrn: "val_alm_onllo_wrn", alm: "val_alm_onllo_alm", hi: false, max: 100 }
    };
}

function limits_json(evt)
{
    var m = limit_map(), out = {};
    for (var k in m) {
        var c = "id('" + m[k].cls + "')/@";
        out[k] = [num(evt, c + m[k].wrn), num(evt, c + m[k].alm)];
    }
    return JSON.stringify(out);
}

// val_fnc of LIMITS: {"VIB":[1.5,4], ...} - any of the three, each checked
// on its own. A pair that is not two numbers in range and in the right
// order is refused and says why; the others still apply.
function on_limits(evt)
{
    var req;
    try { req = JSON.parse("" + evt.valn); } catch (e) { say(evt, "limits refused: not JSON"); return 0; }
    var m = limit_map();
    for (var k in req) {
        var d = m[k];
        if (!d) { say(evt, "limits: no limit called " + k); continue; }
        var w = parseFloat("" + req[k][0]), a = parseFloat("" + req[k][1]);
        var ok = w >= 0.0 && a >= 0.0 && w <= d.max && a <= d.max && (d.hi ? w < a : w > a);
        if (!ok) {
            say(evt, "limits " + k + " refused: " + JSON.stringify(req[k]) + (d.hi ? " (warning must be below alarm)" : " (warning must be above alarm)"));
            continue;
        }
        evt.SetValue("id('" + d.cls + "')/@" + d.wrn, w);
        evt.SetValue("id('" + d.cls + "')/@" + d.alm, a);
        say(evt, "limits " + k + ": warning " + w + ", alarm " + a + " - for every phone");
    }
    evt.SetValue("id('LIMITS_NOW')/@val", limits_json(evt));
    return 0;
}

// ---- the other way: make a phone vibrate ------------------------------------------------

// val_fnc of BUZZ: "<element id> <anything>". The dashboard adds a time
// stamp so that pressing the button twice for the same phone is two
// different values.
function on_buzz(evt)
{
    var pid = ("" + evt.valn).split(" ")[0];
    if (pid.substring(0, 2) != "P_" || !ok_id(pid.substring(2))) return 0;
    var adr = "id('" + pid + "')";
    if (evt.GetValue(adr + "/@buzz") == null) return 0;
    // The phone subscribes to PHN/S00/<its element>/buzz and vibrates on
    // every change. Nothing is sent TO it - an attribute changes.
    evt.SetValue(adr + "/@buzz", parseInt("" + evt.GetValue(adr + "/@buzz")) + 1);
    say(evt, "buzz " + evt.GetValue(adr + "/@name") + " (" + pid + ")");
    return 0;
}

// ---- the watchdog, once a second ----------------------------------------------------------

function tick(evt)
{
    var t = now_ms();
    var link_ms = 1000.0 * rule(evt, "LINK_S");
    var lost_ms = 1000.0 * rule(evt, "LOST_S");

    var all = JSON.parse(evt.GetValue("json(id('PHONES')/phone)"));
    var live = 0, gone = 0;
    for (var i = 0; i < all.length; i++) {
        var ph = all[i];
        var adr = "id('" + ph.id + "')";
        var quiet = t - parseFloat("" + ph.seen);
        if (quiet > lost_ms) {
            evt.DelElement(adr);
            say(evt, ph.name + " (" + ph.id + ") not heard for " + rule(evt, "LOST_S") + " s - forgotten");
            gone = gone + 1;
            continue;
        }
        if (quiet > link_ms && parseInt("" + ph.val) == 1) {
            evt.SetValue(adr + "/@val", 0);           // ALM.onin: LINK alarm
            say(evt, ph.name + " (" + ph.id + ") silent - link down (screen off? page in the background?)");
        }
        if (quiet <= link_ms) live = live + 1;
    }
    if (gone > 0) update_list(evt);
    evt.SetValue("id('COUNT')/@val", live);
    return 0;
}
