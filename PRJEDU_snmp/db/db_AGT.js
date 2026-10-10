// =====================================================================
// AGT/S00 - an SNMP v2c agent written in script.
//
// AyMON's PRO.snmp is a manager (client) only, so the usual trick of this
// example set - put both ends in one engine - needs the other end built
// here. It is built out of three things the engine already offers:
//
//   PRO.raw          a connection with no protocol of its own
//   pro_onparse      the framing hook: the engine hands the script what it
//                    has read, the script says what is one frame
//   CODEC.HEX_dec    text -> bytes, which is how a script builds a frame
//                    (CODEC.HEX_enc is the way back, and what the log shows)
//
// It answers GET and GETNEXT for the OIDs in oid_table() below, in SNMP
// v2c, with no community check. That is enough to poll it and enough to
// read; it is NOT an agent for anything else. A real one lives on the
// device, and PRJEDU_snmp is about the manager side.
//
// THE FORMAT. Every SNMP message is BER: a tag byte, a length, a value.
//   0x30 SEQUENCE   0x02 INTEGER   0x04 OCTET STRING   0x06 OID
//   0x41 Counter32  0x42 Gauge32   0x43 TimeTicks
//   0xA0 GetRequest 0xA1 GetNextRequest  0xA2 GetResponse
// Lengths under 128 are one byte; from 128 to 255 they are 0x81 then the
// byte. Nothing here is longer than that.
// =====================================================================

function start(evt)
{
    evt.Log(4, "AGT: SNMP v2c agent on 127.0.0.1:1161 (PRO.raw + script)");
    evt.Log(4, "AGT: serving " + oid_table().length + " OIDs under 1.3.6.1.4.1.99999");
    return 0;
}

// ---------------------------------------------------------------------
// The MIB of this agent: one row per OID, in ascending order (GETNEXT
// walks it in this order). 'typ' is the BER tag, 'src' the element whose
// value is served, or a fixed string for the description.
// ---------------------------------------------------------------------
function oid_table()
{
    return [
        { oid: "1.3.6.1.4.1.99999.1.1.0", typ: 0x04, txt: "AyMON example agent" },
        { oid: "1.3.6.1.4.1.99999.1.2.0", typ: 0x43, src: "UPTIME" },
        { oid: "1.3.6.1.4.1.99999.2.1.0", typ: 0x42, src: "LEVEL" },
        { oid: "1.3.6.1.4.1.99999.2.2.0", typ: 0x02, src: "TEMP" },
        { oid: "1.3.6.1.4.1.99999.2.3.0", typ: 0x02, src: "PUMP" },
        { oid: "1.3.6.1.4.1.99999.2.4.0", typ: 0x41, src: "STARTS" }
    ];
}

// ---- BER helpers ----------------------------------------------------

// two hex digits for one byte
function hex2(v)
{
    var d = "0123456789abcdef";
    return d.charAt((v >> 4) & 0x0F) + d.charAt(v & 0x0F);
}

// a length, short or long form
function ber_len(n)
{
    if (n < 128) return hex2(n);
    return "81" + hex2(n);
}

// tag + length + body, where body is hex text
function ber_tlv(tag, body)
{
    return hex2(tag) + ber_len(body.length / 2) + body;
}

// an unsigned value, minimum number of bytes, never negative
function ber_uns(v)
{
    var h = "";
    var n = v;
    if (n < 0) n = 0;
    while (n > 0) { h = hex2(n % 256) + h; n = Math.floor(n / 256); }
    if (h == "") h = "00";
    // a leading bit of 1 would read as negative in an INTEGER
    if (parseInt(h.substring(0, 2), 16) > 127) h = "00" + h;
    return h;
}

// text as OCTET STRING body
function ber_txt(s)
{
    var h = "";
    for (var i = 0; i < s.length; i++) h = h + hex2(s.charCodeAt(i) & 0xFF);
    return h;
}

// a dotted OID as BER body: the first two arcs share a byte, every arc
// after that is base 128 with the top bit set on all but the last byte.
function oid_enc(dotted)
{
    var a = dotted.split(".");
    var h = hex2(parseInt(a[0]) * 40 + parseInt(a[1]));
    for (var i = 2; i < a.length; i++) {
        var v = parseInt(a[i]);
        var g = [];
        g[0] = v % 128;
        v = Math.floor(v / 128);
        while (v > 0) { g.unshift(v % 128); v = Math.floor(v / 128); }
        for (var j = 0; j < g.length; j++)
            h = h + hex2(j == (g.length - 1) ? g[j] : (g[j] | 0x80));
    }
    return h;
}

// ---- the request ----------------------------------------------------
//
// Walks the request and returns { pdu, reqid, oids: [hex, ...] }.
// Only what an answer needs is read; everything else is skipped by
// length. A malformed packet returns null and the datagram is dropped,
// which is what a real agent does too.
function req_parse(b, len)
{
    var p = 0;
    if (b[p] != 0x30) return null;
    p = p + 2 + (b[p + 1] > 127 ? 1 : 0);      // into the SEQUENCE
    if (b[p] != 0x02) return null;             // version
    p = p + 2 + b[p + 1];
    if (b[p] != 0x04) return null;             // community, not checked
    p = p + 2 + b[p + 1];

    var pdu = b[p];
    if (pdu != 0xA0 && pdu != 0xA1) return null;
    p = p + 2 + (b[p + 1] > 127 ? 1 : 0);

    if (b[p] != 0x02) return null;             // request id, copied as is
    var idlen = b[p + 1];
    var reqid = "";
    for (var i = 0; i < idlen; i++) reqid = reqid + hex2(b[p + 2 + i]);
    p = p + 2 + idlen;

    p = p + 2 + b[p + 1];                      // error status
    p = p + 2 + b[p + 1];                      // error index

    if (b[p] != 0x30) return null;             // varbind list
    var vbend = p + 2 + (b[p + 1] > 127 ? 1 : 0) + (b[p + 1] > 127 ? b[p + 2] : b[p + 1]);
    p = p + 2 + (b[p + 1] > 127 ? 1 : 0);

    var oids = [];
    while (p < vbend && p < len) {
        if (b[p] != 0x30) break;               // varbind
        var vbinner = p + 2;
        p = p + 2 + b[p + 1];
        if (b[vbinner] != 0x06) break;         // its OID
        var olen = b[vbinner + 1];
        var oh = "";
        for (var k = 0; k < olen; k++) oh = oh + hex2(b[vbinner + 2 + k]);
        oids.push(oh);
    }

    return { pdu: pdu, reqid: reqid, oids: oids };
}

// ---- the answer -----------------------------------------------------

// the value of one row, as a BER tag/length/value
function row_value(evt, row)
{
    if (row.txt != undefined) return ber_tlv(row.typ, ber_txt(row.txt));

    var v = evt.GetValue("id('" + row.src + "')/@val");
    if (v == null) v = 0;
    return ber_tlv(row.typ, ber_uns(Math.round(v)));
}

// noSuchObject (0x80) - the OID is not ours
function row_none()
{
    return "8000";
}

function onparse(exc)
{
    var len = exc.buf_recv.len - exc.buf_recv.pos;
    var b = exc.buf_recv.copy(exc.buf_recv.pos, len);
    exc.buf_recv.pos = exc.buf_recv.len;       // one datagram, one frame

    var req = req_parse(b, len);
    if (req == null) {
        exc.evt.Log(4, "AGT: not an SNMP GET/GETNEXT, dropped: " + CODEC.HEX_enc(b));
        return 0;
    }

    var tbl = oid_table();
    var vbs = "";
    var names = "";

    for (var i = 0; i < req.oids.length; i++) {
        var want = req.oids[i];
        var idx = -1;
        for (var j = 0; j < tbl.length; j++) {
            if (oid_enc(tbl[j].oid) == want) { idx = j; break; }
        }

        if (req.pdu == 0xA1) idx = (idx < 0) ? 0 : idx + 1;   // GETNEXT: the row after

        var oid_out, val_out;
        if (idx < 0 || idx >= tbl.length) {
            oid_out = want;                                   // give the asked OID back
            val_out = row_none();
        } else {
            oid_out = oid_enc(tbl[idx].oid);
            val_out = row_value(exc.evt, tbl[idx]);
            names = names + (names == "" ? "" : ", ") + tbl[idx].oid;
        }
        vbs = vbs + ber_tlv(0x30, ber_tlv(0x06, oid_out) + val_out);
    }

    var pdu = ber_tlv(0x02, req.reqid) + "020100" + "020100" + ber_tlv(0x30, vbs);
    var msg = ber_tlv(0x30, "020101" + ber_tlv(0x04, ber_txt("public")) + ber_tlv(0xA2, pdu));

    exc.buf_send.remove();
    exc.buf_send.append(CODEC.HEX_dec(msg));
    exc.send();

    exc.evt.Log(5, "AGT: " + (req.pdu == 0xA0 ? "GET" : "GETNEXT") + " " + req.oids.length
                 + " varbind -> " + (names == "" ? "noSuchObject" : names));
    return 0;
}

// ---- the plant behind the agent -------------------------------------
// The same tank as the other examples, so the manager has something that
// moves. SNMP has no floats: the temperature is served in tenths of a
// degree and the manager scales it back with val_cnv_dlt.
function tick(evt)
{
    var n    = evt.GetValue("id('STEPS')/@val");
    var lvl  = evt.GetValue("id('LEVEL')/@val");
    var pump = evt.GetValue("id('PUMP')/@val");
    var strt = evt.GetValue("id('STARTS')/@val");

    // The band is deliberately wider than the manager's alarm limits
    // (20 / 80 / 90 in db_MON.xml), so the alarm path runs on its own.
    var drain = 1.0 + 0.6 * Math.sin(n / 20.0);
    if (pump == 1 && lvl > 95.0) pump = 0;
    if (pump == 0 && lvl < 12.0) { pump = 1; strt = strt + 1; }

    lvl = lvl - drain;
    if (pump == 1) lvl = lvl + 3.0;
    if (lvl < 0.0) lvl = 0.0;
    if (lvl > 100.0) lvl = 100.0;

    evt.SetValue("id('LEVEL')/@val",  Math.round(lvl));
    evt.SetValue("id('TEMP')/@val",   Math.round(180.0 + 40.0 * Math.sin(n / 60.0)));
    evt.SetValue("id('PUMP')/@val",   pump);
    evt.SetValue("id('STARTS')/@val", strt);
    evt.SetValue("id('UPTIME')/@val", n * 100);   // TimeTicks are hundredths
    evt.SetValue("id('STEPS')/@val",  n + 1);
    return 0;
}
