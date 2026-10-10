# PRJEDU_net — the engine writes mail and files, nothing to install

The plant talks to the office world. **Mail**: a tank's level alarm writes an
e-mail when it comes and another when it is gone. **Files**: a shift report is
written, zipped and uploaded to an FTP server. One engine, one command, real
SMTP and FTP on loopback sockets:

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8114/** — the tank, three buttons (*Overfill
once*, *Send a test mail*, *Make and upload a shift report*), what the engine
sent with the server's answer to each mail and each transfer, the mails as the
mail server received them, and the files the file server holds.

| Document | Role | What it is |
|---|---|---|
| `PLT/S00` | the **plant** | a tank with a level alarm, a mail connection (`CN_MAIL`, `PRO.smtp`) and the page |
| `MBX/S00` | the **mail server** | a small SMTP server **written in script** on `127.0.0.1:2525`: it takes every message and hands it to the page |
| `FTP/S00` | the **file server** | a small FTP server **written in script** on `127.0.0.1:2121`: it takes every upload, keeps its name and size, and lists them |

Read `db\db_PLT.xml` and `db\db_PLT.js` if you came for mail or file transfer
— that is what you would write for a real plant. Read `db\db_MBX.js` and
`db\db_FTP.js` if you ever have to write a server for a line protocol.

Needs engine **4.3.4.568** or later and its module **`AyLIB_net`** (in `bin`;
`AyLIB_net.dll`, `libAyLIB_net.so` on Linux). The module is attached the first
time a `<con>` names `PRO.smtp` or `PRO.ftp`, or a script calls `FILE.*` — no
`xdb_lib` needed.

## A mail is a write to a point

```xml
<con id="CN_MAIL" xdb_fnc="[CON.tcp,PRO.smtp]" con_ses="1" con_idletmo="30" ..
     con_host="127.0.0.1" con_port="2525" pro_smtp_tls="none"
     pro_smtp_from="Tank farm &lt;plant@example.org&gt;"/>
<dev id="DV_MAIL" pro_con="CN_MAIL" pro_adr="1" ses_idx="0">
    <io id="MAIL" pro="" pro_typ="0x1401" pro_fnc="[PRO.out,main.mail_done]" pro_fno="send"/>
</dev>
```

```js
evt.SetValue("id('MAIL')/@pro", JSON.stringify({
    id: "M7", to: "operator@example.org",
    subject: "ALARM: tank level 91.6 %", body: "The tank level reached ..." }));
```

* **The connection is made for the message.** Nothing is dialled at start; the
  first mail connects, says EHLO and sends; later mails use the open session;
  after `con_idletmo` quiet seconds the engine says QUIT.
* **One attribute, both directions.** The message goes out through `PRO.out`
  and is never stored. The server's answer comes back **into the same `pro`**
  as protocol input, passes `PRO.out` and runs `main.mail_done`:

  ```json
  {"seq":2,"id":"M2","code":250,"ok":1,"text":"250 2.0.0 Ok: queued as 2"}
  ```

  `code` 250 = taken, 4xx = not now, 5xx = no, **0 = it never came to an
  answer** (no connection, refused before sending, the licence's allowance).
  `ok` = recipients the server accepted. The handler's first line asks whether
  the value really came from the protocol — the chain also runs once at start.
  This is the rule every protocol's `pro` follows: a value written to a Modbus
  register goes out the same way and the device's answer comes back the same
  way.
* **Sending waits for the server**, so it never runs on the thread that runs
  the tank. Whoever wants a mail writes `NOTE` (`{subject, body}`); `NOTE`'s
  `val_fnc` runs queued on `TH_MAIL` (`val_typ="0x3401"`) and writes the point.
* **When a mail goes out** is the project's own decision, in script:
  `main.on_alarm` is the `sta_fnc` of `LEVEL` and asks for a mail when the
  level reaches the alarm (90 %) and when it is back to normal after one. The
  warning (80 %) writes no mail — it is on the page.

## A file transfer is a write too

```xml
<con id="CN_FILES" xdb_fnc="[CON.tcp,PRO.ftp]" con_ses="1" con_idletmo="30" ..
     con_host="127.0.0.1" con_port="2121" pro_ftp_tls="none"/>
<dev id="DV_FILES" pro_con="CN_FILES" pro_adr="1" ses_idx="0">
    <io id="FTP"    pro="" pro_typ="0x1401" pro_fnc="[PRO.out,main.ftp_done]"/>
    <io id="FTP_LS" pro="" pro_typ="0x1401" pro_fnc="[PRO.out,main.ls_done]"/>
</dev>
```

```js
evt.SetValue("id('FTP')/@pro", JSON.stringify({
    id: "F3", cmd: "put", src: "%PRJ%/out/shift_20261005_215222.zip",
    dst: "shift_20261005_215222.zip", tmp: 1, move: "%PRJ%/out/sent" }));
```

The same rules as mail: the job is the JSON written to a point, the server's
answer comes back **into the same point**:

```json
{"seq":3,"id":"F3","cmd":"put","code":226,"ok":1,"text":"226 Transfer complete, 327 bytes","bytes":327}
```

* **`put` with `tmp`** uploads as `<name>.part` and renames it when it is
  complete — a reader of the server's directory never sees half a file;
  **`move`** puts the local file into `out/sent` afterwards.
* **`list`** answers the directory in the reply (`"list":[{name, size, ..}]`).
  `main.ftp_done` asks for it after every upload — on the OTHER point,
  `FTP_LS`, with the reply's "from the protocol" mark taken off first: a write
  made inside a reply's chain would otherwise not be sent.
* **Who does the work.** The page only writes `REPORT` (the time of the
  press). The tank's own timer sees it and makes the report: the samples of
  the last minutes into a CSV (`File.open` / `File.puts`), `FILE.mkdir` and
  `FILE.zip` (module `AyLIB_net`). Those two are for an Engineer and above,
  and a script started from the page runs with the page's role (Guest); the
  engine's own timer runs as the engine.
* The upload is handed to `TH_MAIL` through `FTPJOB`, like a mail: a transfer
  waits for the server and never runs on the tank's thread.
* Other jobs: `get`, `stat`, `del`, `mkdir`, `rmdir`, `rename` — the field note
  *File Transfer (FTP)* of the licensed product lists them.

## Why the mail server is script

So that the example needs no mail account and nothing installed. It is built
out of the same pieces as `PRJEDU_snmp`'s agent, plus one:

| | |
|---|---|
| `PRO.raw` | a connection with no protocol of its own |
| `pro_onaccept` | called **once per accepted connection, before anything is read**. SMTP's server speaks first (`220 ...`) and the client waits for it — without this hook (4.3.4.565) a script server could only answer, never begin |
| `pro_onparse` | called with what arrived: the script cuts it into lines (`CR LF`), answers each command and collects the message between `DATA` and the line holding one dot. What is not a whole line yet waits in `exc.ses.mem` for the next arrival |
| `con_role="3"` | an accepted connection is a Guest (role 0), and its scripts run with that role; the server hands each message to the page's document, whose `INBOX` only an Operator (3) may write |

It answers EHLO, HELO, MAIL, RCPT, DATA, RSET, NOOP and QUIT, decodes the
base64 body and the encoded subject, and keeps the last ten messages. It does
not relay, authenticate or encrypt — it is a mail **sink**, for this example
only.

## Why the file server is script, and what FTP needs from it

FTP uses **two kinds of connection**: commands and answers on one, and every
listing and every file on a connection of its own, which the client opens to
the port the server named in its answer to `EPSV`. In stream mode **a file ends
where its connection ends** — so the server has to hear the close. That is the
third hook (4.3.4.568):

| | |
|---|---|
| `pro_onaccept` | a connection arrived. Just after an `EPSV` it is the data connection: taken, nothing said. Otherwise a client: `220 ...` |
| `pro_onparse` | a command line, or the bytes of a file (counted; the first four kept, to show a ZIP is a ZIP) |
| `pro_onclose` | a connection ended. The data connection of an upload: the file is complete, answer `226` on the command connection |

A listing goes the other way: the server writes it on the data connection and
closes it itself — the client reads until the close.

**One listener for both.** `EPSV` names the command port itself (2121), so a
client's command session and its data session are two sessions of the same
`<con>` and run on the same thread: the script keeps its state in its own
variables and never has two threads touching them. A real server names a
range of ports instead. It serves one client at a time, keeps names and sizes
— not the files — and does no TLS: a **sink**, like the mail server.

## The licence: 20 operations a day

Mail and file transfer are the licence feature **`net`**. Without it — FREE,
and the education licence of these examples — **20 operations a day are free**,
mails and FTP jobs together; the next one is not refused by address but
answered `code 0` ("not sent"), and one `LIC:` line goes to the root log. The
count is kept in memory and starts again with the engine. The start-up log
says it:

```
XDB:LIC: net is not licensed: mail and file transfer (PRO.smtp / ftp / sftp) work at any address and are COUNTED, 20 operations a day
```

One *Overfill* costs two mails, *Send a test mail* one, a shift report two FTP
jobs (the upload and the listing).

## What the log looks like

```
XDB:AyLIB: 'AyLIB_net' attached (module abi 1.3, core 1.3)
MBX/S00:MBX: SMTP mail sink on 127.0.0.1:2525 (PRO.raw + pro_onaccept + pro_onparse)
PLT/S00:PLT: tank + mail to operator@example.org through CN_MAIL; open http://127.0.0.1:8114/
PLT/S00:PLT: overfill started at 57 %
PLT/S00:PLT: level WARNING (82 %)
PLT/S00:PLT: level ALARM (92 %)
PLT/S00:DV_MAIL:PRO.smtp(1).connect: ready -- 127.0.0.1, PLAIN TEXT (pro_smtp_tls="none"), no AUTH
MBX/S00:MBX: message 1 from plant@example.org to operator@example.org (503 bytes): ALARM: tank level 92 %
PLT/S00:PLT: mail M1 sent to 1 recipient(s): ALARM: tank level 92 %
PLT/S00:PLT: level WARNING (89.5 %)
PLT/S00:PLT: level normal (79.5 %)
MBX/S00:MBX: message 2 from plant@example.org to operator@example.org (477 bytes): Cleared: tank level back to normal
PLT/S00:PLT: mail M2 sent to 1 recipient(s): Cleared: tank level back to normal
PLT/S00:PLT: shift report shift_20261005_215216.zip - 704 bytes of samples in 305 bytes
PLT/S00:DV_FILES:PRO.ftp(1).connect: ready -- 127.0.0.1, PLAIN TEXT (pro_ftp_tls="none"), user anonymous
FTP/S00:FTP: received shift_20261005_215216.zip.part (305 bytes, a ZIP archive)
PLT/S00:PLT: uploaded F1 (305 bytes): 226 Transfer complete, 305 bytes
PLT/S00:PLT: the file server holds 1 file(s)
```

Raise `xdb_log` to `7` on `CN_MAIL` or `CN_FILES` and every command and answer
is in the log (`C: ..` / `S: ..`); a password, when there is one, shows as
`***`.

## Sending to a real mailbox

In `db\db_PLT.xml`, on `<con id="CN_MAIL">`:

| Field | Set it to |
|---|---|
| `con_host` / `con_port` | your provider's submission server, e.g. `smtp.example.org` / `587` |
| `pro_smtp_tls` | **remove it**: the engine then insists on STARTTLS and refuses a server that does not offer it. Port 465 instead: `xdb_fnc="[CON.tls,PRO.smtp]"` |
| `pro_usr` / `pro_pwd` | the account; many providers want an **app password**, not your own |
| `pro_smtp_from` | an address the account may send as |
| `con_ssl_cacert` | the server's CA chain as a PEM file — **on Windows the system certificate store is not read** |

and set `MAIL_TO` to your address. Leave `MBX/S00` running or set
`sta="0x0000"` on its `<doc>` in `db\AyXDB.xml`.

If nothing arrives, the reply on the page says why:

| Reply | Meaning |
|---|---|
| `code 0`, `no connection to <host>` | the server cannot be reached or the login failed — the `connect:` line above it in `PLT.log` has the reason |
| `code 0` … `does not offer STARTTLS` | port 465 wants `CON.tls`; a plain relay on your own network wants `pro_smtp_tls="none"` |
| `code 0` … `certificate verification failed` | `con_ssl_cacert` missing or not the server's CA |
| `code 535` | account or password |
| `code 0` … `daily allowance` | the 20 mails of the day are used — see *The licence* above |

## Uploading to a real FTP server

In `db\db_PLT.xml`, on `<con id="CN_FILES">`:

| Field | Set it to |
|---|---|
| `con_host` / `con_port` | the server, port `21` |
| `pro_ftp_tls` | **remove it**: the engine then insists on `AUTH TLS` (FTPS) and refuses a server that does not offer it; commands AND data are encrypted. Implicit FTPS on port 990: `xdb_fnc="[CON.tls,PRO.ftp]"` |
| `pro_usr` / `pro_pwd` | the account (none = anonymous) |
| `pro_ftp_dir` | the remote directory the jobs may use; names cannot leave it |
| `con_ssl_cacert` | the server's CA chain as a PEM file |

Leave `FTP/S00` running or set `sta="0x0000"` on its `<doc>`. For SFTP (SSH)
the same jobs go through `[CON.ssh,PRO.sftp]`, with the server's key
fingerprint in `con_ssh_hostkey` — only the `<con>` changes.

## Opening it to other machines

Every listener — the page, the mail sink, the file sink — is on `127.0.0.1`,
and `con_acl="127.0.0.1"` refuses everyone else at accept. The sinks check
nothing: do not put them on a network.

## Licence

Six connections (mail and file connections, the two sinks, two for the page),
four documents, two devices: inside FREE. Mail and file transfer are counted
as above.
