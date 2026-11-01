# PRJEDU_modbus — Modbus TCP, both ends, no hardware

One engine, one command, real Modbus frames on a loopback socket:

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8103/** — the monitoring side's page: the
tank with its limits, the three bits of the status register as lamps, a
trend, and every point as the wire sent it (`pro`) next to what it means
(`val`) and its alarm state.

Two documents in the same process talk to each other:

| Document | Role | What it is |
|---|---|---|
| `PLC/S00` | Modbus **slave** | the plant. Listens on `127.0.0.1:1502`, answers for unit 1, serves four holding registers that a timer keeps moving. |
| `MON/S00` | Modbus **master** | the monitoring side. Polls those registers once a second and turns them into engineering values with limits and alarms. |

Read `db\db_PLC.xml` first if you are putting AyMON **where a device used
to be**, `db\db_MON.xml` first if you are **reading a device that already
exists**. They are the same four levels seen from opposite ends.

## What it teaches

* the four levels every AyMON project has — `<con>`, `<dev>`, `<bi>`, `<io>`
* that the **block** is the unit of communication and the **point** is the
  unit of meaning: 50 registers in one `<bi>` is one frame, 50 separate
  `<bi>` is 50 frames for the same data
* **what `pro_len` counts**: elements of the block's own `pro_typ`. With
  `pro_typ="0xD412"` (a buffer of 16-bit units) `pro_len="4"` is four
  *registers*; with `pro_typ="0xD411"` (bytes) the same block is
  `pro_len="8"` and every `<io>` address below becomes a byte offset too
* **bit addressing**: `pro_adr="2.1"` is register 2, bit 1 — the same unit
  as `pro_len`, so absolute bit 2×16+1 of the block. Three points in this
  example take three bits out of one status register with no script
* that `pro` is the **wire** value and `val` is the **meaning**; nothing
  crosses between them until `pro_fnc="[VAL.put]"` says so
* that scaling, rounding, clamping and alarms are **configuration**
  (`VAL.cnv`, `ATR.rou`, `ATR.lmt`, `ALM.onlvl`), not script
* that plain Modbus is not a licensed feature — all of this runs unlicensed

## The page

`MON/S00` serves it itself, with two more connections: `CN_WEB` (HTTP, the
files in `www\`) and `CN_LIVE` (MQTT inside a WebSocket on the same port,
`/mqtt`). The page subscribes to `MON/S00/+/val`, `/pro` and `/sta`; the
engine answers with the current value of every `<io>` at once and then
sends each change. It only reads: `xdb_acl="0xFFFFFFF1"` on the document
gives a page that did not log in (a Guest) read and nothing else. Both
listen on `127.0.0.1` only (`con_acl`).

`www\kit.js` is the small toolkit the example pages share (connect,
subscribe, what a `sta` word says, a trend chart); `wwwpp.js` is this
page.

## The register map

Unit 1, holding registers, served by `PLC/S00`:

| Register | Meaning | Raw | Engineering |
|---|---|---|---|
| 0 | tank level | 0..1000 | 0..100 % (×0.1) |
| 1 | temperature | 160..340 | 16..34 C (×0.1) |
| 2 | status word | bit0 pump, bit1 valve, bit2 high temp | three `<io>` |
| 3 | pump hours | counts up | h |

Scaled integers, because a Modbus register is 16 bits and has no decimal
point. Turning them back into engineering values is `val_cnv_dlt` in
`db\db_MON.xml` — one attribute per point.

## What the log looks like

```
PLC/S00:PLC: Modbus TCP slave on 127.0.0.1:1502, unit 1, holding registers 0..3
MON/S00:MON: polling unit 1 at 127.0.0.1:1502, holding registers 0..3, once a second
MON/S00:MON: pump STARTED
MON/S00:MON: level 79 %, temp 33.3 C, pump on, valve shut, hot 1, level sta 0x0303
```

Turn `xdb_log` up to `7` on the `<xdb>` root **and** on the `<con>`,
`<dev>` and `<bi>` you care about, and the frames themselves are in the
log — both sides of them:

```
MON/S00:TANK_BLK:PRO.modbus(1).M-Q[...]: 00 04 00 00 00 06 01 03 00 00 00 04
PLC/S00:CN_PLC:PRO.modbus(1).SLV-I[...]: 00 04 00 00 00 06 01 03 00 00 00 04
PLC/S00:modbus.MAS-Q[...]: 00 04 00 00 00 0B 01 03 08 02 63 01 34 00 01 00 05
MON/S00:TANK_BLK:PRO.modbus(1).M-R[...]: 00 04 00 00 00 0B 01 03 08 02 63 01 34 00 01 00 05
```

The file threshold and the element detail are two different settings: the
root's `xdb_log` decides what the file accepts, each element's `xdb_log`
decides how much that element produces. Raising only one of them changes
nothing.

## Pointing it at a real device

### What to get

Modbus is the cheapest way to real field data. Any of these will do:

| What | Examples | Rough cost (2026) | Interface |
|---|---|---|---|
| a **PLC** with a Modbus TCP server | Siemens S7-1200 (`MB_SERVER`), Schneider M221, a WAGO controller, CODESYS on a Raspberry Pi | $150 and more | Ethernet, port 502 |
| a **remote I/O module** | Moxa ioLogik E1200, Advantech ADAM-6000, a WAGO fieldbus coupler | $150–400 | Ethernet, port 502 |
| an **energy meter** | Eastron SDM120 / SDM630, and most panel meters | $30–150 | RS-485, Modbus **RTU** |
| a **temperature / humidity sensor** | RS-485 sensors sold as "Modbus RTU SHT20 / SHT30" | under $20 | RS-485, Modbus RTU |
| for RTU: a **USB–RS-485 adapter** or a **gateway** | an FTDI-based adapter with automatic direction; or a Modbus TCP–RTU gateway (Moxa MGate, USR-TCP232) | $10–40 / $50–300 | USB / Ethernet |

**Modbus RTU** (RS-485) needs only the connection to change:
`<con xdb_fnc="[CON.ser,PRO.modbus]" pro_mod="RTU" con_port="COM5"
con_spd="9600" con_par="N" con_bits="8" con_sbit="1" ..>` — on Linux
`con_port="ttyUSB0"` (or a Raspberry Pi RS-485 HAT's `ttyAMA0`). The
device's address goes in `<dev pro_adr>`. Wire A to A and B to B, a 120 Ω
terminator at both ends of a long line, and set the device's speed and
parity to the same values. A gateway instead turns RTU into TCP, and then
nothing but `con_host` changes. The serial port is used in the field on
Windows; on Linux it has not been run against a real device yet.

The register map is the device's: its manual lists the registers, their
function code (3 holding, 4 input) and their scaling. An energy meter
usually gives its values as 32-bit floats over two registers.

### Changing the example

Change `con_host` and `con_port` on `<dev id="TANK">` in `db\db_MON.xml`,
and `pro_adr` to its unit id. Then set `sta="0x0000"` on `<doc id="PLC/S00">`
in `db\AyXDB.xml` so the simulated plant stays out of the way. Nothing else
in `db_MON.xml` is about the simulator.

The other direction works as well: leave `PLC/S00` running and point any
Modbus master (a SCADA package, `mbpoll`, a PLC) at `127.0.0.1:1502` —
change `con_host` to `0.0.0.0` first if it is on another machine.
