# PRJEDU_plc — a PLC program for a bottle filling line

The laboratory of an automation course, in one engine: a filling machine
whose signals arrive over a fieldbus, a PLC program that runs it, and an
HMI to operate it from.

```bat
run.bat
```

Then open **http://127.0.0.1:8093/** and press **START**.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

| Document | Role | What it is |
|---|---|---|
| `PLT/S00` | the **machine** | a conveyor, bottles, a filling nozzle, two photo-eyes, a level switch, a supply tank and the operator's buttons. Its signals are a **remote I/O**: four Modbus TCP holding registers on `127.0.0.1:1503` |
| `CTL/S00` | the **PLC** | polls the remote I/O every 100 ms, runs its program every 100 ms, writes the outputs back as one register. And the HMI page |

The PLC never reads the machine's document. Everything it knows comes over
Modbus, as it would from a real remote I/O. Point `<dev id="RIO">` at a real
one and the program does not change.

## The machine

```
entry        filling position              exit
x = 0 ...... x = 100 (nozzle, PE_FILL) .... x = 150 (PE_EXIT) .... 170
============ conveyor, 10 cm/s ============
                    |
              [ supply tank ]
```

| Register | Bits |
|---|---|
| 0, inputs | 0 `PE_FILL` bottle under the nozzle · 1 `LS_FULL` bottle full (92 %) · 2 `PE_EXIT` · 3 `ESTOP_OK` · 4 `START` · 5 `STOP_OK` · 6 `RESET` · 7 `TANK_LOW` (under 15 %) |
| 1 | level of the bottle at the nozzle, 0.1 % |
| 2 | supply tank, 0.1 % |
| 3, outputs (the PLC writes) | 0 conveyor · 1 valve · 2 RUN lamp · 3 FAULT lamp · 15 **life bit** |

* The nozzle hits a bottle's mouth only within 3 cm of it. Anywhere else the
  product goes on the floor. `PE_FILL` sees exactly those 3 cm, no more: the
  PLC's valve interlock trusts it, so `PE_FILL` = 1 has to mean "the nozzle
  would fill this bottle" (see "What it measured" for what happened when the
  beam reached 1 cm further).
* A bottle that leaves with 90 % or more is **good**, anything less a
  **reject**. Past 100 % it **overflows**.
* The supply tank empties by 2 % per bottle.
* STOP and EMERGENCY STOP are **normally closed** contacts, as on every real
  machine: the input is 1 while all is well, so a cut wire stops the machine
  instead of hiding the button.
* The remote I/O has a **fault state**: if the PLC's life bit stops flipping
  for 1.5 s, every output goes off.

## The program

`main.scan` in `db\db_CTL.js`, once every 100 ms, top to bottom, like a PLC
scan: read the input image, run the program, write the output image. The
program is a **step sequence**, the SFC / GRAFCET of the course:

| Step | Outputs | Next when |
|---|---|---|
| 0 IDLE | all off | START (rising edge) → 1 |
| 1 CONVEY | conveyor | bottle at `PE_FILL` → 2 |
| 2 POSITION | — | 0.3 s → 3 |
| 3 FILL | valve | `LS_FULL` → 4 · 10 s without it → FAULT · the bottle gone → FAULT |
| 4 DRIP | — | 0.5 s → 5 |
| 5 RELEASE | conveyor | the bottle has left `PE_FILL` → 1, or 0 after STOP |
| 8 FAULT | FAULT lamp flashing | RESET → 0 |
| 9 E-STOP | FAULT lamp steady | pulled out, then RESET → 0 |

Around the sequence, the things a PLC program is judged on:

* **Edges.** START and RESET act on the moment they are pressed, not for as
  long as they are held. The program keeps last scan's inputs (`M_START`,
  `M_RESET`) and compares.
* **An interlock.** The valve output is `step 3 AND a bottle under the nozzle`,
  whatever the sequence says. A bug in the sequence cannot open it over an
  empty conveyor. It is only as good as the sensor it trusts: in the first
  version of this example the photo-eye saw further than the nozzle reached,
  and the interlock let the valve pour beside a bottle.
* **STOP finishes the bottle** under the nozzle, then stops. **EMERGENCY STOP**
  stops everything at once and needs a RESET after it is pulled out.
* **Each end watches the other.** The PLC faults when the remote I/O has not
  answered for 1 s (`T_WATCHDOG`). The remote I/O switches its outputs off
  when the PLC's life bit stops flipping for 1.5 s. Without the second, a cut
  cable leaves the valve open. The first version of this example had only the
  PLC's watchdog, and a pulled cable overflowed a bottle and put 594 bottle-%
  on the floor before anyone noticed.
* **The engine takes the input word apart**, not the program: each input is
  an `<io>` with a bit address (`pro_adr="0.3"` is register 0, bit 3), so the
  program reads `I_ESTOP_OK`, not `register 0 AND 8`.

## What the HMI shows

* **The line**: bottles with their fill level, the nozzle and its stream, the
  photo-eyes' beams, the tank, the lamps, and the remote I/O's fault state.
* **The machine's panel**: START, STOP, RESET and a latching EMERGENCY STOP.
  On the bench, three things a real machine does to you: refill the tank, pull
  the fieldbus cable, change the conveyor speed.
* **The program**: the step sequence with the active step lit, how long it has
  been there, whether a STOP is pending, and the fault.
* **I/O monitor**: every input and output bit as the PLC sees it, and the two
  analog values.
* **Production**: bottles filled (the PLC's count), good, reject, overflow,
  spilled (the machine's), and the cycle time.

The page opens **two** live connections: the PLC's (8093, the page's own
server) and the machine's (8094). Each document publishes only its own
changes, so the page listens to both. A browser may open a WebSocket to any
port.

## What it measured

| Run | What happened |
|---|---|
| START, 70 s (engine 4.3.4.467, the first version) | CONVEY → POSITION → FILL → DRIP → RELEASE, about 9 s a bottle, bottles stopped at x = 98 (within the nozzle's 3 cm). 7 bottles filled, 6 out as good, no reject, no spill, no overflow, 8.7 s per bottle |
| the first version, START, 20 runs of 40 s (engine 4.3.4.494, Windows, the page's two live connections open) | its photo-eye reached 4 cm, the nozzle 3. Of 95 stops, 3 were at **x = 97**, 66 at 98, 24 at 99, 2 at 100. At 97 the beam saw the bottle and the nozzle missed it: for the PLC a bottle was under the nozzle, so FILL opened the valve and the interlock let it, the product went on the floor (200 bottle-% in 10 s), and the line faulted with `not full after 10 s - is the supply tank empty?` although the tank was nearly full. Each time the PLC had reacted *inside one machine step*: poll, scan and output write in the same millisecond, the conveyor off before the bottle moved again. A fast reaction, not a slow one - nothing in the engine was out of order. On Linux (15 runs) the reaction never came inside one step: 75 stops, 66 at 98, 9 at 99 |
| this version, the same 20 runs | the photo-eye sees what the nozzle reaches. 100 stops: 3 at x = 98, 72 at 99, 20 at 100, 5 at 101 - every one under the nozzle. 80 bottles filled, 60 out as good, no reject, no spill, no overflow, no fault. Linux, 15 runs: 75 stops, 68 at 99, 7 at 100; 60 filled, no reject, no spill, no overflow, no fault, 8.4-8.8 s per bottle |
| STOP while filling | the bottle under the nozzle was finished, then IDLE |
| EMERGENCY STOP while running | everything off at once. START while it was pressed did nothing; pulled out + RESET + START ran again |
| supply tank at 3 % | `not full after 10 s - is the supply tank empty?`. Refill + RESET + START finished the half-filled bottle and ran on |
| conveyor 40 cm/s | the bottle overshot the photo-eye while the PLC reacted, and left the nozzle during FILL: `the bottle left the nozzle while filling` |
| pull the fieldbus cable while filling | the PLC faulted after 1.1 s (`no answer from the remote I/O for 1 s`), the remote I/O switched all outputs off after 1.4 s. No overflow, nothing spilled. Plugged back in: the outputs followed the PLC again, RESET + START ran on |
| the page writes `STEP` or `Q_WORD` | refused, and logged: `CTL/S00:STEP.val: xdb_acl yazma reddetti (rol 0)` |

## Try this

| Do | See |
|---|---|
| **START**, watch a few bottles | the step sequence lighting up, and the I/O monitor following the machine |
| **STOP** while a bottle fills | the RUN lamp flashes. The bottle is finished, then the line stops |
| **EMERGENCY STOP**, then START | nothing. Pull it out: still nothing until RESET |
| conveyor **40 cm/s** | the PLC's reaction time is a distance. At 10 cm/s the beam sees the bottle at x = 98 and it stops at 98 to 101 (mostly 99), still under the nozzle. At 40 cm/s it moves 4 cm a machine step. What is the fastest speed that works? |
| **pull the fieldbus cable** while filling | the PLC faults after 1 s, the machine's outputs go off after 1.5 s. Plug it back in, RESET, START |
| let the tank run dry | the fill timeout. Refill, RESET, START |
| remove `&& pe_fill` from the valve line in `main.scan` | the machine runs exactly as before: this sequence never reaches FILL without a bottle. So why is the interlock there? (Think of the next person who edits the sequence.) |
| add a step | a capper after the filler, or count bottles into cases of six and pause the line for the case change |

## Real hardware

> **Status.** Not tried with real I/O. The PLC program is the same; what
> changes is where its inputs come from.

The machine reaches the PLC as a **remote I/O**: a box on the network with
digital inputs and outputs, polled over Modbus TCP. That is a real class of
device, and the cheapest way to put real buttons and lamps in front of this
program.

### What to get

| What | Examples | Rough cost (2026) | Note |
|---|---|---|---|
| a **Modbus TCP remote I/O module**, 8+ DI, 4+ DO, 24 V | Moxa ioLogik E1212, Advantech ADAM-6050, a WAGO 750 fieldbus coupler with DI / DO modules; on a budget, a Modbus "ETH relay" board with digital inputs | $60–400 | the machine's signals |
| an **analogue input** (optional) | a 4–20 mA / 0–10 V input module | $100–300 | for the two levels (registers 1, 2); without one, keep them simulated |
| a **24 V DC supply**, buttons, lamps | START (normally open), STOP and EMERGENCY STOP (**normally closed**), RESET, two pilot lamps | $50–100 | a training panel; any electrical supplier |
| sensors | a 24 V PNP photoelectric sensor for each photo-eye, a level switch | $20–60 each | |
| the conveyor and the valve | a small 24 V conveyor or a motor through a relay; a 24 V solenoid valve | | the outputs switch them through relays — never straight from the module if it cannot carry the current |

An emergency stop that matters is **wired**, through a safety relay that
cuts the motor's power — not read by a program. The `ESTOP_OK` input here
only tells the PLC it happened.

### How it connects

```
 buttons, photo-eyes, level switch --24 V--> DI of the remote I/O
 relays: conveyor, valve, lamps    <--24 V-- DO of the remote I/O
 remote I/O --Ethernet-- switch -- PC / Raspberry Pi (AyMON, CTL/S00)
```

### Pointing the PLC at it

The example's remote I/O packs everything into four holding registers (the
table in *The machine*): the inputs as bits of one word, the outputs as
one word `Q_WORD` the program writes whole (function 6). A real module has
its own map, in its manual. In `db/db_CTL.xml`:

1. `<dev id="RIO">`: `con_host` = the module's address, `con_port="502"`,
   `pro_adr` = its unit id.
2. **A module whose I/O can be read and written as register words** (a WAGO
   coupler's process image is): point `RIO_BLK`'s `pro_adr` / `pro_fni` at
   the input word and `Q_WORD`'s `pro_adr` / `pro_ado` at the output word,
   and wire the terminals in the order of the bit table. The program does
   not change.
3. **A module with discrete inputs and coils only**: the inputs become a
   block with `pro_fni="2"` and one `<io>` per input; the outputs become one
   `<io>` per coil (`pro_fno="5"`), and `main` writes those instead of
   `Q_WORD` — a change in the program, not only in the XML.
4. The two levels (registers 1 and 2): an analogue input's register, with
   `val_cnv_dlt` set for its range; without one, delete the two `<io>`s
   and the program's level checks.
5. Switch the simulated machine off: `<doc id="PLT/S00" sta="0x0000" ..>`
   in `db/AyXDB.xml`.

The **life bit** (output 15) is the simulated module's own fault state. A
real module has a *watchdog* of its own (outputs off when the master stops
talking): turn it on in the module's settings — it does the same job.

## Licence

Six connections (three in each document) and three documents: **exactly the
FREE edition's limit**.
