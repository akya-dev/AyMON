# PRJEDU_101 — first steps

The smallest AyMON project that is still a real one. No network, no database,
no hardware: a value that moves, a value calculated from it, an alarm watching
it, and a log you can read.

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

Stop with CTRL-C. Then open `log\EDU-*.log`.

## What you should see

```
PRJEDU_101: hello. Watch SENSOR / SENSOR_F / ALARM / COUNT.
PRJEDU_101: the alarm limits are 10 / 14 / 26 / 30 degrees.
reading 0: stored 20.1 C, raw 20.1411734284627 C, 68.2541121712328 F
ALARM sta 0x0303 -> 0x034B  value 30.2 C
ALARM sta 0x034B -> 0x0347  value 29.8 C
reading 20: stored 29.9 C, raw 29.90110235669 C, 85.821984242042 F
ALARM sta 0x0347 -> 0x0343  value 21.8 C
```

Two things worth noticing in those lines:

* **`stored` and `raw` differ.** The script computed `20.1411…`; the element
  holds `20.1`, because its `val_fnc` chain rounds (`ATR.rou`, `val_rou="0.1"`)
  and clamps (`ATR.lmt`) before storing. The engine did that, not the script.
* **`sta` carries the alarm.** `0x0343` normal, `0x0347` warning, `0x034B`
  alarm. An alarm in AyMON is not a separate object — it is state on the value
  that raised it, in the same 16-bit field that carries the runtime state.

## The three files

| File | What is in it |
|---|---|
| `db\AyXDB.xml` | the **root document**: names the engine and lists the child documents |
| `db\db_EDU.xml` | the elements — a thread, four values, the alarm limits |
| `db\db_EDU.js` | the script: one function per hook the XML names |

Read them in that order; every attribute has a comment above it explaining what
it does and why.

## The shape of the thing

```
<xdb>                      a document
  <config>                 what it needs before it can work
    <script id="main">     functions callable as main.<name>
  <data>                   the elements
    <thr  id="TH_MAIN">    a thread with its own clock
    <var  id="SENSOR">     a value with a TIMER (evt_per="1")
    <var  id="SENSOR_F">   a value written by the script
    <var  id="ALARM">      a value with LIMITS (val_fnc runs on every write)
    <var  id="COUNT">      a counter
```

Nothing polls anything here. **A write runs a chain, and the chain may write
again** — that is the whole event model. `read_sensor` writes four attributes
once a second; everything else in the log is a consequence.

## Two traps this example deliberately walks into

**1. Arithmetic is typed, and the left operand decides.** `COUNT` is an
unsigned 32-bit attribute, so in the script `c` is an integer:

```js
c / 12                      // integer / integer -> 0 while c < 12
20 + 0.22                   // integer + float   -> 20
Math.round(x) / 100.0       // integer / float   -> still an integer
c / 12.0                    // float             -> what you meant
```

This is not JavaScript's "everything is a double". It is how a control engine
keeps a 16-bit register 16 bits wide. Be deliberate about your literals.

**2. Inside a `*_fnc` chain, the attribute still holds the OLD value.** The
value being written is `evt.valn`. This example does not get bitten by it
because it produces its own values, but the first `val_fnc` you write will.

## Where to go next

* [docs/02_Timers_and_Events.md](../../../docs/02_Timers_and_Events.md) — `evt_*`,
  threads, workers, and the bit that decides whether a chain runs at all
* [docs/03_Scripting.md](../../../docs/03_Scripting.md) — the language, its scopes
  and the six places it is not JavaScript
* [docs/01_The_Element_Tree.md](../../../docs/01_The_Element_Tree.md) — `<con>` /
  `<dev>` / `<bi>` / `<io>`: how this becomes a project that talks to real
  equipment. `PRJEDU_modbus` is that example.
