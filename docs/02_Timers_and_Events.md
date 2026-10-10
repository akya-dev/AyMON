# 2 — Timers, and what makes things happen

Run **PRJEDU_101** first. Its `<thr>` and two `<var>` timers are the whole of
this guide in practice.

---

## Nothing happens by itself

In AyMON there are exactly two ways for something to happen:

1. **A timer fires.** A clock wakes up and writes an attribute.
2. **Something writes an attribute**, and the attribute's `*_fnc` chain runs.

That is the entire event model. A protocol poll is a timer writing `evt`; an
alarm is a chain running on a value write; a script is a name in one of those
chains. There is no main loop you can put code in.

## The three moving parts

```
<thr id="TH_MAIN" thr_per="100" thr_wrk="1">     the CLOCK and the WORKERS
  │
  ├── timer list    one per thread, sorted by what is due next
  │
  └── work queue    one-shot and delayed work: script calls, queued writes
```

Three things follow from that shape:

* **The thread cycle is the floor.** A timer fires only when its thread wakes
  up; `thr_per` is that cycle, in **milliseconds**. A 50 ms poll on a 100 ms
  thread runs at 100 ms and no log line tells you.
* **Timers are not threads.** A thousand elements on one `<thr>` are a thousand
  entries in one list, served by one dispatching thread and `thr_wrk` workers.
  Slow work does not block the clock, but it does occupy the workers.
* **There is one scheduler per thread**, so "what runs next" always has a
  single answer.

## The thread element

```xml
<thr id="TH_MAIN" xdb_fnc="[THR.cre]" sta_fnc="[THR.sta]"
     sta="0x0303" sta_typ="0x142"
     thr_per="100" thr_wrk="1"/>
```

| Field | Unit | Default | Meaning |
|---|---|---|---|
| `thr_per` | ms | 100 | How often the thread wakes to serve its timers (10 … 10000) |
| `thr_wrk` | count | 0 | Worker threads that run the callbacks |
| `xdb_fnc` | — | — | Must be `[THR.cre]`, or no thread object is created |
| `sta_fnc` | — | — | `[THR.sta]`, or writes to `sta` do nothing |
| `sta` | — | — | `0x0303` running, `0x0000` off |

**`thr_wrk="0"` is a real mode, not an oversight.** With no workers the
dispatching thread runs the callbacks itself: simpler, lower latency, and one
slow callback delays every other timer on that thread. Anything that talks to
a device, a database or runs a script of consequence wants at least one worker.
`PRJEDU_101` uses `0`; `PRJEDU_sqlite` uses `1`, because it writes to a
database.

## Which thread does an element belong to?

| You write | The timer lives on |
|---|---|
| `evt_thr="TH_X"` | thread `TH_X` |
| nothing, but the element is (or is under) `<dev pro_con="CN_A">` | connection `CN_A`'s own thread |
| nothing, anywhere else — a `<var>`, a `<list>` … | the **document's own thread** (engine 4.3.4.495 and later; older engines never ran such a timer, silently) |
| `evt_thr="/"` | the document's own thread |
| `evt_thr="TH_TYPO"` (no such thread) | never runs — one `ERROR` line naming the element and the thread at every start (4.3.4.495+) |

The examples here all name their thread with `evt_thr`, which works on every
engine; on 4.3.4.495 and later you may leave it out for a document-level
timer. The document's thread is the root's own: its `thr_per` and `thr_wrk`
apply.

A connection **is** a thread — `<con>` accepts `thr_per` and `thr_wrk` just
like `<thr>`, and poll timers live on it by default. That is why a slow device
on a busy connection is best moved to its own `<con>`, not just its own
`evt_thr`: the thing being shared is the *conversation*, not the clock.

> Only `dev`, `bi`, `io`, `var`, `rec`, `list` and `item` elements are scanned
> for timers. Putting `evt_cfg` on anything else is silently dead — no timer,
> no error.

## A timer, in full

```xml
<var id="T_READ" xdb_fnc="[XDB.evt]" sta="0x0303" sta_typ="0x142" sta_fnc="[EVT.sta]"
     evt="" evt_typ="0x1201" evt_thr="TH_MAIN"
     evt_cfg="0x0042" evt_per="1" evt_dly="0" evt_syn="0"
     evt_fnc="[main.read]"
     cnt="0" cnt_typ="0x5104"/>
```

| Field | Meaning |
|---|---|
| `xdb_fnc="[XDB.evt]"` | Creates the timer object. Without it the element is inert |
| `evt` / `evt_typ` | The attribute the timer writes, and its type |
| `evt_cfg` | Mode and flags. `0x0042` is the one you want: periodic, queued. Add `0x4000` (`0x4042`) to fire once at start — see below |
| `evt_per` | Period, in **seconds**, decimal allowed. `0.05` is 50 ms, `86400` is a day |
| `evt_dly` | Phase offset added to each tick |
| `evt_syn` | `0` = free-running. `>0` = anchor to a wall-clock boundary of that size |
| `evt_fnc` | What to run. The same chain syntax as `val_fnc` |
| `sta_fnc="[EVT.sta]"` | Lets `sta` start and stop the timer |

**All four time fields are seconds.** Queue delays, elsewhere, are
milliseconds — the two surfaces differ and always have.

### The first firing waits a whole period — unless you ask

By default a periodic timer fires for the first time at
**start + `evt_per` + `evt_dly`**: `evt_per="10" evt_dly="6"` first runs 16
seconds in. That is the right default for polls — a device is not asked
before its connection has had time to come up — but a report or a sampler
usually wants to run at once.

`evt_cfg="0x4042"` (the `0x4000` bit) moves the first firing to
**start + `evt_dly`**, then every `evt_per` as usual. "Start" is when the
engine starts the timer and when its `sta` switches it back on; writing
`evt_per` on a running timer is not a start. Needs engine 4.3.4.441 or later —
an older engine ignores the bit and waits the period.

### `evt_syn` is an anchor, not a second period

`evt_syn="0"` means "start counting when the thread starts, then every
`evt_per`". That is what you want almost always. `evt_syn="86400"` with
`evt_per="86400"` means "midnight, then daily" — use it when the *phase*
matters, not the interval.

### Each firing is a pulse

`evt` goes to `1`, which runs `evt_fnc` **once**, and returns to `0` silently —
no second event. So `evt_per="1"` is one firing and one `evt = 1` per second.

Between pulses a local reader sees `0`. A *remote* reader (a web front end, a
replicated mirror) is sent the `1` and never the `0`, so on the wire treat
`evt` as "a pulse happened", not as a level.

### Two rules that decide what you see under load

* **Missed ticks are skipped, never replayed.** A timer configured faster than
  its thread can serve simply runs at the thread's rate. There is never a
  catch-up burst.
* **Lateness is free; earliness would double-fire.** The engine rounds its
  sleep up and re-checks. If you measure your period and get it plus a
  millisecond or two, that is the design.

## The chain: what `*_fnc` actually is

```xml
val_fnc="[VAL.cnv,ATR.rou,ATR.lmt,ALM.onlvl]"
evt_fnc="[main.read]"
sta_fnc="[EVT.sta,main.on_alarm]"
```

The names run left to right when that attribute is written. They can be engine
functions (`ATR.rou`, `ALM.onlvl`, `PRO.pol`) or your own script
(`main.read`) — mixed freely, in any order. An `IF.*` function that returns
"stop" cuts the rest of the chain.

**A chain is declared on the attribute it reacts to.** `val_fnc` runs when
`val` is written, `sta_fnc` when `sta` is written, `evt_fnc` when the timer
writes `evt`.

### The one bit that decides whether `val_fnc` runs

```xml
val_typ="0x1308"      not 0x0308
```

The **`0x1000` bit in `val_typ`** is what says "run this value's `val_fnc`
chain". Leave it out and the chain is declared and **never runs**: no scaling,
no rounding, no alarm — and no error and no log line either. The value stores
raw and nothing tells you why.

Measured, two elements side by side, same chain `[ATR.rou]`, same
`val_rou="0.1"`, both written with `1.23456`:

```
val_typ=0x0308  ->  1.23456      the chain never ran
val_typ=0x1308  ->  1.2          the chain ran
```

It makes no difference how the value is written — through an address
(`evt.SetValue("id('X')/@val", v)`) or through the element object
(`elm.val = v`); both go through the same gate.

**`pro_typ` works the same way** — a `pro_fnc="[VAL.put]"` under
`pro_typ="0x0204"` never runs, and the point never reaches `val`. That is why
every `<io>` in `PRJEDU_modbus` carries `pro_typ="0x1102"` and not `0x0102`.

> **But the rule is not uniform, so do not generalise it.** `evt_fnc` and
> `sta_fnc` run whether or not their `evt_typ` / `sta_typ` carries `0x1000` —
> measured both ways. That is why `PRJEDU_101` can ship `sta_typ="0x142"` next
> to `sta_fnc="[EVT.sta]"` and work perfectly well.
>
> The reason is that **`evt` and `sta` are given a run mode by the engine when
> they do not declare one** — the `sta` path supplies it when the event is set
> up, the `evt` path just before a firing is executed. Declare one and yours is
> what governs the event; declare none and one is supplied anyway. `val` and
> `pro` get no such help: there the bit is yours to write, and forgetting it is
> silent.

If a `val_fnc` chain is not running, check this before anything else.

### Inside a callback, the attribute still holds the OLD value

The chain runs *before* the value is written to the document. So in your
function `evt.obj.val` is the previous value; the value being written is
`evt.valn`, and the one before it is `evt.valp`. That is what lets a function
inspect or veto a change — and it catches everyone once.

## Starting and stopping

The element's own `sta` gates it. `0x0303` runs; write `0x0000` and the timer
stops firing but the element stays registered, ready to be switched back on.

## Pitfalls

* **`evt_per` is seconds; queue delays are milliseconds.**
* **`evt_syn` is an anchor, not a period.**
* **`thr_wrk="0"` serialises everything on that thread**, the clock included.
* **A missing `0x1000` in `val_typ` / `pro_typ` silently disables that chain** — but `evt_fnc` and `sta_fnc` do not need it.
* **Inside a callback the attribute holds the old value** — use `evt.valn`.
* **`evt_per` below 10 ms costs what it asks for.** `evt_per="0.0005"` will
  wake the thread every 500 µs and burn a core. Check the decimal point.
* **Not everything needs a clock.** A block is given a timer because its
  protocol has to *ask* — Modbus, SNMP. A subscribed protocol is told: there
  is no timer anywhere in `PRJEDU_mqtt`'s monitoring document, and a `<bi>`
  there with `evt_fnc="[PRO.pol]"` would be refused. See
  `05_Connections_and_Protocols`.

## Checklist

1. Every `<thr>` has `xdb_fnc="[THR.cre]"`, `sta_fnc="[THR.sta]"`, `sta="0x0303"`.
2. `thr_wrk` ≥ 1 wherever a callback talks to a device, a database or a script
   of any size.
3. Every timer element declares `evt`, `evt_typ`, `evt_cfg`, `sta`,
   `sta_fnc="[EVT.sta]"` and an `evt_fnc`.
4. Each timer runs on the thread you *meant*: its `evt_thr`, or — with none —
   its connection (a `<dev pro_con>` element) or the document's own thread
   (4.3.4.495+; on older engines name the thread). The start log has no
   `names no <thr> or <con>` line.
5. Every `val` / `pro` with a chain carries `0x1000` in its `val_typ` / `pro_typ`.
