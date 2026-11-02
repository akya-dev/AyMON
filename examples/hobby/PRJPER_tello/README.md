# PRJPER_tello — fly a Tello drone, or the one in the box

The DJI / Ryze **Tello** is the drone a lot of people learn to program on: it
costs about as much as a textbook, and it speaks a plain-text protocol over
UDP (the *Tello SDK*). This example is a **ground station** for it, with a web
page to fly from, and a **simulated Tello** so it runs with no drone at all:

```bat
run.bat
```

Then open **http://127.0.0.1:8090/** and press **square**.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

| Document | Role | What it is |
|---|---|---|
| `SIM/S00` | the **drone** | a Tello written in script: the SDK's text commands on UDP 8889, a small flight model, the state line to UDP 8890 ten times a second, and after `streamon` a recorded flight as H.264 video to UDP 11111. The same ports and the same bytes as the real one |
| `TEL/S00` | the **ground station** | sends the commands one at a time, reads the state into `<var>` points with alarms, keeps the safety rules, decodes the camera, and serves the page |

To fly a **real** Tello instead, change three connections and switch the
simulator off. See [Flying a real Tello](#flying-a-real-tello), and read the
safety notes there first.

## What you see

* **Seen from above**: the path of the flight. The Tello does not report
  where it is, only how fast it goes, so the page adds the speeds up (dead
  reckoning). With the simulator the square closes exactly. With a real drone
  it drifts, and that drift is the lesson.
* **Attitude, heading, height, battery**: straight from the state line.
  The colours (warning, alarm) are the engine's verdict in `sta`. The page
  knows no limits.
* **Fly**: each button publishes one Tello command to `TEL/S00/CMD/val/set`.
* **Missions**: `square`, `box`, `hop`, `tower`. Each is a list of commands
  in `main.missions()` in `db\db_TEL.js`.
* **Sticks**: keys `W S A D R F Q E` while the page has focus become
  `rc a b c d`.
* **Ground station**: the command waiting for its answer, the queue, the last
  answer, and every decision the ground station made on its own.
* **Camera**: **Video on** sends `streamon`, and the drone's picture appears,
  ten frames a second (see [The camera](#the-camera)).

## What the log looks like

```
SIM/S00:SIM: a Tello on 127.0.0.1 - commands on UDP 8889, state to UDP 8890
TEL/S00:TEL: ground station - Tello commands to UDP 8889, state from UDP 8890
SIM/S00:SIM: <- command   -> ok
TEL/S00:TEL: the drone is in SDK mode
TEL/S00:TEL: link up - state lines arriving
TEL/S00:TEL: mission square: 10 commands queued
SIM/S00:SIM: <- takeoff
SIM/S00:SIM: -> ok (takeoff done)
TEL/S00:TEL: takeoff -> ok (2.0 s)
SIM/S00:SIM: <- forward 100
TEL/S00:TEL: forward 100 -> ok (2.0 s)
TEL/S00:TEL: cw 90 -> ok (1.0 s)
...
TEL/S00:TEL: land -> ok (2.0 s)
```

`takeoff -> ok (2.0 s)`: the answer to a move comes when the move is
**finished**. That one fact shapes the whole ground station.

## What it teaches

**A text protocol, both ends, in script.** The engine has no Tello driver.
Both ends are `PRO.raw` (a connection with no protocol of its own), and a
script decides what the bytes mean. `PRJEDU_snmp` does this for a binary
protocol. The Tello's protocol is text, so the parsing here is `split(";")`.

**A MASTER that does not wait.** `CN_TELLO` is a UDP client that speaks first.
The usual shape is request, then answer, in one exchange. But "takeoff" is
answered five seconds later on a real drone, and nothing should sit blocked
for that. So `main.tello_send` only sends. The answer arrives on its own, the
way unsolicited input reaches any MASTER, and `pro_onparse` hands it to
`main.on_reply`. To send from outside a hook, a script needs the connection's
main session:

```js
var exc = new CON_EXC(evt, xdb.con["CN_TELLO"].get_ses(0));
exc.buf_send.append("takeoff".toS08());
exc.send();
```

**One command at a time.** A Tello refuses a command while a move is running.
So a request does not send, it **queues**. `main.tick` sends the next command
once the drone has answered the previous one, and gives up after a timeout
(3 s for a query, 30 s for a move). `land`, `stop` and `emergency` skip the
queue and empty it. `BUSY` and `QUEUE` are ordinary `<var>`s, so the page
shows them for free.

**The page asks. The engine decides, and that is enforced.**

```xml
<xdb id="TEL/S00" ... xdb_acl="0xFF111111">          everyone reads, a page writes nothing
<var id="CMD"     xdb_acl="0xFF111113" .../>          ... except the three requests
<var id="MISSION" xdb_acl="0xFF111113" .../>
<var id="RC"      xdb_acl="0xFF111113" .../>
```

A page that has not logged in is role 0. It may write `CMD`, `MISSION` and
`RC`, and nothing else. `main.on_cmd` refuses anything that is not a Tello
command. `main.rule_check` refuses a climb past `MAX_H` or a takeoff below
`BAT_TAKEOFF`. It checks just before the command goes out, not when it was
queued, because by then the drone is somewhere else. Publish
`TEL/S00/MAX_H/val/set` or try to fake the height, and the engine refuses the
write. An AI assistant or a second page would get exactly the same treatment:
they all go through `CMD`.

**Rules that nobody asks for.** In `main.tick`, ten times a second:

| Rule | What happens |
|---|---|
| battery at `BAT_LAND` (20 %) in the air | `land` at once, queue emptied |
| nothing sent for 5 s in the air | `battery?`, because a Tello lands by itself after 15 s of silence |
| no state line for 1.5 s | `LINK` goes to alarm, `SDK` to 0, and "command" is asked again every 3 s until the drone is back |

**Telemetry as points.** The state line
`pitch:0;roll:0;yaw:0;...;h:80;bat:87;...` becomes sixteen `<var>`s: the
field name in capitals is the element id. A field nobody declared is
skipped. Alarms are configuration: `ALM.onlvl` on `H`, `BAT` and `TEMPH`
with limits, and `ALM.onin` on `LINK`, the list form of an alarm, for a value
that is a state and not a level.

**A page that joins in the middle.** `pro_retain="1"` on `CN_LIVE` answers a
new subscription with every current value at once, so a page opened
mid-flight shows the drone straight away.

## Try this

| Do | See |
|---|---|
| **tower** | climbs 100 cm at a time. The third climb would pass 300 cm, so the ground station refuses it and says why. The drone never hears of it |
| **forward 100** while on the ground | the **drone** refuses (`error Motor stop`), and the queue is emptied |
| type `dance` in the command box | refused by the ground station: not a Tello command |
| fly, then publish `SIM/S00/DRAIN/val/set` = `8` | the battery falls 8 % a second. At 20 % the ground station lands it. Afterwards **take off** is refused below 25 % |
| publish `SIM/S00/SDK/val/set` = `0` | the drone "reboots": no state, `LINK LOST`, then "command" again, and it is back |
| **hop** with the battery under 50 % | the flip is refused by the drone, and the rest of the plan with it |
| add a mission to `main.missions()` | restart the engine and it is a word you can publish to `MISSION` |

The two `SIM/S00` rows carry the idea: **to test a safety rule, change the
world, not the rule.** The simulator's document carries no `xdb_acl` on
purpose: its `<var>`s (`BAT`, `DRAIN`, `SDK`, `TEMP`, ...) are the knobs. The
ground station's rules stay out of the page's reach.

The page's own MQTT client is `mqtt` in the browser's console:

```js
mqtt.publish("SIM/S00/DRAIN/val/set", "8")
```

## The Tello SDK, in one table

| | |
|---|---|
| UDP 8889 | commands in, answers out. `command` first (SDK mode), then `takeoff`, `land`, `emergency`, `stop`, `up/down/left/right/forward/back 20..500`, `cw/ccw 1..360`, `flip l/r/f/b`, `go x y z speed`, `speed 10..100`, `rc a b c d` (no answer), and the reads `battery?`, `height?`, `temp?`, `time?`, ... |
| UDP 8890 | the state line, about ten times a second, to whoever sent `command` |
| UDP 11111 | H.264 video after `streamon`, to whoever sent `command`: the encoder's bytes in datagrams of at most 1460 bytes, no RTP, no container. The simulator plays a recorded flight (`sim/tello_clip.bin`); the ground station decodes it — see [The camera](#the-camera) |
| answers | `ok`, `error ...`, or the value asked for. A move is answered when it ends |

The simulator implements those, with the SDK's ranges. Where the real
drone's behaviour is not written down, the simulator picks something and
says so in `db\db_SIM.js`. It answers "error" before `command` (a real one
may stay silent), and it lets go of the sticks after one second without a
new `rc`.

## The camera

After `streamon` a Tello sends its camera as H.264 to UDP port 11111 of the
machine that sent `command`. The simulator does the same with a recorded
flight (`sim/tello_clip.bin`: 10 s over a field, 480 x 360, 25 frames a
second, played in a loop), so the camera works with no drone too.

```
SIM/S00  main.video_tick --H.264 in UDP datagrams--> 127.0.0.1:11111
TEL/S00  CN_VID  con_host="udp:127.0.0.1:11111"      decodes every picture
                 con_cam_out="jpeg" con_cam_fps="10"  keeps the newest as JPEG
         CN_WEB  pro_blob="/blob"      GET /blob/TEL/S00/CN_VID/frm?stream=1
page     <img>   an MJPEG stream from the engine's memory
```

* **Windows: nothing to install.** `CN_VID` is a camera connection whose
  source is the UDP port (`udp:`); the engine decodes with Windows' own
  H.264 decoder. Nobody processes the picture; the page streams it.
* **Before `streamon`** the connection just listens. When the pictures stop
  (`streamoff`, the drone gone) it says so once in the log (`lost -- no frame
  for 5 s`) and listens again.
* **Lost datagrams** damage a picture until the next key frame (one a second
  in the recording). On a drone's Wi-Fi some always get lost; the picture
  heals itself.
* The camera counts as one of the FREE edition's two cameras.

### Video on Linux and the Raspberry Pi

The engine has no H.264 decoder on Linux yet: `CN_VID` says so in the log
and the page shows no picture. Python decodes it instead:
`db/tello_video.py` reads UDP 11111 with OpenCV and writes every picture
into `id('VID')/@frm`; `CN_VID` then takes it from there with `link:`, and
the page stays the same.

1. Python 3.11 or 3.13 with its library, numpy and OpenCV:
   ```bash
   sudo apt install libpython3.11 python3-numpy python3-opencv
   ```
   (Raspberry Pi OS Bookworm / Debian 12; on Trixie `libpython3.13`;
   elsewhere `python3 -m pip install opencv-python-headless`.)
2. In `db/db_TEL.xml`: take the `<script id="vid" ...>` element out of its
   comment, and on `CN_VID` set `con_host="link:VID?atr=frm"`.
3. `./run.sh`. The log says `VID: OpenCV ... listening for the camera on UDP
   11111`, and after **Video on** `VID: the camera stream started`.

Tried on Linux (WSL, Ubuntu 22.04, Python 3.11, OpenCV 5.0) with the
simulator. `VID`'s `sta` is RUNNING only while pictures come, so `link:`
waits quietly until `streamon`.

## Flying a real Tello

> **Not verified against a real drone.** This example was written against
> the Tello SDK 2.0 document and tested only with the simulator. The
> protocol is the same text, but the timings, the error texts and the
> state fields of your drone's firmware may differ. Fly it the first time
> with the drone on a table, props off.

**What to get:** a **Tello** (Ryze / DJI) or a **Tello EDU** — both speak
the Tello SDK used here — new or second hand, about $100–200 (2026), with
spare batteries (a battery lasts about 13 minutes) and propeller guards. A
PC or a Raspberry Pi with Wi-Fi: the drone is its own access point, so the
machine joins the drone's network. The Tello EDU can also join an existing
network (`ap <ssid> <password>`), which keeps the PC on the internet; this
example has not been run that way.

1. **Where**: indoors, in a room with space, nobody near it. A Tello's
   downward sensor needs light and a textured floor to hold its position.
2. **Join its Wi-Fi** (`TELLO-xxxxxx`). The PC then has no internet
   while it flies, which is normal.
3. In `db\db_TEL.xml`:
   ```xml
   <con id="CN_TELLO" ... con_host="192.168.10.1" .../>
   <con id="CN_STATE" ... con_host="0.0.0.0" con_acl="192.168.10.1" .../>
   <con id="CN_VID"   ... con_host="udp:0.0.0.0:11111?from=192.168.10.1" .../>
   ```
   (With the Python camera on Linux, `CN_VID` stays `link:VID?atr=frm`:
   the script listens on every address already.)
4. In `db\AyXDB.xml`, switch the simulator off:
   `<doc id="SIM/S00" sta="0x0000" .../>`
5. `run.bat`. Windows may ask whether AyXDB may receive on the network.
   It must, or the state line (UDP 8890) and the video (UDP 11111) never
   arrive and `LINK` stays in alarm.
6. On the page, `LINK` and `SDK` turn green. **Take off** from there.

What changes with a real drone: moves take longer (raise the 30 s timeout
in `main.answer_tmo` if you fly long distances slowly), the path on the page
drifts, a real drone may hold the last `rc` longer than the simulator's
one second (let go of the keys, or send `stop`), and `emergency` really
does drop it. Keep `BAT_LAND` where it is: a margin is the point of it.

**Video** from a real drone: **Video on** on the page, as with the
simulator. Not tried with a real Tello: the stream format is the Tello's
published one, and the engine's `udp:` source is tested against a sender
that cuts H.264 the same way, including streams that never send an IDR
(reported for the Tello) and lost datagrams.

## Opening it to other machines

Everything listens on `127.0.0.1`. The page has **no login**: any page on this
machine may send `takeoff`. The `xdb_acl` above keeps it to requests, but a
request is enough to fly the drone. Before you open `CN_WEB` to a network,
put a login in front of it (`PRJEDU_telnet` shows the three gates) and give
the flying requests a role above Guest.

## Licence

Eight connections (three in the simulator, five in the ground station),
three documents and one camera: **exactly the FREE edition's connection
limit**, and it runs without a licence file. An MCP endpoint (as in
`PRJEDU_mcp`, which would let an AI assistant fly it through the same `CMD`
element and the same rules) needs a licence with more connections.
