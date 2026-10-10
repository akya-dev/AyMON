# PRJEDU_opcua — an OPC UA client, against a machine with its own server

An injection moulding machine comes with an OPC UA server, the way most new
machines do. AyMON reads it, subscribes to it, writes to it and calls its
methods — over three connections that show three things a real installation
has to get right: **namespaces**, **one session per thread**, and **security
in both directions**.

The machine is a simulation in Python (`sim/ua_machine.py`) behind a real
OPC UA server — [asyncua](https://github.com/FreeOpcUa/opcua-asyncio),
somebody else's stack, not AyMON's. That is the point: the engine talks to
code it has never seen.

Needs engine **4.3.4.494** or later (an array as JSON text, `OPC.cert` with
`%DB%`, `OPC.gen` drafts that run as written).

## Run it

Once, to give the machine its Python environment (Python 3.10 or later and
the internet; nothing is installed into your Python itself):

```bat
setup.bat
```

Then two windows:

```bat
run_machine.bat
```

```bat
run.bat
```

and open **http://127.0.0.1:8102/**.

On Linux: `./setup.sh`, `./run_machine.sh`, `./run.sh`. `setup.sh` takes the
first Python 3.10+ that has its `venv` module (Debian / Ubuntu without one:
`sudo apt install python3-venv`). On WSL with the project under `/mnt/c` it
took 4 min 15 s — the environment is many small files on a Windows disk.

**The first time, one of the three connections will not connect.** That is
the lesson of step 3 below, not a fault.

## What it teaches

| | |
|---|---|
| `db/db_UA.xml` | the client: three `<con>`s to one machine, NodeIds by namespace URI, a poll, a subscription, an array, writes, certificates |
| `db/db_UA.js` | the page's requests carried out on the right session; `OPC.cert`, `OPC.call`, `OPC.browse`, `OPC.gen` |
| `sim/ua_machine.py` | what a server decides: who may read, who may write, which certificates it trusts |

### 1. NodeIds by name, not by number

Every point reads a node such as
`nsu=urn:aymon:examples:moulding;s=IMM1.MouldTemp`. The `nsu=` is the
namespace's **URI**; the engine reads the server's namespace table when it
connects and turns it into today's index. The machine calls it `ns=2` — and
`OPC.browse` shows it that way — but the index is only the order in which the
server registered its namespaces. A server update that adds one before it,
and every `ns=2` in a configuration points somewhere else.

### 2. A poll and a subscription

The mould temperature is read twice: polled every second (`MOULD_P`, on
`CN_UA`) and subscribed (`MOULD_S`, on `CN_UAP`), and the page draws both.
While the mould heated from 40 to 70 °C, measured over 30 s:

| | updates | age when it reached the engine (median / max) |
|---|---|---|
| poll, Windows | 30 | 57 / 313 ms |
| subscription, Windows | 136 | 121 / 233 ms |
| poll, Linux | 30 | 91 / 336 ms |
| subscription, Linux | 134 | 95 / 191 ms |

The difference is **how many changes arrive**, not how fresh they are: the
machine changes the value up to five times a second, so whatever the poll
reads is recent — but it misses the changes in between. (Age = the moment
the value reached the engine minus the machine's own source timestamp of it,
`xdb_tim`; `main.age` writes it into the point.)

**Why the subscription has a connection of its own.** An OPC UA server does
not send on its own: the client parks a Publish request with it, and the
server answers when there is news — or, with nothing to say, after its
keep-alive time (2 s here). Everything that uses one session runs on one
thread (see 4), so with the subscription on the poll's session, that wait
held up the poll too. Measured (engine 4.3.4.485) with the machine standing
still: the 1 s poll made **0.65 reads a second**, each Publish waiting 2.3 s.
On its own `<con>` and `<dev>` it made 1.0.

**And why `evt_per` matters after all.** The engine keeps one Publish
request at the server at a time, so how soon the next follows the answer
caps the rate: measured on 4.3.4.485, with `evt_per="0.5"` (and a 200 ms
publishing interval) the subscription delivered 61 changes in 30 s; with
`0.05` and 100 ms, 135 (the
thread's `thr_per="20"` is what lets 0.05 mean it).

### 3. Security goes both ways

`CN_UAS` is signed and encrypted (Basic256Sha256) and logs in as `setter`.
Two certificates have to be trusted:

| | how | measured |
|---|---|---|
| the machine trusts **us** | the engine makes its certificate at the first start (`OPC.cert`, in `xdb_init`, into `db/pki/`). The machine refuses it and files it under `sim/pki/rejected/` — move that file to `sim/pki/trusted/` | refused every 5–6 s until then (`session: reddedildi 0x801A0000` = BadCertificateUntrusted); connected **6.2 s** after the file was moved (Linux 4.9 s) |
| **we** trust the machine | `pro_trust` names its certificate — a PEM **file**, not a directory. The simulated machine is on this computer, so it points straight at `sim/pki/own/server_cert.pem`; for a real one you copy the machine's certificate | without it the engine connects anyway and says `sunucu sertifikasi DOGRULANMADI` (server certificate NOT VERIFIED) at every connect — even in the clear, which is why `CN_UA` and `CN_UAP` have it too |

The machine's window says what it did with every certificate and login:

```
CERT    'O=AKYA_SE,CN=AyMON PRJEDU_opcua' is not trusted - REFUSED. It is in pki/rejected/AyMON_PRJEDU_opcua_37b44abc.der; move it to pki/trusted/ to trust it.
LOGIN   'setter' accepted - may read, write and call
WRITE   MouldTempSP = 70.0
CALL    ResetCounter() - was 0
DENIED  an anonymous session tried to write - BadUserAccessDenied
```

The certificate is made **once**: a new one at every start would have to be
trusted on the machine again every time. Delete `db/pki/*.pem` for a new
pair.

### 4. One session, one thread — so the page does not write

OPC UA numbers every message of a session, and the numbers must come without
a gap; a gap is a replay attack to the server. So everything on a session
runs on one thread: its `<bi>`s (`evt_thr`) and the script that writes and
calls methods on it. The page's buttons therefore do not write the machine:
they leave a request in `REQ`, and a timer on the right thread (`main.cmd_s`
on `TH_UAS`, `main.cmd_a` on `TH_UA`) carries it out and answers in `RES`.
The document's `xdb_acl` lets the page write `REQ` and nothing else.

Measured, request to answer inside the engine: writes 1–53 ms (Linux
13–83 ms), method calls 2–4 ms.

### 5. The server decides who may write

The machine lets an anonymous session read and nothing else; `setter` may
write and call. The page's **Stop, anonymously** sends the same write over
`CN_UA`: the machine answers `BadUserAccessDenied`, `Run` stays where it was,
and `main.cmd_a` sees it from the point's `sta` (a refused write leaves it
WAITING) and reports **REFUSED**. In the engine's log that one refused write
is an ERROR with the server's reason and a PANIC from the output layer,
and the document's health goes to EMERGENCY:

```
RUN_A:PRO.opc.out nsu=urn:aymon:examples:moulding;s=IMM1.Run: servis hatasi BadUserAccessDenied(0x801F0000)
RUN_A:PRO.opc(1).pro.out: [0] -> @pro : Hata(ERR_COMMON_INVRESP)
UA/S00.hlt: sta alarm NORMAL -> EMERGENCY+new [log PANIC +1] (sta=0x034F)
```

### 6. An array, and one element of it

`BarrelTemp` is a `Double[4]` on the machine. What an array becomes is
decided by the point's **declared type**:

| point | class | what it holds |
|---|---|---|
| `ZONES` | `cls_XA` — text, `pro_typ="0x1401"` | the whole array as JSON text, `[199.7,209.7,219.6,229.6]` — the page `JSON.parse`s it for the four bars |
| `Z4` | `cls_XD` — Double, with `pro_rng="3"` | one element (IndexRange, from 0): `229.6` — a point like any other, for limits and alarms |

The asyncua server ignores the IndexRange and sends the whole array; the
engine applies the range itself and says so, once per session:

```
Z4:PRO.opc.read nsu=urn:aymon:examples:moulding;s=IMM1.BarrelTemp: the server ignored IndexRange '3' and sent Double[4] -- the engine applied the range itself (said once per session)
```

### 7. What the machine has

Once `CN_UA` is up, `main.browse` asks `OPC.browse` for the children of
`IMM1` (10 nodes: 8 variables and 2 methods — the page lists them; this is
where every `pro_adr` came from), and `OPC.gen` writes a draft of the
`<bi>`/`<io>` block to `log/IMM1_generated.xml`: 1 `<bi>`, 8 `<io>`, each
typed by reading the variable once, addressed by `nsu=`. The classes it
names — `cls_XI`, `cls_XB`, `cls_XD`, `cls_XU`, `cls_XS`, `cls_XA` here — are
all defined in `db_UA.xml` (with `cls_XL` / `cls_XUL` for 64-bit integers),
so the block pastes under a `<dev>` as it is.

## The machine

`opc.tcp://127.0.0.1:4840/moulding/`, under `Objects/Moulding/IMM1`:

| Node | Type | |
|---|---|---|
| `State` | Int32 | 0 STOPPED, 1 HEATING, 2 RUNNING |
| `Run` | Boolean | writable — start / stop |
| `MouldTempSP` | Double | writable — mould temperature setpoint, °C |
| `MouldTemp` | Double | follows the setpoint while running |
| `BarrelTemp` | Double[4] | the barrel's four heating zones, 200–230 °C running |
| `CycleTime` | Double | the last cycle, s: 4 s at 40 °C, 0.05 s longer per degree above |
| `CycleCount` | UInt32 | shots since the last reset |
| `Job` | String | |
| `ResetCounter()` | method | → the count before the reset (UInt32) |
| `SetJob(String)` | method | |

It runs when it is hot: from cold with the setpoint at 40 °C it reached
RUNNING 30 s after Start.

## What the log looks like

```
UA/S00:UA: no certificate yet - making one
UA/S00:OPC.cert: uretildi. cert='C:\AyMON\demo\PRJEDU_opcua\db\pkiymon_cert.pem' key='...ymon_key.pem' uri='urn:AyMON:PRJEDU_opcua' ...
UA/S00:IMM:PRO.opc(1).connect: oturum etkin
UA/S00:IMMP_SUB:PRO.opc(1).sub: abonelik 78 kuruldu — periyot 100 ms, keepalive 20
UA/S00:IMMS:PRO.opc(1).session: reddedildi 0x801A0000
UA/S00:IMMS:PRO.opc(1).connect: oturum etkin
UA/S00:UA: request sp -> OK: wrote 70
UA/S00:UA: request reset -> OK: ResetCounter() -> {"ok":true,"out":[{"i":0,"typ":"UInt32","val":0}]}
```

(`oturum etkin` = session active, `abonelik ... kuruldu` = subscription set
up, `reddedildi` = refused.) CTRL-C stops the engine with exit code 0 on
both platforms; the subscription's Publish, cut short, leaves one
`IMMP_SUB ... ERR_CONNECT_0000` line as it goes.

## A real machine instead

1. Set `con_host`, `con_port` and `pro_adr` (the endpoint URL, exactly as the
   machine's documentation or UaExpert shows it) on the three `<dev>`s.
2. Put the machine's namespace URI and node names in the `<io pro_adr>` —
   `OPC.browse` (or `log/IMM1_generated.xml`, re-made at every start) lists
   them.
3. Copy the machine's certificate into a PEM file and point `pro_trust` at
   it; trust `db/pki/aymon_cert.pem` on the machine, the way its manual says.
4. Its user and password on `<dev id="IMMS">` — and not in clear text in a
   file anyone can read.

## Not in this example

- **Events and alarms** (OPC UA Alarms & Conditions) — the engine does not
  subscribe to them.
- **AyMON as the server.** The engine is an OPC UA client only.

The engine's own guide: `AyPROv43/doc/EN/OPCUA_config.md`.

## What it measured

Engine 4.3.4.494, asyncua 2.0.1, on a Windows 11 laptop and on Linux (WSL,
Ubuntu 22.04, Python 3.11) — every number above is from those runs, except
the two tuning measurements in section 2 marked 4.3.4.485.

## Licence

**Five connections** (three to the machine, the page and its live values)
and one document: inside the **FREE** edition. asyncua is LGPL-3.0-or-later and is
not part of this repository — `setup` fetches it from PyPI.
