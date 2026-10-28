# PRJEDU_rep — two engines, one plant

Open two command windows in this directory:

```bat
run_plant.bat
```

```bat
run_centre.bat
```

On Linux: `./run_plant.sh` and `./run_centre.sh`, in two terminals.

Either order. The plant produces the data; the centre mirrors it. Kill
either one and start it again — they find each other and the mirror
catches up by itself.

Then open **http://127.0.0.1:8108/** — the centre's page. It listens to
both engines and puts the source next to the mirror: six values each, the
level of both on one trend, what only the first sync carried, and a switch
for the replication link.

## What you are looking at

The plant window:

```
PLANT:  [source] level 19.1 %, temp 22 C, pump off, starts 0, level sta WARNING
```

The centre window, at the same second:

```
CENTRE: [mirror, 5 elements] level 19.1 %, temp 22 C, pump off, starts 0, draining, level sta WARNING
```

Putting those two lines side by side *is* the example. Everything below is
about why it takes so little configuration to get them.

## The page

The centre serves it (`CN_WEB` on 8108, and `CN_LIVE` — MQTT inside a
WebSocket, `/mqtt`, on the same port). It also opens a second connection,
to the plant's own `/mqtt`, which the plant mounts on the listener it
already has (`CN_EXT`, 9180) the way `CN_PLANT` mounts `/rep`.

The page cannot subscribe to `PRC/P01` itself: an MQTT connection publishes
the document it belongs to, and both `CN_LIVE`s belong to `SYS/S00`. So
each node's `SYS/S00` copies `PRC/P01` into one JSON value, `VIEW`, twice a
second (`main.view`) — the source on the plant, the mirror on the centre.

**Switch the link off** and the plant goes on while the mirror keeps the last
values it had; the two columns and the two lines part. **Switch it on** and
the bulk sync brings the mirror up to date. Measured, three times on
Windows: after a gap of 5.6–16.8 % in the level, the mirror equalled the
source again 0.9–1.6 s after the switch (both `VIEW`s are refreshed every
0.5 s, so that is the resolution).

The switch is `LINK` on the centre — the only thing the page may write (its
own `xdb_acl`; the document's `xdb_acl="0xFFFFFFF1"` gives a page that did
not log in read and nothing else). Its `val_fnc`, `main.link`, writes
`CN_PLANT`'s `sta`: `0x0000` off, `0x0303` on.

## The centre has no file for the data

That is the part worth stopping on. In `db\` there is **one** document of
process data, `db_proc.xml`, and it belongs to the plant. The centre's root
file declares the same document with **no `src`**:

```xml
<doc id="PRC/P01" sta="0x8300" desc="HUB - the mirror of pumping station P01" />
```

Four attributes. No element list, no types, no limits. A `HUB` document
declared this way opens empty and the tree arrives from the field: on
connect, replication pulls the whole document once.

Add a point to `db_proc.xml` and it appears at the centre — you do not go
and edit a second file. That is the difference between replicating a
**document** and forwarding **messages**.

## Two numbers decide the direction

Not the connection. The connection only carries.

```
sta = 0xRC00
        |'- bit 12-13  cluster state
        '-- bit 14-15  role class:  0 plain   1 EDGE (field)   2 HUB (centre)
```

| | plant root | centre root |
|---|---|---|
| `SYS/S00` (connections, scripts) | `0x0300` plain | `0x0300` plain |
| `PRC/P01` (the data) | **`0x4300`** EDGE — the source | **`0x8300`** HUB — the mirror |

Swap those two numbers and the data flows the other way. There is no
`direction=` anywhere in this project.

## One connection row, written once

`<con id="CN_PLANT">` is **the same text** in `db_sys_plant.xml` and
`db_sys_centre.xml`. Neither copy says "listen" or "dial", and neither
names the node it is sitting on:

```xml
<con id="CN_PLANT" xdb_fnc="[REP.cfg,CON.ws,PRO.rep]" pro_nid="PLANT" ... />
```

`REP.cfg` runs first and compares `pro_nid` — the name of the node that
**listens** — with the `tid` in that node's root file:

* on the plant (`tid="PLANT"`) they match → **SERVER**, mounted on the
  node's existing listener at path `/rep`
* on the centre (`tid="CENTRE"`) they differ → **CLIENT**, dials
  `pro_rep_host:pro_rep_port`

With two nodes that is a convenience. With four it is the only way to keep
them consistent: one row per link, copied everywhere, and every node works
out its own end.

## Replication does not open a port

`CN_PLANT` says `con_host="#CN_EXT"`. The `#` means *hand me the sessions
that arrive on that connection for my path*. `CN_EXT` is an ordinary HTTP
listener; a real site already has one for its web interface, its REST API
and its MCP endpoint. Replication costs it one more path, not one more
open port in the firewall.

## The alarm is computed once

`LEVEL` carries four limits and `val_fnc="[ATR.rou,ALM.onlvl]"`. That chain
runs **at the plant**, where the value is born, and what crosses the wire
is the finished value and the finished `sta` — an alarm in AyMON is not a
separate object, it is state on the value that raised it, so it travels
with the value for free.

Watch `level sta` go `normal → WARNING → ALARM` in both windows at once.

## And it runs unlicensed, on one machine

Replication is not in the FREE edition. It works here anyway, because the
rule is about **where the connection goes**, not what it costs:

> an unlicensed feature is a **local** feature.

Cluster, replication, RPC and MCP all run between engines on one machine —
loopback, and every non-IP transport — so that anybody can learn them, and
are refused on a remote address without a licence. What you buy is the
second machine.

## Four traps

| | |
|---|---|
| **`REP.cfg` must come first** in `xdb_fnc` | It writes `con_mod`, `pro_role`, `con_host` and `con_port`; `CON.ws` has to find them already written. Put it after and the connection is never set up. |
| **`pro_rep_doc` is mandatory on the receiving end** | An incoming topic names its document, and the name is resolved against this list. No list, nothing applied. |
| **`pro_rep_dir="both"` on a field-to-centre link** | It is not the direction of the data (that is `<doc sta>`). The same row carries the data upward and the mirror's requests downward. |
| **`val_typ="0x1308"`, not `0x0308`** | The `0x1000` bit is what says "run the `val_fnc` chain". Without it the chain is declared and never runs: no rounding, no alarm, no error, no log line. It is specific to `val_fnc` — `evt_fnc` and `sta_fnc` run either way ([docs/02](../../../docs/02_Timers_and_Events.md)). |

## What the log says about itself

`PRO.rep` prints a line every ten seconds:

```
PRO.rep: çıkış toplam=247 yayın=96 (+10/10sn) | giriş uygulanan=0 red=0 eksik=0 hata=0
PRO.rep: eleman yarat=0 sil=0 gelen-sil=0 | id'siz=1 | istek=0 xml=0 senkron=2
```

`giriş uygulanan` is what was applied from the peer, `red` what the
direction gates refused, `eksik` elements that were not there yet,
`id'siz` branches that were skipped because nothing under them has an `id`
of its own — **an element without an id is not replicated**, because the
wire addresses elements by id. (The `1` above is the empty `<config>`.)

A start in either order writes **no error lines**. If you see this one:

```
PRO.rep.in: yazılamadı: doc('PRC/P01')/id('LEVEL')/@val
```

the engine is older than **4.3.4.443**. It is a value arriving a few hundred
milliseconds before the bulk sync that creates the element; the mirror asks
for it, the sync lands, and the data is right either way. Since 4.3.4.443 the
source holds deltas back until that subscriber's snapshot is queued, and says
so once:

```
PRO.rep: abone toplu senkronu bekliyor — delta atlandı (anlık görüntü taşıyacak)
```

The same release stopped the empty mirror from publishing its own start-up
state back down to the field, which the field refused with a second error
line.

## Where to go next

Both engines share this one project directory and are told apart by `tid`,
which is also what `%TID%` in `log_lnk` uses to keep their log files
separate. To put the centre on another machine, change `pro_rep_host` (and
`con_acl`) — and get a licence, because that connection is no longer local.

Why this runs without a licence at all is [docs/04_Licensing.md](../../../docs/04_Licensing.md).
The full field guide — three nodes, automatic MASTER/SPARE election with
`PRO.clt`, TLS on the link, and what `pro_rep_atr` / `pro_rep_id` /
`pro_rep_sta_msk` are for — comes with the licensed product.
