# Attribute and element functions

The engine functions you write into a `*_fnc` chain in the XML —
`val_fnc="[VAL.cnv,ATR.rou,ATR.lmt]"` — and the few you call from script to debug
one: `ATR`, `VAL`, `ELM`, `XDB`, `EVT`, `THR` and `SCR`. What a chain is and why a
write runs one is in [Timers and events](../02_Timers_and_Events.md); where script
lives is in [Scripting](../03_Scripting.md). The alarm, condition and protocol chain
functions (`ALM`, `IF`, `PRO` ...) are on
[page 05](05_Alarms_Conditions_and_Protocol_Chains.md). Every result below was
measured on engine 4.4.2.702.

* [How a chain runs](#how-a-chain-runs)
* [ATR: attribute functions](#atr-attribute-functions)
* [VAL: functions that write val](#val-functions-that-write-val)
* [ELM: functions on another attribute of the element](#elm-functions-on-another-attribute-of-the-element)
* [XDB: functions on an address](#xdb-functions-on-an-address)
* [EVT: timers](#evt-timers)
* [THR: threads](#thr-threads)
* [SCR: scripts](#scr-scripts)

---

## How a chain runs

```xml
<var id="T1" val="0" val_typ="0x1308" val_fnc="[ATR.cnv,ATR.rou,main.check]"
     val_cnv_dlt="0.1" val_rou="0.5" sta="0x0303" sta_typ="0x142"/>
```

When `val` is written, the names in `val_fnc` run **left to right**, engine functions
and your own (`main.check`) mixed. In this reference `<atr>` is the attribute whose
chain it is: in `val_fnc` it is `val`, in `pro_fnc` `pro`. A function builds the
names it reads from `<atr>`: `ATR.rou` reads `val_rou` in `val_fnc` and `pro_rou` in
`pro_fnc`. Order matters, measured with `val_cnv_dlt="0.5" val_rou="1"`, 5 written:

```
val_fnc="[ATR.cnv,ATR.rou]"   ->  2      5 * 0.5 = 2.5, then rounded
val_fnc="[ATR.rou,ATR.cnv]"   ->  2.5    5 rounded is 5, then * 0.5
```

### The run bits in `<atr>_typ`

A chain runs only if the attribute's type carries a run bit
([Timers and events](../02_Timers_and_Events.md#the-bits-that-decide-whether-val_fnc-runs)).
Measured, one script writing 1, 2, 3 at once:

| `val_typ` | The chain runs | Measured |
|---|---|---|
| `0x0308` | never | `1.23456` with `[ATR.rou]` stays `1.23456`, no line |
| `0x1104` | at once, on the writing thread, before `SetValue` returns | 3 runs; the value is there when `SetValue` returns |
| `0x2104` | queued, once per write, on the element's `evt_thr` | read back at once: `0`; 300 ms later `3`, after 3 runs |
| `0x3104` | queued, newest only | read back at once: `0`; later `3`, after **1** run with `3` |

A queued chain without `evt_thr` goes on the **writer's** thread: measured, it ran only
after the timer function that wrote it had returned (2 s later). `sta` and `evt` get a
run mode from the engine when they declare none, so `sta_fnc` and `evt_fnc` run even
with `sta_typ="0x142"`.

An element with no `sta_fnc` still has a `sta` chain: `[PRO.sta]` on `<io>` `<bi>`
`<dev>` `<con>`, `[ELM.sta,SCR.sta]` on `<script>`, `[ELM.sta]` on everything else; the
engine writes `[XDB.sta]` on the root `<xdb>` and `[THR.sta]` on a `<thr>`.

### What a function sees

Every function receives the event `evt` ([evt](03_Events_Documents_and_Addresses.md)).
A script function in a chain logging it, written 1.23456 from a timer:

```
SEEN A_ROU0.val valn=1.23456 valp=0 obj=0 flg=0x0A00 stan=0x0303 role=9
```

| | |
|---|---|
| `evt.valn` | the value being written. A function may change it; the next function sees the change, and what `valn` holds at the end is what is stored |
| `evt.valp` | the value before |
| `evt.obj` | the element; **its attribute still holds the old value** (`obj=0` above) |
| `evt.atr`, `evt.id`, `evt.doc` | which attribute, element and document |
| `evt.stan` / `evt.stap` | the element's `sta` new / before |
| `evt.flg` | where the write came from (`EVT.FLG_SRC_*`) and its direction (`EVT.FLG_PRO_*`) |
| `evt.user_role` | `9` (System) in a `sta`, `pro` or `val` chain; the writer's role in any other |

```js
function dbl(evt) { evt.valn = evt.valn * 2; return 0; }
```

`val_fnc="[main.dbl,ATR.rou]"` with `val_rou="1"`, 2.4 written: **5** is stored.

### How a chain ends

| What happens | The rest of the chain | The value |
|---|---|---|
| A function does its work | runs | stored, as `evt.valn` ends |
| A function lacks an attribute it needs (`ATR.and` without `val_and`) | runs | stored; one `NOTICE` line `function 'ATR.and' returned an error [...]` |
| A function **stops** the chain (`ATR.hrec`, `ATR.tmr` refusing, `ELM.del`, `PRO.out` ...) | does not run | **not stored** |
| An unknown name (`[ATR.foo,ATR.set]`) | does not run | stored as written; `ALERT function 'ATR.foo' not found` (an unknown scope: `PANIC ... function [XYZ.foo] not found`) |
| `IF.*` answers no | skipped up to `IF.else` / `IF.end` | stored ([page 05](05_Alarms_Conditions_and_Protocol_Chains.md)) |
| A script function returns anything | runs: the return value is ignored | stored |

`NOTICE` lines need `xdb_log="5"` or more on the document to be seen.

### Three traps that silence a function

* **The element must be running.** `ATR.*` and most other functions do nothing when
  the run nibble of the element's own `sta` is 0. An element with **no `sta`**
  attribute reads as 0: measured, `[ATR.rou,main.seen]` on such a `<var>` left
  1.23456 unrounded while `main.seen` ran (`stan=0x0000`). A `<var>` written
  `sta="0x0300"` keeps 0x0300 ([ELM.sta](#elmsta)) — write `0x0303`.
* **A write made in `xdb_init`, `xdb_wait` or `xdb_start` is an update.** Those hooks
  run with the document's own event, whose source is "update" (`evt.flg` =
  `0x0300` = `EVT.FLG_SRC_UPD`), and every write they make carries it. The functions
  marked *skips updates* below then do nothing: measured from `xdb_start`, `ATR.set`
  stored 7, `ATR.inc` 5, `ATR.cnv` 100 — the written values. The same write from a
  timer stored 1, 6 and 15. Test chains from a timer, not from `xdb_start`.
  Updates are also how the engine re-runs a chain on purpose ([XDB.upd](#xdbupd), a
  `<var>` coming back to RUNNING), so that scaling is not applied twice while alarms
  are evaluated again.
* **A write from a timer's chain carries the timer's source** (`EVT.FLG_SRC_EVT`).
  Writing `evt` from there does not reach a timer (use [EVT.set](#evtset)), and
  [ATR.tmr](#atrtmr) counts down instead of setting.

---

## ATR: attribute functions

Functions that change the value being written, in its own chain. They work on any
attribute, so every name they read is `<atr>` + a suffix.

### ATR.and

**In:** any `<atr>_fnc` chain. **Reads:** `<atr>_and`. **Changes:** the value being
written: value AND `<atr>_and`.

```xml
<var id="FLAGS" val="0" val_typ="0x1104" val_and="0x0F" val_fnc="[ATR.and]" sta="0x0303" sta_typ="0x142"/>
```

Writing 255 stores 15. Without `val_and` the value is stored as written (255) with a
`NOTICE` line. Integer attributes only: on a float (`0x1308`) 255.7 stored **0**.

### ATR.or

**Reads:** `<atr>_or`. **Changes:** value OR `<atr>_or`. `val_or="0xF0"`, 15 written →
255.

### ATR.xor

**Reads:** `<atr>_xor`. **Changes:** value XOR `<atr>_xor`. `val_xor="0xFF"`, 15
written → 240.

### ATR.tog

**Reads:** nothing. **Changes:** the value to its logical opposite. *Skips updates.*

It is a logical NOT, not a bit flip: written 0 stores 1, written 5 stores 0, on
`0x1101`, `0x1104` and `0x1308` alike. It inverts what is **written**, not what was
stored: to toggle a stored flag, use [ELM.tog](#elmtog) or [XDB.tog](#xdbtog).

### ATR.set

**Changes:** the value to 1, whatever is written. *Skips updates.* 7 written → 1.

### ATR.rst

**Changes:** the value to 0. *Skips updates.* 7 written → 0.

### ATR.put

**Reads:** `<atr>_put`. **Changes:** the value to `<atr>_put`.

```xml
<var id="P" val="0" val_typ="0x1104" val_put="42" val_fnc="[ATR.put]" sta="0x0303" sta_typ="0x142"/>
```

7 written → 42. Any write becomes a fixed value: a "press" button.

### ATR.eval

**Reads:** `<atr>_eval`, a script expression. **Changes:** the value to the
expression's result; `evt` is available in it.

```xml
<var id="E1" val="0" val_typ="0x1308" val_eval="evt.valn * 2 + 1" val_fnc="[ATR.eval]" .../>
<var id="E2" val="0" val_typ="0x1308" k="3" val_eval="evt.obj.k * evt.valn" .../>
<var id="E3" val="0" val_typ="0x1308" val_eval="main.half(evt)" .../>
```

5 written: `E1` 11, `E2` 15, `E3` 2.5 (`function half(evt) { return evt.valn / 2.0; }`).
The left operand decides integer or float ([Scripting](../03_Scripting.md#eight-places-this-is-not-javascript)):
`evt.valn / 2.0` with an integer written is an integer division — `E3` got 2.5 only
because `val` is a float.

### ATR.inc

**Changes:** the value written + 1. *Skips updates.*

It adds to the **written** value, not to the stored one: 5 written twice stores 6
both times. 2.5 on a float → 3.5. To count, use [ELM.inc](#elminc) or
[VAL.inc](#valinc) from another attribute's chain.

### ATR.dec

**Changes:** the value written − 1. *Skips updates.* 5 → 4. On an unsigned type 0 →
4294967295.

### ATR.hrec

Not implemented. It **stops the chain and the value is not stored**: measured, a
`<var>` with `val_fnc="[ATR.hrec,main.seen]"` kept 0 and `main.seen` never ran. Do
not use it.

### ATR.vrec

**In:** the `pro_fnc` of an element whose `pro` is a buffer. **Reads:** `<atr>_adr`
(`word.bit`) on each child. **Writes:** the child's `<atr>`.

Meant to hand the parts of a buffer to the child elements, as
[PRO.inp](05_Alarms_Conditions_and_Protocol_Chains.md) does for a protocol block.
Measured: a byte or word buffer written from script (`Buffer.create` and
`Buffer.put`, `CODEC.HEX_dec`) reached no child — all stayed 0. Use `PRO.inp`.

### ATR.cnv

**Reads:** `<atr>_cnv_dlt` (factor; missing or 0 = 1), `<atr>_cnv_ofs` (offset, 0).
**Changes:** value × dlt + ofs. *Skips updates.*

```xml
<var id="LVL" val="0" val_typ="0x1308" val_cnv_dlt="0.1" val_cnv_ofs="5" val_fnc="[ATR.cnv]" .../>
```

100 written → 15. Without `val_cnv_dlt` → 105. The result goes back into the
attribute's type: on an integer `val` 725 × 0.1 → **73**.

### ATR.cnvr

**Reads:** the same two. **Changes:** (value − ofs) ÷ dlt — the reverse of `ATR.cnv`,
for a value going out to a device. *Skips updates.* 15 written with the line above →
100.

### ATR.lmt

**Reads:** `<atr>_min`, `<atr>_max`, `<atr>_lmt_min`. **Changes:** clamps the value.

```xml
<var id="SP" val="0" val_typ="0x1308" val_min="0" val_max="100" val_lmt_min="2" val_fnc="[ATR.lmt]" .../>
```

| Written | Stored | |
|---|---|---|
| 150 | 100 | above `val_max` |
| −5 | 0 | below `val_min` |
| 1.5 | 0 | below `val_lmt_min`: becomes `val_min` (a dead band at the bottom) |
| 2 | 2 | |

A missing limit is no limit: with `val_max` alone, −5 stays −5. Works on integer and
float types (`0x1204` with min −10, max 10: 20 → 10, −20 → −10).

### ATR.rou

**Reads:** `<atr>_rou`, the step. **Changes:** the value to a multiple of the step.

```xml
<var id="T1" val="0" val_typ="0x1308" val_rou="0.1" val_fnc="[ATR.rou]" sta="0x0303" sta_typ="0x142"/>
```

21.47 written stores 21.5. The rounding is not the school one; measured:

| Type, step | Written → stored | |
|---|---|---|
| float, 0.1 | 21.47 → 21.5, 21.45 → **21.4**, 2.45 → **2.4** | a half goes **down** |
| float, 1 | 2.5 → **2**, 2.51 → 3, 3.5 → **3** | |
| float, 5 | 12.4 → 10, 12.6 → 15, 12.5 → **10** | |
| float, 0.1 | −2.47 → **−2.4**, −2.44 → **−2.3**, −0.04 → 0 | a negative value ends one step too high |
| integer (`0x1204`), 5 | 17 → 15, 19 → **15**, −7 → **−11** | integers are cut, not rounded; a negative one is wrong |
| unsigned, 5 | 19 → 15 | cut |
| decimal (`0x130C`), 0.05 | 12.37 → 12.35, 12.375 → 12.40, −12.375 → −12.40 | exact, half away from zero |
| float 32 (`0x1304`), 0.1 | 21.47 → 21.5 | |

For exact rounding, and for negative values, declare the attribute a decimal
(`0x130C`). Without `<atr>_rou` the value is stored as written and the chain goes on.
NaN and the infinities pass unchanged. In `pro_fnc` it reads `pro_rou`: `pro_rou="5"`,
12.4 → 10.

### ATR.tim

**Writes:** `<atr>_tim` = now, in milliseconds since 1970 (UTC), through that
attribute's own chain; created as a 64-bit unsigned if missing. *Skips updates.*

`val_fnc="[ATR.tim]"`, 5 written: `val` 5, `val_tim` 1794389771388.

### ATR.timstr

**Writes:** `<atr>_timstr` = now as local text with the offset, no milliseconds.
*Skips updates.*

```
val_timstr = 2026-11-11T02:36:11-0700
```

The offset has no colon (`-0700`); the local zone is the project's
([Timers and events](../02_Timers_and_Events.md#evt_syn-is-an-anchor-not-a-second-period)).

### ATR.tot

An integrator: **write a rate, and the attribute keeps the running total.**
**Reads and writes:** `<atr>_tim` (must exist, a 64-bit integer: the time of the last
write). **Reads:** `<atr>_sec` (the rate's time unit in seconds, default 1),
`<atr>_tot_set` (a preset). *Skips updates.*

Stored = rate × seconds since the last write ÷ `<atr>_sec` + total before. Measured,
10 written three times, 0 s, 1.0 s and 0.5 s apart:

```
0      the first write only starts the clock
10     10 x 1.000 s
15.01  + 10 x 0.501 s
```

```xml
<var id="FLOW_TOT" val="0" val_typ="0x1308" val_tim="0" val_tim_typ="0x0108"
     val_sec="3600" val_sec_typ="0x0104" val_fnc="[ATR.tot]" sta="0x0303" sta_typ="0x142"/>
```

With `val_sec="3600"` 3600 m³/h written for 1.002 s adds 1.002. **Give `<atr>_sec` an
integer type**: as untyped text the total became `Infinity`. A gap of more than 60 s
adds nothing and only restarts the clock. A non-zero `<atr>_tot_set` makes the next
write start from that value and is set back to 0: preset 100, then 10 for 0.5 s →
105.01. Every write logs a `NOTICE` line `ATR.tot: delta sec 1.002000`.

### ATR.upd

**Changes:** nothing; **stores the value at once**, before the rest of the chain runs,
and logs `NOTICE ATR.upd: id('A_UPD')/@val <- 5`.

The functions after it see the new value in `evt.obj` (measured: `obj=5` instead of the
old 0). The engine uses it in its own `sta` handlers.

### ATR.nup

**Changes:** the value back to the old one: **nothing is stored**, and the rest of the
chain runs with the old value (`valn=0`). In a `sta` chain the `sta` is kept too.

Its common use is after a function that only consumes what was written, so the
attribute does not keep it:

```xml
<list id="L" new="" new_typ="0x1401" new_fnc="[ELM.new,ATR.nup]" .../>
```

measured: `new` stays empty after five additions; without `ATR.nup` it holds the last
text written ([PRJEDU_mirror](../../examples/data/PRJEDU_mirror/),
[PRJEDU_records](../../examples/data/PRJEDU_records/)).

### ATR.tmr

A countdown guard. **Changes:** depends on where the write comes from.

* A write from a timer's chain (source EVT): the stored value − 1, down to 0.
* Any other write: accepted when the stored value is 0, or when 0 is written (reset);
  otherwise refused — the chain stops and nothing is stored.

```xml
<var id="HOLD" val="0" val_typ="0x1104" val_fnc="[ATR.tmr]" sta="0x0303" sta_typ="0x142"/>
```

Measured: 5 set, then 20 written → stays 5 (refused). A 0.3 s timer whose `evt_fnc`
writes 1 to it → 4, 3, 2, 1, 0, 0. A script running in a timer's chain is "from a
timer" too: there every write counts down.

### ATR.map

**Reads:** `<atr>_map` = the id of a list; in that list `map_tst`, optionally `map_key`,
and its `<item>` children. **Writes:** the other attributes of the item found, to the
element. *Skips updates.*

| `map_tst` | The item chosen |
|---|---|
| `IDX` | the one at position = the value (from 0) |
| `EQU` | the first whose attribute named `<atr>` equals the value |
| `MSK` | the first whose `<atr>` AND the value is not 0 (the item values must be numbers) |

```xml
<list id="MAP_IDX" map_tst="IDX">
  <item txt="OFF" col="grey"/><item txt="ON" col="green"/><item txt="FAULT" col="red"/>
</list>
<var id="M1" val="0" val_typ="0x1104" val_map="MAP_IDX" val_fnc="[ATR.map]" txt="" col="" sta="0x0303" sta_typ="0x142"/>
```

1 written: `txt` = ON, `col` = green. 9 written: no item, nothing changes.

* Every attribute of the item except `id` and `<atr>` is copied, written through its
  own chain — **including `xdb_cls` and any `*_typ`**. An item carrying `val_typ`
  wrote it onto the element and took its run bit away: after the first match the
  chain never ran again. Give the items numbers through a class instead
  (`<item xdb_cls="cls_N" val="4" .../>`, `<tio id="cls_N" val_typ="0x0104"/>`); the
  element then gets `xdb_cls` too. With `MSK` and untyped item values nothing ever
  matched; class-typed, 3 found the item with 1 and 6 the item with 4.
* `map_key="grp"` keeps only the items whose `grp` equals the element's `grp`
  (`grp="B"`: `B-one`, not `A-one`).
* Not found: the script in `<atr>_map_onfail` runs — **twice per miss** (measured
  with a counter).
* The list is found by id anywhere in the document.

In a `pro_fnc` ([VAL.map](#valmap)) it matches on `pro` and copies `val`:
`<item pro="0" val="Closed"/><item pro="1" val="Open"/>`, 1 written to `pro` → `val`
Open.

### ATR.mapr

The reverse. **Reads:** `<atr>_map`; in the list `map_atr`. **Writes:** to the
element's attribute named by `map_atr`. *Skips updates.*

It looks for the item whose `<atr>` equals the value (in every mode), then writes
either the item's **position** (`IDX`) or the item's `map_atr` attribute (`EQU`,
`MSK`).

```xml
<list id="MAPR" map_tst="EQU" map_atr="code"><item txt="OFF" code="0"/><item txt="ON" code="1"/></list>
<var id="MR" txt="" txt_typ="0x1401" txt_map="MAPR" txt_fnc="[ATR.mapr]" code="" sta="0x0303" sta_typ="0x142"/>
```

`txt` ON → `code` 1, OFF → 0. With `map_tst="IDX" map_atr="idx"`, ON → `idx` 1.

### ATR.json

**Changes:** nothing; **writes** the members of a JSON object written to it as
attributes of the element, each through its own chain, creating the missing ones.
The text itself is stored too.

```js
evt.SetValue("id('J')/@val", '{"a":5,"b":"x","sta":"0x0103"}');
// a=5, b=x, and sta=0x0101: written like any sta
```

A member that is an object becomes a child element (`{"n":{"x":2}}` → `<n x="2"/>`). An
array inside the object is a parse error (`FAIL ATR.json: ... parse error`), after the
members before it were written. A JSON array as the whole text changes nothing.

---

## VAL: functions that write val

The bridge from a raw value to `val`: put into `pro_fnc` (or any other attribute's
chain) they write **`val`**, which then runs `val_fnc`. Put into `val_fnc` itself they
act on `val` like the `ATR` function of the same name.

```xml
<io id="LEVEL" pro="0" pro_typ="0x1102" pro_fnc="[VAL.put]"
    val="0" val_typ="0x1308" val_fnc="[VAL.cnv,ATR.rou]" val_cnv_dlt="0.1" val_rou="0.1" .../>
```

([PRJEDU_modbus](../../examples/protocols/PRJEDU_modbus/)). A missing `val` is
created as a 32-bit integer.

**"Except when the data direction is OUT."** A write that goes out to a device —
`pro` written by [PRO.put or PRO.cnvr](05_Alarms_Conditions_and_Protocol_Chains.md)
from `val_fnc` — carries `EVT.FLG_PRO_OUT` (`0x0080` in `evt.flg`). `VAL.put`, `cnv`,
`cnvr`, `map` and `mapr` do nothing on it, so a value sent out is not copied back into
`val` and the two chains do not feed each other. Measured, with
`out_fnc="[PRO.put]"` writing `pro` and `pro_fnc="[main.flg,VAL.put]"`:

```
FLG VOUT.pro valn=5 flg=0x0180 dir=0x0080     written by PRO.put: val stays 0
FLG VOUT.pro valn=6 flg=0x0A00 dir=0x0000     written directly: val becomes 6
```

`VAL.tog`, `set`, `rst`, `inc` and `dec` do **not** look at the direction (measured:
`VAL.inc` added 1 on the outgoing write). [EVT.flgclrdir](#evtflgclrdir) clears it.

### VAL.put

**Reads:** `<atr>_put`. **Writes:** `val` = `<atr>_put` if present, else the value
written. Skipped on an outgoing write.

`pro` 724 → `val` 724, then `val_fnc="[ATR.cnv]"` with 0.1 → 72.4. With `pro_put="5"`,
any `pro` → `val` 5. In `val_fnc` it is [ATR.put](#atrput) (`val_put="8"`: 3 → 8).

### VAL.cnv

**Reads:** **`val_cnv_dlt`** and **`val_cnv_ofs`** (not `pro_cnv_*`). **Writes:** `val` =
value × dlt + ofs. *Skips updates*; skipped on an outgoing write.

`pro_fnc="[VAL.cnv]"`, `val_cnv_dlt="0.1" val_cnv_ofs="1"`, `pro` 724 → `val` 73.4.

### VAL.cnvr

**Writes:** `val` = (value − `val_cnv_ofs`) ÷ `val_cnv_dlt`. `pro` 72.4 with dlt 0.1 →
`val` 724.

### VAL.set

**Writes:** `val` = 1. *Skips updates.* Any `pro` → `val` 1.

### VAL.rst

**Writes:** `val` = 0. *Skips updates.* `val` 5, any `pro` → 0.

### VAL.tog

**Writes:** `val` = NOT `val`. *Skips updates.* Two writes to `pro`: `val` 0 → 1 → 0.

### VAL.inc

**Writes:** `val` + 1 (the **stored** `val`, unlike `ATR.inc`). *Skips updates.* `val`
10, two writes to `pro` → 11, 12. In an `evt_fnc` it counts timer firings.

### VAL.dec

**Writes:** `val` − 1. *Skips updates.* 10 → 9.

### VAL.map

It is [ATR.map](#atrmap) **on the chain's own attribute**: in `pro_fnc` it reads
`pro_map` and matches items on `pro`. *Skips updates*; skipped on an outgoing write.
The common form:

```xml
<list id="L_DOOR" map_tst="EQU"><item pro="0" val="Closed"/><item pro="1" val="Open"/></list>
<io id="DOOR" pro="0" pro_typ="0x1104" pro_map="L_DOOR" pro_fnc="[VAL.map]" val="" val_typ="0x1401" .../>
```

`pro` 1 → `val` Open, 0 → Closed, 7 → unchanged.

### VAL.mapr

[ATR.mapr](#atrmapr) on the chain's own attribute; skipped on an outgoing write.

### VAL.upd

Meant for `sta_fnc`: re-run `val_fnc` when `sta` changes. **Do not use it**: it carries
the `sta` event's marks into the `val` write, and `val` is then treated as a `sta`.
Measured, `sta_fnc="[ELM.sta,VAL.upd]"`, `val` 7, `sta` written 0x0103: **`val` became
4**. A `<var>` re-runs its `val_fnc` by itself when it comes back to RUNNING
([ELM.sta](#elmsta)).

---

## ELM: functions on another attribute of the element

Each writes a **different attribute of the same element**, named in
`<atr>_elm_<function>_atr`; the operand, where there is one, is
`<atr>_elm_<function>` or else the value written. The target attribute's own chain
runs. The written attribute itself is stored as written. All but `ELM.sta`, `ELM.new`
and `ELM.del` *skip updates*.

If `<atr>_elm_<function>_atr` is missing: `NOTICE ERROR! field val_elm_put_atr not
found`; if it names the chain's own attribute: `NOTICE ERROR! the value of field
val_elm_put_atr cannot be used`. The chain goes on either way.

### ELM.sta

**In:** `sta_fnc` — every element without its own `sta_fnc` gets it. **Changes:** the
run nibble of the `sta` being written, from the command nibble.

Measured on a `<var>`, one write after another:

| Written | Stored | |
|---|---|---|
| `0x0100` | `0x0101` | STOP → RESTING |
| `0x0000` | `0x0000` | DISABLE → DISABLED |
| `0x0200` | `0x0202` | PAUSE → WAITING |
| `0x0300` | **`0x0300`** | START leaves the run nibble as written |
| `0x0303` | `0x0303` | |
| `0x0103` | `0x0101` | |
| `0x0203` | `0x0202` | |
| `0x0003` | `0x0000` | |

So start an element with `0x0303`. On a `<var>` it does two things more:
* the handling bits set to INH (`0x00C0`) clear the alarm bits: `0x03CB` written
  (alarm bits 0x08 in it) is stored `0x03C3`;
* back to RUNNING, or INH taken off, it runs `pro_fnc` and `val_fnc` once more as an
  update — alarms are evaluated again (measured: `val_fnc` ran with `flg=0x0300`).

### ELM.put

**Reads:** `<atr>_elm_put_atr` (target), `<atr>_elm_put` (value, else the value
written). **Writes:** the target.

```xml
<var id="SW" val="0" val_typ="0x1104" val_fnc="[ELM.put]" val_elm_put_atr="out"
     out="0" out_typ="0x0104" sta="0x0303" sta_typ="0x142"/>
```

7 written: `val` 7, `out` 7. With `val_elm_put="99"`: `out` 99. A target that does not
exist is created (as text when it has no type).

### ELM.and

**Writes:** target = target AND (`<atr>_elm_and`, else the value written). `flags`
0xFF, 0x0F written → `flags` 15.

### ELM.or

`flags` 0x10, `val_elm_or="0x01"` → 17.

### ELM.xor

`flags` 0x0F, 3 written → 12.

### ELM.tog

**Writes:** target = NOT target. Two writes: 0 → 1 → 0.

### ELM.set

**Writes:** target = 1.

### ELM.rst

**Writes:** target = 0. Common in the field as `tmr_fnc="[ELM.rst]"`.

### ELM.inc

**Writes:** target + 1. The counter pattern:

```xml
<var id="PULSES" val="0" val_typ="0x1104" val_fnc="[ELM.inc]" val_elm_inc_atr="cnt"
     cnt="0" cnt_typ="0x0104" sta="0x0303" sta_typ="0x142"/>
```

Three writes → `cnt` 1, 2, 3.

### ELM.dec

**Writes:** target − 1. 5 → 4.

### ELM.get

**Reads:** `<atr>_elm_get_atr`. **Changes:** the value being written, to that
attribute's value.

`val_elm_get_atr="src" src="hello"`, "x" written → `val` hello.

### ELM.upd

**Reads:** `<atr>_elm_upd_atr`. **Runs** that attribute's chain once with its current
value; the value does not change.

`val_elm_upd_atr="oth" oth_fnc="[main.seen]"`: writing `val` ran `main.seen` with
`valn=3 valp=3`. Seen in the field as `ref_fnc="[IF.set,ELM.upd,ATR.rst]"`: a
"refresh" button that re-runs another chain and falls back to 0.

### ELM.tim

**Writes:** the target = now, ms since 1970. `t` 1794390223459.

### ELM.timstr

**Writes:** the target = now as local text with offset, `2026-11-11T02:43:43-0700`.

### ELM.tim2int

**Reads:** the value written as a duration in letters — days `D`, then `T`, hours `H`,
minutes `M`, seconds `S`. **Writes:** the target = seconds; the written value is
rewritten in a normal form.

| Written | Target | Stored in the attribute |
|---|---|---|
| `1DT2H3M4S` | 93784 | `1DT2H3M4S` |
| `PT1H30M` | 5400 | `T1H30M` |
| `90S` | 90 | `T90S` |
| `08:30` | **0** | empty |

It does not read `08:30`, whatever its help says.

### ELM.eval

**Reads:** `<atr>_elm_eval_atr` (target), `<atr>_elm_eval` (a script expression, else the
value written is the script). **Writes:** the result to the target.

**Do not use it.** The `evt` it hands to the expression is not set up: measured,
`1+2` wrote 3 once, and the next call (`evt.valn * 10`, and another time the plain
`6*7` as written value) stopped the engine — every thread went silent. Use
[ATR.eval](#atreval) and [ELM.put](#elmput), or a script function in the chain.

### ELM.new

**In:** the chain of an attribute you write to make an element, by convention `new`.
**Makes:** a child element of this element.

```xml
<list id="LOG" new="" new_typ="0x1401" new_fnc="[ELM.new,ATR.nup]"
      new_elm_new="item" new_elm_new_pos="0" new_elm_new_idatr="id"
      new_elm_new_max="B10" new_elm_new_eval="main.fill_item(evt);" sta="0x0303" sta_typ="0x142"/>
```

```js
function fill_item(evt)
{
    var d = JSON.parse("" + evt.valn);   // what was written to @new
    evt.obj.batch = d.batch;             // evt.obj is the new element
    return 1;                            // 1: add it
}
```

| Attribute | Meaning |
|---|---|
| `<atr>_elm_new` | tag of the new element. Required: without it nothing is made, one `NOTICE` |
| `<atr>_elm_new_pos` | `0` first; `-1` or empty last; `name+` / `name-` sorted by the new element's attribute `name`, ascending / descending, `name+,other-` with a second key. Anything else — a number — puts it **last** |
| `<atr>_elm_new_idatr` | the attribute that gets an id, normally `id`. Empty: no id |
| `<atr>_elm_new_max` | how many children of that tag are kept; letters before the digits are the id prefix (below). `0`: no limit. Absent: `N9999` |
| `<atr>_elm_new_eval` | script run before the element is added; its value decides |

**Keeping a list at n.** The list is trimmed so that it holds |max| after the add:
a positive max removes from the **end**, a negative one from the **front**. Measured,
`v1` … `v7` or `p1` … `p5` written:

| `_pos`, `_max` | Result | |
|---|---|---|
| `-1`, `B5` | `B1 v1, B2 v2, B3 v3, B4 v4, B5 v7` | the first four stay, the last slot is replaced each time |
| `0`, `3` | `p5, p4, p3` | newest first: a log |
| `-1`, `-C3` | `C3 c3, C1 c4, C2 c5` | newest last: a log the other way round |

**Ids.** The number pool is |max|, padded to its width: `B10` gives `B01` … `B10`, `B5`
gives `B1` … `B5`, `T01_A9` gives `T01_A1` … (the number is the trailing digits).
Numbers go round and an id freed by the trim is used again. No `_max`: `N0001`,
`N0002` …. `_max="0"` with an id attribute: the first element got `1`, the next ones
none — and an element without an id never reaches a mirror.

**Sorting is text order.** `tim+` with 30, 10, 20, 5 written gave `10, 20, 30, 5`;
`tim-` gave `5, 30, 20, 10`. Pad the numbers, or write times as ISO text.

**The eval.** `evt.obj` is the new element, not yet in the list (its id is already
set; `count()` of the list does not include it). `evt.valn` is what was written,
`evt.valp` empty, `evt.atr` `new`, `evt.id` the new id. The value of the last
expression decides, or a `return`:

| `_eval` | Added |
|---|---|
| `main.fill(evt)` returning 1, `true` | yes — `INFO ELM.new(L1): main.fill(evt) returned true, element added` |
| `main.fill(evt); 0` | no — `NOTICE ... returned false, element not added` |
| a function that returns nothing | **no** |
| `'yes'` | no |
| none | yes, empty |

The written text stays in `new` unless [ATR.nup](#atrnup) follows. The element is
published and replicated like any other new element. To add an element from script
instead, see `AddElement` in [page 03](03_Events_Documents_and_Addresses.md).
[PRJEDU_cluster](../../examples/cluster/PRJEDU_cluster/) keeps a list of ten this way.

### ELM.del

**Deletes** its own element (published and replicated), and **stops the chain**: the
value is not stored.

```xml
<item id="D1" val="0" val_typ="0x1104" val_fnc="[ELM.del]" sta="0x0303" sta_typ="0x142"/>
```

Any write to `D1.val` removes `D1`.

### ELM.json

Does nothing (the help marks it not in use).

---

## XDB: functions on an address

These reach **another element**, by an address in `<atr>_xdb_<function>_lnk`. The
target is written like `evt.SetValue` writes it, so its own chain runs.

The link may hold variables, replaced at every call:

```xml
<var id="KEY" val="" val_typ="0x1401" val_fnc="[XDB.get]"
     val_xdb_get_lnk="id('{=evt.valn}')/@txt" val_xdb_get="out" out="" .../>
```

| Variable | Is replaced by | Measured |
|---|---|---|
| `{=evt.valn}` `{=evt.valp}` | the value written / before | `5` `0` |
| `{=evt.id}` `{=evt.atr}` `{=evt.doc}` | element, attribute, document | `X_FMT` `val` `XDB` |
| `{=evt.stan}` `{=evt.stap}` | `sta` new / before, hex | `0x0303` |
| `{=evt.obj.NAME}` | the element's attribute `NAME`; empty if none | `kW` |
| `{=xdb.doc}` | the document | `XDB` |
| `{=eval(evt.obj.NAME)}` | the script text held in attribute `NAME`, run | `formula="evt.valn+100"` → `105` |
| `{=` anything else `}` | evaluated as script, `evt` available | `{=2*evt.valn}` → `14`, `{=Math.round(evt.valn/3.0)}` → `2` |

**An expression must not start with `evt.`**: such a text is only one of the names
above, and `{=evt.valn*2}` became empty. Write `{=2*evt.valn}`. `{=evt.src.id}` is
always empty.

### XDB.get

**Reads:** the value at `<atr>_xdb_get_lnk`. **Writes:** it to the attribute named in
`<atr>_xdb_get`; without that attribute, or naming itself, it **replaces the value
being written**.

`KEY` above, "K2" written → `out` = "two" (`<item id="K2" txt="two"/>`). Without
`val_xdb_get`, "K1" written → `val` = "one". **An address that finds nothing replaces
the value with an empty one**: "abc" written with `id('NOPE')` stored "".

### XDB.put

**Writes:** `<atr>_xdb_put` if present, else the value written, to `<atr>_xdb_put_lnk`.

`val_xdb_put_lnk="id('TGT')/@val"`: 5 written → `TGT.val` 5. With `val_xdb_put="77"` → 77.

### XDB.msk

**Writes:** target = (target AND `<atr>_xdb_msk_and`) OR `<atr>_xdb_msk_val`, at
`<atr>_xdb_msk_lnk`. Any write triggers it.

`msk_and="0x0F" msk_val="0x05"`: 0xF0 → 0x05. `msk_val="0x10"`: 0xF3 → 0x13.

### XDB.xor

**Writes:** target XOR (`<atr>_xdb_xor`, else the value written). 0xFF XOR 0x0F →
0xF0; 0xFF with 3 written → 0xFC.

### XDB.add

**Writes:** target + (`<atr>_xdb_add`, else the value written). 5 + 10 → 15; 5 with 3
written → 8.

### XDB.tog

**Writes:** target XOR 1 at `<atr>_xdb_tog_lnk`. *Skips updates.* 0 → 1 → 0.

### XDB.upd

**Runs** the chain at `<atr>_xdb_upd_lnk` once with its current value, as an update; the
target value does not change. *Skips updates.* Measured: the target's `val_fnc` ran with
`valn=3 valp=3 flg=0x4B00`.

### XDB.fmt

**Reads:** `<atr>_xdb_fmt`, a text with variables. **Writes:** the text, variables
replaced, to **`<atr>_xdb_fmt_lnk`** (not `_xdb_put_lnk`, as its help says).

```xml
<var id="X_FMT" val="0" val_typ="0x1104" unit="kW" val_fnc="[XDB.fmt]"
     val_xdb_fmt_lnk="id('TXT')/@txt" val_xdb_fmt="P={=evt.valn} {=evt.obj.unit}" .../>
```

5 written → `TXT.txt` = `P=5 kW`.

### XDB.eval

**Reads:** the text at the address `<atr>_xdb_eval_lnk`. **Runs** it as script with
`evt`.

```xml
<var id="CODE" txt="evt.SetValue(&quot;id('TGE')/@val&quot;, evt.valn * 3);"/>
<var id="RUN" val="0" val_typ="0x1104" val_fnc="[XDB.eval]" val_xdb_eval_lnk="id('CODE')/@txt" .../>
```

5 written to `RUN` → `TGE.val` 15.

### XDB.qry

**In:** the chain of the attribute you write a query into, usually `qry` on a `<list>`.
**Makes:** one `<item>` under this element per element the address finds, with copies
of its attributes. The value written is the address.

```xml
<list id="QL" qry="" qry_typ="0x1401" qry_fnc="[XDB.qry]" qry_max="2" qry_flt="rid,val,grp" sta="0x0303" sta_typ="0x142"/>
```

```js
evt.SetValue("id('QL')/@qry", "//var[@grp='A']");
// <item val="3" qry_idx="1" qry_elm="var" qry_doc="XDB" rid="QA1" grp="A"/>
// <item val="12" qry_idx="2" qry_elm="var" qry_doc="XDB" rid="QA2" grp="A"/>   qry_cnt="2"
```

| Attribute | Meaning |
|---|---|
| the value written | the address: `//var[@grp='A']`, `doc('X')//..`, `doc('A,B')//..`, `doc('X*')//..`, `doc('*Y')//..`. A trailing `[position()>N and position()<=M]` pages over all documents together |
| `<atr>_max` | at most this many items; absent or 0: all |
| `<atr>_ofs` | skip that many first |
| `<atr>_flt` | the attributes to copy. A name ending in `+` or `-` sorts by it; `xdb_sub` adds the children as JSON. Absent: all but `*_fnc`, `*_typ`, `xdb_log` |
| `<atr>_id` | the name the source's `id` gets (default `rid`) |
| `<atr>_cls` | `xdb_cls` of every item; `*` keeps the source's own |
| `<atr>_out` | when present, gets the JSON of all items |
| `<atr>_row` | when present, every item gets the JSON of the items made so far |
| writes `<atr>_cnt` | how many items were made |

Every item also gets `<atr>_idx` (1, 2 …), `<atr>_elm` (the source's tag) and `<atr>_doc`.
**All earlier children of the element are removed first** — any child, not only items.
The items have no id. Rows the writer's role may not read are left out (one line says
how many).

* **`id` in the filter copies nothing**: the id is renamed first. Write `rid` (or the
  `<atr>_id` name).
* **Sorting is text order**: `qry_flt="id,val-"` gave 7, 3, 12, 1, 1.
* An unknown document gives `qry_cnt` 0.

### XDB.evt

The same function as [EVT.cre](#evtcre).

### XDB.sta

The engine binds it to the root `<xdb>` (its `sta_fnc` reads `[XDB.sta]`): a command
written to the document's `sta` starts, pauses or stops the document and, on a cluster,
changes its role ([Two engines](../10_Two_Engines.md)). You do not write it into the XML.

### XDB.elmnew

Not in use: does nothing. Measured with `XDB.elmnew`, `elmsub`, `elmdel` and `elmmod`
before an `ATR.set` in one chain: nothing was added or removed, and the `ATR.set` after
them ran.

### XDB.elmsub

Not in use: does nothing.

### XDB.elmdel

Not in use: does nothing.

### XDB.elmmod

Not in use: does nothing.

---

## EVT: timers

The timer and what is written to start or stop one. Why timers exist and how a period
is kept is in [Timers and events](../02_Timers_and_Events.md); this is the full list of
what a timer element reads.

### EVT.cre

**In:** `xdb_fnc`. **Changes:** puts `EVT.sta` at the front of the element's `sta_fnc`:
`sta_fnc="[main.seen]"` became `[EVT.sta,main.seen]`; none became `[EVT.sta]`.

It does not make the timer. **`evt_cfg` does**: measured, an element with `evt_cfg` and
no `xdb_fnc` fired every 0.5 s like the others. Without `EVT.sta`, switching the
element on again does not re-phase it. Only `dev`, `bi`, `io`, `var`, `rec`, `list` and
`item` below `<data>` are timers.

```xml
<var id="T_READ" xdb_fnc="[XDB.evt]" evt="" evt_typ="0x1201" evt_thr="TH_MAIN"
     evt_cfg="0x0002" evt_per="1" evt_dly="0" evt_syn="0" evt_fnc="[main.read]"
     sta="0x0303" sta_typ="0x142"/>
```

| Field | Meaning |
|---|---|
| `evt_cfg` | mode and flags, below. `0x0000` = no timer (the start log says `evt_add: T_OFFC evt_cfg=0x0000`) |
| `evt` / `evt_typ` | the attribute the timer writes; a type that is not an integer is changed to a 32-bit integer |
| `evt_per` | period, **seconds**, decimal; 0 or absent = 1 s |
| `evt_dly` | delay / phase, seconds |
| `evt_syn` | `0` count from the start; `>0` anchor on a local clock boundary of that size |
| `evt_dur` | duration, seconds |
| `evt_thr` | the `<thr>` or `<con>` it runs on ([which thread](../02_Timers_and_Events.md#which-thread-does-an-element-belong-to)) |
| `evt_fnc` | the chain run on every firing |
| `trg` / `trg_fnc` | runs at the start or end edge, with the flags below. `trg_typ` is not needed |
| `evt_tim` | written with the time (ms) of an edge, with the flags below |

**`evt_cfg`, low nibble = mode:**

| | Mode | Measured |
|---|---|---|
| `0x0001` | **round robin**: every such element on one `evt_thr` shares one slot, `evt_dly` apart | three at 0.2 s: R1 200 ms, R2 400, R3 600, R1 801 … each every 0.6 s. With an `evt_per` too: `ERROR evt_add: R4 is ROUND ROBIN and declares evt_per=1, which this mode does NOT read ... NO timer is created` |
| `0x0002` | **periodic**: `evt` pulses to 1 every `evt_per` and runs `evt_fnc` once | ([Timers and events](../02_Timers_and_Events.md#a-timer-in-full)) |
| `0x0003` | **counter**: started by `evt` = 1, writes `evt_dur`/`evt_per`, then one less every `evt_per`, down to 0 | `evt_per="0.2" evt_dur="0.6"`: `evt` 3 at once, 2 at 0.2 s, 1 at 0.4 s, 0 at 0.6 s |
| `0x0004` | **one shot**: started by `evt` = 1; after `evt_dly` writes 1, after `evt_dur` more writes 0 | `evt_dly="0.5" evt_dur="1"`: 1 at 0.502 s, 0 at 1.501 s |

**Flags:**

| Flag | Effect | Measured |
|---|---|---|
| `0x0010` | start inhibit: a second start while running is refused | one shot started at 0, again at 0.2 s: fired 0.6–0.8 s; without the flag 0.8–1.0 s |
| `0x0020` | stop inhibit: writing 0 does not stop it | stopped at 0.2 s, fired anyway at 0.6 s; without it, never |
| `0x0080` | queue every firing, drop none ([Timers and events](../02_Timers_and_Events.md#two-rules-that-decide-what-you-see-under-load)) | |
| `0x0100` | run `trg_fnc` at the start edge | periodic, every second: `TRG` beside each firing |
| `0x0200` | run `trg_fnc` at the end edge | counter: at 0; one shot: at 1.501 s |
| `0x0400` `0x0800` `0x0C00` | warning / alarm / emergency at the end | **no change to the element's `sta` was seen** (one shot, 0x0C04: `sta` 0x0303 after the end) |
| `0x1000` | write `evt_tim` at the start edge | `evt_tim=1794390222955` |
| `0x2000` | write `evt_tim` at the end edge | |
| `0x4000` | periodic: first firing at start + `evt_dly`, not start + `evt_per` | |

A counter or one shot is started by writing 1 to `evt` and stopped by writing 0. **That
write must not come from a timer's chain**: measured, `evt.SetValue(..."/@evt", 1)` in a
function run by another timer stored 1 and started nothing. Write through
[EVT.set](#evtset) or [EVT.put](#evtput) — they start it from anywhere. The starting
write itself runs `evt_fnc` once (with 1 for a counter, 0 for a one shot); test
`evt.valn`.

### EVT.sta

**In:** `sta_fnc` (put there by [EVT.cre](#evtcre)). **Changes:** maps the command onto the
run nibble like [ELM.sta](#elmsta), and **re-phases** the timer when it is switched on.
A firing is skipped while the command is STOP or below.

Measured, a 0.5 s periodic: `sta` 0x0100 written at 1.5 s → `0x0101`, no firing; 0x0303
at 2.5 s → next firing at 3.0 s.

### EVT.put

**In:** another attribute's chain. **Writes:** the value written to `evt`, as a start
the timer takes. *Skips updates.*

```xml
<var id="T_CNT" evt="" evt_typ="0x1201" evt_cfg="0x0003" evt_per="0.2" evt_dur="0.6"
     val="0" val_typ="0x1104" val_fnc="[EVT.put]" evt_fnc="[main.tick]" .../>
```

1 written to `val` from inside a timer's function → `evt` 3, 2, 1, 0.

### EVT.set

**Writes:** `evt` = 1: starts a counter or one shot. *Skips updates.* `x_fnc="[EVT.set]"`
on a one shot with `evt_dly="0.2" evt_dur="0.3"`: `evt` 1 at 0.2 s, 0 at 0.5 s.

### EVT.rst

**Writes:** `evt` = 0: stops it. *Skips updates.* `x_fnc="[EVT.set]" y_fnc="[EVT.rst]"`,
`x` then `y` 0.2 s apart, delay 0.5 s: the timer never fired.

### EVT.flgclrdir

**Changes:** clears the direction bits of `evt.flg` for the rest of the chain, so a
value going out is treated as a plain one. Measured: `pro_fnc="[EVT.flgclrdir,VAL.put]"`
on a `pro` written by `PRO.put` — `flg` 0x0180 became 0x0100, and `VAL.put` wrote `val`
5 (without it `val` stayed 0).

---

## THR: threads

### THR.cre

**In:** `xdb_fnc` of a `<thr>` (or `<con>`). **Makes:** the thread object; puts
`THR.sta` into `sta_fnc`. On any other element it does nothing.

```xml
<thr id="TH_MAIN" xdb_fnc="[THR.cre]" sta="0x0303" sta_typ="0x142" thr_per="100" thr_wrk="1"/>
```

The thread's fields, read when it starts (and again after it is switched off and on);
`<con>`, `<xdb>` and `<script>` accept them too:

| Field | Unit | Default | Range | Meaning |
|---|---|---|---|---|
| `thr_per` | ms | 100 | 10 … 10000 | longest sleep, and one cycle's budget |
| `thr_wrk` | count | 0 | 0 … 1000 | worker threads ([thr_wrk="0"](../02_Timers_and_Events.md#the-thread-element)) |
| `thr_rate` | % | 100 | 10 … 200 | share of a cycle the queue may use |
| `que_max` | nodes | 65000 | 100 … 500000 | how much may wait; more is refused |
| `thr_tmo` | s | — | 1 … 600 | how long the engine waits for this thread on the way down |
| `thr_spin` | µs | 0 | 0 … 10000 | wake that much before a timer is due ([Timers and events](../02_Timers_and_Events.md#pitfalls)) |
| `thr_alm`, `thr_alm_que`, `thr_alm_lat`, `thr_alm_wdt` | | on | | health alarm thresholds ([Keeping it running](../12_Keeping_It_Running.md)) |

A value out of range is moved into it and the log says what was used: `thr_per="5"
que_max="50" thr_rate="500"` gave

```
TH2.thr(0).config: thr_per = 10 ms thread loop period
TH2.thr(0).config: que_max = 100
TH2.thr(0).config: thr_rate = 200
```

`que_cnt` is not read by anything.

### THR.sta

**In:** `sta_fnc`. **Changes:** stops and starts the thread. `0x0000` written:
`Thread paused`, `Thread stopped`, `Thread disabled`; `0x0303`: `Thread enable`, the
`config:` lines again, `Thread started`, `Thread running` — the fields are read anew.
Its timers stop and start with it.

---

## SCR: scripts

### SCR.prs

**In:** `xdb_fnc` of a `<script>` ([Scripting](../03_Scripting.md#where-script-lives)).
**Loads:** the file in `src`, or the element's own text.

A `<script>` without it is never loaded: calling one of its functions fails with
`object variable not found`. A file that cannot be opened:

```
PANIC  src.prs: #XDB.bad: could not open script file '...\db\nope.js'
NOTICE CallScopeFunction: #XDB/bad/xdb_fnc: function 'SCR.prs' returned an error [ERR_OPEN_0000]
```

### SCR.sta

**In:** the `sta` chain of every `<script>` (`[ELM.sta,SCR.sta]` without writing it).
**Reloads** the module when its `sta` crosses a boundary:

| Written | What happens | Log |
|---|---|---|
| `0x0101`, then `0x0303` | **merge**: the file is read again, the functions are replaced, the module's variables are kept | `script re-parsing, MERGE - functions only, state kept` |
| `0x0000` | the module is dropped: calls fail with `object variable not found` | `script module dropped (sta -> DISABLED)` |
| `0x0000`, then `0x0303` | **clean**: a fresh module, as at start | `script re-parsing, CLEAN (sta 0 -> running)` |

Measured on a module with `var cnt = 0;`, `ver()` returning 1 and `inc()` counting:
`inc` 1, 2; the file changed to `ver()` returning 2; merge → `ver()` 2, `inc()` **3**;
clean → `ver()` 2, `inc()` **1**. A function deleted from the file survives a merge.
The code that writes the `sta` must not be in the module being reloaded.

### SCR.trace

`SCR.trace(on, filter, maxlines)` → nothing

Logs every statement that runs. `filter` is a scope or function name (`""` everything);
`maxlines` (default 10000) ends the trace by itself.

```js
SCR.trace(1, "tfn", 20);
tfn(3);
SCR.trace(0);
```

```
NOTICE SCR.trace: main.tfn [44,9] var
NOTICE SCR.trace: main.tfn [45,5] if
NOTICE SCR.trace: main.tfn [45,16] expr
NOTICE SCR.trace: main.tfn [46,5] return
```

The lines are `NOTICE`: with `xdb_log` below 5 you see none.

### SCR.prof

`SCR.prof(1)` starts timing, `SCR.prof(0)` stops it (the table is kept), `SCR.prof("reset")`
clears it, `SCR.prof()` returns it, busiest first; time includes the calls inside.

```js
[{"fnc":"main.tfn","calls":50,"ms":0.0327,"ms_max":0.0009,"ms_avg":0.000654},
 {"fnc":"kw","calls":5,"ms":0.0128,"ms_max":0.0072,"ms_avg":0.00256},
 {"fnc":"toFixed","calls":5,"ms":0.0067,"ms_max":0.0044,"ms_avg":0.00134}, ...]
```

### SCR.dump

`SCR.dump()` → text (JSON)

The calling function's locals and call stack, returned and also logged (`NOTICE`):

```js
function dmp(a, b) { var loc = a + b; var arr = [1, 2]; return SCR.dump(); }
dmp(2, 3)
// {"scope":"main","fnc":"dmp","stack":"main.dmp < main.run < Global. < Global. < Global.",
//  "local":{"a":2,"b":3,"loc":5,"arr":[1,2]},"arg":[]}
```

The arguments appear under `local`.

### SCR.test

`SCR.test()` → text

The engine's own tests of how a script's role is applied, run in the calling document on
temporary elements; Engineer or above. Answers `72 tests, 0 failed -- all passed`, and
leaves about twenty `ALERT` lines in the log: the refusals it provokes on purpose.
