# PRJEDU_mqtt — MQTT, both ends, nothing to install

One engine, one command, real MQTT packets on a loopback socket:

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8104/** — the monitoring side's page: the four
points with their alarm state, a trend, and a set point you send to the field
and watch arrive (the page shows each step with its time).

Two documents in the same process talk to each other through a broker:

| Document | MQTT role | What it is |
|---|---|---|
| `FLD/S00` | **broker** | the field: a small tank, and AyMON as the broker on `127.0.0.1:1884`. Every value that changes is published as `FLD/S00/<id>/<attribute>`. |
| `MON/S00` | **client** | the monitoring side: connects to that broker, subscribes, turns messages into points with limits and alarms, and writes a set point back. |

Read `db\db_FLD.xml` first if AyMON is to **be** the broker other things
connect to. Read `db\db_MON.xml` first if AyMON is to connect to a broker that
**already exists**: mosquitto, a cloud service, another AyMON.

The port is 1884 rather than 1883 so the example never collides with a
mosquitto already running on this machine.

## What it teaches

* **the broker publishes its own document**. `FLD/S00` has no list of topics.
  Every attribute that changes is on the wire as
  `<document>/<element id>/<attribute>`. Adding a point is adding a `<var>`.
* **a write is a PUBLISH to `.../set`**. `FLD/S00/SETPOINT/val/set` writes
  `id('SETPOINT')/@val` through that element's own `val_fnc`: rounded,
  clamped (send `250`, get `100`) and logged. The stored value is then
  published like any other change, so the writer learns what was kept.
* **what stays home**: an attribute whose type carries the `0x4000` (LOCAL)
  bit is never published. `STEPS` changes every second and is never seen
  outside, and neither is the timer's own `evt`.
* **retain, the AyMON way**. The broker keeps no store of retained messages;
  the document is the store. With `pro_retain="1"` a new subscription is
  answered at once with the current values (`pro_retain_adr` picks the
  elements, `pro_retain_atr` the attributes), so a client that connects late
  does not wait for the next change.
* **the client side is the same four levels as Modbus**, with a different
  meaning at each level:
  * `<con>` is the broker connection
  * `<dev>` is one publisher, named by its topic prefix
  * `<bi>` is one subscription; its `pro_adr` is a topic filter
    (`FLD/S00/+/val`)
  * `<io>` is one topic, one point
* **no timer on the block**. Modbus asks, so it needs a clock. MQTT is told:
  the point moves when the message arrives.
* **`pro` is the wire, `val` is the meaning**. The payload is text (`"47.3"`).
  `pro_typ` says how to read it, and `pro_fnc="[VAL.put]"` copies it into
  `val`. Leave `VAL.put` out and every message arrives while `val` never
  moves.
* **limits and alarms belong to the monitoring side**. The field publishes
  plain numbers; `MON/S00` decides what "too high" means.
* **writing back from the client**: `pro_fnc="[PRO.out,VAL.put]"` on the
  `SETPOINT` point. A write to its `pro` goes out as
  `FLD/S00/SETPOINT/val/set`. The value that comes back from the field is
  protocol input, and `PRO.out` does not send protocol input out again, so
  there is no echo.
* **script can publish anything**: `MQTT.publish("CN_MQ", "MON/S00/summary",
  JSON.stringify(...), 0, 0)`. The broker relays it to every subscriber,
  because it is also an ordinary broker, whether or not the topic is an
  element.

## What the log looks like

```
FLD/S00:FLD: MQTT broker on 127.0.0.1:1884, publishing FLD/S00/<id>/<attribute>
FLD/S00:CN_BRK:PRO.mqtt(1).retain: 'FLD/S00/+/val' için 4 değer yayınlandı
MON/S00:VALUES.mqtt(0).connect: bi: topic('FLD/S00/+/val')
MON/S00:MON: level 51.5 % (set point 50), temp 18 C, pump on, level sta 0x0303
MON/S00:MON: asking the field for set point 40 %
FLD/S00:FLD: SETPOINT 50 -> 40 % (written over MQTT)
...
MON/S00:MON: level WARNING (sta 0x0303 -> 0x0347)
MON/S00:MON: level ALARM (sta 0x0347 -> 0x034B)
MON/S00:MON: level WARNING (sta 0x034B -> 0x0347)
MON/S00:MON: level normal (sta 0x0347 -> 0x0343)
```

A client that goes away without saying DISCONNECT — a `mosquitto_sub`
closed with its window, say — leaves one line behind:
`CN_BRK:PRO.mqtt(n).S-Q[...|ERR_CONNECT_WANTCLOSE]`. The engine drops that
session, and there is nothing else to do.

The `retain` line counts four values: `LEVEL`, `TEMP`, `PUMP` and `SETPOINT`.
`STEPS` is local, so it is not among them. The line itself is one of the
engine's own messages and is in Turkish ("4 values published for ...").

The set point moves every 30 seconds, through 40, 70 and 95 %. At 95 the
level climbs past both high limits, so the alarm path runs without anyone
touching anything.

## The page

`MON/S00` serves it with two more connections: `CN_WEB` (HTTP, `www\`) and
`CN_LIVE` — MQTT again, but the other way round: `CN_MQ` is this document as
a **client** of the field's broker, `CN_LIVE` is this document as a
**broker** for the page, inside a WebSocket on the page's port (`/mqtt`).

The page writes exactly one thing, `MON/S00/SETPOINT/pro/set`: writing a
point's `pro` runs its `PRO.out`, which publishes `FLD/S00/SETPOINT/val/set`
to the field. `xdb_acl="0xFFFFFFF1"` on the document lets a page that did not
log in (a Guest) read everything and write nothing; `SETPOINT`'s own
`xdb_acl="0xFFFFFFF3"` adds that one write. Measured: the page's set point
reached `MON/S00` in 70 ms and the field's pump reacted 0.6 s after the click;
a write to `TEMP` from the page was not taken.

## Watching it with mosquitto

The broker speaks plain MQTT 3.1.1, so any client works. With the mosquitto
command-line tools (`mosquitto_sub`, `mosquitto_pub`) in another window:

```bat
mosquitto_sub -h 127.0.0.1 -p 1884 -t "FLD/#" -t "MON/#" -v
```

You get the current values at once (that is the retain replay), then every
change, the set-point writes, and `MON/S00/summary` as one JSON message every
ten seconds.

Write a set point yourself:

```bat
mosquitto_pub -h 127.0.0.1 -p 1884 -t "FLD/S00/SETPOINT/val/set" -m 85
```

Two outside clients can also talk to each other through the engine on any
topic at all, `mosquitto_pub -t hello/world -m hi` included.

No `-i` needed: a client that sends an empty client id is given one by the
broker (`auto-CN_BRK-1`, `auto-CN_BRK-2`, …). This needs engine
**4.3.4.442** or later. Earlier engines refuse such a client.

## Using mosquitto (or any broker) instead

To make `MON/S00` a client of a real broker:

1. In `db\db_MON.xml`, set `con_host` / `con_port` on `<con id="CN_MQ">` to
   the broker, for example `127.0.0.1` / `1883`. Add `pro_usr` / `pro_pwd` if
   the broker wants a login.
2. In `db\AyXDB.xml`, set `sta="0x0000"` on `<doc id="FLD/S00">` so the
   engine's own broker and tank stay out of the way.
3. Feed the broker the topics MON expects:

   ```bat
   mosquitto_pub -h 127.0.0.1 -p 1883 -t "FLD/S00/LEVEL/val" -m 84.5
   mosquitto_pub -h 127.0.0.1 -p 1883 -t "FLD/S00/LEVEL/val" -m 93
   ```

   The second one puts `LEVEL` into ALARM on the monitoring side. Nothing in
   `db_MON.xml` knows it is talking to a different broker.

Or keep both documents and point a real device at `FLD/S00`: anything that
publishes `FLD/S00/<id>/val` feeds the tank's elements. Add `/set` to the
topic to write to them.

## Opening it to other machines

Everything listens on `127.0.0.1`, and `con_acl="127.0.0.1"` refuses anyone
else at accept. There is no login: any client that can connect may read every
value and write every one that has no `xdb_acl`. Before you change
`con_host`:

* widen `con_acl` only as far as needed (`192.168.1.*`)
* give the broker a login. `pro_oncon="main.oncon(exc,cid,usr,pwd);"` is the
  simplest form: a script that returns 0 to accept.
* use `[CON.tls,PRO.mqtt]` with a certificate for anything that crosses a
  network you do not own (PRJEDU_web shows the certificate attributes)

## Licence

Four connections (two for the page) and three documents: well inside FREE. MQTT is not a licensed
feature.
