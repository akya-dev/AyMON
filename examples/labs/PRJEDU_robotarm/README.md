# PRJEDU_robotarm — a robot arm in a cell

The laboratory of a robotics or automation course, in one engine: a
six-axis collaborative robot arm that picks parts and puts them down, and
the cell controller around it — the part that a PLC or a line controller
does in a real factory.

```bat
run.bat
```

Then open **http://127.0.0.1:8098/** and press **Brake release**, **Load
pick_place**, **Play**, and switch the **feeder** on.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

| Document | Role | What it is |
|---|---|---|
| `ROB/S00` | the **robot**, simulated | a six-axis arm and its controller, built after a Universal Robots UR5e. It speaks the two interfaces a cell usually uses on a real one: the **dashboard server** (text lines, TCP 29999) and the **Modbus TCP server** (registers at UR's addresses) |
| `CEL/S00` | the **cell controller** | a dashboard client and a Modbus client to the robot, the part handshake, a feeder, the rules an operator must not break — and the page |

The cell never reads the robot's document. Everything it knows comes over
the same two connections it would use on a real robot.

## The robot

**The arm.** Six joints with the UR5e's Denavit-Hartenberg parameters.
The tool position is worked out from the joint angles —
*forward kinematics*, `main.fk` in `db_ROB.js`: six 4×4 transforms
multiplied, and the orientation turned into a rotation vector the way UR
reports it. Motion is *joint* motion (`movej`): every joint goes straight
to its target angle, all arriving together; the joint with furthest to go
sets the pace and ramps up and down (60 °/s at most, 120 °/s²).

**The programs are data.** `PROGRAMS` holds them as JSON; `main.run`
steps through them:

| step | does |
|---|---|
| `movej` | move to a waypoint (joint angles, degrees, in `WAYPOINTS`) |
| `wait_reg` / `set_reg` | wait for a register to hold a value / write one |
| `grip` | close or open the gripper |
| `wait` | wait so many seconds |
| `count` | add one to a register |
| `goto` | jump to a step |

The waypoints were found once, offline, by *inverse kinematics*: the joint
angles that put the tool at the pick point (0.40, −0.30, 0.07 m) and the
place point (0.40, 0.30, 0.09 m), pointing straight down. The base goes to
201.4° rather than −158.6°: a `movej` goes the short way round only if the
numbers say so.

**The dashboard** — one command, one reply, both text lines:

| command | reply |
|---|---|
| `power on` / `power off` | `Powering on` / `Powering off` |
| `brake release` | `Brake releasing` |
| `load pick_place.urp` | `Loading program: /programs/pick_place.urp` |
| `play` / `pause` / `stop` | `Starting program` / `Pausing program` / `Stopped` |
| `robotmode` | `Robotmode: RUNNING` (`POWER_OFF`, `POWER_ON`, `IDLE`, `RUNNING`) |
| `safetystatus` | `Safetystatus: NORMAL` (`PROTECTIVE_STOP`, `SAFEGUARD_STOP`) |
| `programState` | `PLAYING pick_place.urp` |
| `unlock protective stop` | `Protective stop releasing` |

These are the replies UR's own client library expects. A new connection is
greeted first — `Connected: Universal Robots Dashboard Server` — and a
client that takes that line for the answer to its first command is off by
one from then on. Power and brakes take time here:
`power on` answers at once, but the mode goes `POWER_ON` and only 2 s later
`IDLE`; `brake release` takes another 1.5 s to `RUNNING`.

**The registers** (holding registers; a real controller serves them on
port 502, this one on 1504):

| register | | |
|---|---|---|
| 128..135 | general purpose | the cell writes 128 (part ready) and 132 (speed %); the robot program writes 129 (parts placed), 130 (gripper), 131 (part taken), 133 (program step) |
| 270..275 | joint positions | mrad, base … wrist 3 |
| 280..285 | joint speeds | mrad/s |
| 400..405 | tool position | x y z in 0.1 mm, rx ry rz in mrad |

Negative values are 16-bit two's complement. The cell turns them into
degrees and millimetres by configuration — `val_cnv_dlt="0.0572958"` on a
joint, `"0.1"` on a coordinate — not by script.

**Safety.** Two things in the world stop the arm, and the page has a
button for each:

- **Walk into the arm** — a collision: `PROTECTIVE_STOP`. The program
  pauses. `unlock protective stop` is refused for 5 s ("Cannot unlock
  protective stop until 5s after occurrence. Always inspect cause of
  protective stop before unlocking"), then `play` resumes where it stopped.
- **Open the guard door** — `SAFEGUARD_STOP` while it is open. The program
  pauses; close the door and `play` again.

## The cell

**The handshake.** The robot program and the cell agree through general
purpose registers, the way a PLC and a robot program do:

```
cell   128 = 1   a part is ready at the pick position
robot  131 = 1   I have taken it
cell   128 = 0   seen
robot  131 = 0   seen - and off to put it down
```

Each side acts only on the other's register, so a handshake cut in the
middle (a stop, a reconnect) is never ambiguous. The cell counts a part as
gone on the *edge* of 131 (0 → 1): its level lasts several polls and each
would count it again.

**The feeder** brings a part every `FEED_S` (6) seconds; up to four wait
on the infeed. The cell times every part put down (`CYCLE_S`) and keeps
parts a minute over the last five (`RATE`).

**The rules live in the cell, not in the page.** `play` only when the
robot is `RUNNING` and its safety `NORMAL`; `power off` not while a
program plays; commands the dashboard does not have are refused before
they are sent. The page may write `CMD`, `FEED` and `SPEED` only
(`xdb_acl`); the robot's own safety is the robot's — the cell shows it
(`SAFETY_CODE`, an alarm) and never clears it by itself.

**The dashboard queue.** One command at a time, one reply each: commands
wait in `QUEUE`, `BUSY` is the one waiting for its reply (2 s at most).
Once a second the cell asks `robotmode`, `safetystatus` and
`programState`; an operator's `pause` or `stop` goes to the front.

## The page

- the arm from above and from the side, drawn from the six joint angles by
  the same forward kinematics, with the tool position the robot reports as
  a dot (they should agree) and a trail of where the tool has been
- the robot's buttons, the cell's feeder and speed, the handshake
  registers as lamps, the world's two buttons
- the joints with their speeds, the tool position, and the dashboard
  conversation: every operator command and the robot's reply

## Real hardware

> **Status.** Nothing in this section has been run against URSim or a
> real robot yet. The interfaces are UR's published ones and the
> simulated robot answers the way they do (see *What it measured*); the
> program below is written from UR's script manual, not tested on a
> controller.

### What the simulation stands for

| In the example | In a real cell | Connected to |
|---|---|---|
| `ROB/S00`, the arm and its controller | a **Universal Robots** cobot — UR3e / UR5e / UR10e (e-Series) or UR3 / UR5 / UR10 (CB3) — or **URSim**, UR's free simulator | Ethernet: the dashboard server (TCP 29999) and the Modbus TCP server (TCP 502) of the control box |
| the program `pick_place.urp` in `PROGRAMS` | a program on the robot (the script below) | runs in the robot's controller, not in AyMON |
| `GRIP`, register 130 | a gripper on the tool flange: a vacuum cup or a simple pneumatic gripper on a tool digital output, or an electric one (Robotiq 2F-85, OnRobot RG2 …) with its URCap | the robot's tool connector |
| `BUMP` (walk into the arm) | the robot's own force and power limiting: a collision is a protective stop | inside the robot; nothing to wire |
| `DOOR` (the guard door) | a safety door switch (two channels) | the robot's **safeguard stop** safety input — never through AyMON |
| the feeder and "a part is ready" (register 128) | a conveyor or a parts tray, and a part-present sensor (a 24 V PNP photoelectric sensor) | today: the cell's timer; see *The feeder* below |
| `CEL/S00`, the cell controller | AyMON on a PC, an industrial PC or a Raspberry Pi | the same network as the robot |

The robot is the only expensive part. For a course, **URSim is the way to
start**: it is the real controller software with the arm simulated, it
answers on the same two ports, and it costs nothing. A desk-top arm from
another maker (Dobot, uFactory, Elephant Robotics …) is **not** a drop-in
replacement: none of them speaks UR's dashboard or UR's register map, so the
cell would need its own connection for it.

### The network

```
 AyMON (CEL/S00)                                     UR control box
 PC / Raspberry Pi  --Ethernet--  switch  --Ethernet--  LAN port
 192.168.1.10                                        192.168.1.20
                                                     29999 dashboard server
                                                       502 Modbus TCP server

 on the robot's own I/O, not AyMON's:
   tool connector     gripper (tool digital output 0, or the gripper's URCap)
   safety inputs      guard door switch -> safeguard stop (2 channels)
                      emergency stop button
```

The addresses are examples: give the robot a fixed address
(*Settings → System → Network* on the pendant) in the same subnet as the
machine AyMON runs on.

### Setting up the robot

1. **URSim** (no robot): UR's Docker image `universalrobots/ursim_e-series`,
   with the ports published —
   ```bash
   docker run --rm -it -p 6080:6080 -p 29999:29999 -p 502:502 universalrobots/ursim_e-series
   ```
   The pendant opens in a browser at `http://localhost:6080/vnc.html`.
   The robot's address is then the address of the machine running Docker.
2. **e-Series (and URSim e-Series): remote control.** In *Local* mode the
   dashboard refuses `power on`, `brake release`, `load` and `play` —
   only questions are answered. Turn it on once under *Settings → System →
   Remote Control*, then switch the pendant to *Remote* (top right). CB3
   robots have no such mode.
3. **Services and firewall.** Newer PolyScope versions can switch the
   dashboard server and the Modbus TCP server off and close ports
   (*Settings → Security*). Both must be on, and 29999 and 502 open to the
   address AyMON runs on.
4. **The gripper** and the **guard door** are wired and configured the way
   the robot's manual and the gripper's maker say. The cell only shows the
   robot's safety state (`SAFETY_CODE`); it never clears it.

### The program on the robot

Create `pick_place.urp` on the pendant with one *Script* node that runs
this file (save it as `pick_place.script` in `/programs`). The registers are
the contract with the cell; how the robot moves between them is the
robot's business.

```python
# pick_place.script - PRJEDU_robotarm's program for a real UR (URScript).
# The waypoints are the SIMULATOR's: they assume no gripper and the
# simulator's table. TEACH YOUR OWN before the first run (see below).
def pick_place():
  ready       = [d2r(162.8), d2r(-95.1), d2r(115.4), d2r(-110.3), d2r(-90), d2r(-107.2)]
  pick_above  = [d2r(127.7), d2r(-81.0), d2r(117.4), d2r(-126.4), d2r(-90), d2r(-142.3)]
  pick        = [d2r(127.7), d2r(-58.9), d2r(124.4), d2r(-155.5), d2r(-90), d2r(-142.3)]
  place_above = [d2r(201.4), d2r(-81.0), d2r(117.4), d2r(-126.4), d2r(-90), d2r(-68.6)]
  place       = [d2r(201.4), d2r(-61.8), d2r(124.3), d2r(-152.4), d2r(-90), d2r(-68.6)]
  acc = 2.09                          # rad/s2 = 120 deg/s2, as the simulator

  def vel():                          # register 132 = the cell's speed %, 10..100
    s = read_port_register(132)
    if s < 10:
      s = 10
    elif s > 100:
      s = 100
    end
    return 1.05 * s / 100             # rad/s; 1.05 = 60 deg/s at 100 %
  end

  def grip(on):                       # a vacuum cup / simple gripper on tool output 0;
    set_tool_digital_out(0, on)       # a Robotiq or OnRobot gripper: its URCap's calls
    if on:
      write_port_register(130, 1)
    else:
      write_port_register(130, 0)
    end
  end

  movej(ready, a=acc, v=vel())
  while True:
    movej(pick_above, a=acc, v=vel())
    while read_port_register(128) != 1:   # wait: a part is ready
      sync()
    end
    movej(pick, a=acc, v=vel())
    grip(True)
    sleep(0.5)
    write_port_register(131, 1)           # I have taken it
    movej(pick_above, a=acc, v=vel())
    while read_port_register(128) != 0:   # wait: the cell has seen it
      sync()
    end
    write_port_register(131, 0)
    movej(place_above, a=acc, v=vel())
    movej(place, a=acc, v=vel())
    grip(False)
    sleep(0.3)
    write_port_register(129, read_port_register(129) + 1)   # parts placed
    movej(place_above, a=acc, v=vel())
  end
end
```

**Teach the waypoints first.** The simulator's angles put the *flange* at
7 cm above its table; a gripper is longer than that, so on a real robot the
first `movej(pick)` would drive the gripper into the table. Set the tool
(TCP and payload) for the gripper on the pendant, move the arm by hand to
each of the five positions at low speed, and paste the joint angles the
pendant shows. Run the first cycles at 10–20 % speed.

The simulated program also writes the step number into register 133; this
one does not, so the cell's `PSTEP` stays 0.

### The feeder

The cell's feeder is a timer: every `FEED_S` seconds it decides a part
has arrived and writes register 128. With a real arm that means a part
must really be there — a person puts one on the pick position each time
(raise `FEED_S` to give them time), or the timer is replaced by a
part-present sensor. Reading such a sensor (on a Modbus TCP remote I/O
module, or on one of the robot's configurable inputs, which its Modbus
server also shows) is **not in this example**.

### Pointing the cell at it

1. In `db/db_CEL.xml`: `CN_DASH` → `con_host` = the robot's address;
   `<dev id="ROBOT">` → `con_host` = the same address and `con_port="502"`.
2. In `db/AyXDB.xml`: switch the simulated robot off —
   `<doc id="ROB/S00" sta="0x0000" ...>`.
3. Start the example and use the page as before: **Brake release**,
   **Load pick_place**, **Play**, feeder on.

A real robot needs a risk assessment of the whole cell, and its own safety
system does the stopping. Nothing in AyMON replaces either.

## What it measured

On a Windows 11 laptop, engine 4.3.4.464, and on Linux (WSL, Ubuntu 22.04):

| | |
|---|---|
| time per part, speed 100 % | **8.72 s** on average (8.32 … 8.98, nine parts) — **6.9 parts a minute** |
| time per part, speed 50 % | **11.63 s** (six parts) — 5.2 a minute. Not twice as long: the gripper's waits and the handshake do not slow down, and short moves spend most of their time accelerating |
| the feeder (a part every 6 s) against the robot (one every 8.7 s) | the infeed fills up to its four and stays there: the robot is the bottleneck |
| the tool at the waypoints, as the robot reports it | (400.1, −299.6, 69.9) mm at the pick point (target 400, −300, 70); the lowest the tool went in 170 s: 69.9 mm |
| the dashboard | 492 status questions in 170 s, **0** replies missing; a question takes about 80 ms from sending to its reply |
| protective stop | unlock 2 s after the stop refused (the reply above); unlock after 5 s accepted, `play` resumed at the step it had stopped at |
| safeguard stop | `play` with the door open refused by the cell ("play needs safety NORMAL"); door closed, `play`, the program went on |
| the engine | 16 % of one core, 31 MB — the robot's 20 steps a second (forward kinematics, the program, 24 registers) and the cell's four polls every 100 ms |
| FREE edition | the same run with no licence: six connections, all working |
| Linux | the same startup, the same 8.7 s per part, 0 missing replies |

Five things the measuring found, all fixed before this was written — and
worth knowing for any script you write:

- **`Time.GetTimeMs()` is an unsigned 64-bit integer.** `now - t` with a `t`
  another thread wrote a moment after `now` was read is not −5 but
  18 446 744 073 709 551 611. The cell's reply timeout fired 15 ms after a
  question, and every answer after it went to the wrong question. Both
  documents now read the clock as a float: `0.0 + Time.GetTimeMs()`.
- **`9003 / 60000.0` is 0** when 9003 is an integer: the left operand
  decides the arithmetic. Parts a minute stayed at 0 until the
  subtraction was made a float too.
- **`val_fnc` does not run on an element whose `val_typ` has no function
  bit** (`0x1000`, `0x2000` or `0x3000`): `0x0401` stores the page's command
  and runs nothing, `0x1401` runs `main.on_cmd`.
- **`PRO.out` sends nothing for a value that arrived from a poll** — so the
  cell does not write register 128 from the poll's own `pro_fnc` chain but
  from its timer — and **the address it writes is the block's `pro_ado`
  plus the `<io>`'s** (128 + 0, not 128 + 128).
- **A local attribute (`val_typ` 0x4…) refuses a write that came in from
  another document**, without a word. The page writes `ROB/S00/BUMP` through
  the cell's MQTT connection; `main.on_bump` then could not write the stop
  time into a local `PSTOP_MS`, and the 5-second rule never held. It is not
  local now.

## Try this

| Do | See |
|---|---|
| **Play** before **Brake release** | the cell refuses it: the robot is not `RUNNING`. Ask the robot directly (take the rule out of `main.on_cmd`) and it answers `Failed to execute: play` |
| **Walk into the arm**, then **Unlock** at once | the robot refuses for 5 s. Why would a robot maker insist on that? |
| the speed slider to 30 % | time per part and parts a minute. Which moves get slower, and which do not? |
| the feeder: `FEED_S` 12 in `db_CEL.xml` | now the robot waits for parts: `wait_reg 128` holds it above the pick point. What is the best `FEED_S` for this robot? |
| move the place point | work out new joint angles for another point (the inverse kinematics of a UR5e is a classic exercise), put them in `WAYPOINTS`, and watch the tool position the robot reports |
| a keep-out plane | lower the pick waypoint until `TCP_Z` falls below 50 mm: the cell's warning (`ALM.onlvl` on `TCP_Z`). Should the cell only warn, or pause the robot? |
| a second program | `home.urp` is there; write `place_stack.urp` that puts each part a little higher than the last |

## Licence

Six connections (two in the robot, four in the cell) and three documents:
**exactly the FREE edition's limit**; it runs without a licence.
