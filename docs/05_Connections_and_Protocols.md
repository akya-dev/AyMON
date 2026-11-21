# Connections and protocols

`01_The_Element_Tree` is about what a value is once it is inside the engine.
This guide is about the other side: the socket, the port, the device, and who
speaks first.

Every connection in AyMON is one element with two halves:

```xml
<con id="CN_MB" xdb_fnc="[CON.tcp,PRO.modbus]" ... />
         transport ──┘        └── protocol
```

`CON.*` moves bytes. `PRO.*` decides what they mean. They are chosen
independently, which is why Modbus over TCP and Modbus over a serial port are
the same protocol element with a different first word.

---

## The two words that look alike

| Attribute | Question it answers | Values |
|---|---|---|
| `con_mod` | **who opens the socket** | `SERVER` listens, `CLIENT` dials, `SRVCLI` does both |
| `pro_role` | **who asks the questions** | `MASTER` asks, `SLAVE` answers |

They are independent, and every combination is a real configuration:

| | `pro_role="MASTER"` | `pro_role="SLAVE"` |
|---|---|---|
| **`con_mod="CLIENT"`** | polls a device (`PRJEDU_modbus` MON, `PRJEDU_snmp` MON) | dials out and then answers — a plant that connects to its centre |
| **`con_mod="SERVER"`** | listens, then asks the caller (a device that phones home) | the usual server (`PRJEDU_modbus` PLC, `PRJEDU_mqtt` broker, `PRJEDU_web`, `PRJEDU_telnet`) |

Reading a `<con>` starts with these two: "who dialled" and "who asks" are
different questions, and mixing them up is the most common way to write a
connection that starts, logs nothing and never talks.

---

## The transports

| | What it is | Seen in |
|---|---|---|
| `CON.tcp` | a TCP socket | `PRJEDU_modbus`, `PRJEDU_web`, `PRJEDU_mqtt`, `PRJEDU_telnet`, `PRJEDU_opcua` |
| `CON.udp` | datagrams | `PRJEDU_snmp` (both ends) |
| `CON.tls` | TCP with TLS: the listener holds the certificate | `PRJEDU_web` (8443), `PRJEDU_telnet` (2324) |
| `CON.ws` / `CON.wss` | a WebSocket, which is what a browser can open | `PRJEDU_web`, `PRJEDU_rep` |
| `CON.ser` | a serial port | — (same `PRO.modbus` above it, with `pro_mod="RTU"`) |
| `CON.sql` | a database connection, named by a connection string (`CON.odbc` is the same class). The string picks the driver: `DRIVER=SQLite3i` the embedded SQLite, `DRIVER=PostgreSQLi` PostgreSQL over libpq (below), anything else ODBC | `PRJEDU_odbc` |
| `CON.sqlite` | the same, for the embedded SQLite driver, where `con_host` is the database **file**. Needs `xdb_lib="AyPRO_sqlite"` on the root document; a `CON.sql` whose string says `DRIVER=SQLite3i` attaches it by itself | `PRJEDU_sqlite` |
| `CON.ssh` | a channel over SSH, with the server's key checked; `PRO.sftp` above it | below |
| `CON.cam` | a camera: USB, MJPEG, snapshots, RTSP, raw H.264 in UDP, a recording | `PRJEDU_vision`, `PRJPER_tello` |
| `CON.gpio` `CON.i2c` `CON.spi` | a board's lines and buses | `09_Pins_and_Buses` |
| `CON.hid` | a USB HID device (Windows) | — |

The protocol above them does not change: `PRO.mqtt` is the same broker whether
it sits on `CON.tcp` (a device) or `CON.ws` (a browser), and `PRJEDU_web` runs
both at once.

## The protocols

| | |
|---|---|
| Field | `PRO.modbus` (TCP, RTU, ASCII; both roles), `PRO.snmp` (a manager, v1, v2c, v3), `PRO.opc` (an OPC UA client), `PRO.mqtt` (broker and client), `PRO.rfid`, `PRO.gpio`, `PRO.reg` |
| Web | `PRO.http` (files and `.ayp` pages), `PRO.rest`, `PRO.soap`; `PRO.mqtt` over `CON.ws` for a browser's live values |
| Engines | `PRO.rep`, `PRO.clt`, `PRO.rpc` (`10_Two_Engines`), `PRO.bridge` |
| People and assistants | `PRO.telnet` (a maintenance shell), `PRO.mcp` (AI assistants, `PRJEDU_mcp`) |
| Data | `PRO.sql` |
| Mail and files | `PRO.smtp`, `PRO.ftp`, `PRO.sftp` (below) |
| Cameras | `PRO.cam`, `PRO.vision` |
| Your own | `PRO.raw` |

A connection type or a protocol in a module is attached by its first use, with no
`xdb_lib`: `AyLIB_net`, `AyLIB_vision`, `AyLIB_hw`. **Deploy `AyPRO*.dll` and
`AyLIB*.dll` together**, and on Linux every `lib*.so`.

---

## One port, several services

A `<con>` whose `con_host` starts with `#` does not listen at all. It takes
over the sessions that arrive on another connection, matched by path:

```xml
<con id="CN_WEB"  xdb_fnc="[CON.tcp,PRO.http]" con_host="127.0.0.1" con_port="8080" .../>
<con id="CN_API"  xdb_fnc="[CON.tcp,PRO.rest]" con_host="#CN_WEB"   con_port="/api"  .../>
<con id="CN_LIVE" xdb_fnc="[CON.ws,PRO.mqtt]"  con_host="#CN_WEB"   con_port="/mqtt" .../>
```

One open port, three protocols: the page, a JSON snapshot and live values.
`PRJEDU_web` is built this way, and `PRJEDU_rep` mounts replication on an
ordinary HTTP listener the same way (`pro_rep_link="#CN_EXT"`,
`pro_rep_path="/rep"`) — **replication does not open a port of its own**.

On a real site this matters twice: one hole in the firewall instead of four,
and one certificate instead of four. A linked connection inherits the
listener's TLS, which is why `CN_APIS` and `CN_LIVES` in `PRJEDU_web` carry no
`con_ssl_*` of their own.

The listener itself does more than send files. A file under its
`pro_http_root` ending in `.ayp` is a **server page**, run by the engine on
each request (`03_Scripting.md`): the same listener that sends `index.html`
can answer `report.ayp` with HTML written from the plant or a database, with
no extra connection and no API in between. `PRJEDU_pages` is a whole site of
them; `PRJEDU_oee` has one beside its live page. `con_auth` on the listener
gives the pages a login (`06_Access_and_Safety.md`).

---

## Asking, and being told

The difference decides whether a block needs a clock:

* **Polled protocols** — Modbus, SNMP, OPC UA. The block is a request and it
  needs a timer:

  ```xml
  <bi id="TANK_BLK" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="2"
      pro_adr="1.3.6.1.4.1.99999" pro_fni="GET"> ... </bi>
  ```

  The block is the unit of communication: every `<io>` under it travels in
  **one** request (`PRJEDU_modbus` reads four registers in one frame,
  `PRJEDU_snmp` six OIDs in one packet). Splitting points into separate blocks
  multiplies the traffic and nothing else.

* **Subscribed protocols** — MQTT. There is no timer anywhere in
  `PRJEDU_mqtt`'s monitoring document: the broker pushes a message when a value
  changes and the point moves when it arrives. A `<bi>` here is one
  subscription and its `pro_adr` is a topic filter.

  OPC UA can do both. A `<bi pro_fni="PUBLISH">` is a subscription — but the
  server still does not send on its own: the engine parks a request with it,
  so that block has a timer too, and a Publish **waits** at the server until
  there is news. `PRJEDU_opcua` polls and subscribes the same value side by
  side, and gives the subscription a connection of its own because that wait
  held the poll up on a shared one.

* **Server protocols** — HTTP, REST, telnet, an MQTT broker. Nothing is polled:
  a request arrives and a hook answers it (`pro_onreq`, `pro_oncmd`,
  `pro_onparse`).

---

## The wire value and the meaning

Every protocol lands its raw value in `pro` and nothing crosses to `val` by
itself:

```xml
<io id="LEVEL" pro="0" pro_typ="0x1104" pro_adr="2.1.0" pro_fnc="[VAL.put]"
    val="0" val_typ="0x1308" val_fnc="[VAL.cnv,ATR.rou,ATR.lmt,ALM.onlvl]"
    val_cnv_dlt="0.1" val_unt="%"/>
```

`pro_fnc="[VAL.put]"` is that bridge. Leave it out and every poll succeeds,
every raw value is right, and `val` never moves — a silent zero. The chain on
`val` then does the engineering: scaling, rounding, limits, alarm.

**`pro_typ` needs a run bit** (`0x1000`, or `0x2000` / `0x3000` to run queued) for
`pro_fnc` to run at all — the same rule as `val_typ` in `02_Timers_and_Events`. A
declared chain that never runs is the second silent failure of this layer.

---

## Writing back

| How | Seen in |
|---|---|
| a point with `pro_fnc="[PRO.out,VAL.put]"`; writing its `pro` sends it | `PRJEDU_snmp` (SET), `PRJEDU_mqtt` (a `/set` publish), `PRJEDU_opcua` (a Write, with `pro_fno="WRITE"` and the UA type in `pro_dtyp`) |
| a job written to a point of a job protocol; the answer comes back into the same point | `PRJEDU_net` (a mail through `PRO.smtp`, an upload and a listing through `PRO.ftp`) |
| a client publishes to `<document>/<id>/<attr>/set` | `PRJEDU_mqtt`, `PRJEDU_web` (the browser's set point) |
| a script hook answers a request | `PRJEDU_web` (`pro_onreq`), `PRJEDU_telnet` (`pro_oncmd`) |

**One `pro`, both directions.** What is written to a point's `pro` is sent by
`PRO.out` and is **not stored**; the chain of the written value ends there.
What the device then says comes back into the same `pro` as protocol input —
the next poll, a subscription, a job protocol's reply — passes `PRO.out` and
runs the functions after it (`VAL.put`, a reply handler). So right after a
write `pro` still shows the old value, and `val` moves when the device has
said it moved (engine 4.3.4.559 and later). A point nothing ever reads back —
a publish-only output — uses `PRO.outc`, which goes on with the value written.

An `out()` that sends nothing (no link, a protocol that cannot write) is one `ERROR`
line, `NOT SENT`, with nothing stored. A device that answers "no" is one `ERROR` and
is not asked again. A write to a parked session dials it first.

A write from outside is an ordinary write: it runs the element's own `val_fnc`,
so rounding, limits and alarms apply to it exactly as they do to a value the
plant produced. `PRJEDU_web` shows it end to end — send 250 from the browser,
the element stores 100 and publishes 100 back.

---

## Mail and files

A mail and a file transfer are **jobs**: JSON text written to a point of a
`PRO.smtp`, `PRO.ftp` or `PRO.sftp` connection, whose reply comes back into the same
`pro` as protocol input. `PRJEDU_net` runs all of it against servers written in
script.

```xml
<con id="CN_MAIL" xdb_fnc="[CON.tcp,PRO.smtp]" con_host="smtp.example.com" con_port="587"
     con_mod="CLIENT" con_ses="1" con_idletmo="30" pro_role="MASTER" pro_usr="plant" pro_pwd="..."
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D_MAIL" pro_con="CN_MAIL" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <io id="MAIL" pro_fno="send" pro="" pro_typ="0x1401" pro_fnc="[PRO.out,main.mail_done]"
      sta="0x0302" sta_typ="0x1142"/>
</dev>
```

```js
evt.SetValue("id('MAIL')/@pro", JSON.stringify({ id: "A1", to: "ops@example.com",
    subject: "Tank high", body: "Level " + level }));

function mail_done(evt)                           // the point's chain runs for the reply too
{
    if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return 0;   // the message going out
    var r = JSON.parse(evt.valn);                 // {seq, id, code, ok, text}
    if (r.ok > 0) evt.Log(6, "sent: " + r.id);    // ok = recipients accepted, not 0 or 1
    return 0;
}
```

| | SMTP | FTP | SFTP |
|---|---|---|---|
| `xdb_fnc` | `[CON.tcp,PRO.smtp]`, `[CON.tls,PRO.smtp]` (465) | `[CON.tcp,PRO.ftp]`, `[CON.tls,PRO.ftp]` (990) | `[CON.ssh,PRO.sftp]` |
| Encrypted | STARTTLS by default; a server without it is **refused**. `pro_smtp_tls="none"` says plain out loud | `AUTH TLS` by default, the same. `pro_ftp_tls="none"` | always |
| The job | `{id, to, cc, bcc, subject, body, html, att, from}` | `{id, cmd, src, dst, path, to, move, tmp}`, `cmd` = `put get list stat del mkdir rmdir rename` | the same as FTP |
| A limit on paths | attachments below `pro_smtp_dir` | remote below `pro_ftp_dir`, local below `pro_ftp_local` | `pro_sftp_dir`, `pro_sftp_local` |

**SFTP checks the server's key, always.** `con_ssh_hostkey="SHA256:<base64>"` is what
`ssh-keygen -lf` prints. Absent, the connection is refused and the line shows the key
the server presented; another key is refused too; `"any"` does not check, with a WARN
at each connect. Log in with `pro_usr` + `pro_pwd`, or `con_ssh_key` (+ `con_ssh_keypwd`).

A `con_ses="0"` mail connection is refused at start, and the job's thread is the writer's:
a long transfer belongs on a thread of its own (`pro_typ="0x2401"` + `evt_thr`, and that
thread's `thr_alm_wdt`). A server's "no" is final; only "no answer, connection lost with
the job on the wire" is repeated (`pro_try`), so a message may arrive twice. A file is
written as `.part` first with `"tmp"`. Without the `net` licence feature these count 20
operations a day (`04_Licensing`).

## PostgreSQL without ODBC

A `CON.sql` whose connection string starts with `DRIVER=PostgreSQLi` talks to PostgreSQL
through libpq, PostgreSQL's own client library, with no ODBC driver or data source in
between (engine 4.4.3.769 on; the plug-in `AyPRO_pgsql` is attached by that first use):

```xml
<con id="CN_SQL" xdb_fnc="[CON.sql,PRO.sql]" con_ses="4" pro_tmo="10"
     con_host="DRIVER=PostgreSQLi;SERVER=127.0.0.1;PORT=5432;DATABASE=plant;UID=aymon;PWD={s3cret}"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

The rest of the string is psqlODBC's, so a connection moves from ODBC by its `DRIVER` value
alone, and everything above it stays as it was: `SQL.qry`, `SQL.attach`, `PRO.sql`, the SQL
mirror lists and record sinks (`11_Records_and_Saving`), XDB SQL's `sql()`
(`14_SQL_Both_Ways`). `PRJEDU_odbc` has the string ready (`ConnStrPGNATIVE`).

| Key | |
|---|---|
| `SERVER`, `PORT` | the server; a comma list = several hosts, and libpq's `target_session_attrs` picks one |
| `DATABASE`, `UID`, `PWD` | `PWD={..}` when the password holds `;`; the log writes it as `***` |
| `SSLmode` | `disable` .. `verify-full` |
| `pqopt={k=v ..}`, any libpq keyword | handed to libpq (`connect_timeout`, `application_name`, `sslrootcert` ..) |
| `ConnSettings={..}` | SQL run right after connecting; an error refuses the connection |
| psqlODBC's own keys | (`UseDeclareFetch`, `BoolsAsChar` ..) not used; the log names them once |

**Why.** psqlODBC itself sits on libpq; what goes is the ODBC layer. A parameterised
statement is one round trip to the server instead of psqlODBC's four, which is what counts
over a network: 2.2 against 8.7 ms at a 2 ms round trip. Against a local server, measured
inside the engine: reading cells 1.4-1.8 times, parameterised statements 3 times, `SQL.qry`
1.5-2 times faster. A query whose time is the server's own (a large join, the disk) gains
little.

**The same answers.** What a script reads is what it read through psqlODBC: a `bool` is `1` /
`0`, a `bytea` hex without `\x`, a `uuid` upper case, a `timestamptz` the wall time in the
engine's zone without an offset; everything else is the server's text. Typed reads
(`SQL.getdata`) give integers, floats (NaN and the infinities kept), `numeric` as a decimal,
and with `con_dtm="1"` time values. Parameters go as text without a type, as psqlODBC sent
them. A text of several statements answers its first result; an error in any of them fails
the call.

**A time limit that ends.** A statement past its connection's limit (`pro_tmo`) is cancelled
on the server and answers `57014`; the link stays usable. One still running 2 s after the
cancel takes its link with it, and the pool opens a new one.

**What to deploy.** Windows: `AyPRO_pgsql.dll` and PostgreSQL 18's `libpq.dll`,
`libintl-9.dll`, `libiconv-2.dll` and `libwinpthread-1.dll` beside the engine, all four from
one installation; `bin/win-x64` holds them. Linux and the Raspberry Pi: `libAyPRO_pgsql.so`
(in `bin/`) and the system's libpq, `sudo apt install libpq5`. A missing library fails that
connection, never the engine's start, and says what is missing:

```
SQL.connect: ERROR (con=DRIVER=PostgreSQLi;..;PWD=***..), 08001:1:0:pgsql: libpq could not be loaded [Windows error 126] -- expected libpq.dll next to the executable ..
```

**Moving every string at once.** `<xdb xdb_sql_pg="native">` on the root document sends
every connection string whose `DRIVER` starts with `PostgreSQL` (`{PostgreSQL Unicode(x64)}`,
`{PostgreSQL ODBC Driver(UNICODE)}` ..) through libpq, unchanged. A `DSN=` string names no
driver and stays with ODBC; absent or `odbc` = as before. Deploy the libraries first: a
string moved without them fails.

Not there: `COPY` from a script, server-side named statements, pipelining.

## A camera

A camera is a connection too: `sta` switches it, it is redialled when lost, and every
frame is a blob in an attribute. `PRJEDU_vision` is the whole story, from
`[CON.cam,PRO.cam]` over a recording to a real IP camera's events and PTZ.

| | |
|---|---|
| Sources (`con_host`) | `usb:0`, `http://` (MJPEG), `snap:http://`, `rtsp://`, `udp:11111`, `file:<dir>`, `test:`, `link:<id>`, `none:` |
| One `<dev>` per camera | `con_ses` > 0; the block `<bi pro_fni="frm">` gets the frames and its poll is the watchdog; `thr_wrk` = the number of cameras gives each its own worker |
| Analysis with no script | `[CON.cam,PRO.vision]`: `<bi pro_fni="roi|count|grid|diff|line|edge|match">` on every frame, each result an ordinary point |
| Events and commands | `con_cam_api="dahua|hik|onvif"`: `pro_fni="evt"`, `"din"`, `pro_fno="dout|ptz|snap"` |

RTSP and `udp:` video are decoded on Windows only; on Linux use a camera's MJPEG or
snapshot URL. `usb:` on Linux has not run on a device yet, and no real IP camera has
been tried with RTSP or ONVIF: the rigs use fake ones.

---

## When the engine does not speak it

Two ways out, in the order you should try them:

1. **Write it in script.** `PRO.raw` is a connection with no protocol of its
   own; `pro_onparse` hands the script what arrived, and `CODEC.HEX_dec` /
   `HEX_enc` turn text into bytes and back. `PRJEDU_snmp`'s agent is an SNMP
   v2c server written this way, in about 250 lines, because `PRO.snmp` is a
   manager and does not answer. A protocol whose server speaks first (SMTP,
   FTP, POP3 greet before the client says anything) also needs
   `pro_onaccept`, called once per accepted connection before anything is
   read; one whose message ends with a connection (an FTP upload) needs
   `pro_onclose`, called once when an accepted connection ends.
   `PRJEDU_net`'s mail and file servers are written that way (engine
   4.3.4.568).
2. **Write it as a plug-in.** A DLL that registers `PRO.<name>` or
   `CON.<name>` and is loaded with `xdb_lib`. That is what the licensed
   product's plug-in SDK note is for.

Script first is not a compromise: the format is usually the hard part, and it
is easier to get right where you can change a line and restart.

---

## The knobs you will actually touch

| | |
|---|---|
| `con_ses` | how many sessions. **A TCP listener needs `con_ses` > 0**; a polled connection uses one session per device, which is also what per-device credentials need (`PRJEDU_snmp`); on a SQL connection it is the number of database links |
| `thr_wrk` | workers for a connection's sessions; each worker always serves the same ones |
| `con_tmo` | how long a dial may take (bounded, since 4.3.4.614: a dead host no longer holds the thread for the system's own 21 s) |
| `con_rct` | redial every N seconds while the far end is not there |
| `con_tmomax` | request timeouts in a row after which a dialled session is closed and dialled again (3; `-1` off): for a peer that keeps the socket and stopped answering |
| `con_keeptmo` / `con_idletmo` | keep-alive, and when to close a silent session. On a listener `con_idletmo="-1"` with `con_keeptmo` 0 never drops one, which is what a page that sits open needs; **with `con_keeptmo` > 0 the idle time is 3 × that**. A client session whose `con_idletmo` ran out, or that says `-1`, is **parked**: its own loop does not dial, and a poll or a write wakes it |
| `pro_tmo` / `pro_try` | how long to wait for an answer, and how many *re*tries (`0` = one attempt) |
| `con_acl` | who may connect at all — see `06_Access_and_Safety` |

---

## Checklist

* `con_mod` and `pro_role` both say what you meant
* a TCP listener has `con_ses` > 0
* every point that must move has `pro_fnc="[VAL.put]"` and a `pro_typ` with
  a run bit
* polled blocks have a timer (`evt_fnc="[PRO.pol]"` + `evt_per`); subscribed
  ones do not
* points that belong to one request live under one `<bi>`
* services that can share a listener do (`con_host="#CN_X"` + a path)
* `con_host` is `127.0.0.1` until you have read `06_Access_and_Safety`
