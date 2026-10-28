// =====================================================================
// TRK/S00 - the tracker.
//
//   on_lines(exc)  CN_SBS's pro_onparse: whatever arrived, cut into lines,
//                  each line into its aircraft's element
//   tick(evt)      once a second: forget the aircraft not heard for
//                  LOST_S, count, and put the sky in SNAP for the page
// =====================================================================

function start(evt)
{
    evt.Log(4, "TRK: tracker - SBS-1 from 127.0.0.1:30003, map on http://127.0.0.1:8097/");
    return 0;
}

function get(evt, id) { return parseFloat("" + evt.GetValue("id('" + id + "')/@val")); }
function rad(d) { return d * 0.017453292519943295; }

// ---- the stream -----------------------------------------------------------------
//
// TCP delivers bytes, not lines. What arrives is added to what was left
// over last time; every complete line is used; the unfinished tail waits
// in the session's memory for the rest of it.
function on_lines(exc)
{
    var evt = exc.evt;
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    if (n <= 0) { exc.buf_recv.nxt = 4096; return RES.INF_SUB_CONTINUE; }
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);
    exc.buf_recv.pos = exc.buf_recv.len;

    var carry = exc.ses.mem.carry;
    var text = (carry ? carry : "") + CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401);
    var lines = text.split("\n");
    exc.ses.mem.carry = lines[lines.length - 1];          // the unfinished tail

    var ok = 0, bad = 0;
    for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (use_line(evt, line)) ok = ok + 1; else bad = bad + 1;
    }
    if (ok > 0)  evt.SetValue("id('LINES')/@val", evt.GetValue("id('LINES')/@val") + ok);
    if (bad > 0) evt.SetValue("id('BAD')/@val", evt.GetValue("id('BAD')/@val") + bad);
    return RES.OKY;
}

// One SBS-1 line into its aircraft's element. Returns false for a line
// that is not SBS-1.
//   0 MSG  1 type  4 hex  10 callsign  11 altitude  12 speed  13 track
//   14 lat  15 lon  16 vertical rate  17 squawk  19 emergency
function use_line(evt, line)
{
    var f = line.split(",");
    if (f.length < 22 || f[0] != "MSG" || f[4].length != 6) return false;
    var type = parseInt(f[1]);
    var id = "AC_" + f[4];
    var adr = "id('" + id + "')";

    // first heard: a new element under SKY. It is parsed on its own, taken
    // out of that little document, and added: AddElement takes a node that
    // belongs to no document, it never moves one. The -1 parses it with the
    // XDB fields on, as the engine's own documents are - without it the
    // element is added, but id('AC_...') never finds it and every line
    // makes another one.
    if (evt.GetValue(adr + "/@hex") == null) {
        // seen is 'now' from birth: main.tick runs on its own thread and
        // would forget an element born with seen="0" before this line ends
        var now = Time.GetTimeMs();          // an integer: it goes into the XML text as it is
        var x = new XML("<ac id=\"" + id + "\" hex=\"" + f[4] + "\" cs=\"\" alt=\"\" gs=\"\" trk=\"\" lat=\"\" lon=\"\""
                        + " vr=\"\" dist=\"\" brg=\"\" first=\"" + now + "\" seen=\"" + now + "\" msgs=\"0\""
                        + " sta=\"0x0303\" val=\"0\" val_typ=\"0x1104\" val_fnc=\"[ALM.onin]\""
                        + " val_alm_onin_alm=\"[7500,7600,7700]\"/>", -1);
        var ac = x['ac'];
        x.removeChild(ac);
        var r = evt.AddElement("id('SKY')", ac);
        if (!r) return false;
        evt.SetValue("id('SEEN')/@val", evt.GetValue("id('SEEN')/@val") + 1);
        evt.Log(4, "TRK: new aircraft " + f[4]);
    }

    if (type == 1 && f[10])                                   // identification
        evt.SetValue(adr + "/@cs", f[10].trim());
    if (type == 3 && f[14] && f[15]) {                        // position
        var lat = parseFloat(f[14]), lon = parseFloat(f[15]);
        evt.SetValue(adr + "/@alt", parseInt(f[11]));
        evt.SetValue(adr + "/@lat", lat);
        evt.SetValue(adr + "/@lon", lon);
        // distance and bearing from the antenna (flat earth: fine to 300 km)
        var lat0 = get(evt, "HOME_LAT"), lon0 = get(evt, "HOME_LON");
        var dy = (lat - lat0) * 110.57, dx = (lon - lon0) * 111.32 * Math.cos(rad(lat0));
        var dist = Math.sqrt(dx * dx + dy * dy);
        var brg = Math.atan2(dx, dy) * 57.29577951308232;
        if (brg < 0.0) brg = brg + 360.0;
        evt.SetValue(adr + "/@dist", 0.1 * Math.round(dist * 10.0));
        evt.SetValue(adr + "/@brg", Math.round(brg));
        if (dist > get(evt, "MAXR")) evt.SetValue("id('MAXR')/@val", 0.1 * Math.round(dist * 10.0));
    }
    if (type == 4 && f[12]) {                                 // velocity
        evt.SetValue(adr + "/@gs", parseInt(f[12]));
        evt.SetValue(adr + "/@trk", parseFloat(f[13]));
        evt.SetValue(adr + "/@vr", parseInt(f[16]));
    }
    if (type == 6 && f[17])                                   // squawk: the element's val, alarmed
        evt.SetValue(adr + "/@val", parseInt(f[17]));

    evt.SetValue(adr + "/@seen", Time.GetTimeMs());
    evt.SetValue(adr + "/@msgs", parseInt("" + evt.GetValue(adr + "/@msgs")) + 1);
    return true;
}

// ---- the tracker's second ---------------------------------------------------------

function tick(evt)
{
    var now = 0.0 + Time.GetTimeMs();   // a float: GetTimeMs is unsigned, and another thread's stamp may be later
    var lost = 1000.0 * get(evt, "LOST_S");

    // the whole sky in one call: every <ac>, every attribute, as JSON
    var sky = JSON.parse(evt.GetValue("json(id('SKY')/ac)"));
    var alive = [];
    var emerg = "";
    for (var i = 0; i < sky.length; i++) {
        var a = sky[i];
        if (now - parseFloat("" + a.seen) > lost) {
            evt.DelElement("id('" + a.id + "')");
            evt.Log(4, "TRK: " + (a.cs ? a.cs : a.hex) + " not heard for " + get(evt, "LOST_S") + " s - forgotten");
            continue;
        }
        var sq = parseInt("" + a.val);
        if (sq == 7500 || sq == 7600 || sq == 7700)
            emerg = (a.cs ? a.cs : a.hex) + " squawks " + sq + (sq == 7700 ? " (emergency)" : sq == 7600 ? " (radio failure)" : " (hijack)");
        alive.push(a);
    }

    if (emerg != evt.GetValue("id('EMERG')/@val")) {
        evt.SetValue("id('EMERG')/@val", emerg);
        evt.Log(4, "TRK: " + (emerg ? emerg : "the emergency is over"));
    }
    evt.SetValue("id('COUNT')/@val", alive.length);
    var lines = evt.GetValue("id('LINES')/@val");
    evt.SetValue("id('RATE')/@val", lines - evt.GetValue("id('LAST_LINES')/@val"));
    evt.SetValue("id('LAST_LINES')/@val", lines);
    evt.SetValue("id('SNAP')/@val", JSON.stringify(alive));
    return 0;
}
