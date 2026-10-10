// =====================================================================
// PRJEDU_web -- the script side: the simulated tank and the REST answer.
//
// Nothing in this file knows about MQTT or WebSockets. The live page works
// because tick() WRITES values and the MQTT connection publishes every
// write of its document. That is the point of the example: the web side is
// configuration in db_PLT.xml, not code.
// =====================================================================

function start(evt)
{
    evt.Log(4, "PRJEDU_web: open http://127.0.0.1:8080/ in a browser.");
    evt.Log(4, "PRJEDU_web: snapshot at /api/values, live values on ws://127.0.0.1:8080/mqtt");
    evt.Log(4, "PRJEDU_web: the same over TLS: https://127.0.0.1:8443/ (self-signed, the browser warns once)");
    return 0;
}

// Twice a second, from the timer on <var id="T_SIM">.
//
// A pump controller with a dead band: the pump starts 3 % below the set
// point and stops 3 % above it, while the outlet drains the tank at a
// rate that wanders. Move the set point on the page past 80 or 90 and the
// level follows it into the warning and alarm bands.
function tick(evt)
{
    var c    = evt.GetValue("id('COUNT')/@val");
    var lvl  = evt.GetValue("id('LEVEL')/@val");
    var sp   = evt.GetValue("id('SETPOINT')/@val");
    var pump = evt.GetValue("id('PUMP')/@val");

    // Typed arithmetic, left operand decides (see PRJEDU_101): c is an
    // unsigned integer, so the float goes on the left.
    var drain = 0.6 + 0.4 * Math.sin(c / 40.0);

    if (pump == 1 && lvl > sp + 3.0) pump = 0;
    if (pump == 0 && lvl < sp - 3.0) pump = 1;

    lvl = lvl - drain;
    if (pump == 1) lvl = lvl + 1.8;

    var t = 18.0 + 4.0 * Math.sin(c / 120.0) + (Math.random() - 0.5) * 0.2;

    // Each SetValue below is one MQTT message to every page that is open --
    // but only if the stored value actually CHANGES. PUMP is written twice
    // a second and published only when it switches.
    evt.SetValue("id('LEVEL')/@val", lvl);
    evt.SetValue("id('TEMP')/@val",  t);
    evt.SetValue("id('PUMP')/@val",  pump);
    evt.SetValue("id('COUNT')/@val", c + 1);
    return 0;
}

// The last link of SETPOINT's val_fnc, after ATR.rou and ATR.lmt.
// Inside a *_fnc chain the attribute still holds the OLD value; the one
// being written is evt.valn -- already rounded and clamped by the two
// functions before this one.
function on_setpoint(evt)
{
    evt.Log(4, "SETPOINT " + evt.valp + " -> " + evt.valn + " %");
    return 0;
}

// ---------------------------------------------------------------------
// REST: pro_onreq="main.api(exc,msg);" on CN_API.
//
// PRO.rest parses the request and hands it over; the answer -- status
// line, headers and body -- is ours to write. Two things to notice:
//   * the body is converted to UTF-8 bytes (toS08) BEFORE its length is
//     taken: Content-Length counts bytes, not characters
//   * the session is closed after the answer ("Connection: close"), so
//     the browser never waits for more
// ---------------------------------------------------------------------
function api(exc, msg)
{
    if (!msg.isRequest) return;

    // A script file is a collection of functions, so constants live inside
    // the function that uses them.
    var API_IDS = ["LEVEL", "TEMP", "PUMP", "SETPOINT", "COUNT"];

    var status = "200 OK";
    var body;

    if (msg.uri.indexOf("/api/values") == 0) {
        var out = {};
        for (var i = 0; i < API_IDS.length; i++) {
            var id = API_IDS[i];
            out[id] = {
                val: exc.evt.GetValue("id('" + id + "')/@val"),
                sta: exc.evt.GetValue("id('" + id + "')/@sta"),
                unt: exc.evt.GetValue("id('" + id + "')/@val_unt"),
                desc: exc.evt.GetValue("id('" + id + "')/@desc")
            };
        }
        body = JSON.stringify(out);
    } else {
        status = "404 Not Found";
        body = '{"error":"try /api/values"}';
    }

    body = body.toS08();
    var buf = "".toS08();
    buf += "HTTP/1.1 " + status + "\r\n";
    buf += "Content-Type: application/json; charset=utf-8\r\n";
    buf += "Cache-Control: no-store\r\n";
    buf += "Connection: close\r\n";
    buf += "Content-Length: " + body.size + "\r\n";
    buf += "\r\n";
    buf += body;

    exc.buf_send.remove();
    exc.buf_send.append(buf);
    exc.send();
    exc.ses.close();
}
