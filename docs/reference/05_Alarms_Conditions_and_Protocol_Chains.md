# Alarms, conditions and protocol chains

The functions on this page are written in XML, in a `*_fnc` chain, and run when the
attribute is written: alarms (`ALM`), conditions that skip part of a chain (`IF`),
filters that hold a change back (`FILTER`), an on-off controller (`CTRL`), and the `PRO`
functions every protocol shares — the ones that poll a block, cut it into points and send
a write. Why a write runs a chain is [02_Timers_and_Events](../02_Timers_and_Events.md);
the `<con>`/`<dev>`/`<bi>`/`<io>` tree is [01_The_Element_Tree](../01_The_Element_Tree.md);
the health bits and device alarms are [12_Keeping_It_Running](../12_Keeping_It_Running.md).

* [How these functions run](#how-these-functions-run)
* [ALM: alarms](#alm-alarms)
* [IF: conditions](#if-conditions)
* [FILTER: holding a change back](#filter-holding-a-change-back)
* [CTRL: the on-off controller](#ctrl-the-on-off-controller)
* [PRO: the protocol chain functions](#pro-the-protocol-chain-functions)

## How these functions run

A chain runs left to right **before** the value is stored. A function can let it go on,
stop it, or make it skip:

| What the function does | The rest of the chain | The value |
|---|---|---|
| goes on | runs | stored |
| stops it (`PRO.out`, `PRO.set`, a held `FILTER`, `PRO.req` …) | does not run | **not stored** |
| a failed `IF.*` | skipped until `IF.else` / `IF.end` | stored |

An alarm function does not write `sta` itself. It changes the level in the event
(`evt.stan`, which a script later in the chain can read); the engine writes `sta` when the
chain is over, and that write runs the element's `sta_fnc` — which is where `ALM.put`,
`ALM.msk`, `ALM.lnk` and `ALM.tim` sit.

!!! warning "A chain is at most 63 characters"
    `val_fnc`, `pro_fnc` and `sta_fnc` keep 63 characters. A longer list is cut, loses its
    closing `]`, and **nothing in it runs** — no error, no line. Measured:
    `[main.x,ATR.rou,ATR.rou,ATR.rou,ATR.rou,ATR.rou,ATR.rou,IF.any]` (63) runs,
    the same with `ATR.rou` at the end (64) does not, and reading the attribute back gives
    the first 63 characters. Other `*_fnc` attributes are not cut: a 79-character
    `evt_fnc` ran whole. Put a long tail into one script function.

## ALM: alarms

An alarm is not an object. It is the level in the element's own `sta`, and how it is
handled:

| `sta` bits | Meaning |
|---|---|
| `0x000C` | level: `0x0004` WARNING, `0x0008` ALARM, `0x000C` EMERGENCY, `0` normal |
| `0x00C0` | handling: `0x0040` NEW (not acknowledged), `0x0080` SUP, `0x00C0` INH (inhibited) |

The value functions (`onlvl`, `onequ`, `onand`, `onin`) share these rules, measured on
`ALM.onlvl`:

* **Only a running value is judged.** With the run state WAITING (`0x0302`) nothing is
  raised; when `sta` goes back to `0x0303` nothing is judged either until the value next
  changes.
* **Only a change is judged.** Writing the same value again does nothing. The value in
  the file at start is not judged: `val="96"` with a limit of 90 starts as `0x0303`.
* **A rise sets NEW.** `0x0303` → `0x034B` for an alarm. A return to normal keeps NEW
  until someone acknowledges: `0x0343`.
* **To acknowledge**, write `sta` with NEW cleared: `sta &= ~0x0040` gives `0x030B`. A
  later change at the same level leaves it acknowledged; a new level sets NEW again.
  An acknowledged alarm that clears goes straight to `0x0303`.
* **Writing `0x0303`** clears the level of a value alarm until the value next changes:
  `0x034F` → `0x0303`, then 97 → `0x034F` again. (The health bits of `<xdb>`, `<con>` and
  `<thr>` behave differently: [12_Keeping_It_Running](../12_Keeping_It_Running.md).)
* **INH** (`sta` `0x03C3`) holds the level at 0 whatever the value. **SUP** (`0x0080`)
  does not hold: the next alarm writes NEW over it (`0x0383` → `0x034B`).

Every change of the level writes one `WARN` line and, when the document has an
`alm_adr`, one record:

```
ALM.onlhi: id('LVL')/@val ! 'alm_onlhi_alm' -> sta = 0x034B
```

```
{"tim":1794389499975,"uid":111263334298192,"src":"S01","knd":"alm","doc":"XDB","rid":"LVL",
 "atr":"val","valp":"85","valn":"90","stap":839,"stan":843,"fnc":"onlhi","valr":"90",
 "pri":0,"desc":"tank level"}
```

`fnc` is the function (`onlhi` above the high limits, `onllo` below the low ones, `onlvl`
for a return to normal, `onequ`, `onand`, `onin`, `onsta`, `devsta_<why>`, or the name
given to `ALM.send`), `valr` the limit that decided, `pri` the element's `<atr>_alm_pri`,
`desc` its `desc`, `stap`/`stan` the `sta` before and after as numbers. Where the record goes —
a history table, the journal, another node — is
[11_Records_and_Saving](../11_Records_and_Saving.md). Without `alm_adr` the level is set
and logged all the same.

**A delay.** Two attributes on the element (not per attribute) hold a change back:

| Attribute | Unit | Effect |
|---|---|---|
| `alm_dly_set` | s | a rise is applied this long after the crossing, if the value is still beyond the limit then |
| `alm_dly_rst` | s | a return to normal is applied this long after |

Measured with `alm_dly_set="2" alm_dly_rst="1"`: a write of 91 left `sta` at `0x0303` for 2 s,
then `0x034B`, and the record's `tim` was the moment of the crossing. A value back
below the limit within the 2 s recorded nothing at all. The engine also keeps `alm_tim`
(ms) on the element: the time of the last change. A write made in `xdb_start`, before the
document runs, is applied at once.

There is **no hysteresis or deadband**: a value that wanders around a limit raises and
clears on every crossing. `alm_dly_set` / `alm_dly_rst` are the filter.

### ALM.onlvl

**In:** `val_fnc` (any `<atr>_fnc`). **Reads:** `<atr>_alm_onlhi_wrn`, `_onlhi_alm`,
`_onlhi_emr`, `<atr>_alm_onllo_wrn`, `_onllo_alm`, `_onllo_emr`, `<atr>_alm_pri`,
`alm_dly_set`, `alm_dly_rst`. **Changes:** the level in `sta`.

Six limits, any of them left out. A high limit is reached **at or above** it, a low limit
**at or below** it; EMERGENCY is tested first, then ALARM, then WARNING. The chain goes on.

```xml
<var id="LVL" desc="tank level" val="50" val_typ="0x1308" sta="0x0303" sta_typ="0x1142"
     val_fnc="[ALM.onlvl]"
     val_alm_onlhi_wrn="80" val_alm_onlhi_alm="90" val_alm_onlhi_emr="95"
     val_alm_onllo_wrn="20" val_alm_onllo_alm="10" val_alm_onllo_emr="5"/>
```

| Written | `sta` | Record `fnc` |
|---|---|---|
| 80 | `0x0347` | `onlhi` (`valr` 80) |
| 85 | `0x0347` | — (same level) |
| 90 | `0x034B` | `onlhi` |
| 95 | `0x034F` | `onlhi` |
| 92 | `0x034B` | `onlhi` (`valr` 90) |
| 50 | `0x0343` | `onlvl` (cleared, NEW kept) |
| 20 / 10 / 5 | `0x0347` / `0x034B` / `0x034F` | `onllo` |
| `NaN` | `0x034F` | `onlhi`: NaN is above every high limit |
| `Infinity` / `-Infinity` | `0x034F` | `onlhi` / `onllo` |

The limits compare as the **value** compares: a text value (`val_typ="0x1401"`) is
compared as text, so `"100"` is below `"90"` and raises nothing. Give a value that is a
number a number type. Used in [PRJEDU_modbus](../../examples/protocols/PRJEDU_modbus/) and
[PRJEDU_records](../../examples/data/PRJEDU_records/).

### ALM.onequ

**In:** `val_fnc`. **Reads:** `<atr>_alm_onequ_wrn`, `_alm`, `_emr`. **Changes:** the level.

The level of the first of EMERGENCY, ALARM, WARNING whose value equals the value written.
Numbers and text both work.

```xml
<var id="MODE" val="0" val_typ="0x1104" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onequ]"
     val_alm_onequ_alm="3" val_alm_onequ_wrn="2"/>
<var id="STATE" val="OK" val_typ="0x1401" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onequ]"
     val_alm_onequ_emr="FAULT"/>
```

`MODE` 2 → `0x0347`, 3 → `0x034B`, 4 → `0x0343`. `STATE` `"FAULT"` → `0x034F`, `"OK"` → `0x0343`.

### ALM.onand

**In:** `val_fnc`. **Reads:** `<atr>_alm_onand_wrn`, `_alm`, `_emr`, `_wai` — each a bit
mask **with a number type** (`_typ`). **Changes:** the level, and the run state.

A level is raised when the value AND its mask is not 0. `_wai` is different: a match puts
the element into WAITING.

```xml
<var id="FLAGS" val="0" val_typ="0x1104" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onand]"
     val_alm_onand_alm="0x0004" val_alm_onand_alm_typ="0x0144"
     val_alm_onand_wrn="1"      val_alm_onand_wrn_typ="0x0104"/>
```

1 → `0x0347`, 5 → `0x034B`. Two traps, both measured: a mask with no `_typ` is text, and
text AND a number is never true — `val_alm_onand_alm="0x0004"` alone raises nothing,
ever. And `_wai`: 0x80 against `_wai="0x0080"` gave `0x0342`, and from then on nothing,
because WAITING is not judged; only a write of `sta` brings it back.

### ALM.onin

**In:** `val_fnc`. **Reads:** `<atr>_alm_onin_wrn`, `_alm`, `_emr`: a list of integers in
brackets, `"[3,5,7]"`. **Changes:** the level.

```xml
<var id="LINK" val="1" val_typ="0x1104" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onin]"
     val_alm_onin_alm="[0]"/>
```

The usual use: a 1/0 point that is an alarm at 0 ([PRJPER_tello](../../examples/hobby/PRJPER_tello/)).
Measured with `_alm="[3,5,7]" _wrn="[1]"`: 1 → `0x0347`, 5 → `0x034B`, 4 → `0x0343`.
Only whole numbers.

### ALM.onsta

**In:** `sta_fnc`. **Reads:** `sta_alm_onsta_wrn`, `_alm`, `_emr` — a `sta` value whose run
nibble is compared. **Changes:** the level.

Raises the level when the run state equals the one named:

```xml
<var id="PUMP" val="0" sta="0x0303" sta_typ="0x142" sta_fnc="[ALM.onsta]" sta_alm_onsta_alm="0x0002"/>
```

`sta` 0x0302 → `0x034A`, 0x0303 → `0x0343`. An element that passes through WAITING while
the document starts records that alarm and its clear at start.

### ALM.onalmlnk

**In:** `val_fnc` of a value that carries alarm levels from elsewhere. **Reads:** the value.
**Changes:** the level, **without** NEW, record or line.

The value is read in 2-bit parts; the highest part is the level (1 WARNING, 2 ALARM, 3
EMERGENCY). It is the receiving end of [ALM.lnk](#almlnk).

```xml
<var id="ZONE" val="0" val_typ="0x1144" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onalmlnk]"/>
```

0x0110 → `0x0307`, 0x0300 → `0x030F`, 0 → `0x0303`.

### ALM.onstalnk

**In:** `val_fnc`. **Reads:** the value. **Changes:** the level, without NEW, record or line.

The value is read in 4-bit parts, each a `sta` run nibble; the highest alarm level among
them is taken. 0x3663 → `0x0307`, 0x030B → `0x030B`, 0 → `0x0303`.

### ALM.put

**In:** `sta_fnc`. **Reads:** `sta_alm_put_cfg`, `sta_alm_put_<state>`,
`sta_alm_put_lnk_<state>`, `sta_alm_put_lnk` — always these `sta_` names. **Changes:** the
addresses named.

When the level (or the run state) changes, writes the value given for the new state to an
address: the state's own `_lnk_<state>`, else the common `_lnk`.

| `sta_alm_put_cfg` bit | State | | bit | State |
|---|---|---|---|---|
| `0x80` | emergency (`emr`) | | `0x08` | running (`run`) |
| `0x40` | alarm (`alm`) | | `0x04` | waiting (`wai`) |
| `0x20` | warning (`wrn`) | | `0x02` | stopped (`man`) |
| `0x10` | normal (`nrm`) | | `0x01` | off (`dis`) |

```xml
<var id="TANK" val="50" val_typ="0x1308" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onlvl]"
     val_alm_onlhi_alm="90" val_alm_onlhi_wrn="80"
     sta_fnc="[ALM.put]" sta_alm_put_cfg="0x0070" sta_alm_put_alm="2" sta_alm_put_wrn="1" sta_alm_put_nrm="0"
     sta_alm_put_lnk="id('LAMP')/@val" sta_alm_put_lnk_alm="id('HORN')/@val"/>
```

85 → `LAMP.val` 1; 91 → `HORN.val` 2 (its own link); 50 → `LAMP.val` 0.

### ALM.msk

**In:** `sta_fnc`. **Reads:** `sta_alm_msk_cfg`, `sta_alm_msk_lnk`, `sta_alm_msk_<state>`.
**Changes:** some bits of the address.

Packs the state into a few bits of a shared word, so many elements report into one value.
`sta_alm_msk_cfg` = `0x000BIISS`: `SS` the states (the bits of `ALM.put`), `II` the
position, `B` the bits per element (2 when 0). The first state that applies, in the order
off, stopped, waiting, emergency, alarm, warning, normal, running, writes its
`sta_alm_msk_<state>`, or 1, 1, 1, 3, 2, 1, 0, 0 when that is absent.

```xml
<var id="P4" val="50" val_typ="0x1308" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onlvl]"
     val_alm_onlhi_alm="90" val_alm_onlhi_wrn="80"
     sta_fnc="[ALM.msk]" sta_alm_msk_cfg="0x000004F0" sta_alm_msk_lnk="id('SUMMARY')/@val"/>
```

Position 4 × 2 bits: 85 → `SUMMARY` `0x0100`, 91 → `0x0200`, 50 → `0x0000`. The other
bits of `SUMMARY` are kept.

### ALM.lnk

**In:** `sta_fnc`. **Reads:** `sta_alm_lnk` (address), `sta_alm_lnk_idx` (position, in
2-bit steps), `sta_alm_lnk_map`. **Changes:** 2 bits of the address.

Writes the state as 2 bits at position `idx`. `sta_alm_lnk_map` has one hex digit per state,
from the right: off, stopped, waiting, running, normal, warning, alarm, emergency; the
larger of the run state's digit and the level's digit is written. Without a map it is
`0x32101011`.

```xml
<var id="P5" val="50" val_typ="0x1308" sta="0x0303" sta_typ="0x1142" val_fnc="[ALM.onlvl]"
     val_alm_onlhi_alm="90" val_alm_onlhi_wrn="80"
     sta_fnc="[ALM.lnk]" sta_alm_lnk="id('SUMMARY')/@val" sta_alm_lnk_idx="5"
     sta_alm_lnk_map="0x32100111"/>
```

With the map above: 85 → `SUMMARY` `0x0400`, 91 → `0x0800`, back to 50 → `0x0000`.
**Write your own map.** The default gives *running* the digit 1, so a running point with no
alarm writes 1 (a warning): measured with no map, 50 after the alarm gave `0x0400`, not 0.
`0x32100111` makes running 0 and waiting 1.

### ALM.tim

**In:** `sta_fnc`, or after an alarm function in `val_fnc`. **Reads:** the level change.
**Changes:** `<atr>_alm_tim`.

On a rise of the level (not on a fall) writes the time in ms since 1970:
`sta_alm_tim` in `sta_fnc`, `val_alm_tim` in `[ALM.onlvl,ALM.tim]`. Measured both:
`1794389499998`; unchanged when the alarm cleared.

### ALM.timstr

As `ALM.tim`, into `<atr>_alm_tim_str`, as local time text with its offset:
`2026-11-11T02:31:39-0700`.

### ALM.devsta

**In:** a `<dev>`'s `sta_fnc` — in a plain document `PRO.sta` runs it for every device by
itself. **Reads:** the device's `sta`, its blocks' `sta`, its `<con>`. **Changes:** the
device's level and run state.

ALARM when no block communicates or the device stopped answering, WARNING when some do and
some do not. The record's `fnc` names why (`devsta_nbi`, `_pbi`, `_emp`, `_dwn`, `_con`,
`_stp`, `_nrm`) and `why` says it in words; the table and what is *not* an alarm are in
[12_Keeping_It_Running](../12_Keeping_It_Running.md#why-a-device-is-in-alarm). Measured:

```
"fnc":"devsta_nbi","why":"none of 1 blocks communicating, waiting: "
"fnc":"devsta_pbi","why":"1 of 3 blocks not communicating: BLKW"
```

The second one is a trap: `BLKW` was a block of write points with no timer. A block that
is never polled stays WAITING after its device starts, and the device reads WARNING for
ever. Put write points under a polled block. Name `ALM.devsta` yourself only in an edge or
hub document (`sta_fnc="[IF.edge,PRO.sta,IF.hub,ALM.devsta]"`); there `PRO.sta` does not.

### ALM.xdbsta

**In:** the `sta_fnc` of an `<xdb>`, in an edge or hub document; a plain document runs it by
itself. **Reads:** the health bits. **Changes:** nothing — it only records.

Records every change of the health level of the document as `xdbsta_<why>`. Measured
(a licence for another project wrote a PANIC line at start):

```
"rid":"XDB","atr":"sta","fnc":"xdbsta_pnc","valr":"0x004C","why":"log PANIC +1"
```

### ALM.consta

The same for a `<con>`: `consta_<why>` (`consta_lnk`, `consta_wdt` …). See
[12_Keeping_It_Running](../12_Keeping_It_Running.md).

### ALM.thrsta

The same for a `<thr>`. Measured with `thr_alm_wdt="0,1,60"` and a callback that slept
2.5 s:

```
"rid":"TH_SLOW","atr":"sta","fnc":"thrsta_wdt","valr":"0x0048","why":"worker 0 running one node for 1 s"
```

### ALM.send

`ALM.send(evt, stan, fnc, valr)` → result code

Raises or clears an alarm from a script function in a chain: the level of `stan` goes into
the element's `sta` when the chain ends (NEW set when it is not 0), with the `WARN` line and
the record `fnc` names.

| Argument | Meaning |
|---|---|
| `evt` | the chain's event; the alarm is on its element and attribute |
| `stan` | a `sta` value; only its level bits are used: `0x0308` = ALARM, `0x0300` = normal |
| `fnc` | the record's `fnc` |
| `valr` | the record's `valr` |

Returns `0x00000000` when the record was written, `0x80000002` when the document has no
`alm_adr` (the level is set anyway), `0x80000008` with other than four arguments.

```js
function check(evt)           // val_fnc="[main.check]"
{
    var r = ALM.send(evt, 0x0308, "custom", 42);
    evt.Log(4, "" + r + " " + evt.stan);    // 0x00000000 0x034B
    return 0;
}
```

After the call `evt.stan` already shows the new level, as it does after any alarm
function in the chain.

## IF: conditions

An `IF.*` function compares the value being written with an attribute. When it fails,
every following function of the chain is **skipped** until `IF.else` or `IF.end`; the
value itself is still stored. Measured with `[IF.grt,ATR.rou]` and `val_if_grt="10"`:
5.555 stored as 5.555, 15.555 as 15.6.

| Pattern | Means |
|---|---|
| `[IF.x,A,IF.end,B]` | A if x; B always |
| `[IF.x,A,IF.else,B,IF.end,C]` | A if x, else B; C always |
| `[IF.x,IF.y,A,IF.else,B,IF.end,IF.end,C]` | A if x **and** y, else B; C always |

Several `IF` in a row are an AND, and `IF.else` is the else of the whole row. **Close a row
with one `IF.end` for each `IF` in it.** One `IF.end` is not always enough, because an `IF`
that is skipped is not counted: measured on `[IF.grt,IF.les,main.a,IF.end,main.b]` with
limits 10 and 20, `main.b` ran for 5 and 15 and **not for 25**. With two `IF.end` it ran for
all three. `IF.else` with no `IF` before it does nothing and both sides run.

The limit is `<atr>_if_<name>`: `val_if_grt` in a `val_fnc`, `sta_if_and` in a `sta_fnc`.
No limit is 0. Every comparison is skipped while the element's run state is DISABLED.

Measured, each with `[IF.x,main.hit]`:

| Function | Limit | Written → `main.hit` ran |
|---|---|---|
| `IF.grt` | 10 | 5 no · 10 no · 15 yes |
| `IF.gre` | 10 | 5 no · 10 yes · 15 yes |
| `IF.les` | 10 | 5 yes · 10 no |
| `IF.lse` | 10 | 10 yes · 15 no |
| `IF.equ` | 10 | 10 yes, and 10 again yes |
| `IF.equ` | `ON` | `"ON"` yes · `"on"` no |
| `IF.grt` | none | 0 no · 1 yes |
| `IF.set` | — | 0→1 yes · 1→1 no · 1→2 no · 0→2 yes; text `""`→`"x"` yes, `"x"`→`"y"` no |
| `IF.rst` | — | 1→0 yes · 0→0 no · 2→0 yes |
| `IF.chg` | — | 0→1 yes · 1→1 no |
| `IF.and` | 2 | 4 yes · 2 yes · 0 no |
| `IF.nand` | 2 | 4 no · 2 no · 0 yes |
| `IF.in` | `[2,4,6]` | 2 yes · 3 no |

### IF.equ

**In:** any `<atr>_fnc`. **Reads:** `<atr>_if_equ`. Goes on when the value equals it — on
every such write, not only a change (add `IF.chg` for that).

### IF.neq

**Does not exist.** The help lists it, but the name is not registered: a chain with it
writes `CallScopeFunction: #XDB.NEQ: function 'IF.neq' not found` and skips it. Use
`[IF.equ,IF.else,..]`.

### IF.grt

**Reads:** `<atr>_if_grt`. Goes on when the value is above it.

### IF.gre

**Reads:** `<atr>_if_gre`. Goes on when the value is at or above it.

### IF.les

**Reads:** `<atr>_if_les`. Goes on when the value is below it.

### IF.lse

**Reads:** `<atr>_if_lse`. Goes on when the value is at or below it.

### IF.set

**Reads:** the previous value. Goes on only when the value goes **from 0** to something
else (for text: from empty to not empty).

### IF.rst

Goes on only when the value goes from something else **to 0** (text: to empty).

### IF.chg

Goes on when the value differs from the stored one. The usual guard before history or a
script: `[ATR.rou,ALM.onlvl,IF.chg,HIS.val]` ([PRJEDU_records](../../examples/data/PRJEDU_records/)).

### IF.and

**Reads:** `<atr>_if_and`. Goes on when **both** the value and the limit are not 0. It is a
logical AND, **not a bit test**: 4 with a limit of 2 goes on. To act on one bit, address the
bit itself (`pro_adr="2.1"`, [PRO.inp](#proinp)) or test it in a script.

### IF.nand

**Reads:** `<atr>_if_nand`. The opposite: goes on when the value (or the limit) is 0.

### IF.in

**Reads:** `<atr>_if_in`, a list of whole numbers in brackets: `"[2,4,6]"`.

### IF.else

Turns the current answer round: what was skipped runs, what ran is skipped. Inside a role
section (`IF.edge` …) it turns the **section** round instead — do not mix the two.

### IF.end

Ends one `IF`. When every `IF` of the row is ended, the chain runs again whatever the
answer was. It does not end a role section.

### IF.alone

**Role marks** say which kind of document runs the part of the chain after them. The kind
is the role class in the document's `sta` ([10_Two_Engines](../10_Two_Engines.md)): plain,
edge (`<doc sta="0x4300">`) or hub (`<doc sta="0x8300">`). A section lasts until the next
mark; `IF.end` does not close it, `IF.any` does.

`IF.alone`: what follows runs in a plain document.

### IF.edge

What follows runs in an edge document.

### IF.hub

What follows runs in a hub document.

### IF.any

What follows runs in every kind.

**An unmarked chain does not run in a hub document**, with one `WARN` line the first time:
`HUB -- unmarked chain skipped ('[ELM.sta]'); write IF.hub / IF.any to run it at the centre`.
Measured with the same elements in three documents:

| Chain | plain | edge | hub |
|---|---|---|---|
| `[main.a]` | a | a | — |
| `[ATR.rou]` (1.23456) | 1.2 | 1.2 | 1.23456 |
| `[IF.any,ATR.rou]` | 1.2 | 1.2 | 1.2 |
| `[IF.alone,main.a,IF.edge,main.b,IF.hub,main.c,IF.any,main.d]` | a d | b d | c d |
| `[IF.edge,main.a,IF.else,main.b]` | b | a | b |
| `[IF.edge,main.a,IF.end,main.b]` | — | a b | — |

A chain that must run on both sides starts with `IF.any`.

## FILTER: holding a change back

A filter stops the chain and does **not** store the value while it holds a change back;
"written to the database" in the help means stored in the attribute. The counters it keeps
are attributes of the element (`<atr>_flt_setcnt` …), and a write that is an update passes
every filter.

### FILTER.setcnt

**In:** `val_fnc`. **Reads:** `<atr>_flt_setcnt_cfg` (a count). **Changes:**
`<atr>_flt_setcnt`.

A change from 0 to something else is stored only after `cfg` more writes of it. A 0 in
between starts again (one `INFO` line: `flt.setcnt : id('SC')/@val value changed before the
filter counter ran out`). Any other change passes.

```xml
<var id="SC" val="0" val_typ="0x1104" sta="0x0303" sta_typ="0x1142"
     val_fnc="[FILTER.setcnt,main.hit]" val_flt_setcnt_cfg="3"/>
```

Five writes of 1: the first three are held (counter 1, 2, 3, `val` stays 0), the fourth is
stored and runs `main.hit`. A debounce for a contact read at every poll.

### FILTER.rstcnt

**Reads:** `<atr>_flt_rstcnt_cfg`. **Changes:** `<atr>_flt_rstcnt`. The same for a change to
0. With `cfg="2"`, 1 → 0 was stored at the third write of 0.

### FILTER.rpttim

**Reads:** `<atr>_flt_rpttim_cfg` (seconds). **Changes:** `<atr>_flt_rpttim` (the time, s).

After a change, writes of the **same** value within `cfg` seconds stop the chain. A change
always passes. With `cfg="3"`: 5, 5, 5 → only the first ran the chain; 4 s later 5, 5 ran
it, the third did not; 6 ran it.

### FILTER.chgtim

**Reads:** `<atr>_flt_chgtim_cfg` (seconds). **Changes:** `<atr>_flt_chgtim`.

A change passes and opens a window; **further changes within `cfg` seconds are dropped** —
not delayed, dropped. With `cfg="3"`: 1 stored; 2 and 3 a moment later were lost (`val`
stayed 1); 4 s later 4 and 5 were stored, 6 right after was lost. A rate limit, not a
"stable for N seconds" filter.

## CTRL: the on-off controller

A thermostat-style controller on one element. Its fields:

| Field | Meaning |
|---|---|
| `rmt` | `1`: AyMON decides the output. `0`: the device is the controller; AyMON mirrors it and passes on what an operator writes |
| `mod` | `1` direct (heating: output 1), `2` reverse (cooling: output 2), `0` both |
| `run` | `0` off, `1` on (manual), `2` automatic |
| `val` | the measurement, copied from `val_ctl_lnk` at every run |
| `set` | the set point |
| `out` | the output: 0, 1 (`out_ctl1_lnk`), 2 (`out_ctl2_lnk`). **Must exist** in the element |
| `ooc_his` | the switching tolerance |
| `val_ctl_lnk`, `set_ctl_lnk`, `run_ctl_lnk`, `out_ctl1_lnk`, `out_ctl2_lnk` | addresses of the device's points |
| `run_ctl_off`, `run_ctl_man`, `run_ctl_aut` | the device's values for off, manual, automatic |

### CTRL.inpOOC

**In:** the `evt_fnc` of a timer on the controller element. **Reads:** the fields above.
**Changes:** `val`, `out` (and in local mode `set` and `run`), and the output links.

Without `rmt` or `mod` it writes `ctl.inpOOC : rmt not defined` (NOTICE) and does nothing.

* **`rmt="1"`**: `val` is copied from `val_ctl_lnk`. `run="0"` sets `out` 0 and writes 0 to
  the output link; `run="1"` sets `out` 1 and writes 1. **`run="2"` (automatic) switches
  nothing on 4.4.2.702:** measured with `set="21"` and the temperature at 20.8, 21.0, 21.2
  and, reversed, at 24.5 with `set="24"` — `out` stayed 0 every time. Decide in a script
  until this works.
* **`rmt="0"`**: `set` from `set_ctl_lnk`, `run` from `run_ctl_lnk` (0, 1 or 2 by matching
  `run_ctl_off`/`_man`/`_aut`, anything else 0), `out` from the output links (`mod="0"`: 1,
  2 or 3 for both).

### CTRL.outOOC

**In:** `set_fnc`, `run_fnc`, `out_fnc` of the controller. **Reads:** `rmt`, the links.
**Changes:** the device's points.

Passes an operator's write on to the device: `out` to the output links (1 to
`out_ctl1_lnk`, 2 to `out_ctl2_lnk`, the other gets 0); with `rmt="0"` also `set` to
`set_ctl_lnk` and `run` to `run_ctl_lnk` as `run_ctl_off`/`_man`/`_aut`. A value
`CTRL.inpOOC` wrote is not passed back.

A complete local controller, measured: the device's `DSET` 19.5 and `DRUN` 0x05 appear as
`set=19.5 run=1`; writing `set` 22.5 made `DSET` 22.5, writing `run` 2 made `DRUN` 0x0D.

```xml
<var id="TRL" xdb_fnc="[XDB.evt]" sta="0x0303" sta_typ="0x142" sta_fnc="[EVT.sta]"
     evt="" evt_typ="0x1201" evt_thr="TH" evt_cfg="0x0002" evt_per="1" evt_fnc="[CTRL.inpOOC]"
     rmt="0" mod="1" run="0" run_typ="0x1104" run_fnc="[CTRL.outOOC]"
     set="0" set_typ="0x1308" set_fnc="[CTRL.outOOC]" val="0" val_typ="0x0308"
     out="0" out_typ="0x1104" out_fnc="[CTRL.outOOC]"
     run_ctl_off="0x00" run_ctl_man="0x05" run_ctl_aut="0x0D"
     run_ctl_off_typ="0x0144" run_ctl_man_typ="0x0144" run_ctl_aut_typ="0x0144"
     val_ctl_lnk="id('TEMP')/@val" set_ctl_lnk="id('DSET')/@val"
     run_ctl_lnk="id('DRUN')/@val" out_ctl1_lnk="id('DOUT')/@val"/>
```

## PRO: the protocol chain functions

These are the same for every protocol; what a protocol adds is in
[09_Connection_and_Protocol_Types](09_Connection_and_Protocol_Types.md#promodbus). Where
each one goes:

| Element | Attribute | Chain |
|---|---|---|
| `<con>`, `<dev>`, `<bi>`, `<io>` | `sta_fnc` | `[PRO.sta]` (the engine runs it when `sta_fnc` is absent) |
| `<bi>` | `evt_fnc` | `[PRO.pol]` — the timer asks the device |
| `<bi>` | `pro_fnc` | `[PRO.inp]` — the answer into the points |
| `<io>` | `pro_fnc` | `[VAL.put]` to read; `[PRO.out,VAL.put]` to read and write |
| `<io>` | `val_fnc` | `[PRO.put]`, `[PRO.cnvr,VAL.cnv]` … to write from `val` |

A whole polled point that can also be written, from the measured loopback (one engine,
a Modbus slave on 127.0.0.1 answering a master in the same document, as
[PRJEDU_modbus](../../examples/protocols/PRJEDU_modbus/) does with two):

```xml
<dev id="D1" pro_adr="1" pro_con="CN_MB" con_host="127.0.0.1" con_port="1502"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="BLK" xdb_fnc="[XDB.evt]" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]"
      evt="0" evt_typ="0x1204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="1"
      pro_typ="0xD412" pro="" pro_fnc="[PRO.inp]" pro_adr="0" pro_len="10" pro_fni="3" pro_fno="6">
    <io id="LEVEL" pro="0" pro_typ="0x1102" pro_adr="0" pro_fnc="[VAL.put]" sta="0x0302" sta_typ="0x1142"
        val="0" val_typ="0x1308" val_fnc="[VAL.cnv,ATR.rou,ALM.onlvl]" val_cnv_dlt="0.1" val_rou="0.1"
        val_alm_onlhi_alm="70"/>
    <io id="SP" pro="0" pro_typ="0x1102" pro_adr="6" pro_fnc="[PRO.out,VAL.put]"
        sta="0x0302" sta_typ="0x1142" val="0" val_typ="0x1104"/>
  </bi>
</dev>
```

Register 0 = 724 gave `LEVEL` `pro=724 val=72.4 sta=0x034B`. Writing `SP.pro` 150 left
`SP` at 100 until the next poll brought 150 back into `pro`, and through
[VAL.put](04_Attribute_and_Element_Functions.md#valput) into `val`. The device counters on
`<dev>` are `pro_pol_snd`, `pro_pol_rcv`, `pro_pol_dur` (ms), `pro_out_snd`, `pro_out_rcv`,
`pro_out_dur`.

### PRO.cre

**In:** `xdb_fnc`. **Changes:** `sta_fnc`.

Puts `PRO.sta` at the head of the element's `sta_fnc`: none → `[PRO.sta]`; `[main.x]` →
`[PRO.sta,main.x]` (measured). The protocol named in a `<con>`'s `xdb_fnc` does the same
for its `<con>`.

### PRO.sta

**In:** `sta_fnc` of `<con>`, `<dev>`, `<bi>`, `<io>`. **Reads:** the command and run
nibbles. **Changes:** `sta` of the element and of the ones below it.

Turns a command into a run state and carries it down the tree:

| Written | `<con>` | `<dev>` / `<bi>` / `<io>` |
|---|---|---|
| START (`0x03xx`) from below START | the connection starts | WAITING, and the ones below WAITING; a point is RUNNING only when an answer lands |
| STOP (`0x01xx`) | the connection stops | RESTING (run nibble 1) |
| DISABLE (`0x00xx`) | off | run nibble 0 (a `<dev>` written `0x0000` left its blocks and points at `0x0300`); a `<dev>` closes its own session (`device left STARTED, closing CLISES(1)`) |
| INH on an `<io>` | | the alarm level cleared |

In a plain document it also runs [ALM.devsta](#almdevsta) for each `<dev>`. On a `<con>`
it also takes an acknowledgement of the health bits
([12_Keeping_It_Running](../12_Keeping_It_Running.md)).

### PRO.open

**In:** `pro_fnc` of a `<con>`. **Reads:** the value written to the `<con>`'s `pro`.
**Changes:** the connection.

`pro` = 0 closes the connection (`PRO.open: connection cut`); measured, the `<con>` then
reads `sta=0x0000`, its devices `0x0340`, its points `0x0301`. Writing 1 afterwards does
nothing: the connection is off. Writing its `sta` `0x0303` brought it back and the polls
went on.

### PRO.pol

**In:** `evt_fnc` of a `<bi>`. **Reads:** `pro_con` and `pro_adr` of the `<dev>`; `pro_fni`,
`pro_adr`, `pro_len` of the `<bi>`; the timing fields below. **Changes:** the `<bi>`'s
`pro`, its `sta`, the `<dev>`'s counters.

Builds one request from the block, sends it, and writes the answer into the block's `pro`,
which runs its `pro_fnc` (`PRO.inp`). The timer lives on the `<con>`'s thread unless
`evt_thr` says otherwise. No poll is made while the `<dev>` is commanded STOP or below.

**If no answer comes, nothing is distributed:** the points keep their last value, and only
the **last** failed attempt takes the block and its points to WAITING. Measured with a peer
that accepts the connection and never answers (`pro_tmo="0.5" pro_try="2"
pro_faildly="1.5"` on the `<dev>`):

```
SBLK:PRO.modbus(2).pro.pol: @pro : Error(ERR_RECEIVE_TIMEOUT)
SBLK:PRO.modbus(2).pro.pol: @pro : retry 1/2 queued in 1500 ms (ERR_RECEIVE_TIMEOUT)
...
SBLK:PRO.modbus(2).pro.pol: @pro : retry budget exhausted, 3 attempts (requests in a row without an answer)
SBLK:PRO.modbus(2).pro.pol: no answer to 3 request(s) in a row -- the device is asked less often until it answers (next in 500 ms, then up to con_rct 5000 ms)
ALM.devsta_nbi: id('DSLOW')/@sta ! 'sta' -> sta = 0x034A
```

After that the polls (`evt_per="2"`, `con_rct="5"`) came 2.5, 2, 4, 6, 6 s apart; the
first answer ends the pause.

| Field | On | Unit | Meaning |
|---|---|---|---|
| `pro_tmo` | `<con>` or `<dev>` | s | how long to wait for the answer |
| `pro_try` | `<con>` or `<dev>` | count | retries after a failed request: `2` = 3 attempts (log: `pro_try = 2 retries (3 attempts)`) |
| `pro_faildly` | `<con>` or `<dev>` | s | the gap before a retry; nothing waits on it |
| `pro_refreshdly` | `<con>` or `<dev>` | s | after a write that succeeded, read the block back this much later |
| `pro_senddly`, `pro_readdly` | `<con>` or `<dev>` | s, at most 1 | pauses inside one exchange (a shared RS-485 line) |
| `con_rct` | `<con>` | s | the longest pause for a device that does not answer, and the redial wait |

A retry is made only after a time-out, a checksum error or a wrong answer, never after a
failed connection. Measured `pro_refreshdly="0.3"` with `evt_per="10"`: a write came back
into `pro` within the second, not ten seconds later.

### PRO.inp

**In:** `pro_fnc` of a `<bi>`. **Reads:** the block's `pro`, each child's `pro_typ`,
`pro_adr`, `pro_len`, `pro_swp`. **Changes:** the `pro` and `sta` of every child.

Cuts the block into its points. Leave it out and every poll succeeds and no `<io>` moves.

* **`pro_typ` of the `<bi>`** is a buffer, and its element is the unit of everything else:
  `0xD412` 16-bit, `0xD411` bytes. **`pro_len`** counts those elements.
* **`pro_adr` of an `<io>`** is the element it starts at. `"N.b"` is bit *b* of element *N*;
  the bit may run past the element (`0.19` is bit 3 of element 1).
* **`pro_typ` of the `<io>`** says how much it takes: `0x1102` one 16-bit element, `0x1111`
  one bit, `0x1104` / `0x1304` two elements (U32 / F32).
* **`pro_swp`**: `1` swaps the bytes of each 16-bit word, `2` the 16-bit words of each
  32-bit, `4` the 32-bit halves of each 64-bit. It is for numbers only.
* A point outside the block stays WAITING, without a line.

Measured on registers 724, 8, 1, 2, then 12.5 as a float in registers 4–5:

| `<io>` | `pro_typ` | `pro_adr` | `pro_swp` | `pro` |
|---|---|---|---|---|
| A | `0x1102` | `0` | | 724 |
| B | `0x1111` | `1.3` | | 1 (bit 3 of 8) |
| B2 | `0x1111` | `1.2` | | 0 |
| B19 | `0x1111` | `0.19` | | 1 |
| C | `0x1104` | `2` | | 131073 (`0x00020001`: the first register is the low word) |
| C2 | `0x1104` | `2` | `2` | 65538 (`0x00010002`: high word first, as most Modbus devices send) |
| C3 | `0x1102` | `2` | `1` | 256 |
| F | `0x1304` | `4` | | 12.5 |
| S1 | `0x1401`, `pro_len="4"` | `0` | `1` or none | `"BADC"` from `0x4142 0x4344`: text keeps each register's bytes swapped |
| OOR | `0x1102` | `12` | | 0, `sta=0x0302` |

### PRO.vrec

**In:** an `<atr>_fnc` of a `<bi>`. Distributes the block like `PRO.inp`, into the
children's attribute of the same name, by `<atr>_adr`. It does not apply `pro_swp`
(measured: the point that read 65538 under `PRO.inp` read 131073). On `pro`, use `PRO.inp`.

### PRO.out

**In:** `pro_fnc` of an `<io>`. **Reads:** `pro_fno` (of the `<io>`, else of its `<bi>`),
`pro_ado` (else `pro_adr`) of the `<io>` and the `<bi>`, `pro_swp`, the `<dev>`'s `pro_adr`.
**Changes:** the device; `pro_out_snd` / `pro_out_rcv`.

Sends what was written to `pro` and **ends the chain without storing it**. The device's
answer comes back into the same `pro` with the next read and runs the functions after
`PRO.out` — so `[PRO.out,VAL.put]` is read and write in one point. A value that came
**from** the device passes `PRO.out` to the next function.

| Situation | Measured |
|---|---|
| sent | `SP:PRO.modbus(1).pro.out: [150] -> @pro : OK`; `pro` 100 until the next poll, then 150 |
| a point nothing reads back | `pro` stays at its old value for good: use `PRO.outc` |
| the protocol cannot write, no link | one `ERROR` line `NOT SENT`, nothing stored |
| the device refused | one `ERROR` line, not repeated |
| **the `<dev>` is switched off** | **stored in `pro`, not sent, no line**; the next poll after the device comes back overwrites it |

### PRO.outc

As `PRO.out`, but after a successful send the chain goes on with the value written, and
it is stored. For a point that is never read back: an output nothing polls, a
publish-only topic ([PRJHW_fan](../../examples/board/PRJHW_fan/)). Measured
`[PRO.outc,main.after]`: `pro` 33 at once, `main.after` saw 33.

### PRO.outf

Sends **every** value written to `pro`, also one that came from the device, and ends the
chain. Measured in a polled block: every poll wrote the reading straight back to the device
(`pro_out_snd` up by one a second) and `pro` was never stored. Use `PRO.out`.

### PRO.put

**In:** `val_fnc` of an `<io>`. **Reads:** `<atr>_put` (else the value written).
**Changes:** the `<io>`'s `pro`.

Writes the value (or a fixed `val_put`) into `pro` as an outgoing value, so its `pro_fnc`
(`PRO.out`) sends it; the chain goes on and `val` is stored. A value that came from the
device passes.

```xml
<io id="SV" pro="0" pro_typ="0x1102" pro_adr="7" pro_fnc="[PRO.out,VAL.put]"
    sta="0x0302" sta_typ="0x1142" val="0" val_typ="0x1104" val_fnc="[PRO.put]"/>
```

`val` = 77: `val` 77 at once, `[77] -> @pro : OK`, and the next poll's value in both.

!!! warning "It writes the stored value at every start of the device"
    A point with `VAL.put` in `pro_fnc` and `PRO.put` (or `PRO.cnvr`, `PRO.set`) in
    `val_fnc` writes its stored `pro` to the device whenever the device's session starts,
    and its `val` becomes that `pro`. Measured: the register was 66 on the device, the
    point held 0; switching the `<dev>` off and on wrote `[0] -> @pro : OK` and the
    register became 0. Keep the write path (`PRO.out` in `pro_fnc`) and write `pro`, or
    accept that a restart restores the last value.

### PRO.set

**In:** `val_fnc`. Writes 1 into `pro` (as `ATR.set`) to be sent, and **ends the chain**:
`val` is not stored; it follows the device. Measured: `val` = 5 sent `[1]` and left `val` 1.

### PRO.rst

As `PRO.set` with 0. Measured: `val` = 9 on a point with `pro` 7 → `pro` 0, `val` kept 5.

### PRO.cnv

**In:** `val_fnc`. **Reads:** `<atr>_cnv_dlt`, `<atr>_cnv_ofs`. Writes `val × dlt + ofs` into
`pro` and ends the chain. Measured `val_cnv_dlt="0.1"`: `val` = 50 → `pro` 5, `val` kept.

### PRO.cnvr

The reverse: `pro = (val − ofs) / dlt`, then ends the chain. The pair for an engineering
value that is written:

```xml
<io id="CV" pro="0" pro_typ="0x1102" pro_adr="8" pro_fnc="[PRO.out,VAL.put]"
    sta="0x0302" sta_typ="0x1142" val="0" val_typ="0x1308"
    val_fnc="[PRO.cnvr,VAL.cnv]" val_cnv_dlt="0.1"/>
```

`val` = 7.7 sent `[77] -> @pro : OK` and left `val` as it was; the device's value then came
back through `VAL.put` and `VAL.cnv` (`PRO.cnvr` lets a reading pass).

### PRO.map

**In:** `val_fnc`. Runs [ATR.map](04_Attribute_and_Element_Functions.md#atrmap) on the value
and ends the chain: the value is not stored and nothing is written to `pro`.

### PRO.mapr

As `PRO.map` with `ATR.mapr`.

### PRO.req

Does nothing useful: it ends the chain, so the value is not stored. On a `<con>` it also
writes a `PANIC` line, `CN_MB:PRO.inp: connection not found`, which puts the document in
EMERGENCY. Do not use it.

### PRO.upd

Does nothing; the chain goes on.
