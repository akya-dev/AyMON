// =====================================================================
// SRC/S00 - a dump1090, simulated: aircraft, and their SBS-1 lines.
//
//   fly(evt)   twice a second: move every aircraft, replace the ones that
//              have left, write their messages to every connected client
//
// An aircraft is a JSON object in SKY:
//   hex  the 24-bit ICAO address, six hex digits - what identifies it
//   cs   callsign     lat lon  degrees     alt  feet     gs  knots
//   trk  track, degrees clockwise from north    vr  feet per minute
//   tgt  the altitude it is climbing or descending to
//   sq   squawk       em  steps left of an emergency squawk, 0 if none
//   n    messages so far (every tenth step it says its callsign and squawk)
// =====================================================================

function start(evt)
{
    evt.Log(4, "SRC: a simulated ADS-B receiver - SBS-1 on 127.0.0.1:30003, around "
               + get(evt, "HOME_LAT") + ", " + get(evt, "HOME_LON"));
    return 0;
}

function get(evt, id) { return parseFloat("" + evt.GetValue("id('" + id + "')/@val")); }
function rad(d) { return d * 0.017453292519943295; }

function hex2(v)
{
    var d = "0123456789ABCDEF";
    return d.charAt((v >> 4) & 15) + d.charAt(v & 15);
}

// A new aircraft on the edge of the circle, heading roughly across it.
function spawn(evt, lat0, lon0, range)
{
    var b = 360.0 * Math.random();                           // where on the edge
    var r = range - 10.0;                                    // km
    var lat = lat0 + r * Math.cos(rad(b)) / 110.57;
    var lon = lon0 + r * Math.sin(rad(b)) / (111.32 * Math.cos(rad(lat0)));
    var trk = b + 180.0 + 70.0 * (Math.random() - 0.5);      // back towards the middle, give or take
    if (trk >= 360.0) trk = trk - 360.0;
    if (trk < 0.0) trk = trk + 360.0;

    var arriving = Math.random() < 0.3;                      // some are coming down to land
    var alt = arriving ? 12000.0 + 8000.0 * Math.random() : 1000.0 * Math.round(24.0 + 15.0 * Math.random());
    var prefix = ["AYM", "LAB", "EDU", "SIM", "PER"];
    var cs = prefix[Math.floor(5.0 * Math.random())] + (100 + Math.floor(900.0 * Math.random()));
    return {
        hex: hex2(Math.floor(256.0 * Math.random())) + hex2(Math.floor(256.0 * Math.random())) + hex2(Math.floor(256.0 * Math.random())),
        cs: cs, lat: lat, lon: lon, alt: alt,
        gs: arriving ? 250.0 + 40.0 * Math.random() : 420.0 + 60.0 * Math.random(),
        trk: trk, vr: 0.0,
        tgt: arriving ? 3000.0 : alt,
        sq: "" + (1000 + Math.floor(6000.0 * Math.random())),
        em: 0, n: 0
    };
}

// One SBS-1 line. Only the fields a message type carries are filled.
function sbs(type, a, date, time)
{
    var f = ["MSG", "" + type, "1", "1", a.hex, "1", date, time, date, time,
             "", "", "", "", "", "", "", "", "0", "0", "0", "0"];
    if (type == 1) f[10] = a.cs;
    if (type == 3) {
        f[11] = "" + Math.round(a.alt);
        f[14] = Number.toFixed(a.lat, 5);
        f[15] = Number.toFixed(a.lon, 5);
    }
    if (type == 4) {
        f[12] = "" + Math.round(a.gs);
        f[13] = Number.toFixed(a.trk, 1);
        f[16] = "" + Math.round(a.vr);
    }
    if (type == 6) {
        f[17] = a.em > 0 ? "7700" : a.sq;
        f[19] = a.em > 0 ? "-1" : "0";                       // the emergency flag
    }
    return f.join(",");
}

function fly(evt)
{
    var dt = 0.5;
    var lat0 = get(evt, "HOME_LAT"), lon0 = get(evt, "HOME_LON");
    var range = get(evt, "RANGE_KM");
    var n = parseInt("" + evt.GetValue("id('STEPS')/@val"));
    var old = JSON.parse(evt.GetValue("id('SKY')/@val"));
    var sky = [];
    var emergency = false;
    for (var i = 0; i < old.length; i++) if (old[i].em > 0) emergency = true;

    // is an emergency due this step? the first after EMERG_FIRST seconds,
    // then every EMERG_EVERY seconds (0: never); which aircraft: any
    var first = parseInt("" + Math.round(2.0 * get(evt, "EMERG_FIRST")));
    var every = parseInt("" + Math.round(2.0 * get(evt, "EMERG_EVERY")));
    var due = every > 0 && n >= first && (n - first) % every == 0;
    var pick = old.length > 0 ? Math.floor(old.length * Math.random()) : 0;

    var now = Time.GetTimeStr(0);                            // 2026-09-25 10:00:00
    var date = now.substring(0, 10).split("-").join("/");
    var time = now.substring(11, 19) + ".000";
    var out = "";

    for (var j = 0; j < old.length; j++) {
        var a = old[j];
        // JSON gives 36000 back for 36000.0, and an integer on the left of
        // an operator makes it integer arithmetic: floats first
        a.lat = 0.0 + a.lat;  a.lon = 0.0 + a.lon;  a.alt = 0.0 + a.alt;
        a.gs = 0.0 + a.gs;    a.trk = 0.0 + a.trk;  a.tgt = 0.0 + a.tgt;
        // move: ground speed in knots -> km in dt seconds
        var km = 1.852 * a.gs / 3600.0 * dt;
        a.lat = a.lat + km * Math.cos(rad(a.trk)) / 110.57;
        a.lon = a.lon + km * Math.sin(rad(a.trk)) / (111.32 * Math.cos(rad(a.lat)));

        // climb or descend towards the target, 1500 ft/min
        a.vr = 0.0;
        if (a.alt < a.tgt - 50.0) a.vr = 1500.0;
        if (a.alt > a.tgt + 50.0) a.vr = -1500.0;
        a.alt = a.alt + a.vr * dt / 60.0;

        // an emergency on schedule: 7700 for a minute
        if (a.em > 0) a.em = a.em - 1;
        else if (due && !emergency && j == pick) {
            a.em = 120;
            emergency = true;
            evt.Log(4, "SRC: " + a.cs + " (" + a.hex + ") squawks 7700");
        }

        var dy = (a.lat - lat0) * 110.57, dx = (a.lon - lon0) * 111.32 * Math.cos(rad(lat0));
        if (Math.sqrt(dx * dx + dy * dy) > range + 10.0) continue;  // out of range: gone

        // what it says this half second
        out = out + sbs(3, a, date, time) + "\r\n";
        if (n % 2 == 0) out = out + sbs(4, a, date, time) + "\r\n";
        if (a.n % 10 == 0) out = out + sbs(1, a, date, time) + "\r\n" + sbs(6, a, date, time) + "\r\n";
        a.n = a.n + 1;
        sky.push(a);
    }

    while (sky.length < get(evt, "PLANES")) sky.push(spawn(evt, lat0, lon0, range));

    evt.SetValue("id('SKY')/@val", JSON.stringify(sky));
    evt.SetValue("id('STEPS')/@val", n + 1);
    if (out != "") send_all(evt, out);
    return 0;
}

// dump1090 writes to everyone connected: here, every session of CN_SBS
// that has a client on it. A session is connected when its sta says
// RUNNING (the low nibble, 3).
function send_all(evt, text)
{
    var con = xdb.con["CN_SBS"];
    var sent = 0;
    for (var i = 1; i <= 4; i++) {
        var ses = con.get_ses(i);
        if (!ses) continue;
        if ((parseInt("" + ses.sta) & 15) != 3) continue;
        var exc = new CON_EXC(evt, ses);
        exc.buf_send.append(text.toS08());
        if (exc.send() == 0) sent = sent + 1;
        exc = 0;
    }
    if (sent > 0) {
        var lines = text.split("\r\n").length - 1;
        evt.SetValue("id('SENT')/@val", evt.GetValue("id('SENT')/@val") + lines);
    }
}

// Nothing is expected from a client; drop whatever comes.
function on_nothing(exc)
{
    exc.buf_recv.pos = exc.buf_recv.len;
    return RES.OKY;
}
