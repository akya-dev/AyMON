// =====================================================================
// FTP/S00 - an FTP server in script (RFC 959 + EPSV / MLSD, the small part).
//
// One listener, two kinds of connection, three hooks (see db_FTP.xml):
//
//   onaccept(exc)  a client (greet it) or the data connection it was
//                  told to open (take it, say nothing)
//   onparse(exc)   a command line on a client's connection, or the bytes
//                  of a file on the data connection
//   onclose(exc)   a connection ended; the data connection of an upload
//                  ending = the file is complete: "226" to the client
//
// The conversation PRO.ftp holds with it, for one upload and a listing:
//
//   S: 220 ftp.example FTP AyMON example sink
//   C: USER anonymous            S: 331 ..     C: PASS ..    S: 230 ..
//   C: OPTS UTF8 ON              S: 200 ..     C: TYPE I     S: 200 ..
//   C: EPSV                      S: 229 Entering Extended Passive Mode (|||2121|)
//      (the client opens the data connection)
//   C: STOR shift_..zip.part     S: 150 ..
//      (the file arrives on the data connection; the client closes it)
//                                S: 226 Transfer complete
//   C: RNFR shift_..zip.part     S: 350 ..     C: RNTO shift_..zip   S: 250 ..
//   C: EPSV ..  C: MLSD          S: 150 ..  (the listing on the data
//                                connection, which the SERVER closes)   S: 226 ..
//
// State is kept in this script's own variables - the command connection
// and its data connection run on the same thread, one at a time. It serves
// one client at a time, which is all this example needs.
// =====================================================================

var g_ctl    = null;   // the client's command session (to answer "226" on it)
var g_expect = 0;      // 1 = EPSV was answered: the next connection is data
var g_data   = null;   // the data session, once it is there
var g_stor   = "";     // the name being uploaded on it
var g_pend   = "";     // a listing waiting for its data connection

function start(evt)
{
    evt.Log(4, "FTP: FTP sink on 127.0.0.1:2121 (commands and data on the same listener, PRO.raw + pro_onaccept + pro_onparse + pro_onclose)");
    return 0;
}

// ---- sending ----------------------------------------------------------

function reply(exc, text)
{
    exc.buf_send.remove();
    exc.buf_send.append(text);
    exc.send();
}

// on ANOTHER session than the one the hook was called for
function send_on(evt, ses, text)
{
    var x = new CON_EXC(evt, ses);
    x.buf_send.append(text);
    x.send();
}

// ---- a connection arrives ---------------------------------------------

function onaccept(exc)
{
    var m = exc.ses.mem;
    m.carry = "";
    m.bytes = 0;
    m.head  = "";

    if (g_expect == 1) {
        // the data connection of the transfer just announced
        g_expect = 0;
        m.data = 1;
        g_data = exc.ses;
        if (g_pend != "") {
            // the listing was asked for before this connection was here:
            // send it now and close (an error result closes the connection)
            var l = g_pend;
            g_pend = "";
            g_data = null;
            reply(exc, l);
            return RES.ERR;
        }
        return RES.OKY;
    }

    m.data = 0;
    g_ctl = exc.ses;
    reply(exc, "220 ftp.example FTP AyMON example sink\r\n");
    return RES.OKY;
}

// ---- what arrives -----------------------------------------------------

function onparse(exc)
{
    var m = exc.ses.mem;
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    if (n <= 0) return RES.OKY;

    if (m.data == 1) {
        // the bytes of a file: counted, the first four kept
        if (m.bytes == 0 && n >= 4) m.head = CODEC.HEX_enc(exc.buf_recv.copy(exc.buf_recv.pos, 4));
        m.bytes = m.bytes + n;
        exc.buf_recv.pos = exc.buf_recv.len;
        return RES.OKY;
    }

    var txt = CODEC.HEX_dec(CODEC.HEX_enc(exc.buf_recv.copy(exc.buf_recv.pos, n)), 0x0401);
    exc.buf_recv.pos = exc.buf_recv.len;
    var buf = m.carry + txt;
    while (true) {
        var p = buf.indexOf("\r\n");
        if (p < 0) break;
        var line = buf.substring(0, p);
        buf = buf.substring(p + 2);
        command(exc, line);
    }
    m.carry = buf;
    return RES.OKY;
}

// one command line
function command(exc, line)
{
    var sp   = line.indexOf(" ");
    var verb = (sp < 0 ? line : line.substring(0, sp)).toUpperCase();
    var arg  = sp < 0 ? "" : line.substring(sp + 1);
    g_ctl = exc.ses;

    if      (verb == "USER") reply(exc, "331 Any password will do\r\n");
    else if (verb == "PASS") reply(exc, "230 Logged in\r\n");
    else if (verb == "OPTS") reply(exc, "200 Always UTF-8\r\n");
    else if (verb == "TYPE") reply(exc, "200 Binary it is\r\n");
    else if (verb == "PWD")  reply(exc, "257 \"/\" is the only directory\r\n");
    else if (verb == "CWD")  reply(exc, "250 Still in /\r\n");
    else if (verb == "NOOP") reply(exc, "200 Ok\r\n");
    else if (verb == "EPSV") {
        g_expect = 1; g_data = null;
        reply(exc, "229 Entering Extended Passive Mode (|||2121|)\r\n");
    }
    else if (verb == "PASV") {
        g_expect = 1; g_data = null;
        reply(exc, "227 Entering Passive Mode (127,0,0,1,8,73)\r\n");   // 8 * 256 + 73 = 2121
    }
    else if (verb == "STOR") {
        if (g_expect == 0 && g_data == null) { reply(exc, "425 Use EPSV first\r\n"); return; }
        g_stor = arg;
        reply(exc, "150 Send it\r\n");
        // the answer to the transfer comes from onclose, when the file is complete
    }
    else if (verb == "MLSD" || verb == "NLST") {
        if (g_expect == 0 && g_data == null) { reply(exc, "425 Use EPSV first\r\n"); return; }
        reply(exc, "150 Here comes the listing\r\n");
        listing(exc, verb == "MLSD");
        reply(exc, "226 Listing sent\r\n");
    }
    else if (verb == "SIZE") {
        var f = find(exc.evt, arg);
        reply(exc, f == null ? "550 No such file\r\n" : "213 " + f.size + "\r\n");
    }
    else if (verb == "RNFR") {
        exc.ses.mem.rnfr = arg;
        reply(exc, find(exc.evt, arg) == null ? "550 No such file\r\n" : "350 Name the new name\r\n");
    }
    else if (verb == "RNTO") {
        files_rename(exc.evt, exc.ses.mem.rnfr, arg);
        reply(exc, "250 Renamed\r\n");
    }
    else if (verb == "DELE") {
        var ok = files_remove(exc.evt, arg);
        reply(exc, ok ? "250 Deleted\r\n" : "550 No such file\r\n");
    }
    else if (verb == "QUIT") reply(exc, "221 Bye\r\n");
    else reply(exc, "502 Not implemented here\r\n");
}

// the directory, as MLSD ("type=file;size=N; name") or NLST (names) lines
function listing(exc, mlsd)
{
    var list = JSON.parse(exc.evt.GetValue("id('FILES')/@val"));
    var out = "";
    for (var i = 0; i < list.length; i++)
        out = out + (mlsd ? "type=file;size=" + list[i].size + "; " : "") + list[i].name + "\r\n";

    if (g_data != null) {
        // the data connection is here: the listing goes out, and the server
        // ends it - the client reads until the connection closes
        send_on(exc.evt, g_data, out);
        g_data.stop();
        g_data = null;
    }
    else g_pend = out;                         // onaccept sends it when the connection comes
}

// ---- a connection ended ----------------------------------------------

function onclose(exc)
{
    var m = exc.ses.mem;
    if (m.data != 1 || g_stor == "") return 0;

    // the data connection of an upload: the file is complete
    var name = g_stor;
    g_stor = "";
    g_data = null;
    var no = exc.evt.GetValue("id('UPLOADS')/@val") + 1;
    exc.evt.SetValue("id('UPLOADS')/@val", no);
    files_add(exc.evt, { name: name, size: m.bytes, at: Time.GetTimeStr(0), zip: m.head == "504b0304" ? 1 : 0 });
    exc.evt.Log(4, "FTP: received " + name + " (" + m.bytes + " bytes" + (m.head == "504b0304" ? ", a ZIP archive" : "") + ")");
    if (g_ctl != null) send_on(exc.evt, g_ctl, "226 Transfer complete, " + m.bytes + " bytes\r\n");
    return 0;
}

// ---- the directory (names and sizes only) ----------------------------

function files_get(evt) { return JSON.parse(evt.GetValue("id('FILES')/@val")); }

function files_put(evt, list)
{
    var txt = JSON.stringify(list);
    evt.SetValue("id('FILES')/@val", txt);
    evt.SetValue("doc('PLT/S00')/id('FTP_FILES')/@val", txt);   // the page
}

function find(evt, name)
{
    var list = files_get(evt);
    for (var i = 0; i < list.length; i++) if (list[i].name == name) return list[i];
    return null;
}

function files_add(evt, f)
{
    var old = files_get(evt);
    var list = [f];
    for (var i = 0; i < old.length && list.length < 20; i++) if (old[i].name != f.name) list.push(old[i]);
    files_put(evt, list);
}

function files_rename(evt, from, to)
{
    var list = files_get(evt);
    var out = [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].name == to) continue;              // replaced
        if (list[i].name == from) list[i].name = to;
        out.push(list[i]);
    }
    files_put(evt, out);
}

function files_remove(evt, name)
{
    var list = files_get(evt);
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i].name != name) out.push(list[i]);
    files_put(evt, out);
    return out.length < list.length;
}
