// =====================================================================
// PLT/S00 - a tank whose alarm writes mail.
//
// What is NOT here: no SMTP, no socket, no retry loop. PRO.smtp connects,
// says EHLO, sends, and lets the connection go; this file only decides
// WHEN to write a mail and reads what came of it.
// =====================================================================

function start(evt)
{
    var to = evt.GetValue("id('MAIL_TO')/@val");
    evt.Log(4, "PLT: tank + mail to " + to + " through CN_MAIL; open http://127.0.0.1:8114/");
    return 0;
}

// ---- the tank, once a second -----------------------------------------
//
// PHASE 0 wobbles around 52 %. OVERFILL = 1 starts 1: up 2.5 % a second
// to 97 %, 2: eight seconds full, 3: down again to 55 %, then 0.

function tick(evt)
{
    var t = evt.obj.cnt + 1;
    evt.obj.cnt = t;

    var lvl   = 0.0 + evt.GetValue("id('LEVEL')/@val");
    var phase = evt.GetValue("id('PHASE')/@val");

    if (phase == 0 && evt.GetValue("id('OVERFILL')/@val") == 1) {
        evt.SetValue("id('OVERFILL')/@val", 0);       // a button, not a switch
        evt.Log(4, "PLT: overfill started at " + lvl + " %");
        phase = 1;
    }

    // (0.0 + t): arithmetic takes the LEFT operand's type, and t is an
    // integer - t / 15.0 would divide as integers
    if (phase == 0) lvl = 52.0 + 6.0 * Math.sin((0.0 + t) / 15.0);
    else if (phase == 1) {
        lvl = lvl + 2.5;
        if (lvl >= 97.0) { lvl = 97.0; phase = 2; evt.obj.full = t; }
    }
    else if (phase == 2) {
        if (t - evt.obj.full >= 8) phase = 3;
    }
    else {
        lvl = lvl - 2.5;
        if (lvl <= 55.0) phase = 0;
    }

    evt.SetValue("id('PHASE')/@val", phase);
    evt.SetValue("id('LEVEL')/@val", lvl);

    // the samples a shift report is made of: kept on this timer element,
    // an attribute nobody publishes; the last ten minutes or so
    var s = evt.obj.samples;
    if (s == null) s = "";
    s = s + Time.GetTimeStr(0) + "," + evt.GetValue("id('LEVEL')/@val") + "\n";
    if (s.length > 24000) s = s.substring(s.indexOf("\n", s.length - 20000) + 1);
    evt.obj.samples = s;

    // the page asked for a report (REPORT holds the time of the press)
    var req = evt.GetValue("id('REPORT')/@val");
    if (req != 0 && req != evt.obj.rep_done) {
        evt.obj.rep_done = req;
        report(evt, s);
    }
    return 0;
}

// ---- the shift report -------------------------------------------------
//
// Runs on the tank's timer, i.e. as the engine: FILE.* (the AyLIB_net
// module, attached at its first call) is for an Engineer and above.
//   out/shift_<date>_<time>.csv  the samples
//   out/shift_<date>_<time>.zip  FILE.zip of it; the CSV is removed
// The upload is handed to TH_MAIL like a mail: it waits for the server.

function report(evt, samples)
{
    var t = Time.GetTimeStr(0);                       // "2026-10-05 21:50:07"
    var name = "shift_" + t.substring(0, 4) + t.substring(5, 7) + t.substring(8, 10)
             + "_" + t.substring(11, 13) + t.substring(14, 16) + t.substring(17, 19);
    FILE.mkdir("%PRJ%/out");

    var csv = xdb.normalizePath("%PRJ%/out/" + name + ".csv");
    var f = File.open(csv, "w");
    File.puts(f, "time,level_pct\n" + samples);
    File.close(f);

    var z = FILE.zip(csv, "%PRJ%/out/" + name + ".zip", 9);
    File.remove(csv);
    evt.Log(4, "PLT: shift report " + name + ".zip - " + z.bytes + " bytes of samples in " + z.size + " bytes");

    // put it as "<name>.zip.part" and rename it when it is complete (tmp),
    // then move the local file to out/sent (move)
    evt.SetValue("id('FTPJOB')/@val", JSON.stringify({
        id: "F" + (evt.GetValue("id('REPORTS')/@val") + 1),
        cmd: "put", src: "%PRJ%/out/" + name + ".zip", dst: name + ".zip",
        tmp: 1, move: "%PRJ%/out/sent" }));
}

// val_fnc of FTPJOB, on TH_MAIL: the job is written to the point FTP
function on_ftpjob(evt)
{
    evt.SetValue("id('FTP')/@pro", evt.valn);
    return 0;
}

// ---- what came of it --------------------------------------------------
//
// The FTP reply has the mail's shape and a little more:
//   {"seq":3,"id":"F1","cmd":"put","code":226,"ok":1,"text":"226 ..","bytes":431}
//   code: the server's answer (226 / 250 done), 0 = it never came to one.
// After an upload the server is asked for its directory - written to the
// OTHER point, FTP_LS: a write made inside a reply's chain carries the
// reply's mark "from the protocol" and would not be sent, so the mark is
// taken off first (the rule is in Mail_SMTP / File_Transfer_FTP, section 5).

function ftp_done(evt)
{
    if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return 0;
    var r = JSON.parse(evt.valn);
    ftp_out(evt, r);
    if (r.ok == 1) {
        evt.SetValue("id('REPORTS')/@val", evt.GetValue("id('REPORTS')/@val") + 1);
        evt.Log(4, "PLT: uploaded " + r.id + " (" + r.bytes + " bytes): " + r.text);
        evt.flg = evt.flg & ~EVT.FLG_PRO_MSK;
        evt.SetValue("id('FTP_LS')/@pro", JSON.stringify({ id: "L" + r.id.substring(1), cmd: "list", path: "" }));
    }
    else evt.Log(2, "PLT: upload " + r.id + " NOT done [" + r.code + "] " + r.text);
    return 0;
}

function ls_done(evt)
{
    if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return 0;
    var r = JSON.parse(evt.valn);
    ftp_out(evt, r);
    if (r.ok == 1) {
        evt.SetValue("id('FTP_FILES')/@val", JSON.stringify(r.list));
        evt.Log(4, "PLT: the file server holds " + r.list.length + " file(s)");
    }
    else evt.Log(2, "PLT: listing " + r.id + " NOT done [" + r.code + "] " + r.text);
    return 0;
}

// the last eight replies, newest first
function ftp_out(evt, r)
{
    var old = JSON.parse(evt.GetValue("id('FTP_OUT')/@val"));
    var list = [{ at: Time.GetTimeStr(0), id: r.id, cmd: r.cmd, code: r.code, ok: r.ok,
                  text: r.text, bytes: r.bytes }];
    for (var i = 0; i < old.length && i < 7; i++) list.push(old[i]);
    evt.SetValue("id('FTP_OUT')/@val", JSON.stringify(list));
}

// ---- the alarm --------------------------------------------------------
//
// sta_fnc of LEVEL: ALM.onlvl moved the alarm bits in sta (0x0004
// warning, 0x0008 alarm). A mail when the level REACHES the alarm, and
// one when it is back to normal after one. The warning alone writes no
// mail - it is on the page.

function on_alarm(evt)
{
    var now = (evt.stan & 0x000C) >> 2;
    var was = (evt.stap & 0x000C) >> 2;
    if (now == was) return 0;

    var name = ["normal", "WARNING", "ALARM", "EMERGENCY"];
    var lvl  = evt.GetValue("id('LEVEL')/@val");
    evt.Log(4, "PLT: level " + name[now] + " (" + lvl + " %)");

    if (now >= 2 && was < 2)
        note(evt, "ALARM: tank level " + lvl + " %",
             "The tank level reached the alarm limit (90 %).\n\n"
           + "Level:  " + lvl + " %\nTime:   " + Time.GetTimeStr(0) + "\n\n"
           + "Live page: http://127.0.0.1:8114/\n");
    else if (now == 0 && evt.obj.alm_mailed == 1)
        note(evt, "Cleared: tank level back to normal",
             "The tank level is back below the warning limit (80 %).\n\n"
           + "Level:  " + lvl + " %\nTime:   " + Time.GetTimeStr(0) + "\n");

    if (now >= 2) evt.obj.alm_mailed = 1;
    if (now == 0) evt.obj.alm_mailed = 0;
    return 0;
}

// ---- asking for a mail ------------------------------------------------
//
// The tank runs on the document's thread, and sending waits for the
// server. So the request goes through NOTE, whose val_fnc (main.on_note)
// runs queued on TH_MAIL. The time inside makes every request a change.

function note(evt, subject, body)
{
    evt.SetValue("id('NOTE')/@val",
                 JSON.stringify({ subject: subject, body: body, t: Time.GetTimeStr(0) }));
}

// val_fnc of TEST (queued to TH_MAIL): the page pressed "Send a test mail"
function on_test(evt)
{
    note(evt, "Test mail from the tank farm",
         "This is a test mail written by AyMON (PRJEDU_net).\n\n"
       + "Tank level: " + evt.GetValue("id('LEVEL')/@val") + " %\nTime: " + Time.GetTimeStr(0) + "\n");
    return 0;
}

// val_fnc of NOTE, on TH_MAIL: the message is written to the point MAIL.
// PRO.out sends it; the reply comes back into MAIL and runs mail_done.
function on_note(evt)
{

    var n = JSON.parse(evt.valn);
    var no = evt.GetValue("id('MAILS')/@val") + 1;
    evt.SetValue("id('MAILS')/@val", no);

    // the reply carries the id, not the subject: keep the subject until it
    // comes (mail_done runs on this same thread, inside the write below)
    var pend = JSON.parse(evt.GetValue("id('PENDING')/@val"));
    pend["M" + no] = n.subject;
    evt.SetValue("id('PENDING')/@val", JSON.stringify(pend));

    evt.SetValue("id('MAIL')/@pro", JSON.stringify({
        id:      "M" + no,                                // comes back in the reply
        to:      evt.GetValue("id('MAIL_TO')/@val"),
        subject: n.subject,
        body:    n.body
    }));
    return 0;
}

// ---- what came of it --------------------------------------------------
//
// pro_fnc="[PRO.out,main.mail_done]": the engine runs this chain twice
// for every mail. Once with the MESSAGE (PRO.out sends it and ends the
// chain there - this function is not reached), once with the server's
// REPLY, which arrives as protocol input:
//
//   {"seq":4,"id":"M4","code":250,"ok":1,"text":"250 2.0.0 Ok: queued as 4"}
//
//   code  250 taken; 4xx not now; 5xx no; 0 = it never came to an answer
//         (no connection, refused before sending, the licence's allowance)
//   ok    recipients the server accepted
//
// The direction test is the first line: the chain also runs once at start
// with the stored value, and that is no reply.

function mail_done(evt)
{
    if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return 0;

    var r = JSON.parse(evt.valn);

    // which mail this was: on_note left its subject under its id
    var pend = JSON.parse(evt.GetValue("id('PENDING')/@val"));
    var subject = pend[r.id] == null ? "" : pend[r.id];
    delete pend[r.id];
    evt.SetValue("id('PENDING')/@val", JSON.stringify(pend));

    if (r.code == 250) {
        evt.SetValue("id('SENT')/@val", evt.GetValue("id('SENT')/@val") + 1);
        evt.Log(4, "PLT: mail " + r.id + " sent to " + r.ok + " recipient(s): " + subject);
    }
    else {
        evt.SetValue("id('FAILED')/@val", evt.GetValue("id('FAILED')/@val") + 1);
        evt.Log(2, "PLT: mail " + r.id + " NOT sent [" + r.code + "] " + r.text);
    }

    var old = JSON.parse(evt.GetValue("id('OUTBOX')/@val"));
    var list = [{ at: Time.GetTimeStr(0), id: r.id, subject: subject,
                  code: r.code, ok: r.ok, text: r.text }];
    for (var i = 0; i < old.length && i < 7; i++) list.push(old[i]);
    evt.SetValue("id('OUTBOX')/@val", JSON.stringify(list));
    return 0;
}
