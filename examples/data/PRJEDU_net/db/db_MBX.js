// =====================================================================
// MBX/S00 - a mail server in script (SMTP, RFC 5321, the small part).
//
// Two hooks on one PRO.raw connection:
//
//   onaccept(exc)  once per connection, before anything is read. SMTP's
//                  server speaks first: "220 <name> ESMTP ...". Without
//                  this hook (engine 4.3.4.565) the client would wait for
//                  a greeting that never comes.
//   onparse(exc)   with what arrived. SMTP is lines ending in CR LF; one
//                  arrival may hold half a line or several, so whatever
//                  is not a whole line yet is kept in exc.ses.mem and
//                  put in front of the next arrival.
//
// The conversation, as this server holds it:
//
//   S: 220 mbx.example ESMTP AyMON example mail sink
//   C: EHLO plant          S: 250-mbx.example ...  250 SIZE 1048576
//   C: MAIL FROM:<..>      S: 250 2.1.0 Ok
//   C: RCPT TO:<..>        S: 250 2.1.5 Ok          (once per recipient)
//   C: DATA                S: 354 End data with <CR><LF>.<CR><LF>
//   C: the message, line by line, ending with a line holding one dot
//                          S: 250 2.0.0 Ok: queued as 7
//   C: QUIT                S: 221 2.0.0 Bye
//
// It takes every message and keeps the last ten. It does not relay,
// authenticate or encrypt - it exists so that PLT/S00 has somebody to
// talk to without an account anywhere.
// =====================================================================

function start(evt)
{
    evt.Log(4, "MBX: SMTP mail sink on 127.0.0.1:2525 (PRO.raw + pro_onaccept + pro_onparse)");
    return 0;
}

// ---- sending ----------------------------------------------------------

// one or more reply lines, each ending in CR LF
function reply(exc, text)
{
    exc.buf_send.remove();
    exc.buf_send.append(text);
    exc.send();
}

// ---- the greeting -----------------------------------------------------

// pro_onaccept: the connection is up and nothing has been read yet. The
// session's own store starts empty for every connection.
function onaccept(exc)
{
    var m = exc.ses.mem;
    m.carry = "";
    m.mode = "cmd";
    m.from = "";
    m.rcpt = "";
    m.msg = "";

    var n = exc.evt.GetValue("id('SESSIONS')/@val") + 1;
    exc.evt.SetValue("id('SESSIONS')/@val", n);

    reply(exc, "220 mbx.example ESMTP AyMON example mail sink\r\n");
    return RES.OKY;
}

// ---- what arrives -----------------------------------------------------

// pro_onparse: take the bytes, cut them into lines, answer each line.
function onparse(exc)
{
    var m = exc.ses.mem;
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    if (n <= 0) return RES.OKY;

    // bytes -> text (hex is the way a script turns a byte buffer into text)
    var txt = CODEC.HEX_dec(CODEC.HEX_enc(exc.buf_recv.copy(exc.buf_recv.pos, n)), 0x0401);
    exc.buf_recv.pos = exc.buf_recv.len;               // all of it is ours now

    var buf = m.carry + txt;
    while (true) {
        var p = buf.indexOf("\r\n");
        if (p < 0) break;                              // half a line: wait for the rest
        var line = buf.substring(0, p);
        buf = buf.substring(p + 2);
        on_line(exc, m, line);
    }
    m.carry = buf;
    return RES.OKY;
}

// one line, in command mode or inside DATA
function on_line(exc, m, line)
{
    if (m.mode == "data") {
        if (line == ".") { take(exc, m); return; }
        // a line of the message that began with a dot was sent with
        // a second one in front (dot-stuffing): take it off again
        if (line.substring(0, 1) == ".") line = line.substring(1);
        m.msg = m.msg + line + "\r\n";
        if (m.msg.length > 1048576) {                  // SIZE we announced
            m.mode = "cmd"; m.msg = "";
            reply(exc, "552 5.3.4 Message too big\r\n");
        }
        return;
    }

    var verb = line.substring(0, 4).toUpperCase();
    var arg  = line.length > 5 ? line.substring(5) : "";

    if (verb == "EHLO") {
        reset(m);
        reply(exc, "250-mbx.example greets " + arg + "\r\n250-8BITMIME\r\n250 SIZE 1048576\r\n");
    }
    else if (verb == "HELO") { reset(m); reply(exc, "250 mbx.example\r\n"); }
    else if (verb == "MAIL") { m.from = addr(arg); m.rcpt = ""; reply(exc, "250 2.1.0 Ok\r\n"); }
    else if (verb == "RCPT") { m.rcpt = m.rcpt == "" ? addr(arg) : m.rcpt + ", " + addr(arg); reply(exc, "250 2.1.5 Ok\r\n"); }
    else if (verb == "DATA") {
        if (m.rcpt == "") { reply(exc, "503 5.5.1 No recipients\r\n"); return; }
        m.mode = "data"; m.msg = "";
        reply(exc, "354 End data with <CR><LF>.<CR><LF>\r\n");
    }
    else if (verb == "RSET") { reset(m); reply(exc, "250 2.0.0 Ok\r\n"); }
    else if (verb == "NOOP") { reply(exc, "250 2.0.0 Ok\r\n"); }
    else if (verb == "QUIT") { reply(exc, "221 2.0.0 Bye\r\n"); }
    else reply(exc, "502 5.5.2 Command not recognised\r\n");
}

function reset(m)
{
    m.mode = "cmd"; m.from = ""; m.rcpt = ""; m.msg = "";
}

// "FROM:<a@b> SIZE=123" -> "a@b"
function addr(arg)
{
    var a = arg.indexOf("<");
    var b = arg.indexOf(">");
    if (a < 0 || b < a) return arg;
    return arg.substring(a + 1, b);
}

// ---- a whole message --------------------------------------------------

// The line with a single dot: the message is complete. Answer first (the
// client waits for it), then read it and put it in the inbox.
function take(exc, m)
{
    var no = exc.evt.GetValue("id('RECEIVED')/@val") + 1;
    exc.evt.SetValue("id('RECEIVED')/@val", no);
    reply(exc, "250 2.0.0 Ok: queued as " + no + "\r\n");

    var mail = read_message(m.msg);
    mail.no = no;
    mail.at = Time.GetTimeStr(0);
    mail.env_from = m.from;
    mail.env_to = m.rcpt;
    mail.bytes = m.msg.length;
    m.mode = "cmd"; m.msg = ""; m.rcpt = "";

    exc.evt.Log(4, "MBX: message " + no + " from " + mail.env_from + " to " + mail.env_to
                 + " (" + mail.bytes + " bytes): " + mail.subject);
    inbox_add(exc.evt, mail);
}

// headers + body of one message, the parts the page shows
function read_message(raw)
{
    var p = raw.indexOf("\r\n\r\n");
    var head = p < 0 ? raw : raw.substring(0, p);
    var body = p < 0 ? "" : raw.substring(p + 4);

    // a header may continue on the next line (it then starts with a blank)
    var lines = head.split("\r\n");
    var h = {};
    var last = "";
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if ((l.substring(0, 1) == " " || l.substring(0, 1) == "\t") && last != "") {
            h[last] = h[last] + " " + l.substring(1);
            continue;
        }
        var c = l.indexOf(":");
        if (c <= 0) continue;
        last = l.substring(0, c).toLowerCase();
        h[last] = l.substring(c + 1);
        if (h[last].substring(0, 1) == " ") h[last] = h[last].substring(1);
    }

    var cte = h["content-transfer-encoding"];
    var ctype = h["content-type"];
    var text = body;
    if (ctype != null && ctype.indexOf("multipart") >= 0)
        text = "(a message in several parts - text, HTML or attachments - " + body.length + " bytes)";
    else if (cte != null && cte.toLowerCase() == "base64")
        text = CODEC.B64_dec(body.split("\r\n").join(""), 0x0401);

    return {
        from:    words(h["from"]),
        to:      words(h["to"]),
        subject: words(h["subject"]),
        date:    h["date"],
        body:    text.length > 600 ? text.substring(0, 600) + " ..." : text
    };
}

// "=?UTF-8?B?...?=" -> the text it stands for (RFC 2047, the B form, which
// is what AyMON writes for a subject or a name with non-ASCII letters)
function words(s)
{
    if (s == null) return "";
    var out = "";
    while (true) {
        var a = s.indexOf("=?");
        if (a < 0) break;
        var q = s.indexOf("?B?", a);
        if (q < 0) q = s.indexOf("?b?", a);
        var e = q < 0 ? -1 : s.indexOf("?=", q + 3);
        if (q < 0 || e < 0) break;
        out = out + s.substring(0, a) + CODEC.B64_dec(s.substring(q + 3, e), 0x0401);
        s = s.substring(e + 2);
        if (s.substring(0, 1) == " " && s.indexOf("=?") == 1) s = s.substring(1);
    }
    return out + s;
}

// the last ten messages, newest first, as JSON text - in this document,
// and handed to the page's document as well
function inbox_add(evt, mail)
{
    var old = JSON.parse(evt.GetValue("id('INBOX')/@val"));
    var list = [mail];
    for (var i = 0; i < old.length && i < 9; i++) list.push(old[i]);
    var txt = JSON.stringify(list);
    evt.SetValue("id('INBOX')/@val", txt);
    evt.SetValue("doc('PLT/S00')/id('INBOX')/@val", txt);
}
