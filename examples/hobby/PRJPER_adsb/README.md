# PRJPER_adsb — the aircraft overhead, on a map

Every airliner broadcasts where it is, twice a second, on 1090 MHz: its
identity, position, altitude, speed and squawk code. That is **ADS-B**. A
USB TV stick (an RTL-SDR, about 25 $) and a free decoder such as
**dump1090** or **readsb** often hear it from 200 km and more, and serve what they
decode as text lines on TCP port **30003** — the *SBS-1* or *BaseStation*
format that half the aviation hobby software reads.

This example is the other end of that port: a tracker that keeps **one
element per aircraft** in the engine's document, creating and deleting
elements as aircraft come and go, and draws them on a map. No radio is
needed to run it — a simulated receiver comes with it.

```bat
run.bat
```

Then open **http://127.0.0.1:8097/**.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

| Document | Role | What it is |
|---|---|---|
| `SRC/S00` | the **receiver**, simulated | a dump1090 in script: flies a dozen aircraft around Istanbul Airport and writes their SBS-1 lines to everyone connected to `127.0.0.1:30003` |
| `TRK/S00` | the **tracker** | dials port 30003, turns each line into its aircraft's element, forgets aircraft not heard for a minute, raises an alarm on an emergency squawk, and serves the map |

The tracker never reads the receiver's document. Everything it knows
arrives as text over TCP, as it would from a real dump1090.

## The stream

A line per decoded message, 22 comma-separated fields; a message type
fills only the fields it carries:

```
MSG,3,1,1,4B1805,1,2026/09/25,10:00:00.000,2026/09/25,10:00:00.000,,36000,,,41.51234,28.99876,,,0,0,0,0
MSG,4,1,1,4B1805,1,...,,,452,63.0,,,-1500,,0,0,0,0
MSG,1,1,1,4B1805,1,...,THY1A,,,,,,,,0,0,0,0
MSG,6,1,1,4B1805,1,...,,,,,,,,7700,0,-1,0,0
```

| field | | type |
|---|---|---|
| 4 | ICAO address — six hex digits, the aircraft's identity | all |
| 10 | callsign | 1 |
| 11, 14, 15 | altitude (ft), latitude, longitude | 3 |
| 12, 13, 16 | ground speed (kt), track (°), vertical rate (ft/min) | 4 |
| 17 | squawk — 7500 hijack, 7600 radio failure, 7700 emergency | 6 |

The simulator sends types 3 every half second, 4 every second, 1 and 6
every five seconds: about 40 lines a second for twelve aircraft.

**TCP delivers bytes, not lines.** One arrival may end in the middle of a
line, and the next one starts with the rest of it. `CN_SBS` is a MASTER
that never asks for anything — whatever arrives goes to `pro_onparse`,
`main.on_lines(exc)` — and the unfinished tail waits in the session's
memory (`exc.ses.mem.carry`) until the rest comes. A line that is not
SBS-1 is counted in `BAD` and dropped.

## The aircraft are elements

```
<list id="SKY">
    <ac id="AC_4B1805" hex="4B1805" cs="THY1A" alt="36000" gs="452" trk="63" lat="41.51234" lon="28.99876"
        vr="0" dist="31.4" brg="47" seen="..." msgs="118"
        sta="0x0303" val="1200" val_fnc="[ALM.onin]" val_alm_onin_alm="[7500,7600,7700]"/>
    ...
</list>
```

- **First heard** — `evt.AddElement("id('SKY')", ac)` adds an `<ac>` built
  from text with `new XML(..., -1)`. `AddElement` takes a node that
  belongs to no document, so the new node is first taken out of the little
  document it was parsed into (`x.removeChild(ac)`).
- **Every line** — `evt.SetValue("id('AC_4B1805')/@alt", ...)`: the
  element is the aircraft's state; `dist` and `brg` from the antenna are
  worked out as positions arrive.
- **Not heard for `LOST_S` (60 s)** — `evt.DelElement("id('AC_4B1805')")`.

So the document **is** the traffic picture: `count(id('SKY')/ac)` is how
many aircraft are overhead, and anything that reads elements — this page,
an AI assistant over MCP, a replication partner — sees the sky.

**The emergency is configuration, not code.** Each `<ac>` keeps its squawk
in `val`, with `ALM.onin` and the three emergency codes. When a squawk
becomes 7700 the element's `sta` gets its alarm bits (`0x0303` → `0x034B`)
and the engine logs it; the script only writes the squawk. `main.tick`
also puts a sentence in `EMERG` for the page's banner.

**The page gets the whole sky in one value.** Once a second `main.tick`
reads `json(id('SKY')/ac)` — one engine call, every aircraft, every
attribute, as a JSON array — and publishes it as `SNAP`. The page draws
that; the only thing it keeps itself is the trails, because the tracker
holds where an aircraft *is*, not where it was.

## The map

- aircraft coloured by altitude, pointing along their track, with their
  callsign and flight level; a trail of the last minute behind each
- range rings every 50 km (25 km at 100 km, 100 km at 420 km); north up
- a red banner and a red aircraft while one squawks an emergency code
- a table, nearest first; click a row or an aircraft for its element's
  address and `sta`

The page writes nothing: `TRK/S00` is read-only for it
(`xdb_acl="0xFF111111"`).

## A real receiver

Not tested with a radio for this example; the tracker was tested against a
stand-in that behaves like dump1090 on the wire (see *What it measured*).

1. An RTL-SDR stick and an antenna for 1090 MHz — the small one that comes
   with most sticks is enough to start; a quarter-wave wire (69 mm) high
   up and outdoors hears much farther.
2. dump1090 (dump1090-fa, dump1090-mutability) or readsb, with its SBS
   output on port 30003 — for readsb, `--net --net-sbs-port 30003`.
3. In `db/db_TRK.xml`: `CN_SBS` → `con_host` = the machine running the
   decoder; `HOME_LAT` / `HOME_LON` = where the antenna is.
4. In `db/AyXDB.xml`: switch the simulator off — `<doc id="SRC/S00" sta="0x0000" ...>`.

Receiving ADS-B is legal almost everywhere; what you may do with the data
(publishing it, for example) is a matter of local law.

## What it measured

On a Windows 11 laptop, engine 4.3.4.464, and on Linux (WSL, Ubuntu 22.04):

| | |
|---|---|
| twelve aircraft | 204 lines every 5 s (about 41 a second; `RATE` jumps between 24 and 60 with the message schedule), **0** not SBS-1, 12 elements under `SKY`; the engine at **2.7 %** of one core, 30 MB |
| a hundred aircraft (`PLANES` = 100) | 1 700 lines every 5 s (340 a second), 100 elements, **0** not SBS-1; **4.1 %** of one core, 40 MB |
| the scheduled emergency | `SRC` squawks 7700 30 s after the start; the tracker's `<ac>` goes `sta 0x0303` → `0x034B` (`ALM.onin`) and `EMERG` is set within a second; cleared 60 s later, the next one at 210 s |
| Linux | the same run with twelve aircraft: the same counts, the same emergency (CPU not measured) |

Against a stand-in for dump1090 (a Python script, not included) that sent
three aircraft cut into **random pieces of 1 to 60 bytes**, with one line
of garbage in every thirteen, and then dropped the connection for ten
seconds:

| | |
|---|---|
| lines | 364 sent in 1 080 pieces: **336 used, 28 counted as not SBS-1** — every line put back together, none lost |
| squawk 7600 | the alarm, and `EMERG` = "UAL9 squawks 7600 (radio failure)" |
| the receiver goes away | the aircraft are forgotten after `LOST_S` (10 s in that test); `COUNT` 0 |
| the receiver comes back | `CN_SBS` dials again by itself (`con_rct` = 5 s) — connected 3.3 s after the port opened — and the aircraft reappear |

Three things the measuring found, all fixed:

- **An aircraft born with `seen="0"` was forgotten at once.** `main.tick`
  runs on its own thread; when it came round between the element's
  creation and the line's last write, it saw an element "not heard since
  1970" and deleted it. A hundred aircraft made it happen at the first
  start. Every `<ac>` is now born with `seen` = now.
- **`new XML(text)` without `-1`**: the element is added, but
  `id('AC_...')` never finds it, so every line makes another one — 8 438
  elements in 38 seconds.
- **`Time.GetTimeMs()` is an unsigned integer** (found later, in
  `PRJEDU_robotarm`): `now - seen`, with a `seen` stamped by the stream a
  moment after `main.tick` read the clock, wraps to an enormous number
  instead of going negative, and forgets an aircraft that was heard a
  millisecond ago. `main.tick` now reads the clock as a float.

## Try this

| Do | See |
|---|---|
| wait 30 s | the first emergency: a red aircraft, the banner, and `sta 0x034B` on its element. Every three minutes after (`EMERG_EVERY`) |
| `PLANES` = 100 in `db_SRC.xml` | a busy sky: ten times the lines, still a few per cent of one core. Where is the time going — the SBS-1 parsing, or the `SetValue`s? |
| switch `SRC/S00` off (`sta="0x0000"` in `AyXDB.xml`) and start again | "no feed" and an empty sky; `CN_SBS` keeps dialling every 5 s. This is what the tracker looks like before you plug a radio in |
| `RANGE_KM` = 400, map at 420 km | aircraft beyond 300 km: where does the flat earth of `use_line` start to be wrong, and by how much? (Compare with the haversine formula.) |
| think: the receiver stops in the middle of a line | the unfinished tail stays in `exc.ses.mem.carry`. What happens to it when the receiver comes back? How many lines does it cost? |
| add a counter | `vr` is there: count the aircraft climbing and descending in `main.tick`, into a new `<var>`. Every `<var>` goes to the page over MQTT by itself (`pro_retain_adr="//var"`) |
| a geofence | an alarm when an aircraft comes within 20 km below 10 000 ft: `dist` and `alt` are attributes already. Count them in `main.tick` into a `<var>` and give that `<var>` an `ALM.onlvl` limit — configuration again |

## Licence

Four connections and three documents: inside the FREE edition's limits,
it runs without a licence.
