# Connection and protocol types

Every name you can put in a `<con>`'s `xdb_fnc` — the transports (`CON.x`) and the
protocols (`PRO.x`) — and the `con_*` / `pro_*` fields each one reads, with its default and
unit. The ideas are in the guides: [The element tree](../01_The_Element_Tree.md) for
`<con>` / `<dev>` / `<bi>` / `<io>`, [Connections and protocols](../05_Connections_and_Protocols.md)
for who dials and who asks, [Pins and buses](../09_Pins_and_Buses.md) for a board's lines,
[Two engines](../10_Two_Engines.md) for replication and the election. Every example marked
*measured* was run on engine 4.4.2.702 on one machine, over 127.0.0.1.

* [The shape of a connection](#the-shape-of-a-connection)
* [Fields every connection reads](#fields-every-connection-reads)
* [Fields every protocol reads](#fields-every-protocol-reads)
* [Transports](#transports)
* [Protocols](#protocols)
* [Not in this repository's bin](#not-in-this-repositorys-bin)

---

## The shape of a connection

```xml
<con id="CN_PLC" xdb_fnc="[CON.tcp,PRO.modbus]" con_mod="CLIENT" pro_role="MASTER" .../>
  <dev id="TANK" pro_con="CN_PLC" pro_adr="1" ...>          <!-- one device       -->
    <bi id="BLK" pro_fni="3" pro_adr="0" pro_len="4" ...>    <!-- one request      -->
      <io id="LEVEL" pro_adr="0" .../>                       <!-- one value in it  -->
```

The transport always comes first in `xdb_fnc`, the protocol second. A `<dev>` names its
connection with `pro_con` and does not have to sit under it. A `<bi>` is one request; an
`<io>` is one value taken out of it. The raw value lands in `pro`, and nothing reaches `val`
until a chain says so (`pro_fnc="[VAL.put]"`). The whole model, `sta` and the log line are in
[The element tree](../01_The_Element_Tree.md).

Three words decide what a `<con>` does, and they are independent:

| Field | Question | Values |
|---|---|---|
| `con_mod` | who opens the socket | `SERVER` listens, `CLIENT` dials, `SRVCLI` both. **Required**: without it the `<con>` is not created (`con_mod not given`) |
| `pro_role` | who asks | `MASTER` asks, `SLAVE` answers. Default `MASTER` |
| `con_ses` | how many conversations | a listener: the most peers at once; a client: one session per `<dev>` |

A name in a module (`AyLIB_net`, `AyLIB_vision`, `AyLIB_hw`) is attached the first time a
`<con>` uses it, with no `xdb_lib`. `CON.sqlite` is the exception: it needs
`xdb_lib="AyPRO_sqlite"` on the root document. **A creator that is not found stops the rest of
the document's element list** (measured: `function 'CON.sqlite' not found`, and the next
`<con>` in the file was never configured), so a misspelt name costs more than its own line.

## Fields every connection reads

On the `<con>`. Those marked *per device* may also be written on a `<dev>` of a connection
with `con_ses` > 0, for that device's own session; a `<dev>` that leaves one out takes the
`<con>`'s.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `con_mod` | — | | `SERVER` / `LISTEN` / `1`, `CLIENT` / `CONNECT` / `2`, `SRVCLI` / `3` |
| `con_host` | | text | where to dial or listen. At most 255 characters (a SQL connection string included); `#CN_X` = take over another listener's sessions ([#link](#link)) |
| `con_port` | | text | the port (a COM port, a path for `#link`). At most 63 characters |
| `con_ses` | 0 | count | sessions. **A TCP listener needs it above 0**; when it is full a new peer is refused (`Session list is full`). On a client, `con_ses` > 0 gives every `<dev>` its own session. On a SQL connection, the number of database links. Read once at start |
| `con_tmo` | 0 = 1 s | s | how long a dial may take (*per device*) |
| `con_rct` | 0 = at once | s | pause before dialling again after a failure; also the longest pause of a device that stopped answering (10 s when 0) (*per device*) |
| `con_comdly` | 0 | s | pause between connecting and the first exchange (*per device*) |
| `con_tmomax` | 3 | count | request timeouts in a row after which a dialled TCP / TLS / WebSocket session is closed and dialled again; `-1` = never (*per device*) |
| `con_keeptmo` | 0 = off | s | keep-alive period (*per device*; not applied while running: disable, write, enable) |
| `con_idletmo` | 0 = off | s | a silent session is closed. A client session closed this way is *parked*: a poll or a write wakes it. On a listener, `con_keeptmo` > 0 with no `con_idletmo` makes it 3 × `con_keeptmo` (*per device*) |
| `con_rcvlen` | 0 | bytes | a client reads what the far end sends unasked only with this > 0 **and** `con_way="FULL"`. On a listener the size of one read (1500 without it) (*per device*) |
| `con_rcvdly` | 0 | ms | pause between those reads (*per device*) |
| `con_way` | set by the protocol | | `HALF` / `1` or `FULL` / `2`. Modbus and SNMP make it `HALF`, HTTP and the bridge `FULL`, the others leave it |
| `con_clr` | 0 | | `1` = empty the input before a request and after an error, `2` = before every send (serial lines) |
| `con_acl` | none | | who may connect: `"10.40.1.*, 127.0.0.1"`, `*` and `?`, matched against the peer's address text. No field = no filtering |
| `con_role` | 0 | 0..9 | the role a session arriving here starts with (Guest 0 … Admin 7, 8 Document, 9 System) |
| `con_auth` | | id | an `<auth>` element that logs the peers in (telnet, MQTT, HTTP) — [AUTH](06_Sessions_and_Protocol_Scripts.md) |
| `con_addr_max` | none | count | sessions one peer address may hold at once |
| `ses_per` | 0.1 | s | how often the connection visits its sessions (0.01 … 10) |
| `thr_wrk` | 0 | count | worker threads for the sessions; worker *k* always serves the same sessions |
| `thr_per` | 100 | ms | the connection thread's step (10 … 10000) |
| `thr_rate` | 100 | % | share of a step the queue may use (10 … 200) |
| `que_max` | 65000 | count | the connection thread's queue limit (100 … 500000) |
| `xdb_log` | | 0..7 | traffic (`M-Q[..]`, `M-R[..]`) is written at DEBUG. Measured on a Modbus master with `con_ses="1"`: it appeared only when the **document**, the `<dev>` **and** the `<bi>` all said `7`; the document and the `<con>` at `7`, with the `<dev>` and `<bi>` saying nothing, wrote no traffic |

A `<con>` is a thread of its own: the `<dev>`, `<bi>` and `<io>` elements that point at it
are polled on it unless they name another one with `evt_thr`. Its `sta` is switched like any
element's: `0x0303` on, `0x0000` or `0x0100` off. Its health (queue, latency, sessions not
served) shows in the alarm bits of `sta`, so test `(sta & 0x0003) == 3`, never `sta == 0x0303`.

**Licence.** Every `<con>` takes one of the 8 connection slots of the FREE edition, in document
order, and every `<dev>` polled or written takes one of 8 device slots at its first poll
([Licensing](../04_Licensing.md)).

## Fields every protocol reads

On the `<con>` (the connection's default) and, those marked *per device*, on a `<dev>`:

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `pro_role` | `MASTER` | | `MASTER` / `HOST` / `0` or `SLAVE` / `DEVICE` / `1` |
| `pro_tmo` | 0 | s | how long a request waits for its answer (*per device*). **Write it**: absent, a master does not wait at all (measured on Modbus: every poll `ERR_RECEIVE_TIMEOUT`, then `bad answer` when the late reply is read by the next poll) |
| `pro_try` | 0 | count | *re*tries of a failed poll: `0` = one attempt, `3` = up to four. Retried only on timeout, checksum or a wrong answer, never on a lost link (*per device*) |
| `pro_faildly` | 0 | s | spacing of those retries; a queue delay, any length (*per device*) |
| `pro_senddly` | 0 | s | pause before writing, inside one exchange, at most 1 s — the way to pace a shared RS-485 line (*per device*) |
| `pro_readdly` | 0 | s | pause before reading, at most 1 s (*per device*) |
| `pro_refreshdly` | 0 | s | after a write, read the device back this much later instead of at the next poll (*per device*) |
| `pro_onparse` | | script | read what arrived in script instead of the built-in parser — [PRO.raw](#proraw) |

On the elements below the `<con>`:

| Element | Field | Meaning |
|---|---|---|
| `<dev>` | `pro_con` | the `id` of the `<con>` it talks through. A name no `<con>` has is one `ERROR` at the document's start |
| | `pro_adr` | the device's address: Modbus unit, MQTT topic level, OPC UA endpoint URL, I²C address, SPI chip select |
| | `con_host`, `con_port` | this device's own endpoint on a client with `con_ses` > 0 |
| | `pro_slave_con`, `pro_slave_adr` | a device a SLAVE answers *for* (Modbus): the listening `<con>` and the unit id |
| | `pro_pol_snd` / `_rcv` / `_dur`, `pro_out_snd` / `_rcv` / `_dur` | requests sent, answers received, last time (ms) — written by the engine; declare them to see them |
| `<bi>` | `pro_fni` | the read function (Modbus `3`, OPC UA `READ`, SQL text, GPIO `in` …) |
| | `pro_fno` | the write function, taken by an `<io>` that has none |
| | `pro_adr`, `pro_ado` | start of the block; `pro_ado` = a different start for writes |
| | `pro_len` | how many **elements** the block holds, in the unit of `pro_typ` (`0xD412` = 16-bit words, `0xD411` = bytes); 0 = 1 |
| | `pro`, `pro_typ` | the raw block. `pro_fnc="[PRO.inp]"` hands it to the points |
| | `evt_fnc="[PRO.pol]"` + `evt_per` | the poll's timer — [PRO.pol](05_Alarms_Conditions_and_Protocol_Chains.md#propol) |
| `<io>` | `pro_adr` | position in the block, `element.bit` in the block's unit (`2.1`); a whole address where there is no block (OID tail, NodeId, topic rest) |
| | `pro_fno` | write function; `pro_fnc="[PRO.out,VAL.put]"` sends what is written to `pro` |
| | `pro_swp` | byte order: `1` swap bytes, `2` swap words, `4` swap 32-bit halves, added together |
| | `pro_str` | a text's layout in the block (`0x11` = a byte for the maximum, a byte for the length, then the text) |
| | `xdb_tim` | declare it and it holds when the value last came from the field |

A write to `pro` is sent by [PRO.out](05_Alarms_Conditions_and_Protocol_Chains.md#proout) and
**not stored**: `pro` read right after the write still shows the old value, and the device's
answer arrives at the next poll (measured: Modbus `M1.pro` written 77, read back 5 at once, 77
one poll later). A point nothing reads back uses
[PRO.outc](05_Alarms_Conditions_and_Protocol_Chains.md#prooutc).

---

## Transports

### CON.tcp

A TCP socket, client or listener. Every TCP protocol sits on it: Modbus TCP, MQTT, HTTP,
telnet, OPC UA, PRO.raw.

| `con_mod` | `con_host` / `con_port` |
|---|---|
| `CLIENT` | the peer to dial; on a client with `con_ses` > 0 each `<dev>` may carry its own |
| `SERVER` | the address and port to listen on (`127.0.0.1` = this machine only, `0.0.0.0` = every interface) |

```xml
<con id="CN_TS" xdb_fnc="[CON.tcp,PRO.raw]" con_host="127.0.0.1" con_port="47804" con_mod="SERVER"
     con_ses="2" con_rcvlen="512" pro_role="SLAVE" pro_tmo="5" pro_onparse="main.srv_parse(exc);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* a peer that sends `hello raw\n` gets the script's `echo:hello raw\n` back. A third
peer on a `con_ses="2"` listener is refused at once with `add_session: Session list is full`;
a slot comes free only once the engine has noticed its peer left, so leave room.
Examples: [PRJEDU_modbus](../../examples/protocols/PRJEDU_modbus/),
[PRJPER_adsb](../../examples/hobby/PRJPER_adsb/).

### CON.udp

Datagrams. A `SERVER` binds `con_host` / `con_port` and answers the sender of each datagram;
a `CLIENT` sends to `con_host` / `con_port`. The fields are those of [CON.tcp](#contcp);
`con_rcvlen` is the largest datagram accepted.

```xml
<con id="CN_UC" xdb_fnc="[CON.udp,PRO.raw]" con_host="127.0.0.1" con_port="47806" con_mod="CLIENT"
     con_way="FULL" con_rcvlen="512" con_ses="0" con_tmo="2" con_rct="2"
     pro_role="MASTER" pro_tmo="5" pro_onparse="main.cli_parse(exc);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* a client sending `udp 4` to a `[CON.udp,PRO.raw]` server got `echo:udp 4` back
into its `pro_onparse`. A UDP listener has no sessions of its own; keep a small `con_ses`
anyway. Examples: [PRJEDU_snmp](../../examples/protocols/PRJEDU_snmp/) (both ends),
[PRJPER_tello](../../examples/hobby/PRJPER_tello/).

### CON.tls

TCP with TLS from the first byte. The same fields as [CON.tcp](#contcp), and:

| Field | Default | Meaning |
|---|---|---|
| `con_ssl_cert`, `con_ssl_key` | | PEM files; a listener needs both. `%DB%`, `%PRJ%` are expanded |
| `con_ssl_pwd` | | the key's passphrase |
| `con_ssl_cacert` | | a CA file to verify the peer against |
| `con_ssl_verify` | client: verify, listener: do not ask | `0` = a client does not check the server's certificate (a WARN line says so); on a listener `1` asks the client for one, `3` refuses a client without one |

TLS 1.2 is the oldest version accepted. A client checks the server against the system's trust
store unless `con_ssl_cacert` or `con_ssl_verify="0"` says otherwise.

```xml
<con id="CN_TLS" xdb_fnc="[CON.tls,PRO.http]" con_host="127.0.0.1" con_port="47815" con_mod="SERVER"
     con_ses="4" con_rcvlen="8192" con_idletmo="60" pro_role="SLAVE" pro_tmo="5"
     pro_http_root="%PRJ%/www" con_ssl_cert="%DB%/cert/demo_cert.pem" con_ssl_key="%DB%/cert/demo_key.pem"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* `https://127.0.0.1:47815/index.html` answered 200 over TLS 1.3. A plain
[CON.tcp](#contcp) client session can also change to TLS in the middle of a conversation
(STARTTLS) — that is what [PRO.smtp](#prosmtp) and [PRO.ftp](#proftp) do.
Examples: [PRJEDU_web](../../examples/web/PRJEDU_web/) (port 8443),
[PRJEDU_telnet](../../examples/web/PRJEDU_telnet/).

### CON.ser

A serial port (RS-232, RS-485). Needs a port on the machine: stated from the source, not
measured here.

| Field | Default | Meaning |
|---|---|---|
| `con_port` | | `COM1`; on Linux `ttyUSB0` (made `/dev/ttyUSB0`) or a full path |
| `con_spd` | 0 | baud rate. **Write it** |
| `con_par` | **`E`** | `N`, `E`, `O`, `M`. Absent or misspelt reads as even parity |
| `con_bits` | 8 | `7` or `8` |
| `con_sbit` | 1 | `1`, `1.5`, `2` |
| `con_flow` | `NONE` | `XON/XOFF`, `DTR/DSR`, `RTS/CTS` |
| `con_sint` | 1000 | ms of silence between characters that ends a read; the engine never takes less than 4 characters' time at the baud rate |

```xml
<con id="CN_485" xdb_fnc="[CON.ser,PRO.modbus]" con_port="COM3" con_spd="19200" con_par="N" con_sbit="1"
     con_bits="8" con_sint="10" con_mod="CLIENT" con_ses="0" con_clr="1" con_rct="5"
     pro_role="MASTER" pro_mod="RTU" pro_tmo="0.5" pro_try="1" pro_senddly="0.01"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

On a shared line keep `con_ses="0"` (one conversation at a time), `con_clr` at 1 or 2 so a
late answer to a previous request is dropped, and pace the line with `pro_senddly`.

### CON.ws

A WebSocket, which is what a browser can open. On a listener it is almost always mounted on an
HTTP listener with [#link](#link); as a client it dials a WebSocket server.

| Field | Default | Meaning |
|---|---|---|
| `con_ws_path` | `/mqtt` | client only: the path asked for in the handshake |
| `con_ws_origin` | | listener: browser origins allowed besides this host and localhost, separated by `,` `;` or spaces, `*` = any; a host alone matches any scheme and port. Another origin is refused with 403 |
| `con_ws_max` | 16 MiB | bytes of one message; above it the connection is closed (1009) |

```xml
<!-- CN_WEB: a [CON.tcp,PRO.http] listener on 127.0.0.1:47808 -->
<con id="CN_WSB" xdb_fnc="[CON.ws,PRO.mqtt]" con_host="#CN_WEB" con_port="/mqtt" con_mod="SERVER"
     con_ses="4" con_keeptmo="120" con_idletmo="-1" pro_role="SLAVE" pro_tmo="5"
     pro_cid="S01_WSB" pro_pfx="+/+" pro_getsfx="" pro_setsfx="set"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<con id="CN_WSC" xdb_fnc="[CON.ws,PRO.mqtt]" con_host="127.0.0.1" con_port="47808" con_mod="CLIENT"
     con_ses="0" con_tmo="2" con_rct="2" pro_role="MASTER" pro_tmo="5" pro_cid="S01_WSC" pro_pfx="LAB"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* the client, with no `con_ws_path`, reached the broker mounted on `/mqtt` of the
HTTP listener on 47808 and received the document's values. Examples:
[PRJEDU_web](../../examples/web/PRJEDU_web/), [PRJEDU_rep](../../examples/cluster/PRJEDU_rep/).

### CON.wss

[CON.ws](#conws) over TLS: the fields of both [CON.ws](#conws) and [CON.tls](#contls). A
`CON.wss` mounted on a `CON.tls` listener with `#link` needs no certificate of its own.
Example: [PRJEDU_web](../../examples/web/PRJEDU_web/) (`CN_LIVES`).

### CON.sql

A database, named by a connection string in `con_host`. `CON.odbc` is the same class under its
older name (measured: `[CON.odbc,PRO.odbc]` works). The driver is chosen by the string:
`DRIVER=SQLite3i;Database=<file>;` goes to the built-in SQLite plug-in, anything else to ODBC
(`AyPRO_odbc`, both beside the engine).

| Field | Default | Meaning |
|---|---|---|
| `con_host` | | the connection string, at most 255 characters. **Path macros are not expanded in it** (measured: `Database=%PRJ%/log/t.db` = `unable to open database file`); write the path out, or use [CON.sqlite](#consqlite) |
| `con_ses` | 1 | database links; each opens when a borrower first needs one and closes by its own `con_idletmo`. `con_pool` is the old name and wins when written |
| `con_keeptmo` | 0 | s between liveness checks of an idle link |
| `con_dtm` | 0 | `1` = date and time columns come back as times, not text |
| `con_dia` | the driver's | the SQL dialect the engine writes in: `mssql`, `pgsql`, `sqlite`, `mysql` or a `<sqldia>` id |
| `pro_tmo` | | s a borrower waits for a free link |

A `<dev pro_con>` under it is a database of its own: its `con_host` names that database and it
gets its own links. The connection is what [SQL.attach](07_SQL_History_Files_and_Cluster.md#sqlattach),
[SQL.qry](07_SQL_History_Files_and_Cluster.md#sqlqry), a `<his>` record sink and a SQL mirror
list use; [PRO.sql](#prosql) is the protocol half.

```xml
<con id="CN_SQL" xdb_fnc="[CON.sql,PRO.sql]" con_host="DRIVER={ODBC Driver 17 for SQL Server};Server=.\SQLEXPRESS;Database=plant;Trusted_Connection=yes;"
     con_mod="CLIENT" con_ses="2" con_rct="5" pro_role="MASTER" pro_tmo="10"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

The `<con>`'s own `sta` stays `0x0302`: its links open on demand. A database that cannot be
opened is one `PANIC` line per attempt, at every poll. Example:
[PRJEDU_odbc](../../examples/data/PRJEDU_odbc/).

### CON.sqlite

The same SQL connection, bound to the SQLite plug-in, with `con_host` the database **file**
(path macros expanded; the file is made at the first connect). Needs `xdb_lib="AyPRO_sqlite"`
on the root document — without it the name is not found and the rest of the document's
element list is not run (measured).

```xml
<!-- root: <xdb id="XDB" xdb_lib="AyPRO_sqlite" ...> -->
<con id="CN_LITE" xdb_fnc="[CON.sqlite,PRO.sql]" con_host="%PRJ%/log/lite.db"
     con_mod="CLIENT" con_ses="1" pro_role="MASTER" pro_tmo="5"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* `SELECT 7 * 6 AS x` over it answered `42`, and `lite.db` appeared under `%PRJ%/log`.
Examples: [PRJEDU_sqlite](../../examples/data/PRJEDU_sqlite/),
[PRJEDU_records](../../examples/data/PRJEDU_records/),
[PRJEDU_mirror](../../examples/data/PRJEDU_mirror/).

### CON.ssh

An SSH client channel used as a byte pipe, for [PRO.sftp](#prosftp). Module `AyLIB_net`.
Needs an SSH server: stated from the source, not measured here.

| Field (on the `<dev>` first, then the `<con>`) | Default | Meaning |
|---|---|---|
| `con_port` | | usually `22` |
| `pro_usr`, `pro_pwd` | | the account; `pro_pwd` also answers keyboard-interactive |
| `con_ssh_hostkey` | **none = refused** | the server key's fingerprint, `SHA256:<base64>` as `ssh-keygen -lf` prints it. Absent, the connection is refused and the log line shows the key the server presented; another key is refused; `any` = not checked, a WARN at every connect |
| `con_ssh_key`, `con_ssh_keypwd` | | a private key file (OpenSSH or PEM; ed25519, ECDSA, RSA) instead of the password, and its passphrase |
| `con_ssh_sub` | `sftp` | the channel's subsystem |
| `con_ssh_trace` | 0 | `1` = the SSH library's own trace as WARN lines |

`con_tmo` bounds the connect, handshake and login steps; `pro_tmo` one read or write.
See [PRO.sftp](#prosftp) for a whole connection.

### CON.cam

A camera as a connection (module `AyLIB_vision`): it is dialled, lost and dialled again like any
other, and every frame is a blob value. Pair it with [PRO.cam](#procam) or [PRO.vision](#provision).

| `con_host` | |
|---|---|
| `usb:0`, `usb:<name>` | a USB camera |
| `http://host/path` | an MJPEG stream |
| `snap:http://host/path` | one JPEG request per frame |
| `rtsp://host[:554]/path` | RTSP over TCP, H.264 / H.265 (Windows only) |
| `udp:[addr:]port[?h265][&from=ip]` | raw H.264 / H.265 in datagrams (Windows only) |
| `file:<dir>[?fps=10&loop=1]` | a recording, one picture per file |
| `test:w=64&h=48&fps=5` | a test picture, nothing needed |
| `link:<id>` | another `<con>`'s frames through this connection's own `con_cam_*` |
| `none:` | no source (a camera's events only) |

| Field | Default | Live | Meaning |
|---|---|---|---|
| `con_cam_w`, `con_cam_h` | the device's | yes | delivered size; one of them keeps the aspect |
| `con_cam_fps` | 0 = all | yes | frames delivered a second |
| `con_cam_out` | `rgb` | yes | `rgb`, `gray`, `jpeg` |
| `con_cam_q` | 85 | yes | JPEG quality |
| `con_cam_crop` | none | yes | `x,y,w,h` before the resize |
| `con_cam_tmo` | 5 | yes | s without a frame = the camera is lost |
| `con_cam_otmo` | 10 | next connect | s opening may take |
| `con_cam_srcfmt` | automatic | next connect | `mjpg`, `yuyv`, `nv12` |
| `con_cam_api`, `con_cam_http` | | | `dahua`, `hik`, `onvif`: the camera's own interface for events, inputs, outputs, PTZ ([PRO.cam](#procam)) |
| `pro_usr`, `pro_pwd` | | | HTTP / RTSP login |
| `con_cam_info`, `con_cam_rate`, `con_cam_in`, `con_cam_err` | | written | what was opened, frames a second delivered and read, why it was lost |

With `con_ses` > 0 every `<dev pro_con>` is a camera of its own, and its `con_host` starting
with `/` is a path on the `<con>`'s camera (an NVR channel). See [PRO.vision](#provision) for a
measured example. **Licence:** without the `vision` feature 2 cameras with a real source are
counted; `link:` views are free ([Licensing](../04_Licensing.md)). Examples:
[PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/), [PRJPER_tello](../../examples/hobby/PRJPER_tello/).

### CON.gpio

A board's GPIO chip (module `AyLIB_hw`), for [PRO.gpio](#progpio). Real lines need Linux; on
every platform `sim:` gives lines in memory.

| Field | Default | Meaning |
|---|---|---|
| `con_host` | | `auto` (the chip with lines named `GPIOn`), `gpiochip0`, `/dev/gpiochip0`, `label:pinctrl-rp1`, or `sim:[jumper=17-27+18-23][,busy=4][,lines=54][,pwm=18:2]` |
| `con_ses` | | `0`: every `<dev>` shares the chip |
| `con_gpio_maxhz` | 100000 | edges a second a block may take before its interrupts go off for 1 s |
| `con_gpio_pwm` | | `18=pwmchip0/2;12=...`: a line's PWM channel where the module does not know the board |

See [PRO.gpio](#progpio) and [Pins and buses](../09_Pins_and_Buses.md).

### CON.i2c

An I²C bus (module `AyLIB_hw`). A `<dev>`'s `pro_adr` is the chip's address. `con_host` =
`/dev/i2c-1`, `1`, or `sim:mpu6050@0x68+pcf8574@0x27+reg@0x50` (chips in memory). Use
[PRO.reg](#proreg) for a chip that is a list of registers, [PRO.raw](#proraw) with
`pro_onpol` / `pro_onout` for a driver in script. Keep `con_ses="0"`.

### CON.spi

An SPI bus (module `AyLIB_hw`). A `<dev>`'s `pro_adr` is its chip select.

| Field | Default | Meaning |
|---|---|---|
| `con_host` | | `/dev/spidev0`, `0`, or `sim:loop@0+max7219@1+mfrc522@2+adc0834@3+shift@4` |
| `con_spi_hz` | 1000000 | clock, on the `<con>` or a `<dev>` |
| `con_spi_mode` | 0 | 0 … 3 |
| `con_spi_lsb` | 0 | `1` = least significant bit first |
| `con_spi_bits` | 8 | bits a word |

```xml
<con id="CN_SPI" xdb_fnc="[CON.spi,PRO.raw]" con_host="sim:loop@0" con_ses="0"
     con_mod="CLIENT" pro_role="MASTER" con_rct="5" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="LOOP" pro_con="CN_SPI" pro_adr="0" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_LOOP" xdb_fnc="[XDB.evt]" pro_onpol="main.spi_pol(evt, exc);" pro="" pro_typ="0xD418"
      pro_fnc="[PRO.inp]" evt="0" evt_per="0.5" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="L0" pro_adr="0" pro="0" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142"/>
    <io id="L1" pro_adr="1" pro="0" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

```js
function spi_pol(evt, exc)
{
    var r = exc.xfer(exc.unit, [0x12, 0x34]);   // the loop chip answers what went out
    if (r == null) return;
    exc.result([r[0], r[1]]);                    // L0 = 18, L1 = 52 (measured)
}
```

The bus calls (`exc.xfer`, `exc.wr`, `exc.rd`, `exc.wrrd`, `exc.result`) are in
[exc](06_Sessions_and_Protocol_Scripts.md); the chips and the board in
[Pins and buses](../09_Pins_and_Buses.md). Examples: [PRJHW_fan](../../examples/board/PRJHW_fan/),
[PRJHW_lock](../../examples/board/PRJHW_lock/), [PRJHW_reverse](../../examples/board/PRJHW_reverse/).

### CON.raw

A connection with no transport: it has a session and a state, and moves no bytes. With
[PRO.raw](#proraw) and `pro_onpol` it is a device written entirely in script — the poll runs,
the script makes the values, and they are distributed like a device's.

```xml
<con id="CN_RAW" xdb_fnc="[CON.raw,PRO.raw]" con_mod="CLIENT" pro_role="MASTER" con_ses="0"
     pro_onpol="main.raw_pol(evt, exc);" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D_RAW" pro_con="CN_RAW" pro_adr="7" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_RAW" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      evt="0" evt_typ="0x1204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="1"
      pro="" pro_typ="0xD418" pro_fnc="[PRO.inp]">
    <io id="RAW0" pro="0" pro_typ="0x1308" pro_adr="0" sta="0x0302" sta_typ="0x1142"/>
    <io id="RAW1" pro="0" pro_typ="0x1308" pro_adr="1" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

```js
function raw_pol(evt, exc)
{
    exc.result([exc.unit, 6]);    // RAW0 = 7 (the <dev>'s pro_adr), RAW1 = 6 (measured)
}
```

*Measured:* the device counted 4 polls sent and 4 received in 4 s and the block was RUNNING.

### CON.hid

A USB HID device (plug-in `AyPRO_hid`, Windows only, attached on first use).
`con_host="VID_04D8|PID_003F|IDX_0"` (hex; `IDX` optional, 0 = the first match),
`con_port` = the serial number, optional. Usually with [PRO.raw](#proraw). Needs a device:
stated from the source, not measured here.

### #link

A `<con>` whose `con_host` starts with `#` opens no port: it takes over the sessions that
arrive on the named listener and whose request path starts with its `con_port`. One port, one
certificate, several services.

```xml
<con id="CN_WEB" xdb_fnc="[CON.tcp,PRO.http]" con_host="127.0.0.1" con_port="47803" con_mod="SERVER"
     con_ses="4" con_rcvlen="8192" con_idletmo="60" pro_role="SLAVE" pro_tmo="5"
     pro_http_root="%PRJ%/www" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<con id="CN_API" xdb_fnc="[CON.tcp,PRO.rest]" con_host="#CN_WEB" con_port="/api" con_mod="SERVER"
     con_ses="4" con_rcvlen="8192" con_idletmo="60" pro_role="SLAVE" pro_tmo="5"
     pro_onreq="main.api(exc,msg);" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* `GET /api/x` reached `main.api` (its answer `{"uri":"/api/x",..}`), `GET /apix`
did not (404 from the file server), `GET /hello.txt` was a file. The taker inherits the
listener's TLS; its own `con_acl` is applied too. A WebSocket protocol mounted this way
(`[CON.ws,PRO.mqtt]`, `[CON.ws,PRO.rep]`) takes the upgrade request for its path.
Examples: [PRJEDU_web](../../examples/web/PRJEDU_web/), [PRJEDU_rep](../../examples/cluster/PRJEDU_rep/).

---

## Protocols

### PRO.raw

No protocol of its own: the engine moves the bytes, a script decides what they mean. Both
roles, over any transport.

| Field | On | Meaning |
|---|---|---|
| `pro_onparse` | `<con>` | `main.f(exc);` — called with what arrived; without it what arrives is written to the `<con>`'s `pro` |
| `pro_onaccept` | `<con>` | called once for every accepted connection before anything is read: a server that speaks first (a banner) |
| `pro_onclose` | `<con>` | called once when an accepted connection ends |
| `pro_onpol` | `<bi>`, `<dev>` or `<con>` (nearest wins) | a poll written in script: `exc.result([..])` gives the block's slots |
| `pro_onout` | `<io>`, `<dev>` or `<con>` | a write written in script; `evt.valn` is the value |

The hooks, their arguments and what their return value does are in
[Sessions and protocol scripts](06_Sessions_and_Protocol_Scripts.md). Three traps, measured:

* **A client reads what the server sends unasked only with `con_way="FULL"` and `con_rcvlen`
  above 0.** Without `con_way`, a `[CON.tcp,PRO.raw]` client sent `ping N\n` every second and
  its `pro_onparse` was never called for the answers; with `con_way="FULL"` it got
  `echo:ping N` each time.
* A TCP listener needs `con_ses` > 0.
* A script sends from outside a hook with `new CON_EXC(evt, ses)`, `exc.buf_send.append(..)`,
  `exc.send()` — `0` = sent ([PRJPER_adsb](../../examples/hobby/PRJPER_adsb/)'s `send_all`).

Examples: [PRJEDU_snmp](../../examples/protocols/PRJEDU_snmp/) (an SNMP agent in script),
[PRJPER_adsb](../../examples/hobby/PRJPER_adsb/), [PRJEDU_net](../../examples/data/PRJEDU_net/)
(mail and file servers), [PRJHW_fan](../../examples/board/PRJHW_fan/) (chip drivers).

### PRO.sql

The protocol half of [CON.sql](#consql) / [CON.sqlite](#consqlite). `PRO.odbc` is the older
name of the same class. Most projects use the connection only through
[SQL.attach](07_SQL_History_Files_and_Cluster.md#sqlattach),
[SQL.qry](07_SQL_History_Files_and_Cluster.md#sqlqry) or a `<his>` element; a `<bi>` under a
`<dev pro_con>` can also poll a statement:

| Field | On | Meaning |
|---|---|---|
| `pro_fni` | `<bi>` | the SQL statement a poll runs |
| `pro_fno` | `<io>` | the SQL statement a write runs |
| `pro_onpol` | `<bi>` | `main.f(evt, val)` — `val` is the record set (`SQL.fetch`, `SQL.getdata(val, 1)` …; columns count from 1). Nothing is written to `pro` by itself |
| `pro_onout` | `<io>` | the same after a write |

```xml
<dev id="DBL" pro_con="CN_LITE" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="QL" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      evt="0" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="1"
      pro="" pro_typ="0x0401" pro_fni="SELECT 7 * 6 AS x" pro_onpol="main.on_q(evt, val)"/>
</dev>
```

```js
function on_q(evt, val)
{
    SQL.fetch(val);
    evt.Log(4, "x=" + SQL.getdata(val, 1));     // x=42, a number (measured)
    return 0;
}
```

The poll needs `pro_role="MASTER"`. Its `pro_adr` is meant to give the
statement's `?` parameters as a script expression; on SQLite that measured broken (every poll
logged `column index out of range` and the parameters came back empty), so put the values in the
text or use [SQL.qry](07_SQL_History_Files_and_Cluster.md#sqlqry).

### PRO.modbus

Modbus TCP, RTU and ASCII. MASTER polls devices; SLAVE answers masters in TCP and ASCII
framing — an RTU request to a slave is answered "not supported" by the source, so a slave on a
serial line is not available.

| Field | On | Default | Meaning |
|---|---|---|---|
| `pro_mod` | `<con>` | none | `TCP`, `RTU` or `ASC`. **Write it**: absent, every poll fails with `Error(ERR_COMMON_NULL)` (measured) |
| `pro_adr` | `<dev>` | | the unit id (master side) |
| `pro_slave_con`, `pro_slave_adr` | `<dev>` | | slave side: the listening `<con>` and the unit id answered |
| `pro_fni` | `<bi>` | | `1` coils, `2` discrete inputs, `3` holding registers, `4` input registers |
| `pro_fno` | `<bi>` / `<io>` | | `5` one coil, `6` one register, `15` coils, `16` registers, `22` mask write |
| `pro_adr`, `pro_len` | `<bi>` | | first register, count in the block's unit |
| `pro_adr` | `<io>` | | `element.bit` inside the block |

The help text also lists functions 20 and 21 (file records). A master refuses them as a
configuration error (from the source); a slave does not answer them (measured: no reply to
function 20).

```xml
<!-- the slave: answers unit 1, four holding registers from 0 -->
<con id="CN_MBS" xdb_fnc="[CON.tcp,PRO.modbus]" con_host="127.0.0.1" con_port="47801" con_mod="SERVER"
     pro_role="SLAVE" pro_mod="TCP" con_ses="8" thr_wrk="1" pro_tmo="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="PLC1" pro_slave_con="CN_MBS" pro_slave_adr="1" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="PLC_BLK" sta="0x0303" sta_typ="0x1142" pro_typ="0xD412" pro="" pro_adr="0" pro_len="4">
    <io id="R0" pro="1234" pro_typ="0x1102" pro_adr="0" sta="0x0303" sta_typ="0x1142"/>
    <io id="R1" pro="5" pro_typ="0x1102" pro_adr="1" sta="0x0303" sta_typ="0x1142"/>
  </bi>
</dev>

<!-- the master: polls them once a second, writes register 1 with function 6 -->
<con id="CN_MBM" xdb_fnc="[CON.tcp,PRO.modbus]" con_mod="CLIENT" pro_role="MASTER" pro_mod="TCP"
     con_ses="2" con_tmo="1" con_rct="2" pro_tmo="1" pro_try="0"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="TANK" pro_adr="1" pro_con="CN_MBM" con_host="127.0.0.1" con_port="47801"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="TANK_BLK" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      evt="0" evt_typ="0x1204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="1"
      pro_typ="0xD412" pro="" pro_fnc="[PRO.inp]" pro_adr="0" pro_len="4" pro_fni="3">
    <io id="M0" pro="0" pro_typ="0x1102" pro_adr="0" pro_fnc="[VAL.put]" val="0" val_typ="0x0102" sta="0x0302" sta_typ="0x1142"/>
    <io id="M1" pro="0" pro_typ="0x1102" pro_adr="1" pro_fno="6" pro_fnc="[PRO.out,VAL.put]" val="0" val_typ="0x0102" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

*Measured:* `M0` = 1234; writing `M1.pro = 77` set the slave's `R1` to 77 and `M1` read 77 one
poll later. The slave, asked from outside: function 3 answered `04 d2 00 4d 00 00 00 00`;
function 4 answered from the **same** block; function 1 answered the bits of register 0
(`d2 04`); function 6 to register 2 was echoed and stored. A request outside the block or for
a unit no `<dev>` answers got **no reply** (no exception frame); a TCP listener full of
sessions refused the next connection. Examples:
[PRJEDU_modbus](../../examples/protocols/PRJEDU_modbus/) (both ends),
[PRJEDU_plc](../../examples/labs/PRJEDU_plc/), [PRJEDU_oee](../../examples/labs/PRJEDU_oee/).

### PRO.http

The web listener: files, server pages (`.ayp`), a mount for blob values, logins. SLAVE only —
**the client half does not send**: a `[CON.tcp,PRO.http]` MASTER polling `GET /index.html`
connected, counted the request and failed every poll with `Error(ERR_CONNECT_0000)` (measured).
To call a web service from AyMON, write the request with [PRO.raw](#proraw).

| Field | Default | Meaning |
|---|---|---|
| `pro_http_root` | | the directory files are served from (`%PRJ%/www`) |
| `pro_http_index` | `index.html` | the file for `/` |
| `pro_http_list` | 0 | `1` = list a directory |
| `pro_http_max` | 16 MiB | bytes of a request body; above it 413 before the body is read |
| `pro_http_hdr` | | extra answer headers, `Name: value` lines separated by a vertical bar |
| `pro_onreq` | | `main.f(exc,msg);` — called for a request **with a body** (a POST); a GET or HEAD is always a file |
| `pro_onreq_ses` | 0 | `1` = `pro_onreq` runs with the visitor's role instead of the connection's (with `con_auth` the visitor's is the default, `0` turns it off) |
| `pro_blob` | | a path (`/blob`) under which blob values are served, `?stream=1` as MJPEG |
| `con_auth` | | an `<auth>`: `/auth/login` … and a role per request |
| `pro_http_auth`, `pro_http_auth_pfx`, `pro_http_pub`, `pro_http_cookie`, `pro_http_csrf`, `pro_http_rate` | | the login's rules — [AUTH](06_Sessions_and_Protocol_Scripts.md) and [Access and safety](../06_Access_and_Safety.md) |

```xml
<con id="CN_WEB" xdb_fnc="[CON.tcp,PRO.http]" con_host="127.0.0.1" con_port="47803" con_mod="SERVER"
     con_ses="4" con_rcvlen="8192" con_idletmo="60" pro_role="SLAVE" pro_tmo="5"
     pro_http_root="%PRJ%/www" pro_onreq="main.webreq(exc,msg);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* `GET /hello.txt` = the file (200), `GET /nope.txt` = 404 with one `ALERT` line,
`POST /x` = the script's answer. A file ending in `.ayp` is run as a server page
([Scripting](../03_Scripting.md)). Examples: [PRJEDU_web](../../examples/web/PRJEDU_web/),
[PRJEDU_pages](../../examples/web/PRJEDU_pages/).

### PRO.rest

A web listener that hands **every** request, GET included, to `pro_onreq="main.f(exc,msg);"`;
without `pro_onreq` it serves files like [PRO.http](#prohttp). Usually mounted on a path with
[#link](#link). The script writes the whole answer into `exc.buf_send` and calls `exc.send()`
([req and res](06_Sessions_and_Protocol_Scripts.md)). Like PRO.http it does not work as a
client. *Measured* with the XML under [#link](#link). Example:
[PRJEDU_web](../../examples/web/PRJEDU_web/) (`/api`).

### PRO.soap

The same as [PRO.rest](#prorest) — every request to `pro_onreq(exc, msg)` — for a SOAP
endpoint; the scope `SOAP` builds and reads the envelopes
([Time, text and codecs](02_Time_Text_and_Codecs.md)). Server only. No example uses it.

### PRO.mcp

AyMON as an MCP server for AI assistants: HTTP + JSON-RPC 2.0, protocol version
`2025-03-26`. SLAVE, on its own port or mounted with [#link](#link). Only documents whose root
element carries `mcp_pub="1"` are visible.

| Field | Default | Meaning |
|---|---|---|
| `pro_mcp_key` | empty | the Bearer key a client must send. **Empty = only loopback clients are served** (any other address gets 401) |
| `pro_mcp_acc` | `ro` | `rw` opens the write tools |
| `pro_mcp_role` | none | the role the tools read (and write) as, 0 … 7, filtered by `xdb_acl`. Absent: reads are not filtered |
| `pro_mcp_usr` | | the name written in every write's log line and audit record |
| `pro_mcp_wmax` | 100 | most elements one write may touch |
| `pro_mcp_api` | `api` | scopes `api_call` may call, comma-separated |
| `pro_mcp_log` | none | 0 … 7: turns `read_logs` on, up to that level |
| `pro_mcp_tools` | | a script function that declares the project's own tools |
| `pro_mcp_onuser` | | a script function turning a per-user token into an identity |
| `pro_mcp_sqlcon`, `pro_mcp_alm`, `pro_mcp_evt`, `pro_mcp_audit` | | the history connection, the alarm list, the event list, the audit address |
| `pro_mcp_cors` | | browser origins allowed; a request with another `Origin` is 403 |

```xml
<!-- root of the published document: <xdb id="LAB/S01" mcp_pub="1" ...> -->
<con id="CN_MCP" xdb_fnc="[CON.tcp,PRO.mcp]" con_host="127.0.0.1" con_port="47811" con_mod="SERVER"
     con_ses="4" thr_wrk="1" con_rcvlen="8192" con_idletmo="120" pro_role="SLAVE" pro_tmo="5"
     pro_mcp_role="2" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

*Measured:* `initialize` answered `serverInfo` `AyMON 4.4.2.702`; `tools/list` gave 12 tools
(`system_info browse find_points read_points get_alarms get_events query_history tree
get_summary get_metrics get_connections aggregate`; `read_logs` joins them with `pro_mcp_log`,
`set_value add_value xor_value msk_value ask_value api_call ack_alarm` with `pro_mcp_acc="rw"`);
`read_points` for `V1` returned its `val` and `sta`; a `set_value` call on the `ro` connection
answered `Method not found`. **Licence:** MCP is not in FREE but works on a local connection
([Licensing](../04_Licensing.md)). Examples: [PRJEDU_mcp](../../examples/ai-vision/PRJEDU_mcp/),
[PRJEDU_robot_mcp](../../examples/ai-vision/PRJEDU_robot_mcp/).

### PRO.telnet

A maintenance shell over [CON.tcp](#contcp) or [CON.tls](#contls). SLAVE. Every line a user
types runs as script in the current document, with the session's own role.

| Field | Default | Meaning |
|---|---|---|
| `con_auth` | | an `<auth>` element that logs users in; then `pro_onlogin` is ignored |
| `pro_onlogin` | | `main.f(ses, usr, pwd)` without `con_auth`: return `0` to accept and set `ses.user_role`. **One of the two is required, or every connection is refused** |
| `pro_oncmd` | | `main.f(ses, cmd)`: return a value to answer with it, nothing to fall through to script |
| `pro_tel_doc` | the `<con>`'s | the document the shell starts in |
| `pro_tel_ban` | | the line shown before `login:` |
| `pro_tel_try` | 3 | failed logins before the session is closed |
| `pro_tel_echo` | 1 | the server echoes and edits the line; `0` = the client does |

```xml
<con id="CN_TEL" xdb_fnc="[CON.tcp,PRO.telnet]" con_host="127.0.0.1" con_port="47807" con_mod="SERVER"
     con_ses="2" con_rcvlen="4096" con_idletmo="600" pro_role="SLAVE" pro_tmo="5"
     pro_onlogin="main.tel_login(ses, usr, pwd)" pro_tel_ban="Plant shell"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

```js
function tel_login(ses, usr, pwd)
{
    if (usr == "eng" && pwd == "pw") { ses.user_role = 6; return 0; }
    return 1;
}
```

*Measured:* the banner, `login:`, `password:`, then `user 'eng', role 6, document 'LAB/S01'`;
`1+2` answered `3`; `who` showed role 6 and the peer; a wrong password answered `login failed`
and a `FAIL` line `login: 'eng' REFUSED (rc = 1)`. Built-in commands: `help`, `who`, `ver`,
`history`, `doc[=NAME]`, `log [level] [lines]`, `log on` / `log off`, `exit`. Telnet is in the
FREE edition. Example: [PRJEDU_telnet](../../examples/web/PRJEDU_telnet/).

### PRO.rfid

A UHF RFID reader (ISO 18000-6C) on a serial line. MASTER. Needs a reader: stated from the
source, not measured here. `pro_mod` defaults to `ISO18000-6C`; the `<dev>`'s `pro_adr` is the
reader's address; a `<bi pro_fni="1">` (Inventory) puts the answer, up to 16 bytes, into the
block's `pro` (a byte buffer, `pro_typ="0xD411"`). There is no write.

```xml
<con id="CN_RF" xdb_fnc="[CON.ser,PRO.rfid]" con_port="COM4" con_spd="57600" con_par="N" con_mod="CLIENT"
     con_ses="0" con_clr="1" pro_role="MASTER" pro_tmo="0.5" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

### PRO.bridge

Meant to move bytes between two connections: a listener with `pro_con="CN_X"` opens, for every
peer, a MASTER `<con>` named `CN_X_0`, `CN_X_1` … and passes what each side sends to the other.
**Not verified:** in a loopback test the listener opened its partner `CN_BRM_0` when a peer
connected (`bridge.open: Slave 'CN_BRS', Master 'CN_BRM_0'`), but no byte crossed in either
direction. No example uses it. To pass bytes between two connections, a [PRO.raw](#proraw)
pair with a few lines of script is the measured way.

### PRO.mqtt

MQTT 3.1, 3.1.1 and 5. As a **SERVER** it is a broker: SLAVE publishes the document's values
as `<document>/<id>/<attribute>` and applies what clients publish to
`<document>/<id>/<attribute>/set`. As a **CLIENT** MASTER it subscribes to a broker and
distributes what arrives to `<dev>` / `<bi>` / `<io>`, and publishes what is written to a point.

| Field | Default | Meaning |
|---|---|---|
| `pro_ver` | `3.1.1` | `3.1`, `3.1.1`, `5.0` (what a client asks for) |
| `pro_cid` | | client id |
| `pro_usr`, `pro_pwd` | | a client's login; on a broker `con_auth` or `pro_oncon` decides |
| `pro_pfx` | | topic prefix. A broker that publishes documents: `+/+`. A client: the first level(s) of its filters |
| `pro_nid` | | node id put in front of the topics (SLAVE) |
| `pro_getsfx`, `pro_setsfx`, `pro_addsfx`, `pro_xorsfx`, `pro_msksfx`, `pro_pubsfx` | | the command suffixes (`set` …) |
| `pro_subqos`, `pro_pubqos`, `pro_pubrtn` | 0 | QoS of subscriptions and publishes, retain flag |
| `pro_pubflt` | | a filter on what a SLAVE publishes by itself |
| `pro_retain`, `pro_retain_adr`, `pro_retain_atr`, `pro_retain_max` | off, —, all, 200 | publish the document's current values to a new subscriber (XPath of the elements is required) |
| `pro_willqos`, `pro_willrtn` | | a client's last will: when it disappears the broker publishes `0x0301` on its `<con>`'s `.../sta` topic |
| `pro_oncon`, `pro_onsub`, `pro_onunsub`, `pro_onconack` | | hooks — [Sessions and protocol scripts](06_Sessions_and_Protocol_Scripts.md) |
| `pro_outq`, `pro_outmax` | 1000, 4 MiB | messages and bytes waiting for one slow subscriber |
| `pro_mqtt_nolocal` | 0 | `1` = a client never gets back what it published |
| `pro_mqtt_pktmax` | 16 MiB | largest packet a client may send |
| `pro_mqtt_rcvmax`, `pro_mqtt_alias` | 1000, 10 | MQTT 5 Receive Maximum and Topic Alias Maximum |
| `pro_mqtt_retain_keep`, `pro_mqtt_retain_bytes` | 10000, 16 MiB | the broker's retained-message store; 0 = none |
| `pro_mqtt_share_qos`, `pro_mqtt_share_pol` | 1, `idle` | shared subscriptions (`$share/..`): highest QoS, and `idle`, `rr` or `topic` |
| `pro_mqtt_share` | | on a client: every subscription goes out as `$share/<name>/<filter>` |
| `pro_mqtt_ses_exp`, `_keep`, `_bytes`, `_qos0` | 7200 s, 10000, 64 MiB, 0 | persistent sessions on a broker |

On a client the filter of a `<bi>` is `pro_pfx/<dev pro_adr>/<bi pro_adr>`, and an `<io>`'s
`pro_adr` is the rest of the topic after the `<dev>`'s level. No timer is needed: a message
moves the point when it arrives.

```xml
<con id="CN_BRK" xdb_fnc="[CON.tcp,PRO.mqtt]" con_host="127.0.0.1" con_port="47802" con_mod="SERVER"
     con_ses="4" con_keeptmo="60" con_idletmo="0" pro_role="SLAVE" pro_tmo="5"
     pro_cid="S01_BRK" pro_pfx="+/+" pro_getsfx="" pro_setsfx="set"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<con id="CN_MQC" xdb_fnc="[CON.tcp,PRO.mqtt]" con_host="127.0.0.1" con_port="47802" con_mod="CLIENT"
     con_ses="0" con_tmo="2" con_rct="2" con_keeptmo="60" pro_role="MASTER" pro_tmo="5"
     pro_cid="S01_MQC" pro_pfx="LAB" pro_getsfx="" pro_setsfx="set"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="FIELD" pro_con="CN_MQC" pro_adr="S01" sta="0x0302" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="SUB1" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      pro="" pro_typ="0xD402" pro_fnc="[]" pro_adr="+/val">
    <io id="MQV" pro="0" pro_typ="0x1104" pro_adr="V1/val" pro_fnc="[VAL.put]"
        val="0" val_typ="0x0104" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

*Measured:* the broker in document `LAB/S01` published `V1`'s value as `LAB/S01/V1/val`; the
client's filter `LAB/S01/+/val` brought it to `MQV` (60 when `V1` was 60). A point with
`pro_fnc="[PRO.out,VAL.put]"` publishes what is written to it on `<topic>/set`. Examples:
[PRJEDU_mqtt](../../examples/protocols/PRJEDU_mqtt/) (broker and client),
[PRJEDU_web](../../examples/web/PRJEDU_web/) (`[CON.ws,PRO.mqtt]` for the browser).

### PRO.clt

The election of a cluster: which node is master of the cluster documents. Built on PRO.mqtt,
carries no data. Write `[CLT.cfg,CON.ws,PRO.clt]` — [CLT.cfg](07_SQL_History_Files_and_Cluster.md#cltcfg)
**before** the transport, because it writes `con_mod`, `pro_role`, `con_ses`, `con_host` and
`con_port` from the root's `tid`: do not set them by hand. One row per node, the same rows on
every node.

| Field | Default | Meaning |
|---|---|---|
| `pro_nid` | the row id's last part | the node this row stands for (compared with `tid`) |
| `pro_clt_link`, `pro_clt_path` | | this node's listener (`#CN_EXT`) and path (`/clt`) |
| `pro_clt_host`, `pro_clt_port` | | where the other nodes dial this one |
| `pro_clt_id` | `APP` | the cluster's name |
| `pro_clt_pri` | digits of `tid` | smaller is preferred; read from the node's own row only |
| `pro_clt_hb`, `pro_clt_expiry`, `pro_clt_elec`, `pro_clt_init` | 5, 2, 3, 10 | heartbeat s, missed beats, election window s, wait at start s |
| `pro_clt_preempt`, `pro_clt_pdelay` | 0, 15 | whether a better node takes a working master's place, and after how long |
| `pro_clt_quorum` | 0 | nodes that must hear each other for a master |
| `pro_clt_doc` | | the documents this row's group drives |
| `pro_clt_cold` | 60 | s a group with durable documents waits for every node at a cold start |
| `pro_clt_cmd` (+ `pro_clt_cmd_fnc="[CLT.cmd]"`) | | `standdown` / `takeover` by hand |

The node writes `pro_clt_role`, `pro_clt_master` and `pro_clt_term` on its own row. The whole
story, with the traps, is [Two engines](../10_Two_Engines.md#the-election). **Licence:** the
cluster is not in FREE but works on local connections. Examples:
[PRJEDU_cluster](../../examples/cluster/PRJEDU_cluster/),
[PRJEDU_remote](../../examples/cluster/PRJEDU_remote/).

### PRO.rep

Replication: carries a document's changes to its copies on other engines. Built on PRO.mqtt.
Write `[REP.cfg,CON.ws,PRO.rep]` — [REP.cfg](07_SQL_History_Files_and_Cluster.md#repcfg)
before the transport, like `CLT.cfg`. Mounted on an existing listener: replication opens no
port of its own.

| Field | Default | Meaning |
|---|---|---|
| `pro_nid` | | the node this row stands for |
| `pro_rep_link`, `pro_rep_path` | | this node's listener (`#CN_EXT`) and path (`/rep`) |
| `pro_rep_host`, `pro_rep_port` | | where the peer dials |
| `pro_rep_doc` | | the documents carried, comma-separated; **required on a receiving end** |
| `pro_rep_id` | `*` | element id filter (`*`, `?`) |
| `pro_rep_atr` | `*` | attributes carried (`val,sta`) |
| `pro_rep_dir` | `out` | `out`, `in`, `both` (a field-to-centre link) |
| `pro_rep_axis`, `pro_rep_dial` | `horz`, `in` | a vertical link, and which end dials out |
| `pro_rep_max` | 65536 | bytes of one bulk answer; larger is not sent, and logged |
| `pro_rep_sta_msk` | `0xFFFF` | bits of an incoming `sta` that apply |
| `con_role` | | `8` (Document) on replication rows; `con_acl` the peer's address |

The direction is the document's (master sends, spare receives), not the connection's; the
receiving right is in the target `<doc>`'s `sta`. A blob is not replicated. See
[Two engines](../10_Two_Engines.md#replication). **Licence:** not in FREE, works on local
connections. Examples: [PRJEDU_rep](../../examples/cluster/PRJEDU_rep/),
[PRJEDU_cluster](../../examples/cluster/PRJEDU_cluster/).

### PRO.rpc

A remote call: a script reads, writes or calls a function in a document that lives on another
node. Built on PRO.mqtt, on a `<con>` of its own (not the replication one). The serving end is
SLAVE, the asking end MASTER.

| Field | Where | Default | Meaning |
|---|---|---|---|
| `con_role` | serves | 0 | the most a caller may be here; give it **7 or less** |
| `con_acl` | serves | | who may connect |
| `pro_rpc_thr` | serves | | a `<thr>` whose workers run the requests, so one slow call holds no other |
| `pro_tmo` | asks | | s a call waits for its answer |
| `pro_rpc_down` | asks | 10 | s calls fail at once after one that had no answer; 0 = off |

```xml
<con id="CN_RPCS" xdb_fnc="[CON.tcp,PRO.rpc]" con_host="127.0.0.1" con_port="47812" con_mod="SERVER"
     con_ses="4" con_role="3" con_acl="127.0.0.1" pro_role="SLAVE" pro_tmo="5"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<con id="CN_RPCC" xdb_fnc="[CON.tcp,PRO.rpc]" con_host="127.0.0.1" con_port="47812" con_mod="CLIENT"
     con_rct="1" pro_role="MASTER" pro_tmo="2" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

```js
evt.GetValue("doc('LAB/S01@CN_RPCC')/id('V1')/@val")   // 30, a number, read over the link (measured)
```

`doc('X@CN')` goes over that connection even when `X` is loaded here; `<doc id="X" rpc_con="CN">`
makes `doc('X')` go there with no change to the script. Make the call on a thread that may
wait. See [Two engines](../10_Two_Engines.md#a-document-on-another-node). **Licence:** not in
FREE, works on local connections. Example: [PRJEDU_remote](../../examples/cluster/PRJEDU_remote/).

### PRO.snmp

An SNMP manager, v1, v2c and v3, over [CON.udp](#conudp). MASTER only — to answer SNMP, write
an agent with [PRO.raw](#proraw) ([PRJEDU_snmp](../../examples/protocols/PRJEDU_snmp/) does).

| Field | On | Default | Meaning |
|---|---|---|---|
| `pro_ver` | `<con>` / `<dev>` | **`V1`** | `V1`, `V2C`, `V3` |
| `pro_getc`, `pro_setc` | `<con>` / `<dev>` | empty; `pro_setc` = `pro_getc` | v1 / v2c communities |
| `pro_usr`, `pro_auth`, `pro_pwd`, `pro_priv`, `pro_priv_key` | `<con>` / `<dev>` | | v3 user, `MD5` / `SHA` / `SHA256` …, its password, `DES` / `AES` / `AES256` …, its key |
| `pro_fni` | `<bi>` | | `GET`, `GETNEXT`, `GETBULK` |
| `pro_adr` | `<bi>` | | the base OID (`1.3.6.1.4.1.99999`) |
| `pro_adr` | `<io>` | | the rest of the OID (`2.1.0`) |
| `pro_vb` | `<bi>` | 24 | most varbinds per GET packet; halved by itself on `tooBig` |
| `pro_mr`, `pro_nr` | `<bi>` | 10, 0 | GETBULK max-repetitions and non-repeaters |
| `pro_fno` | `<io>` | | `SET`, with `pro_fnc="[PRO.out,VAL.put]"` |

Each `<dev>` may carry its own `con_host` / `con_port` and credentials with `con_ses` > 0.
Measured in its example (the manager and a script agent on one machine), not separately here.
Example: [PRJEDU_snmp](../../examples/protocols/PRJEDU_snmp/).

### PRO.opc

An OPC UA client over [CON.tcp](#contcp) (`opc.tcp`, UA Binary): read, write, subscriptions,
browse, method calls, signing and encryption. MASTER only. Needs an OPC UA server; measured in
its example against a Python server, not separately here.

| Field | On | Default | Meaning |
|---|---|---|---|
| `pro_sec` | `<con>` / `<dev>` | `None` | `None`, `Basic256Sha256`, `Aes128_Sha256_RsaOaep`, `Aes256_Sha256_RsaPss` |
| `pro_mod` | `<con>` / `<dev>` | `None` | `None`, `Sign`, `SignAndEncrypt` (must agree with `pro_sec`) |
| `pro_usr`, `pro_pwd` | `<con>` / `<dev>` | anonymous | user identity |
| `pro_cert`, `pro_key`, `pro_pwdk`, `pro_trust` | `<con>` | | client certificate, key, key password, the server certificate trusted |
| `pro_app_uri`, `pro_app_name` | `<con>` | `urn:AyMON:AyXDB`, `AyMON` | must match the certificate |
| `pro_buf` | `<con>` | 65536 | buffer sizes announced |
| `pro_tmo_pub` | `<con>` / `<dev>` | 30 | s a Publish may wait |
| `pro_adr` | `<dev>` | from `con_host` | the endpoint URL `opc.tcp://host:4840/path` |
| `pro_fni` | `<bi>` | | `READ` (a poll) or `PUBLISH` (a subscription pump) |
| `pro_mx` | `<bi>` | 50 | points read in one request |
| `pro_pub_int`, `pro_pub_keep`, `pro_pub_life`, `pro_pub_smp`, `pro_pub_queue` | `<bi>` | 500 ms, 10, keep × 3, −1, 1 | subscription settings |
| `pro_adr` | `<io>` | | the NodeId: `ns=2;s=Tag`, `i=2258`, `nsu=<uri>;s=Tag` |
| `pro_att`, `pro_rng` | `<io>` | 13, | attribute id, index range |
| `pro_fno`, `pro_dtyp` | `<io>` | | `WRITE` and the UA type to write (`Double`, `Int32` …) |
| `pro_tim` | `<io>` | `src` | `src` or `srv` timestamp into `xdb_tim` |

Every `<bi>` of one `<dev>` must run on the same thread; a subscription that must not hold the
polls up gets a `<con>` + `<dev>` of its own. The tools `OPC.browse`, `OPC.gen`, `OPC.call`
and `OPC.cert` are in [OPC](07_SQL_History_Files_and_Cluster.md#opc-opc-ua-tools). OPC UA is
in the FREE edition. Example: [PRJEDU_opcua](../../examples/protocols/PRJEDU_opcua/).

### PRO.smtp

Sending mail (module `AyLIB_net`). A message is the JSON text written to an
`<io pro_fno="send">`; the server's reply comes back into the same `pro` as protocol input.
MASTER over `[CON.tcp,PRO.smtp]` (STARTTLS) or `[CON.tls,PRO.smtp]` (port 465).

| Field (on the `<dev>` first, then the `<con>`) | Default | Meaning |
|---|---|---|
| `pro_smtp_tls` | `starttls` | a server without STARTTLS is **refused**; `none` = plain, said out loud |
| `pro_usr`, `pro_pwd` | | AUTH PLAIN / LOGIN; no `pro_usr` = no AUTH |
| `pro_smtp_from` | | default sender |
| `pro_smtp_helo` | | EHLO name |
| `pro_smtp_max` | 26214400 | largest message, bytes |
| `pro_smtp_dir` | `%PRJ%` | attachments must lie below it; `*` = anywhere |
| `con_ses` | | **at least 1** (`con_ses="0"` is refused at start); `con_idletmo` closes the link after a quiet spell |

The message: `{"id","to","cc","bcc","subject","body","html","att":[..],"from"}`. The reply:
`{"seq","id","code","ok","text"}` — `code` 250 = sent, 4xx / 5xx = the server's answer (final,
not repeated), 0 = no answer; `ok` = recipients accepted, so test `ok > 0`. Only "no answer, link
lost with the message on the wire" is repeated (`pro_try`), so a message may arrive twice. The
whole job, with a handler, is in [Connections and protocols](../05_Connections_and_Protocols.md#mail-and-files).
**Licence:** without the `net` feature, 20 operations a day ([Licensing](../04_Licensing.md)).
Example: [PRJEDU_net](../../examples/data/PRJEDU_net/) (against a mail server written in script).

### PRO.ftp

FTP and FTPS file transfer by jobs (module `AyLIB_net`), the same pattern as
[PRO.smtp](#prosmtp): a job is JSON written to an `<io>`, its reply comes back into the same
`pro`. `[CON.tcp,PRO.ftp]` (AUTH TLS) or `[CON.tls,PRO.ftp]` (port 990). Passive mode only.

| Field | Default | Meaning |
|---|---|---|
| `pro_ftp_tls` | `explicit` | a server without AUTH TLS is **refused**; `none` = plain |
| `pro_usr`, `pro_pwd` | anonymous | the account |
| `pro_ftp_dir` | | remote names are relative to it; a job cannot leave it |
| `pro_ftp_local` | `%PRJ%` | local files must lie below it; `*` = anywhere |
| `pro_ftp_tmp` | 0 | `1` = upload as `<name>.part`, renamed when complete |
| `pro_fno` | | the job's `cmd` when the JSON has none |

Jobs: `{"id","cmd":"put|get|list|stat|del|mkdir|rmdir|rename","src","dst","path","to","move","tmp"}`.
Reply: `{"seq","id","cmd","code","ok","text","bytes"}` + `list` / `size`, `mtime` / `moved`.
A long transfer belongs on a thread of its own (`pro_typ="0x2401"` + `evt_thr`).
**Licence:** `net`, as PRO.smtp. Example: [PRJEDU_net](../../examples/data/PRJEDU_net/).

### PRO.sftp

SFTP (version 3) over [CON.ssh](#conssh), module `AyLIB_net`. The jobs and the reply are
[PRO.ftp](#proftp)'s; the fields are `pro_sftp_dir`, `pro_sftp_local`, `pro_sftp_tmp` (the
`pro_ftp_` names are read too). The reply's `code` is the SFTP status (0 OK, 2 no such file,
3 permission denied, 4 failure, −1 no answer); decide by `ok`. A `rename` never replaces an
existing file. Needs an SSH server: stated from the source, not measured here.

```xml
<con id="CN_SFTP" xdb_fnc="[CON.ssh,PRO.sftp]" con_host="files.example.com" con_port="22" con_mod="CLIENT"
     con_ses="1" con_idletmo="30" pro_role="MASTER" pro_tmo="10" pro_usr="plant" pro_pwd="..."
     con_ssh_hostkey="SHA256:..." pro_sftp_dir="/in" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D_SFTP" pro_con="CN_SFTP" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <io id="UP" pro="" pro_typ="0x1401" pro_fno="put" pro_fnc="[PRO.out,main.up_done]" sta="0x0302" sta_typ="0x1142"/>
</dev>
```

**Licence:** `net`, as PRO.smtp.

### PRO.cam

The protocol half of [CON.cam](#concam) (module `AyLIB_vision`), only over it.

| Element | Field | Meaning |
|---|---|---|
| `<bi>` | `pro_fni="frm"` | the stream: every frame into the block's `frm` (declare `frm_typ="0x750E"`); its poll is the watchdog — no frame for `con_cam_tmo` takes the block WAITING |
| `<bi>` | `pro_fni="evt"` | with `con_cam_api`: the camera's events; `<io pro_adr="VideoMotion">` = 1 / 0 |
| `<bi>` | `pro_fni="din"` | the camera's alarm inputs, `<io pro_adr="1">` |
| `<io>` | `pro_fno="dout"` | an alarm output, write 1 / 0 |
| `<io>` | `pro_fno="ptz"` | `{"cmd":"up","speed":4,"ms":500}`, `{"cmd":"preset","n":2}`, `"stop"` |
| `<io>` | `pro_fno="snap"` | a snapshot, out as a frame |

The frames are blobs; [CAM and IMG](08_Engine_Modules.md) work on them in script. Examples:
[PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/), [PRJPER_tello](../../examples/hobby/PRJPER_tello/).

### PRO.vision

[PRO.cam](#procam) plus analyses run on every frame, with no script: each `<bi>` is one
analysis on the frame's grey plane, its result a buffer of slots (`pro_typ="0xD418"`,
`pro_fnc="[PRO.inp]"`) handed to `<io pro_adr="n">`.

| `pro_fni` | Slots | Fields |
|---|---|---|
| `roi` | 0 mean, 1 min, 2 max, 3 std, 4 pixels | |
| `count` | 0 count, 1 fraction, 2 cx, 3 cy (of pixels in `lo`..`hi`) | `pro_vision_lo` 128, `pro_vision_hi` 255 |
| `grid` | 0 cells in range, 1 max, 2 at, 3 min, 4 at, 5.. cell values | `pro_vision_grid="8x8"`, `pro_vision_stat` `mean`/`std`/`min`/`max` |
| `diff` | 0 mean change, 1 count ≥ lo, 2 fraction, 3 max | `lo` 25, `pro_vision_ref` `prev` / `keep` |
| `line` | 0 mean, 1 min, 2 max, 3 at min, 4 at max, 5 first ≥ lo, 6 last ≥ lo, 7.. samples | `pro_vision_n` |
| `edge` | 0 mean Sobel, 1 count ≥ lo, 2 fraction, 3 max | `lo` 64 |
| `match` | 0 x, 1 y, 2 score, 3 dx, 4 dy | `pro_vision_area="x,y,w,h"` |

`pro_adr` on the `<bi>` = the region `x,y,w,h` (empty = the whole frame; a `line` takes
`x0,y0,x1,y1`). `pro_vision_ms` = at most one result per that many ms; `pro_vision_ch` =
`luma`, `r`, `g`, `b` on colour frames. `<io pro_fno="ref">` = take the next frame as the
reference.

```xml
<con id="CN_CAM" xdb_fnc="[CON.cam,PRO.vision]" con_host="test:w=64&amp;h=48&amp;fps=5" con_cam_out="gray"
     con_mod="CLIENT" pro_role="MASTER" con_ses="0" con_rct="2" con_tmo="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="CAM1" pro_con="CN_CAM" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_ROI" xdb_fnc="[XDB.evt]" pro_fni="roi" pro_adr="" pro="" pro_typ="0xD418" pro_fnc="[PRO.inp]"
      evt="0" evt_per="0.5" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="MEAN" pro_adr="0" pro="0" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142"/>
    <io id="NPX" pro_adr="4" pro="0" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

*Measured:* `MEAN` = 131.27, `NPX` = 3072 (64 × 48), the block RUNNING. **Licence:** `vision`,
as [CON.cam](#concam). Example: [PRJEDU_vision](../../examples/ai-vision/PRJEDU_vision/).

### PRO.gpio

What a pin does (module `AyLIB_hw`), only over [CON.gpio](#congpio). A line in `pro_adr` is
its number (BCM on a Pi) or name (`GPIO17`).

| Where | `pro_fni` / `pro_fno` | What |
|---|---|---|
| `<bi>` | `in` | every line of the block read at one instant |
| `<bi>` | `evt` | by interrupt; the poll only watches. `pro_gpio_edge` `both` (level) / `rise` / `fall`, `pro_gpio_deb` ms, `pro_gpio_ms`, `pro_gpio_lost` |
| `<bi>` | `cnt`, `pw`, `enc`, `son`, `dht` | counter, pulse width, encoder, HC-SR04, DHT11/22 — results in slots |
| `<bi>` | `key` | a key matrix, `pro` = the key held |
| `<io>` | `out` | an output; `pro` = the level read back. `pro_gpio_drv` `push` / `drain` / `source`, `pro_safe` |
| `<io>` | `pwm`, `servo` | duty % (or µs) and a servo position; `pro_pwm_hz`, `pro_srv_*` |

Input fields: `pro_gpio_bias` `up` / `down` / `off`, `pro_gpio_inv="1"` = active low.

```xml
<con id="CN_GPIO" xdb_fnc="[CON.gpio,PRO.gpio]" con_host="sim:jumper=17-27" con_ses="0"
     con_mod="CLIENT" pro_role="MASTER" con_rct="5" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D_IO" pro_con="CN_GPIO" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_IN" xdb_fnc="[XDB.evt]" pro_fni="in" evt="0" evt_per="0.5" evt_typ="0x5204"
      evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      pro="" pro_typ="0x0401">
    <io id="IN27" pro_adr="27" pro="0" pro_typ="0x1104" sta="0x0302" sta_typ="0x1142"/>
  </bi>
  <io id="OUT17" pro_fno="out" pro_adr="17" pro_safe="0" pro="0" pro_typ="0x1104"
      sta="0x0302" sta_typ="0x1142" pro_fnc="[PRO.out]"/>
</dev>
```

*Measured:* writing `OUT17.pro = 1` made `IN27` read 1 through the simulated jumper. Every
slot, field and the stop / crash behaviour are in [Pins and buses](../09_Pins_and_Buses.md).
No licence feature. Examples: [PRJHW_fan](../../examples/board/PRJHW_fan/),
[PRJHW_lock](../../examples/board/PRJHW_lock/), [PRJHW_reverse](../../examples/board/PRJHW_reverse/).

### PRO.reg

A chip that is a list of registers, described in XML alone (module `AyLIB_hw`), over
[CON.i2c](#coni2c) or [CON.spi](#conspi).

| Field | On | Default | Meaning |
|---|---|---|---|
| `pro_adr` | `<dev>` | | the I²C address, or the SPI chip select |
| `pro_reg_chk` | `<dev>` | | `75=68`: this register must read this value, else the chip is refused |
| `pro_reg_init` | `<dev>` | | `6B=00;~2;1C=08`: writes, `~ms` a pause; at connect and after every outage |
| `pro_reg_ab` | `<dev>` | 1 | register address bytes: 0, 1, 2 |
| `pro_reg_rdf`, `pro_reg_wrf` | `<dev>` | | OR'd into the first byte of a read / write (SPI chips: `0x80`) |
| `pro_fni="rd"` | `<bi>` | | `pro_adr` the first register, `pro_len` the bytes, one transaction |
| `pro_fno="wr"` | `<io>` | | a write: a buffer, hex text, or a number of `pro_len` bytes |
| `pro_swp` | `<io>` | | `1` = high byte first (most sensors) |

```xml
<con id="CN_I2C" xdb_fnc="[CON.i2c,PRO.reg]" con_host="sim:mpu6050@0x68" con_ses="0"
     con_mod="CLIENT" pro_role="MASTER" con_rct="5" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="IMU" pro_con="CN_I2C" pro_adr="0x68" pro_reg_chk="75=68" pro_reg_init="6B=00;~2;1C=08"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_IMU" xdb_fnc="[XDB.evt]" pro_fni="rd" pro_adr="0x3B" pro_len="14" pro="" pro_typ="0xD411"
      pro_fnc="[PRO.inp]" evt="0" evt_per="0.5" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="AX" pro_adr="0" pro="0" pro_typ="0x1202" pro_swp="1" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

*Measured:* the simulated chip passed `pro_reg_chk`, the block ran (`AX` = 0 until the model is
given a value with `I2C.sim`). A register nothing reads back is written with
`pro_fnc="[PRO.outc]"`. Example: [PRJHW_reverse](../../examples/board/PRJHW_reverse/).

---

## Not in this repository's bin

These names exist for the engine but their DLLs are not in `bin/`:

### PRO.s7pro

Siemens S7 over [CON.tcp](#contcp) (`con_port="102"`), a plug-in (`AyPRO_s7pro`) named on the
root document with `xdb_lib="AyPRO_s7pro"`. It is not shipped in this repository's `bin`, so
`[CON.tcp,PRO.s7pro]` here ends in `function 'PRO.s7pro' not found` — and, like any name not
found, the rest of the document's element list is not run (measured).

The smart-building protocols `PRO.ateis`, `PRO.aybus`, `PRO.visca` and the BLE RTU
(`CON.blertu`, `PRO.blertu`) belong to the engine module `AyLIB_sb`, which is not shipped
either. A `<con>` naming one is skipped with one line and the document goes on (measured:
`'PRO.visca' needs plug-in AyLIB_sb, which is not loaded -- element skipped, the element list
goes on`).
