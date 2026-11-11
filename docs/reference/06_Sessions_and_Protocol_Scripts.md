# Sessions and protocol scripts

The objects a script meets when it talks on a connection: the connection itself
(`con`), its sessions (`ses`), one exchange of bytes (`exc`) and its buffers, the HTTP
request (`req`) and a server page's answer (`res`); every hook a connection can call in
your script (`pro_onparse`, `pro_onreq`, `pro_oncon` ...), with what it is handed and what
its return value means; and the scopes `MQTT`, `TOPIC`, `AUTH` and the `LDAP_CON` object.
The ideas are in [Connections and protocols](../05_Connections_and_Protocols.md), the
script side in [Scripting](../03_Scripting.md#script-can-also-speak-a-protocol), logins
and roles in [Access and safety](../06_Access_and_Safety.md). Every result below was
measured on engine 4.4.2.702.

* [How a script reaches a connection](#how-a-script-reaches-a-connection)
* [con: a connection](#con-a-connection)
* [con.pro: the connection's protocol](#conpro-the-connections-protocol)
* [ses: a session](#ses-a-session)
* [exc: an exchange](#exc-an-exchange)
* [CON_BUF: a byte buffer](#con_buf-a-byte-buffer)
* [Protocol hooks](#protocol-hooks)
* [req: the HTTP request](#req-the-http-request)
* [res: a server page's answer](#res-a-server-pages-answer)
* [MQTT](#mqtt)
* [TOPIC](#topic)
* [AUTH](#auth)
* [LDAP_CON](#ldap_con)

---

## How a script reaches a connection

| You have | You get | How |
|---|---|---|
| nothing (a timer, `xdb_start`) | a connection | `xdb.con["CN_X"]` (`xdb` is the document) |
| a connection | its main session | `con.get_ses(0)` |
| a session | its connection | `ses.con` |
| a session | a new exchange on it | `new CON_EXC(evt, ses)` |
| a hook | the exchange, the session, the event | `exc`, `exc.ses`, `exc.evt` |

```js
var c = xdb.con["CN_RS"];
c.id + " " + c.name + " " + c.pro.name     // "CN_RS tcp raw"
Object.keys(xdb.con)                        // ["CN_RS","CN_RC"]: every <con> of the document
```

`xdb.con` holds the document's own connections only. The transport's name is `con.name`
(`tcp`), the protocol's is `con.pro.name` (`raw`).

---

## con: a connection

The object behind a `<con>` element (class `XDB_CON`). Reached as `xdb.con["id"]`,
`ses.con`, `con.pro.con` or `thr.con`.

| Field | | Measured |
|---|---|---|
| `con.id` | the element's id | `"CN_RS"` |
| `con.name` | the transport | `"tcp"` |
| `con.sta` | the main session's state; **writable**: the same command a `sta` write gives (`0x0303` start, `0x0000` stop) | `0x0303` |
| `con.thr_sta` | the connection THREAD's state, a step behind `con.sta` | `0x0303` |
| `con.thr_run` | 1 while the connection's thread exists, 0 once it has left | `1` |
| `con.evt` | the `<con>`'s own event (an `evt` object) | `.id` = `"CN_RS"` |
| `con.eng_mode` | flags: what the object is (help: `0x1n` thread, `0x2n` connection, `0xn1` server, `0xn2` client) | server `0x71`, client `0x72` |
| `con.run_mode` | `0x00` standalone, `0x01` load share, `0x02` standby, `0x03` hot | `0x00` |
| `con.con_host`, `con.con_port` | the address and port, **writable** (a value that does not fit is refused, not cut) | `"127.0.0.1"`, `"47601"` |
| `con.pro` | the protocol object, below | `<CON_PRO>` |
| `con.mem` | an object of your own, one per connection, shared by every thread, kept across stop and start | `{"a":1}` |
| `con.xdb` | the document | `<XDB_DOC>` |
| `con.ses` | **not the main session**: empty for a `<con>` reached this way. Use `con.get_ses(0)` | `null` |

`con.mem` is the place for state that belongs to the connection rather than to one
client: a counter of all requests, a flag one session sets for the next one.

```js
var c = xdb.con["CN_RS"];
c.mem.a = 1;
JSON.stringify(xdb.con["CN_RS"].mem)   // {"a":1}: the same object, from anywhere
```

### con.get_ses

`con.get_ses(idx)` → a session, or empty

| Argument | Meaning |
|---|---|
| `idx` | `0` = the main session; `1`.. = the sessions of the `con_ses` list |

`get_ses(0)` is the session to send on from a timer: on a client it is the dialled link,
on a server it is the listening socket itself (`con_port` is the server's own port and
`user_role` is 9). `get_ses(1)` .. answer the sessions of the list by index; no argument
answers nothing.

```js
var m = xdb.con["CN_RS"].get_ses(0);
m.idx + " " + m.con_port + " " + m.user_role    // "0 47601 9"
xdb.con["CN_RS"].get_ses(1)                      // <CON_SES>
xdb.con["CN_RS"].get_ses()                       // nothing
```

Sending on a server's main session is refused: it has no peer
(`CON.tcp(0).send: refused -- the main session of a server connection is its listening socket`).

### con.add_ses

`con.add_ses()` → a new device session, or `null`

Makes one more client session on a CLIENT connection that keeps one session per device.
On a connection with `con_ses="0"` (or a SQL pool) it answers `null`.

### con.lock

`con.lock([ms])` → `1` taken, `0` not in time

A lock for scripts, one per connection, to keep two threads out of the same piece of
script state. Without `ms` it waits for ever. The same thread may take it again
(counted).

### con.unlock

`con.unlock()` → `1` released, `0` this thread did not hold it

```js
c.lock(100) + " " + c.lock(10) + " " + c.unlock() + " " + c.unlock() + " " + c.unlock()
// "1 1 1 1 0": taken twice by the same thread, given back twice, the third is refused
```

---

## con.pro: the connection's protocol

`con.pro` (class `CON_PRO`) has four read-only fields:

| Field | Measured |
|---|---|
| `pro.name` | `"raw"`, `"mqtt"`, `"http"` .. |
| `pro.eng_mode`, `pro.run_mode` | the same values as the connection's |
| `pro.con` | back to the connection |

---

## ses: a session

One link of a connection (class `CON_SES`): a dialled client, an accepted client of a
server, or the main session. A hook hands it to you (`exc.ses`, or `ses` itself in the
telnet and login hooks); a page sees it as `ses`.

| Field | | Measured on an accepted TCP client |
|---|---|---|
| `ses.id` | the connection's id | `"CN_RS"` |
| `ses.idx` | the session's index: 0 main, 1.. the list | `2` |
| `ses.sta` | the session's run state (writable: a command) | `0x0303` |
| `ses.evt` | the session's own event; its `user_role` is the session's role | `.id` = `"CN_RS"` |
| `ses.con` | the connection | `.id` = `"CN_RS"` |
| `ses.mem` | an object of your own, **empty at every new session**; survives between the hook calls of that session | `{}` at accept |
| `ses.pro_ver` | the protocol version the peer spoke, where the protocol has one | `0` on `PRO.raw` |
| `ses.eng_mode` | flags (`0xn4` server session, `0xn8` client session) | `0x05` |
| `ses.run_mode` | as `con.run_mode` | `0x00` |
| `ses.con_host`, `ses.con_port` | the peer's address and port; on the main session the connection's own | `"127.0.0.1"`, `"19515"` |
| `ses.pro_role` | `0` MASTER, `1` SLAVE | `1` |
| `ses.tls` | `""` on a plain link, else what TLS agreed (`"TLSv1.3 TLS_AES_256_GCM_SHA384"`) | `""` |
| `ses.user` | the logged-in user's name (read-only; a login sets it) | `""` |
| `ses.user_role` | 0..7, below | `0` |
| `ses.auth` | the `<auth>` that logged it in, as `document/id`, `"-"` if none | `"-"`, after a login `"XDB/A_MAIN"` |
| `ses.auth_sta` | `0` none, `1` init, `2` waiting for a second factor, `3` logged in | `0x00` |
| `ses.auth_flt` | the address a second-factor code goes back to (writable) | `""` |
| `ses.origin`, `ses.route` | not in the help; empty on a plain TCP session | `""` |

The main session of a server (`con.get_ses(0)`) answers `user_role` 9: it is the engine.

### ses.user_role

`ses.user_role` → 0..7; `ses.user_role = n` sets it

The role every read and write of this session is judged by (`xdb_acl`,
[Access and safety](../06_Access_and_Safety.md)): 0 Guest, 1 Customer, 2 Monitor,
3 Operator, 4 Supervisor, 5 Manager, 6 Engineer, 7 Admin. A session starts at its
connection's `con_role` (0 unless the `<con>` says otherwise).

**Who may set it:** any script that runs, whatever its own role. A login hook runs before
anyone is logged in, i.e. as Guest, and must be able to raise the role it is deciding
about; the protection is that the hook runs only because someone could write to its
element (the login element's `xdb_acl`). Two limits hold:

* 8 (Document) and 9 (System) cannot be given: the write is refused and the role stays.
* raising a session above its connection's `con_role` makes it a logged-in user for the
  licence (`max_cli`); when the licence has no slot left the write is refused.

Every change writes one WARN line: `CN_RS: ses(2) user_role 0 -> 5`.

```js
exc.ses.user_role = 5;     // 5, and the WARN line
exc.ses.user_role = 8;     // inside try: throws; the role stays 5
```

A role given by a login through `con_auth` or `AUTH.login` is the better way: it also
sets `ses.user`, `ses.auth`, writes the audit line and applies the lock-out.

### ses.send

`ses.send(exc)` → result code (0 = sent)

The same as `exc.send()`: sends `exc.buf_send` on this session. Anything but a
`CON_EXC` answers `RES_ERR_SUB_PARAMETER` (a negative number).

### ses.receive

`ses.receive(exc)` → result code

Reads up to `exc.buf_recv.nxt` bytes from the socket into `exc.buf_recv`, with no parse
hook. The buffer must exist (`buf_recv.max` set).

```js
var s = xdb.con["CN_RC"].get_ses(0);
var e = new CON_EXC(evt, s);
e.buf_send.append("PING\n");
s.send(e);                            // 0
e.buf_recv.max = 64; e.buf_recv.nxt = 64;
s.receive(e);                         // 0; e.buf_recv holds "PONG 3\n"
```

### ses.connect

`ses.connect()` → result code

Runs the protocol's connect step on the session (a CLIENT dials). Normally the engine does
this itself.

### ses.disconnect

`ses.disconnect()` → result code

Closes the link but leaves the session running: a client session falls to WAITING
(`0x0302`) and dials again after `con_rct`.

```js
s.disconnect()      // 0, "Session Disconnected"; 2 s later sta 0x0302, then dialled again
```

### ses.close

`ses.close()` → 0

Ends the session for good (its command goes to DISABLE). On an accepted connection the
socket closes and `pro_onclose` runs. Measured: a `BYE` command answered, then
`exc.ses.close()`; the client saw the answer and then the end of the stream.

### ses.start

`ses.start(idle_ms)` → `0` started, `1` was running, negative = no argument

Starts a stopped session. The argument is required: it is the session's idle time-out
in milliseconds (`0` = none). `ses.start()` without it answers `RES_ERR_SUB_PARAMETER`
(`-2147483640`).

### ses.stop

`ses.stop()` → `0` stopped, `1` was not running

### ses.wait_start

`ses.wait_start(ms)` → `0` the session is started (WAITING or RUNNING), negative = not in time

Started means at least WAITING, not connected: a client waiting to dial answers `0`.

### ses.wait_stop

`ses.wait_stop(ms)` → `0` the session is down, negative = not in time

```js
s.stop();  s.wait_stop(2000);       // 0, sta 0x0000
s.start(0); s.wait_start(3000);     // 0, sta 0x0303: dialled again
```

---

## exc: an exchange

One exchange of bytes on one session (class `CON_EXC`): what was received, what goes out,
and the calls that move them. Every byte hook gets one as `exc`; a script makes its own
with `new CON_EXC`.

| Field | | |
|---|---|---|
| `exc.ses` | the session | read |
| `exc.evt` | the event the exchange runs under; its `user_role` is the role reads and writes through it get | read |
| `exc.buf_recv` | what arrived ([CON_BUF](#con_buf-a-byte-buffer)) | read |
| `exc.buf_send` | what goes out | read |
| `exc.buf_data` | a third buffer, for a parsed payload; empty until something is appended, freed with the exchange | read |
| `exc.step` | 0 before the first read, 1 after; in a server's `pro_onparse` the first call already sees 1 | read / write |
| `exc.typ` | 0 receive, 1 query-response | read |
| `exc.unit` | in `pro_onpol` / `pro_onout`: the `<dev>`'s `pro_adr` as a number (`0x50` → `80`) | read / write |
| `exc.flag` | flags; `0x00000004` in a poll | read |
| `exc.err` | on a bus: the first failure of this hook, below | read / write |

> Before 4.4.2.703 **`exc.buf_data` did not work in a hook**: in every exchange the
> engine makes (`pro_onparse`, `pro_onaccept`, `pro_onclose`, `pro_onpol`, `pro_onout`)
> it had no buffer behind it, and `exc.buf_data.append(..)` failed with
> `object.function not found`. There, keep a parsed frame in `exc.ses.mem`.

### new CON_EXC

`new CON_EXC(evt, ses)` → an exchange on `ses`

| Argument | Meaning |
|---|---|
| `evt` | the event the exchange runs under (its role applies) |
| `ses` | a session: `con.get_ses(0)`, `exc.ses`, `ses` in a hook |

Its three buffers start empty (`max` 0) and grow as you write into them. To read an
answer, give the receive buffer room and a first length:

```js
var e = new CON_EXC(evt, xdb.con["CN_RC"].get_ses(0));
e.buf_send.append("PING\n");
e.buf_recv.max = 64;          // make the buffer
e.buf_recv.nxt = 64;          // first read: up to 64 bytes
e.exchange();                 // 0; the connection's pro_onparse framed the answer
```

Trap: `new CON_EXC(evt, con.ses)` — a `<con>` reached as `xdb.con[..]` has no `ses` —
makes nothing and writes one ERROR line, `no session -- con.ses of a <con> is empty,
use con.get_ses(0)`. With one argument it makes nothing, silently.

### exc.send

`exc.send()` → result code (0 = sent)

Sends `buf_send` from its `pos` to its `len`. On TCP it goes to the session's peer; on a
UDP server to whoever sent the datagram being answered. It takes no lock of its own, so
it may be called inside a hook.

```js
exc.buf_send.remove();
exc.buf_send.append("HELLO\r\n");
exc.send();                   // 0
```

### exc.exchange

`exc.exchange()` → result code (0 = an answer was framed)

Sends `buf_send`, then — only when `buf_recv` has room (`max`) and a first length
(`nxt`) — reads, calling the connection's `pro_onparse` on what comes until it returns
`RES.OKY`. It holds the session's lock for the whole round, so two threads asking on one
session take turns.

* The first call of `pro_onparse` in an exchange comes **before** anything was read,
  with `step` 0 and an empty buffer: answer it with `buf_recv.nxt = n` and
  `RES.INF_SUB_CONTINUE`.
* Without `max` and `nxt` the request goes out and the answer stays in the socket.
  Measured: the next exchange on that session read it and took it for its own.
* Not inside `pro_onparse` or `pro_onaccept`: they already hold the lock.

### exc.complete

`exc.complete()` → result code

Hands what the session has already read to `pro_onparse`, without sending — the path the
engine itself takes for an unsolicited arrival. `buf_recv` must exist. (From the
source; not used in a measured example.)

### exc.starttls

`exc.starttls([host])` → `0` TLS is up, `1` it was TLS already, negative = failed

Turns the plain `CON.tcp` CLIENT session into TLS in mid-stream, after the server said yes
to the protocol's own STARTTLS command. `host` is the name the server's certificate is
checked against, `con_host` by default; the connection's `con_ssl_*` fields apply as on a
`CON.tls` connection. A failure writes one ERROR line with the reason and closes the
session. Read the server's go-ahead completely first: plain bytes still in the socket
fail the handshake. Afterwards `ses.tls` names the version and cipher. (From the source
and its field rig; not run for this page.)

### exc.wr

`exc.wr(a, bytes)` → `0`, or `null` on a failure

A write on a bus (`CON.i2c`, `CON.spi`). `a` is the chip's address or chip select —
normally `exc.unit`. `bytes` is an array of numbers, a hex text (`"10 01 02"`) or a buffer.

### exc.rd

`exc.rd(a, n)` → an array of `n` numbers, or `null`

### exc.wrrd

`exc.wrrd(a, bytes, n)` → an array of `n` numbers, or `null`

A write and then a read as one transaction (on I2C a repeated start): set a register
pointer, read from it.

### exc.xfer

`exc.xfer(a, bytes[, n])` → an array as long as what went out (or `n`), or `null`

SPI, full duplex. On I2C it fails: `I2C is half duplex: a write, then a read (exc.wrrd)`.

### exc.result

`exc.result([v0, v1, ..])`

In `pro_onpol` only: the block's value. Slot `k` goes to the `<io pro_adr="k">` under it.
The block needs a buffer type: `pro_typ="0xD418"` (doubles) or `"0xD411"` (bytes). Called
in `pro_onout` it is refused (`exc.result: only in pro_onpol`). A poll hook that never
calls it publishes nothing.

### exc.err

`exc.err` → `""`, or the first failure of this hook

A bus call that fails answers `null`, and every later bus call of the same hook answers
`null` too, so a driver need not test each one; the poll or write then fails with that
reason, written once per device outage. Writing `exc.err = ""` takes the failure back (a
driver that was only asking whether a chip is there); writing a text fails the hook with
that text. Also usable on a byte pipe: `exc.err = "no answer"` in `pro_onpol` fails the
poll with `Error(ERR_RECEIVE_INVRESP)`.

The bus calls, measured on `con_host="sim:reg@0x50"` (a register file in memory):

```js
var a = exc.unit;                     // 80 (0x50)
exc.wr(a, [0x10, 1, 2]);              // 0: pointer 0x10, then 1, 2
exc.wrrd(a, [0x10], 2);               // [1,2]
exc.wrrd(a, "10", 2);                 // [1,2]: a hex text is bytes too
exc.rd(a, 3);                         // [0,0,0]: the pointer went on to 0x12
exc.xfer(a, [1, 2]);                  // null, exc.err = "I2C is half duplex: .."
exc.err = "";                         // taken back
exc.wr(a, {k: 1});                    // null: "exc: the bytes must be an array of numbers, a hex text or a buffer"
exc.wr(0x51, [0]);                    // null, "no answer from 0x51": the poll fails with ERR_RECEIVE_TIMEOUT
```

`BYTES` turns those arrays into numbers ([BYTES](02_Time_Text_and_Codecs.md));
[PRJHW_fan](../../examples/board/PRJHW_fan/) has an SPI and an I2C driver written this way.

---

## CON_BUF: a byte buffer

`exc.buf_recv`, `exc.buf_send` and `exc.buf_data` are byte buffers (class `CON_BUF`), and
`new CON_BUF(max)` makes a free one to build a frame in.

| Field | | |
|---|---|---|
| `buf.len` | the bytes it holds | read |
| `buf.pos` | where reading (or sending) has got to | read / write |
| `buf.nxt` | in a receive buffer: how many more bytes to read | read / write |
| `buf.max` | the room; writing it grows the buffer (never below `len`) | read / write |
| `buf[i]` | the byte at `i` as a number 0..255; `undefined` past `len`; **writable** | read / write |

### new CON_BUF

`new CON_BUF([max])` → an empty buffer

`max` is rounded up to a multiple of 256: `new CON_BUF(16).max` is 256. Without it the
buffer starts at 0 and grows at the first write.

### buf.append

`buf.append(v)` → the number of bytes added

| `v` | What goes in |
|---|---|
| a text in UTF-8 (a literal, `.toS08()`) | its bytes: `append("AB")` → 2 |
| a buffer (`CODEC.HEX_dec(..)`, `buf.copy(..)`) | its bytes |
| another `CON_BUF` | its bytes; the buffer itself → 0 |
| `JSON.stringify(..)` | **two bytes per character**: it is UTF-16 text. `append(JSON.stringify({a:1}))` → 14 (`7b00 2200 ..`). Write `.toS08()` → 7 |
| a number | **its own eight bytes**: `append(0x44)` → `44 00 00 00 00 00 00 00` |
| an array `[1, 2]` | nothing: 0 |

So build binary with hex text or a buffer, never with an array of numbers:

```js
exc.buf_send.append(CODEC.HEX_dec("300b0201 00"));   // the bytes 30 0b 02 01 00
exc.buf_send.append("OK\r\n");                       // text: its UTF-8 bytes
exc.buf_send.append(JSON.stringify(o).toS08());      // JSON: convert first
```

### buf.insert

`buf.insert(pos, v)` → bytes added

`v` as in `append`, put in front of `pos`.

### buf.remove

`buf.remove([pos[, qty]])` → bytes removed

No argument removes everything (the usual start of building an answer:
`exc.buf_send.remove()`); one argument removes from `pos` to the end. A `pos` inside the
removed part moves back to its start, a `pos` after it moves back by `qty`.

### buf.copy

`buf.copy([pos[, qty]])` → a byte buffer (`0x0411`)

A copy, cut at `len`; past `len` an empty buffer. A byte of the copy reads as a number
(`b[0]` → 65) but **cannot be written through its index**: `cp[0] = 0x7A` is ignored.
Write into the `CON_BUF` itself (`buf[0] = 0x61` works), or build a new one.

Text out of bytes goes through hex:

```js
var b = exc.buf_recv.copy(exc.buf_recv.pos, exc.buf_recv.len - exc.buf_recv.pos);
var t = CODEC.HEX_dec(CODEC.HEX_enc(b), 0x0401);    // the bytes as UTF-8 text
var k = t.indexOf("\n");                              // then ordinary string work
```

### buf.find

`buf.find(v)` → the offset of the first match, `-1` if none

Searches **the whole buffer from 0**, not from `pos`. `v` as in `append` (a text, a
buffer).

```js
b.find("AB")                       // 0
b.find(CODEC.HEX_dec("0d0a"))      // 10
b.find("QQ")                       // -1
```

### buf.split

`buf.split(sep)` → array of texts

The bytes from 0 to `len` cut at every `sep` (a text or a buffer), each piece a text;
two separators side by side give `""`, no separator (or `""`) gives the whole buffer.

```js
var b = new CON_BUF(32);
b.append("a,b,,c");
b.split(",")                       // ["a","b","","c"]
b.split(CODEC.HEX_dec("2c2c"))     // ["a,b","c"]
```

Before 4.4.2.703 it was not implemented and always answered an empty array.

---

## Protocol hooks

A hook is an attribute on a `<con>` (sometimes a `<dev>`, `<bi>`, `<io>`, `<auth>` or the
document root) that names script the engine runs when something happens on the wire.

| Hook | On | When | Names it hands you | Its return |
|---|---|---|---|---|
| [`pro_onparse`](#pro_onparse) | `PRO.raw` | bytes arrived (or an exchange reads) | `exc` | `RES.OKY` frame done, `RES.INF_SUB_CONTINUE` more bytes, error = drop |
| [`pro_onaccept`](#pro_onaccept) | `PRO.raw` server | a client was accepted, before the first read | `exc` | error closes the connection |
| [`pro_onclose`](#pro_onclose) | `PRO.raw` server | an accepted connection ended | `exc` | ignored |
| [`pro_onpol`](#pro_onpol) | `PRO.raw` client: `<bi>`, `<dev>`, `<con>` | the block is polled | `evt`, `exc` | error fails the poll; the value is `exc.result(..)` |
| [`pro_onout`](#pro_onout) | `PRO.raw` client: `<io>`, `<dev>`, `<con>` | a value is written to a point | `evt`, `exc` | error fails the write |
| [`pro_onreq`](#pro_onreq) | `PRO.http`, `PRO.rest`, `PRO.soap` server | a request arrived | `exc`, `msg` | ignored: the script writes the answer |
| [`pro_oninp`](#pro_oninp) | `PRO.http` client | an answer arrived | `exc`, `msg` | ignored |
| [`pro_oncon`](#pro_oncon) | `PRO.mqtt` server | a client sends CONNECT | `exc`, `cid`, `usr`, `pwd` | the CONNACK code: 0 accept |
| [`pro_onconack`](#pro_onconack) | `PRO.mqtt` client | the broker answered CONNECT | `exc`, `cid`, `err` | ignored |
| [`pro_onsub`](#pro_onsub) | `PRO.mqtt` | server: a SUBSCRIBE; client: its SUBACK | `exc`, `cid`, `topic` | server: a number ≠ 0 refuses |
| [`pro_onunsub`](#pro_onunsub) | `PRO.mqtt` server | an UNSUBSCRIBE | `exc`, `cid`, `topic` | ignored |
| [`pro_onlogin`](#pro_onlogin) | `PRO.telnet` without `con_auth` | a user typed a password | `ses`, `usr`, `pwd` | 0 accept |
| [`pro_oncmd`](#pro_oncmd) | `PRO.telnet` | a command line | `ses`, `cmd` | a value = the answer; nothing = not mine |
| [`xdb_pub`](#xdb_pub) | the document root; `<pub pub_fnc>` | a value of the document was published | `evt` | ignored |
| [`auth_script` / `auth_onlogin` / `auth_on2fa`](#auth) | `<auth>` | a login | `ses`, `usr`, .. | see [AUTH](#auth) |

`PRO.sql` reads its own `pro_onpol` / `pro_onout` with another contract (`evt`, `val`
= the result set): [SQL](07_SQL_History_Files_and_Cluster.md). `PRO.mcp` has
`pro_mcp_onuser`, a function NAME called with the user token, which returns
`{usr, role}` (from the source; not run for this page).

### How a hook is written

The attribute is an expression, run with **only** the names of the table above defined:

```xml
<con id="CN_RS" xdb_fnc="[CON.tcp,PRO.raw]" ... pro_onparse="main.onparse(exc);"/>
```

* Write it as a call with its arguments, `main.onparse(exc);` — not a bare
  `main.onparse`. Its value is the hook's return.
* A function called with **more** arguments than it declares fails
  (`too much parameter argn >= argcmax`); declare them all.
* `evt` is **not** defined in a hook that does not list it: `pro_onreq="main.api(exc, msg, evt);"`
  passes `undefined`. Use `exc.evt`.
* **Trap: inside a module function a free `evt` still means something.** A function that
  uses `evt` without having it as a parameter gets the document's own root event
  (`evt.id` is the root's id, `evt.user_role` says 9). What it reads and writes is
  judged by the role the hook runs with: in a `pro_onreq` handler on 4.4.2.703 an
  Admin-only value read through it answered `null`, as through `exc.evt`. **Before
  4.4.2.703 it read that value** — the handler ran as the engine. Always name what you
  use as a parameter.
* A script error is not a return value: it is logged (`Code error ...`) and the engine
  does what it does without the hook (for `pro_onparse`: nothing is answered for that
  arrival; for `pro_oncon`: CONNACK 3; for `pro_onlogin`: refused).

### pro_onparse

**On:** a `PRO.raw` connection (`<con>`). **Called with:** `exc`. **Runs as:** the
session's role — an accepted client is Guest (0) unless the `<con>` gives `con_role`.

Called when bytes arrive on a session, and inside every `exc.exchange()`. It decides
where one frame ends:

1. read from `exc.buf_recv`, from `pos` to `len`;
2. a frame is complete → move `pos` past it, answer if you like, return `RES.OKY`. If
   bytes are left after `pos`, the hook is called again for them (two frames in one
   read: two calls);
3. not complete → set `buf_recv.nxt` (more bytes wanted) and return
   `RES.INF_SUB_CONTINUE`. The bytes from `pos` on stay with the session and the next
   call has them in front of what comes next — on TCP too.

| Return | Meaning |
|---|---|
| `RES.OKY` (or nothing) | this frame is done |
| `RES.INF_SUB_CONTINUE` | read `buf_recv.nxt` more bytes and call me again |
| anything with the error bit (`RES.ERR`) | this arrival is dropped; an answer already sent stays sent. With `con_clr="1"` what is waiting in the socket is thrown away. The connection stays |

A line server, measured with a Python client:

```js
function onparse(exc)
{
    var r = exc.buf_recv;
    var t = CODEC.HEX_dec(CODEC.HEX_enc(r.copy(r.pos, r.len - r.pos)), 0x0401);
    var k = t.indexOf("\n");
    if (k < 0) { r.nxt = 64; return RES.INF_SUB_CONTINUE; }   // no end of line yet
    var line = t.substring(0, k);
    r.pos = r.pos + k + 1;                                      // consumed
    exc.ses.mem.n = exc.ses.mem.n + 1;
    exc.buf_send.remove();
    exc.buf_send.append("PONG " + exc.ses.mem.n + "\n");
    exc.send();
    return RES.OKY;
}
```

| The client sent | It got back |
|---|---|
| `PING\n` | `PONG 1\n` |
| `PING\nPING\n` in one write | `PONG 2\nPONG 3\n` (two calls) |
| `PI`, 400 ms later `NG\n` | `PONG 4\n`: the second call saw `PING\n` |

* **Advance `pos`.** A hook that returns `RES.OKY` without moving it is called again with
  the same bytes; after 200 such calls the engine gives up with
  `complete: on_parse2 cnt>200` and the connection goes on.
* It runs under the session's lock: `exc.send()` yes, `exc.exchange()` no.
* In an exchange (a client asking) the first call comes before any read, with `step` 0
  and an empty buffer: return `RES.INF_SUB_CONTINUE` with `nxt` set.
* An answer from an earlier, unanswered request, or a server's greeting, arrives in the
  next exchange's buffer: skip what is not yours (a loop over the lines) before you
  return `RES.OKY`.

[PRJEDU_snmp](../../examples/protocols/PRJEDU_snmp/) is an SNMP agent written this way;
[PRJEDU_net](../../examples/data/PRJEDU_net/) has a mail and an FTP server.

### pro_onaccept

**On:** a `PRO.raw` SERVER `<con>` (on any other protocol it is refused at load with one
WARN line). **Called with:** `exc`. **Runs as:** the session's role.

Called once per accepted connection, before anything is read — for a protocol whose
server speaks first (SMTP, FTP, POP3 greet). `exc.buf_recv` is empty, `exc.buf_send` and
`exc.send()` work, `exc.ses.mem` is a fresh empty object.

| Return | Meaning |
|---|---|
| `RES.OKY` or nothing | keep the connection |
| a value with the error bit | send what was sent, then close: `accept: main.onaccept(exc); closes the connection` |

```js
function onaccept(exc)
{
    exc.ses.mem.n = 0;
    exc.buf_send.remove();
    exc.buf_send.append("HELLO\r\n");
    exc.send();
    return RES.OKY;
}
```

A refusal, measured: the hook sent `NO\r\n` and returned `RES.ERR`; the client read
`NO\r\n` and then the end of the stream.

### pro_onclose

**On:** a `PRO.raw` SERVER `<con>`. **Called with:** `exc`. **Return:** ignored.

Called once when an accepted connection ends — the client closed it, `ses.close()`, or
`con_idletmo`. The last bytes that arrived have already been through `pro_onparse`, and
`exc.ses.mem` still holds what the session kept. Nothing can be sent on the closing
connection; write elements, or send on another session. Not called when the connection
itself is being stopped.

```js
function onclose(exc)
{
    exc.evt.Log(4, "closed after " + exc.ses.mem.n + " lines");
    return 0;
}
```

An FTP upload is complete when its data connection closes:
[PRJEDU_net](../../examples/data/PRJEDU_net/)'s FTP sink uses all three hooks.

### pro_onpol

**On:** a `PRO.raw` CLIENT connection — the `<bi>`, else its `<dev>`, else the `<con>`;
the nearest wins. **Called with:** `evt` (the block's event, `evt.id` = the block, `atr`
= `pro`), `exc`. **Runs as:** the engine (role 9).

A client protocol written in script: the block's `PRO.pol` timer calls the hook, which
asks the device and hands the numbers back with `exc.result([..])`. On a byte pipe
(`CON.tcp`, `CON.ser`) it uses `exc.exchange()`; on a bus (`CON.i2c`, `CON.spi`) the bus
calls.

| Return / state | Meaning |
|---|---|
| `exc.result([..])` called, no error | the block's value: slot `k` → `<io pro_adr="k">` |
| no `exc.result` | the poll publishes nothing |
| `exc.err` set, or an error returned | the poll fails (`Error(ERR_RECEIVE_INVRESP)`, on a bus the bus's reason) |

```xml
<con id="CN_RC" xdb_fnc="[CON.tcp,PRO.raw]" con_host="127.0.0.1" con_port="47601" con_mod="CLIENT"
     con_ses="0" con_rct="2" pro_role="MASTER" pro_tmo="2" pro_onparse="main.cparse(exc);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D1" pro_con="CN_RC" pro_adr="7" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B1" xdb_fnc="[XDB.evt]" evt="0" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="1"
      pro="" pro_typ="0xD418" pro_fnc="[PRO.inp]" pro_onpol="main.pol(evt, exc);"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="I0" pro_adr="0" pro="0" pro_typ="0x1308" pro_fnc="[VAL.put]" val="0" val_typ="0x0308" sta="0x0303" sta_typ="0x1142"/>
    <io id="I1" pro_adr="1" pro="0" pro_typ="0x1308" pro_fnc="[VAL.put]" val="0" val_typ="0x0308" sta="0x0303" sta_typ="0x1142"/>
  </bi>
</dev>
```

```js
function cparse(exc)                  // frames one line of the answer
{
    var r = exc.buf_recv;
    var t = (r.len > r.pos) ? CODEC.HEX_dec(CODEC.HEX_enc(r.copy(r.pos, r.len - r.pos)), 0x0401) : "";
    var k = t.indexOf("\n");
    if (k < 0) { r.nxt = 64; return RES.INF_SUB_CONTINUE; }
    exc.ses.mem.ans = t.substring(0, k);
    r.pos = r.pos + k + 1;
    return RES.OKY;
}

function pol(evt, exc)
{
    exc.ses.mem.ans = "";
    exc.buf_send.remove();
    exc.buf_send.append("POLL\n");
    exc.buf_recv.nxt = 64;
    exc.exchange();                                   // 0
    var a = exc.ses.mem.ans;                          // "VAL 12.5 2"
    if (a.indexOf("VAL ") != 0) { exc.err = "no answer: " + a; return 0; }
    var p = a.split(" ");
    exc.result([parseFloat(p[1]), parseInt(p[2])]);   // I0 = 12.5, I1 = 2
}
```

On a bus a hook runs alone (a poll and a write of the same bus never overlap).
[PRJHW_fan](../../examples/board/PRJHW_fan/) reads an ADC0834 this way.

### pro_onout

**On:** a `PRO.raw` CLIENT connection — the `<io>`, else its `<dev>`, else the `<con>`.
**Called with:** `evt` (`evt.valn` is the value being written), `exc`.

Called by `PRO.out` when a point is written. Send the value; fail the write with
`exc.err` or an error return. `exc.result` is refused here.

```js
function out(evt, exc)
{
    exc.ses.mem.ans = "";
    exc.buf_send.remove();
    exc.buf_send.append("OUT " + evt.valn + "\n");
    exc.buf_recv.nxt = 64;
    exc.exchange();
    if (exc.ses.mem.ans.indexOf("ACK") != 0) exc.err = "not acknowledged";
    return 0;
}
```

A failed write is one ERROR line with the reason and a `pro.out: [abc] -> @pro :
Error(ERR_SEND_INVRESP)` line; as with every `PRO.out`, the written value is not stored
in `pro`.

### pro_onreq

**On:** a `PRO.http`, `PRO.rest` or `PRO.soap` SERVER `<con>`. **Called with:** `exc`,
`msg` (the request, [req](#req-the-http-request)). **Return:** ignored.

The script writes the whole HTTP answer into `exc.buf_send` and sends it.

| Protocol | Which requests reach the hook |
|---|---|
| `PRO.rest`, `PRO.soap` | every request, `GET` included |
| `PRO.http` | a request with a body (`POST`, `PUT` ..); a plain `GET` or `HEAD` is a file from `pro_http_root`. A request to a `*.ayp` page goes to the page, never to the hook |

```xml
<con id="CN_API" xdb_fnc="[CON.tcp,PRO.rest]" con_host="#CN_WEB" con_port="/api" con_mod="SERVER"
     con_ses="4" pro_role="SLAVE" pro_onreq="main.api(exc, msg);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

```js
function api(exc, msg)
{
    var body = JSON.stringify({ api: msg.uri, q: msg.getParam("q") }).toS08();
    var buf = "".toS08();
    buf += "HTTP/1.1 200 OK\r\n";
    buf += "Content-Type: application/json\r\n";
    buf += "Content-Length: " + body.size + "\r\n";   // bytes, not characters
    buf += "\r\n";
    buf += body;
    exc.buf_send.remove();
    exc.buf_send.append(buf);
    exc.send();
}
// GET /api/values?q=3  ->  200 {"api":"/api/values","q":"3"}
```

`msg.fileServe(exc)` answers with the file the request names instead.

**Roles.** Two roles meet in a handler, measured with a value only Admin may read:

| | `exc.evt` (reads and writes through it) | the handler's own context (`xdb`, a free `evt`, `AUTH.list`, `File.open`, scope gates) |
|---|---|---|
| default (no `pro_onreq_ses`) | the visitor: `con_role`, 0 by default, or the login's role | the visitor's role |
| `pro_onreq_ses="1"` | the visitor | the visitor |
| `pro_onreq_ses="0"` | the visitor | the engine (9) |

So `exc.evt.GetValue(..)` always meets `xdb_acl` with the visitor's role, and since
4.4.2.703 so does the rest of the handler unless the connection says
`pro_onreq_ses="0"` — for a handler that checks its callers itself and must act as the
engine. Measured: an Admin-only value read with `xdb.GetValue` answered `null` to an
anonymous POST, `42` with `pro_onreq_ses="0"`. **Before 4.4.2.703, without `con_auth`
the handler's own context was the engine (9)**: `xdb.GetValue` and a free `evt` read
that value for anyone. With `con_auth` an unsafe request whose
login came from the cookie needs the CSRF token, or it is answered 403 before the hook
runs ([Access and safety](../06_Access_and_Safety.md)).
[PRJEDU_web](../../examples/web/PRJEDU_web/) answers a REST call this way.

### pro_oninp

**On:** a `PRO.http` CLIENT `<con>` — whose `<bi>` / `<io>` polls and writes **send
nothing** (since 4.4.2.703 one ERROR line says so at the first one). Kept for the
record: it would be called with `exc`, `msg` (the answer). A script can still use such a
connection as an HTTP client: `new CON_EXC(evt, ses)`, the request in `exc.buf_send`,
`exc.exchange()`, the answer read with `new HTTP_MSG(exc.buf_data)` (DCIM's SMS and ERP
calls do this; from their code, not run for this page). Or use `PRO.raw` with a
`pro_onpol` / `pro_onout` hook.

### pro_oncon

**On:** a `PRO.mqtt` SERVER `<con>` without `con_auth` (with it, `con_auth` decides and
the hook is not asked). **Called with:** `exc`, `cid` (client id), `usr`, `pwd`.
**Runs as:** the session (Guest until you raise it).

| Return | CONNACK |
|---|---|
| `0` or nothing | accepted |
| `4` | bad user name or password |
| `5` | not authorized |
| `1`, `2`, `3` | the other MQTT 3.1.1 codes; a script error is 3 |

`exc.ses.user` is already the user name when the hook runs; raise the role inside it.

```js
function oncon(exc, cid, usr, pwd)
{
    if (usr == "u" && pwd == "p") { exc.ses.user_role = 3; return 0; }
    return 4;
}
```

Measured: `usr="u" pwd="wrong"` → `refused with CONNACK 0x04`, and the client's
`pro_onconack` got `err=4`. [PRJEDU_mqtt](../../examples/protocols/PRJEDU_mqtt/)'s README shows
the hook.

### pro_onconack

**On:** a `PRO.mqtt` CLIENT `<con>`. **Called with:** `exc`, `cid` (our own client
id), `err` (the CONNACK code, a number: 0 = connected).

```js
function onack(exc, cid, err) { exc.evt.Log(4, cid + " CONNACK " + err); }   // "w6cli CONNACK 0"
```

### pro_onsub

**On:** a `PRO.mqtt` `<con>`. **Called with:** `exc`, `cid`, `topic` (one filter).

* **Server:** once per filter of a SUBSCRIBE, after the subscription is in the list (a
  hook that sends the new subscriber its first values finds it there). A **number other
  than 0** refuses that filter: measured, `deny/x` got SUBACK `0x80`. Nothing, 0 or a
  script error keep it.
* **Client:** once per filter when the broker's SUBACK arrives; the return is ignored.

```js
function onsub(exc, cid, topic)
{
    if (topic.indexOf("deny") == 0) return 1;     // SUBACK 0x80
    return 0;
}
```

### pro_onunsub

**On:** a `PRO.mqtt` SERVER `<con>`. **Called with:** `exc`, `cid`, `topic`, once per
filter of an UNSUBSCRIBE. The return is ignored.

### pro_onlogin

**On:** a `PRO.telnet` `<con>` **without** `con_auth` (with `con_auth` it is ignored, and
the log says so). **Called with:** `ses`, `usr`, `pwd`. **Runs as:** Guest.

Return `0` to accept, after setting `ses.user_role`; anything else, nothing included,
refuses (`login: 'x' REFUSED (rc = 1)`), and a role the hook raised before refusing is
taken back. With neither `con_auth` nor this hook every login is refused.

```xml
<con id="CN_TEL" xdb_fnc="[CON.tcp,PRO.telnet]" con_host="127.0.0.1" con_port="47630" con_mod="SERVER"
     con_acl="127.0.0.1" con_ses="4" pro_role="SLAVE" pro_tel_ban="w6 shell" pro_tel_echo="0"
     pro_onlogin="main.login(ses, usr, pwd);" pro_oncmd="main.cmd(ses, cmd);"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

```js
function login(ses, usr, pwd)
{
    if (usr == "opr" && pwd == "opr1") { ses.user_role = 3; return 0; }
    return 1;
}
```

The shell then greets `user 'opr', role 3, document 'XDB'`. Prefer `con_auth` and an
`<auth>`: hashed passwords, lock-out and an audit line come with it
([PRJEDU_telnet](../../examples/web/PRJEDU_telnet/)).

### pro_oncmd

**On:** a `PRO.telnet` `<con>`. **Called with:** `ses`, `cmd` (the line typed).
**Runs as:** the session's role.

Asked after the shell's own commands (`help`, `who`, `log` .. never reach it) and before
the line is run as script.

| Return | The shell |
|---|---|
| a text or a number | prints it: `num` → `42` |
| `""` | prints nothing; the line is done |
| nothing (`return;`) | runs the line as script: `1+2` → `3` |

```js
function cmd(ses, c)
{
    if (c == "hello") return "hi " + ses.user + ", role " + ses.user_role;   // "hi opr, role 3"
    return;                                                                  // not mine
}
```

### xdb_pub

**On:** the document's root element (`<xdb xdb_pub="main.pub(evt);">`), or a
`<config><pub id pub_fnc>` entry. **Called with:** `evt` — the publication: `evt.id`,
`evt.atr`, `evt.valn`, `evt.valp`. **Return:** ignored.

Runs for every value the document publishes (the same ones MQTT and replication see):
not for a `0x4...` LOCAL attribute, and not for writes made inside `xdb_init` /
`xdb_start`. A `<pub>` entry filters before it calls: `pub_id` (element ids, `*` and `?`)
and `pub_atr` (attribute names).

```xml
<xdb id="XDB" ... xdb_pub="main.pub(evt);">
  <config>
    <pub id="P1" pub_id="V*" pub_atr="val" pub_fnc="main.pub2(evt);"/>
```

```js
function pub(evt) { evt.Log(4, evt.id + "." + evt.atr + " = " + evt.valn); }
// "V1.val = 5", "W1.val = 6", "V1.sta = 0x0303" ...; pub2 sees only "V1.val = 5"
```

A function the hook names that does not exist switches the hook off with one ERROR line
(looked for again every 60 s). Measured trap: values written by a timer that ran on the
document's own thread (no `evt_thr`) did not reach the hook; the same writes from a timer
on a `<thr>` of its own did.

---

## req: the HTTP request

The request (class `HTTP_MSG`) as a server page sees it (`req`) and as `pro_onreq` gets it
(`msg`). Measured with `GET /p.ayp?a=1+2&b=x%20y&f=q` and a header `X-Test: hello`:

| Field | | Measured |
|---|---|---|
| `req.method` | | `"GET"` |
| `req.uri` | the path, without the query | `"/p.ayp"` |
| `req.query` | the query, still encoded | `"a=1+2&b=x%20y&f=q"` |
| `req.proto` | | `"HTTP/1.1"` |
| `req.body` | the body as it came | `""`; a form POST `"a=from+body&f=%C3%A7"` |
| `req.body_size` | the body's length | `0` |
| `req.chunk` | the body (the same text here) | |
| `req.message` | the whole request, head and body | 91 characters |
| `req.headers` | **empty**: read headers with `getHeader` | `""` |
| `req.buffer` | the request's bytes, a [CON_BUF](#con_buf-a-byte-buffer) | `<CON_BUF>` |
| `req.csrf` | the login's CSRF token, `""` without a login | `""` |
| `req.isRequest`, `req.isResponse` | 1 / 0 for a request | `1`, `0` |

A field set from script (`message`, `method`, `body`) rewrites the message; a script that
builds a request uses `new HTTP_MSG(buf)` on a `CON_BUF` it filled.

### req.getParam

`req.getParam(name)` → text, or `undefined`

A query-string parameter, %-decoded, `+` kept: `getParam("a")` → `"1+2"`,
`getParam("b")` → `"x y"`. The name must match exactly, case too: `getParam("A")` →
nothing.

### req.getForm

`req.getForm(name)` → text, or `undefined`

A form field: from a `application/x-www-form-urlencoded` body, else from the query;
`+` is a space. `getForm("a")` → `"1 2"` on the GET above; on a POST with
`a=from+body` and `?a=fromquery` → `"from body"`. `%C3%A7` arrives as the UTF-8 text
`ç`. `multipart/form-data` is not decoded.

### req.getHeader

`req.getHeader(name)` → text, or nothing

A header's value; the name is matched without regard to case (`getHeader("x-test")`
found `X-Test`).

### req.fileServe

`req.fileServe(exc)` → `1`

Answers the request with the file under `pro_http_root` that `req.uri` names, as a plain
`GET` would have been. Measured: a `POST /serve.txt` handed to `pro_onreq` and answered
with `msg.fileServe(exc)` sent the file.

---

## res: a server page's answer

`res` (class `HTTP_RES`) exists only in a server page (`.ayp`): the page writes its answer
into it and the engine sends it when the page ends — buffered, so status, headers and a
redirect still work after output started, `Content-Length` is exact and `HEAD` gets the
headers only. The page syntax is in
[Scripting](../03_Scripting.md#script-can-also-write-a-web-page). A page sees `evt`, `req`,
`res`, `exc`, `ses` and your modules by name, and runs with the **visitor's** role:
measured, the Admin-only value read empty for a Guest and `42` after an engineer logged
in.

| Field | Default | |
|---|---|---|
| `res.status` | `200` | read / write, 100..599; another value is refused |
| `res.type` | `text/html; charset=utf-8` | read / write; `<%@ page type=".." %>` sets it too |
| `res.length` | | body bytes written so far |

```html
<%@ page type="text/plain; charset=utf-8" %>
user=<%= ses.user %> role=<%= ses.user_role %>
sp=<%= evt.GetValue("id('SP')/@val") %>
esc=<%= "<b>&'\"" %>
raw=<%- "<b>" %>
```

gives `esc=&lt;b&gt;&amp;&#39;&quot;` and `raw=<b>`. A page that sets no `Cache-Control`
is sent with `no-cache`. A page that throws answers `500 Server page error`, with the
reason only in the log.

### res.write

`res.write(v, ...)`

Appends each argument as it is; a number or `true` as text, `null` and `undefined` write
nothing.

### res.writeText

`res.writeText(v, ...)`

The same, HTML-escaped (`& < > " '`): `res.writeText(" <i>", 5, " ", null, undefined, true)`
writes ` &lt;i&gt;5 1`.

### res.escape

`res.escape(v)` → text

`v` HTML-escaped, for an attribute built in code:
`res.escape("<a href='x'>&</a>")` → `&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;`.

### res.header

`res.header(name, value)`

Adds a header line. Refused, with the reason (inside `try` in `e.message`, outside one
ERROR line, and the page goes on):

| Call | Refusal |
|---|---|
| `res.header("Content-Length", "5")` | `Content-Length is written by the engine` |
| `res.header("X-B", "a\r\nb")` | `the value of 'X-B' holds a line break` |
| `res.header("Bad Name", "a")` | `'Bad Name' is no header name` |

`Content-Type` set this way is the same as `res.type`; a `Cache-Control` of your own
replaces the `no-cache`.

### res.redirect

`res.redirect(url[, code])`

`302`, or `301` `303` `307` `308`; another code is refused. The body written before is
dropped and later output too: `res.write("lost"); res.redirect("/p.ayp?a=1", 303);
res.write("after")` answers `303`, `Location: /p.ayp?a=1`, an empty body.

### res.clear

`res.clear()`

Drops the body written so far: `res.write("aaa")` then `res.length` is 3, after
`res.clear()` it is 0.

`res` belongs to its request. Kept in a variable and used by a later request it refuses:
`res: the page has ended -- 'res' is valid only while its page runs`. `new HTTP_RES()`
makes nothing.

---

## MQTT

Script access to a `PRO.mqtt` connection: publish on it, add a subscription of your own
with a handler, list the sessions a broker keeps for clients that are away. The
connection's own publishing and subscribing are its XML ([PRJEDU_mqtt](../../examples/protocols/PRJEDU_mqtt/)).

### MQTT.publish

`MQTT.publish(con_id, topic, value, qos, retain[, props])` → `1` / `0`

| Argument | Meaning |
|---|---|
| `con_id` | a `PRO.mqtt` connection of this document |
| `topic` | the topic, up to 255 bytes |
| `value` | the payload; a number goes as its text (`42` → `"42"`); JSON: `JSON.stringify(..)` |
| `qos` | 0, 1 or 2 |
| `retain` | 1 = retained. Required: with four arguments the call answers 0 |
| `props` | MQTT 5 user properties `[["k","v"], ..]`; ignored on an MQTT 3.1.1 link |

On a **client** connection it goes to the broker: `1` when the session took it (whether
anybody is subscribed or not). On a **server** connection the broker sends it to its
matching subscribers itself, each at min(`qos`, what they were granted): `1` when at
least one got it (or one away with a kept session), `0` when nobody is subscribed. A
retained message on a server is kept and sent to the next subscriber of a matching filter
even when the call answered `0`.

```js
MQTT.publish("CN_CLI", "zz/a", "hello", 1, 0)            // 1
MQTT.publish("CN_BRK", "zz/b", "from broker", 0, 0)      // 1: CN_CLI subscribed zz/#
MQTT.publish("CN_BRK", "nobody/x", "x", 0, 0)            // 0
MQTT.publish("CN_BRK", "rr/r", "retained", 1, 1)         // 0, and a later subscriber of rr/# gets it
MQTT.publish("CN_CLI", "zz/n", 42, 0, 0)                  // 1, the subscriber reads "42"
MQTT.publish("CN_BRK", "zz/c", "c", 0)                   // 0: retain missing
```

### MQTT.subscribe

`MQTT.subscribe(con_id, filter, handler[, qos])` → `1` / `0`

Adds a subscription with a handler of its own. On a CLIENT connection the engine sends
SUBSCRIBE; on a SERVER connection (the engine is the broker) it is registered locally.
For every message that matches it runs `handler` with the names `exc`, `cid`, `topic`,
`msg`.

| Argument | Meaning |
|---|---|
| `con_id` | a `PRO.mqtt` connection |
| `filter` | a topic filter (`+`, `#`), up to 127 bytes; `$share/<name>/<filter>` = a shared subscription, the handler gets `<filter>`'s messages |
| `handler` | an expression, as a hook is written, `"main.h(exc, cid, topic, msg);"`, or a function's name, `"main.h"` (called with the four). At most 63 characters |
| `qos` | 0 (default), 1, 2 |

In the handler `msg` is the payload as text, `topic` the message's topic, `cid` **this
connection's own client id** (not the publisher's), `exc.ses` the session it arrived on.

```js
MQTT.subscribe("CN_CLI", "zz/#", "main.h(exc, cid, topic, msg);", 1);   // 1

function h(exc, cid, topic, msg)
{
    exc.evt.Log(4, topic + " = " + msg);      // "zz/a = hello"
    return 0;
}
```

* The handler gets the whole payload (a 700-byte message arrives as 700).
* A handler text over 63 characters is refused: `0` and one ERROR line. Keep it a call
  of a function with short argument names, or give the function's name alone.
* Subscribing the same filter again replaces the earlier handler.
* On a SERVER connection it answers `1`; the handler runs for every matching PUBLISH
  the broker's clients send (`exc.ses` = the publishing client's session, `cid` = the
  broker's own `pro_cid`).
* A connection that does not exist answers `0`, with no line.

Before 4.4.2.703: a bare function name was accepted and **never called**; the payload
reached the handler cut to **511 bytes**; a handler over 63 characters was cut and failed
with a `Syntax error` at every message; on a SERVER connection the call answered `0`
and wrote two ERROR lines (the handler was registered and ran all the same).

### MQTT.unsubscribe

`MQTT.unsubscribe(con_id, filter)` → `1` sent, `0` nothing to remove

Removes a subscription `MQTT.subscribe` made (the same filter text) and, on a CLIENT
connection, sends UNSUBSCRIBE: `MQTT.unsubscribe("CN_CLI", "zz/#")` → 1, a filter never
subscribed → 0. On a SERVER connection it removes the local registration (→ 1).

### MQTT.sessions

`MQTT.sessions(con_id)` → JSON text

The sessions a broker (`PRO.mqtt` server) keeps for clients that connected with a
persistent session and are away. Needs Engineer (6) or above; `"[]"` when there are none
or the connection does not exist.

```js
MQTT.sessions("CN_BRK")
// [{"cid":"py1","usr":"u","ver":4,"subs":1,"queued":0,"bytes":0,"inflight":0,
//   "dropped":0,"refused":0,"left_s":7198}]
```

`left_s` counts down from `pro_mqtt_ses_exp` (7200 s). Measured: a QoS 1 message
published while `py1` was away was delivered when it came back.

---

## TOPIC

How the engine reads an MQTT topic as an address — the same reader PRO.mqtt, MCP and the
blob mount use. For a script that has a topic and wants the element.

### TOPIC.local

`TOPIC.local(rest[, doc])` → an address, or `undefined`

`rest` is what follows the document in a topic, without a command (`set`, `get` ..). A
plain level is an element id, the last level the attribute; `tag[n]` is a child by
position.

```js
TOPIC.local("V1/val")              // id('V1')/@val
TOPIC.local("V1.val")              // id('V1')/@val
TOPIC.local("L/item[12].val")      // id('L')/item[12]/@val
TOPIC.local("L/item[12]")          // id('L')/item[12]: the element
TOPIC.local("L/item[*].val")       // id('L')/item/@val
TOPIC.local("L/item[**]")          // id('L')//item
TOPIC.local("L/a[1].b[2].val")     // id('L')/a[1]/b[2]/@val
TOPIC.local("A.B.val")             // id('A.B')/@val: a dotted id is one id
TOPIC.local("X/*")                 // id('X')/@*
TOPIC.local("val")                 // @val
TOPIC.local("L/item[0].val")       // undefined: positions count from 1
TOPIC.local("bad'quote/val")       // undefined: a quote is refused
```

`doc` names the document whose root id may lead the topic.

### TOPIC.xpath

`TOPIC.xpath(topic)` → `doc(..)/..` address, or `undefined`

A topic with its document (its first two levels):

```js
TOPIC.xpath("XDB/S00/V1/val")              // doc('XDB/S00')/id('V1')/@val
TOPIC.xpath("CMR/T01/L/item[3].val")       // doc('CMR/T01')/id('L')/item[3]/@val
TOPIC.xpath("XDB/V1")                      // undefined: no level after the document
TOPIC.xpath("$SYS/RPC/1/req")              // undefined: '$' topics are the engine's own
TOPIC.xpath("XDB/S00/V1/sta/set")          // doc('XDB/S00')/id('V1')/id('sta')/@set
```

The last line is the trap: `TOPIC.xpath` does not know commands. Take `/set` off first.

### TOPIC.test

`TOPIC.test()` → a report text

The reader's own tests, no communication: `"... 84 passed, 0 failed"`. A failure is also
logged as ALERT.

---

## AUTH

Logins. An `<auth>` element holds the users and the rules; a `<con>` names it with
`con_auth`, and then the channel (telnet, MQTT, HTTP) logs its clients in through it. The
scope lets a script do the same, check a token and hash a password. The fields of
`<auth>` and the three gates are in [Access and safety](../06_Access_and_Safety.md):

```xml
<auth id="A_MAIN" xdb_acl="0xFF000000" auth_prv="local" auth_map="operator:3, engineer:6" auth_map_def="0"
      auth_try="3" auth_lock="60" auth_rehash="1" auth_tkn_ttl="1800">
  <usr usr_id="opr" usr_pwd="opr123" usr_grp="operator"/>
  <usr usr_id="adm" usr_pwd="adm123" usr_role="7"/>
</auth>
```

`ref` below names an `<auth>`: `"A_MAIN"` in the calling document, or
`"doc('DAS/S00')/id('A_MAIN')"`. Where it is optional and left out, `login` uses the
session's `con_auth`; `check`, `list` and `unlock` use the only `<auth>` in use, if
there is exactly one.

**Hooks on `<auth>`** (all written like protocol hooks):

| Attribute | Called with | |
|---|---|---|
| `auth_script` | `ses`, `usr`, `pwd`, `cid` | the `script` provider (`auth_prv="script"`). Return `{grp: ..}` or `{role: ..}` (plus `nam`, `mail`, `mobile`) to accept; `0` to accept with the role the script put on `ses`; `"NOUSER"` / `"BADPASS"` / `"UNAVAIL"` to refuse. **Nothing (`undefined`) refuses**, so does any other number |
| `auth_on2fa` | `ses`, `usr`, `code`, `pay` | a second factor is due (`auth_2fa`): deliver `code`. `"UNAVAIL"`, `"ERR_SUB_REFUSED"` or `3` = could not be sent |
| `auth_onlogin` | `ses`, `usr`, `pay` | after a password was accepted, and again after the second factor |
| `auth_resume` | as `auth_script` | the provider for a session coming back (from the source; not run) |

`pay` is an object: `{"usr":"opr","role":3,"sta":2,"prv":"local","chn":"script",
"host":"127.0.0.1","resume":0,"grp":"operator","nam":"","mail":"opr@example.com",..}`.

### AUTH.hash

`AUTH.hash(pwd[, iter])` → `$pbkdf2-sha256$<iter>$<salt>$<key>`, or `undefined`

A PBKDF2-SHA256 hash for a `usr_pwd` or a SQL column; 100000 rounds by default. An
empty or missing password answers `undefined`.

```js
AUTH.hash("opr123")          // "$pbkdf2-sha256$100000$yLZxYUdQrdbPzW2wuLZFZQ$q-BPFY..."
AUTH.hash("opr123", 1000)    // "$pbkdf2-sha256$1000$..."
```

### AUTH.hash_ok

`AUTH.hash_ok(pwd, stored)` → `1` / `0`

`stored` may be a hash or plain text (compared as text): `AUTH.hash_ok("opr123", h)` →
1, `AUTH.hash_ok("abc", "abc")` → 1.

### AUTH.login

`AUTH.login(ses, usr, pwd[, ref])` → a result text

Logs a session in, as a channel's own login does: lock-out, provider, role, audit line.
On success the session has `ses.user`, `ses.user_role`, `ses.auth` and `auth_sta` 3.

| Result | |
|---|---|
| `"INF_OKY"` | logged in |
| `"INF_SUB_2FA"` | password accepted, a code went out: `AUTH.verify` next (`auth_sta` 2) |
| `"ERR_SUB_INVUSER"` / `"ERR_SUB_INVPASS"` | unknown user / wrong password |
| `"ERR_SUB_LOCKED"` | too many failures for this user and address (`auth_try`, `auth_lock`) |
| `"ERR_SUB_REFUSED"` | the provider is unavailable |
| `"ERR_SUB_CONFIG"` | no such `<auth>`, or no `ref` and no `con_auth` on the session's connection |
| `"ERR_SUB_PARAMETER"` | the first argument is no session |

```js
AUTH.login(exc.ses, "opr", "opr123", "A_MAIN")   // "INF_OKY"; exc.ses.user_role is 3
```

Measured with `auth_try="3"`: three wrong passwords gave `ERR_SUB_INVPASS` and locked the
pair; the next attempts `ERR_SUB_LOCKED`. Trap: `exc.evt` of the request that logged in
keeps the role it started with (0) for the rest of that request; `exc.ses.user_role`
is the new one.

### AUTH.verify

`AUTH.verify(ses, code)` → `"INF_OKY"`, `"ERR_SUB_INVPASS"`, `"ERR_SUB_TIMEOUT"`, `"ERR_SUB_NOTEXIST"`

The second factor. `ERR_SUB_NOTEXIST` = no code is pending (already verified, or none
sent). Measured: a wrong code → `ERR_SUB_INVPASS`, the right one → `INF_OKY` and role 3,
the same again → `ERR_SUB_NOTEXIST`.

### AUTH.resend

`AUTH.resend(ses)` → `"INF_SUB_2FA"` (a new code went out), `"ERR_SUB_REFUSED"`, `"ERR_SUB_NOTEXIST"`

### AUTH.token

`AUTH.token(ses)` → a token text, or `undefined`

A new token (43 characters) for a session logged in through AUTH; `undefined` for any
other session.

### AUTH.check

`AUTH.check(tkn[, ref])` → `{usr, role, exp}`, or `undefined`

Checks a token and slides its expiry: `{"usr":"opr","role":3,"exp":1794391781428}`
(`exp` in epoch ms). A bad or revoked token → `undefined`.

### AUTH.logoff

`AUTH.logoff(ses | tkn)` → the number of tokens revoked

Given a session it also resets the session to its connection's role and drops a pending
code: after it `ses.user_role` is 0, `ses.user` is `""` and the session's tokens no
longer check.

### AUTH.list

`AUTH.list([ref])` → `[{tkn, usr, role, host, chn, exp}]`

The live tokens, the token shown by its first six characters:
`[{"tkn":"2FppjH...","usr":"opr","role":3,"host":"127.0.0.1","chn":"script",..}]`.
Needs Engineer (6) or above; below that, and before any `<auth>` was used, it answers
nothing.

### AUTH.unlock

`AUTH.unlock(usr | "@addr" | "*"[, ref])` → entries cleared

Clears lock-out entries: one user, every entry of an address, or all. Needs Admin (7);
below it answers 0. Writes `AUTH(XDB/A_MAIN): unlock 'opr' by role 9, 1 entries cleared`.

---

## LDAP_CON

A connection to an LDAP directory from script (Windows): bind, search, modify. For logins
the `<auth>` `ldap` provider is the usual way; this object is for reading or changing the
directory itself. **Not run against an LDAP server for this page**: the calls and their
answers without a server were measured, the rest is from the source.

| Field | | |
|---|---|---|
| `ld.sta` | `0x0301` new, `0x0302` connected, `0x0303` bound | read |
| `ld.cfg` | `ld.NOSSL` (0), `ld.SSL` (256), `ld.TLS` (512), OR'ed with a version `ld.VERSION2` (2, the default) / `ld.VERSION3` (3) | read / write |
| `ld.error_text` | why the last call failed | read |
| `ld.MOD_ADD` `ld.MOD_DELETE` `ld.MOD_REPLACE` | 0, 1, 2 for `modify` | read |

### new LDAP_CON

`new LDAP_CON()` → `sta` 0x0301, `cfg` 0x0002

### ld.connect

`ld.connect(host[, port])` → 0, or negative

Prepares the link (389, or 636 with `SSL`); with `TLS` it also runs STARTTLS. Nothing is
sent without SSL/TLS: measured, `connect("127.0.0.1", 47650)` with nothing listening
answered 0 and `sta` 0x0302; the bind found the server missing.

### ld.bind

`ld.bind(dn, pwd)` → 0, or negative

A simple bind; `sta` becomes 0x0303. A failure closes the handle: measured,
`error_text` = `"BIND: Server Down"`, and every later call needs a new `connect`. Before
`connect` it answers negative.

### ld.search

`ld.search(base[, filter[, attrs[, tmo]]])` → `[{_dn, attr: value | [values]}]`

Subtree search below `base`; `filter` defaults to `(objectClass=*)`, `attrs` is one name
or an array, `tmo` seconds (10). Each entry is an object with `_dn` and its attributes:
a single value as text, several as an array. A failed search answers nothing and sets
`error_text` (measured after a failed bind: `"SEARCH: Parameter Error"`).

### ld.modify

`ld.modify(dn, mods)` → 0, or negative

```js
ld.modify("CN=John,OU=Users,DC=example,DC=com",
          [[ld.MOD_REPLACE, "telephoneNumber", "+1 555"],
           [ld.MOD_ADD, "description", ["a", "b"]],
           [ld.MOD_DELETE, "pager", []]]);
```

Without a bound link it answers negative.

### ld.disconnect

`ld.disconnect()` → 0; `sta` back to 0x0301
