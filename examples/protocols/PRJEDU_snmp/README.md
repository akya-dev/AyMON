# PRJEDU_snmp — SNMP, both ends, nothing to install

One engine, one command, real SNMP packets on a loopback socket:

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8105/** — the manager's page: the tank with its
limits, what the agent says about itself, a trend, and every OID as the agent
sent it (`pro`) next to what it means (`val`) and its alarm state.

| Document | Role | What it is |
|---|---|---|
| `AGT/S00` | the **device** | an SNMP v2c agent **written in script**, serving six OIDs from a simulated tank on `127.0.0.1:1161` |
| `MON/S00` | the **manager** | AyMON in the role it really has: it polls those OIDs into `<io>` points with units, scaling and alarms |

Read `db\db_MON.xml` if you came for SNMP — that file is what you would write
for a real device. Read `db\db_AGT.js` if you ever have to speak a protocol
AyMON does not know yet.

Needs engine **4.3.4.444** or later.

## Why the agent is script

AyMON's `PRO.snmp` is a manager: it asks, it does not answer. The other
examples put both ends in one engine because the engine has both roles —
Modbus master and slave, MQTT broker and client. SNMP has no second role, so
the device end is built out of the three pieces the engine gives a script for
exactly this purpose:

| | |
|---|---|
| `PRO.raw` | a connection with no protocol of its own |
| `pro_onparse` | the framing hook: the engine hands over what it read, the script says what one frame is — and may answer on the same socket |
| `CODEC.HEX_dec` / `HEX_enc` | text ↔ bytes, which is how a script builds a frame and how the log shows one |

That is the general lesson of this example: **a protocol AyMON does not speak
can be written in script first**, and only then, if it earns it, in C or as a
plug-in. `db\db_AGT.js` does BER by hand — tags, lengths, OID
arcs in base 128 — because that is what the format is.

The agent answers GET and GETNEXT, in v2c, without checking the community. It
is a teaching agent, not a device.

## What it teaches (the manager side)

* **the four levels, with SNMP meanings**: `<con>` the client and its version
  and community, `<dev>` one device and its address, `<bi>` **one request**,
  `<io>` one OID and one point
* **the OID is split in two**: the base on the `<bi>`, the rest on each
  `<io>`; the engine joins them with a dot
* **polling costs packets, not points**: `pro_fni="GET"` puts every `<io>` of
  the block in **one** packet (up to `pro_vb`, 24 by default). Six points here
  are one packet every two seconds; six separate `<bi>` would be six packets
* **types arrive as types**: Gauge32 and Counter32 as unsigned, INTEGER
  signed, TimeTicks as hundredths of a second (a plain number — the engine
  does not turn it into a time), OCTET STRING as text
* **SNMP has no floats**: the agent serves tenths of a degree and
  `val_cnv_dlt="0.1"` turns them back — the same attribute the Modbus example
  uses for scaled registers
* **`pro` is the wire, `val` is the meaning**: `pro_fnc="[VAL.put]"` is the
  bridge, and `pro_typ` needs its `0x1000` bit or the chain never runs
* **alarms belong to the monitoring side**: the device serves numbers, the
  limits are `val_alm_*` on the `<io>`

## The page

`MON/S00` serves it with two more connections: `CN_WEB` (HTTP, `www\`) and
`CN_LIVE` (MQTT inside a WebSocket on the same port, `/mqtt`). The page
subscribes to `MON/S00/+/val`, `/pro` and `/sta`; the engine answers with the
current value of every `<io>` at once, then sends each change. It only reads:
`xdb_acl="0xFFFFFFF1"` on the document gives a page that did not log in (a
Guest) read and nothing else. Both listen on `127.0.0.1` only.

## What the log looks like

```
AGT/S00:AGT: SNMP v2c agent on 127.0.0.1:1161 (PRO.raw + script)
AGT/S00:AGT: serving 6 OIDs under 1.3.6.1.4.1.99999
MON/S00:MON: SNMP v2c manager -> 127.0.0.1:1161, base 1.3.6.1.4.1.99999, every 2 s
MON/S00:MON: level 22 %, temp 18 C, pump off, starts 0, agent up 23 s ('AyMON example agent')
MON/S00:MON: level WARNING (sta 0x0303 -> 0x0347)
MON/S00:MON: level ALARM (sta 0x0347 -> 0x034B)
MON/S00:MON: pump STARTED
MON/S00:MON: level normal (sta 0x0347 -> 0x0343)
```

Raise `xdb_log` to `7` on `<xdb>` and on `CN_AGT` / `CN_SNMP` and the packets
are in the log as hex, both sides of them. The agent also writes one line per
request at level 5:

```
AGT: GET 6 varbind -> 1.3.6.1.4.1.99999.2.1.0, ... , 1.3.6.1.4.1.99999.1.1.0
```

Six OIDs, one line: that is the whole poll.

## The OIDs

Under the private enterprise arc `1.3.6.1.4.1.99999` (99999 is not assigned to
anyone — a real device uses its vendor's arc):

| OID | Type | Meaning |
|---|---|---|
| `.1.1.0` | OCTET STRING | what the agent calls itself |
| `.1.2.0` | TimeTicks | uptime, hundredths of a second |
| `.2.1.0` | Gauge32 | tank level, % |
| `.2.2.0` | INTEGER | temperature, tenths of a degree |
| `.2.3.0` | INTEGER | pump, 0 or 1 |
| `.2.4.0` | Counter32 | pump starts |

Add a row to `oid_table()` in `db\db_AGT.js` and an `<io>` in `db\db_MON.xml`
and the next poll carries it.

## Polling a real device instead

1. In `db\db_MON.xml`, set `con_host` and `con_port` on `<dev id="TANK">` to
   the device (port 161), and `pro_getc` to its read community. For SNMPv3
   use `pro_usr`, `pro_auth`, `pro_pwd` (and `pro_priv` / `pro_priv_key` for
   encryption) — on the `<dev>` or on the `<con>`; the `<dev>` wins, field by
   field, and `con_ses` must be greater than 0 because credentials are per
   device session.
2. Put the device's own OIDs in `<bi pro_adr>` and the `<io pro_adr>` below
   it. The vendor's MIB file is where they come from.
3. In `db\AyXDB.xml`, set `sta="0x0000"` on `<doc id="AGT/S00">` so the
   example's agent stays out of the way.

If a point stays empty, the usual causes are: the OID does not exist on that
device (the answer says `noSuchObject`), the community is wrong (no answer at
all), or `pro_fnc="[VAL.put]"` is missing and only `pro` is moving.

## Opening it to other machines

The agent listens on `127.0.0.1` and `con_acl="127.0.0.1"` refuses everyone
else at accept. It checks no community and it is not a device — do not put it
on a network. The manager side is ordinary and safe to point anywhere you are
allowed to poll.

## Licence

Four connections (two for the page), three documents: well inside FREE. SNMP is not a licensed
feature.
