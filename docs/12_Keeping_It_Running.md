# Keeping it running

How a running engine tells you something is wrong, before someone reads a log. Everything
here is on by default in every example: `PRJEDU_telnet` is the way in while it runs.

---

## Health is in `sta`

`<xdb>`, `<con>` and `<thr>` show the state of their own work in the alarm bits of their
own `sta`, so an operator's page sees "this thread is behind" as it sees any alarm.

| Bits | Meaning |
|---|---|
| `0x000C` | level: `0x0004` WARNING, `0x0008` ALARM, `0x000C` EMERGENCY |
| `0x00C0` | handling: `0x0040` NEW (not acknowledged), `0x0080` SUP, `0x00C0` INH |

**So do not compare a whole `sta` with `0x0303`:** an object showing a WARNING reads
`0x0347`. Test the run state: `(sta & 0x0003) == 3`.

**Conditions** are measured once a second and clear by themselves after 10 quiet seconds:

| What | WARNING / ALARM / EMERGENCY | Attribute |
|---|---|---|
| queue depth against `que_max` | 50 / 80 / 95 % | `thr_alm_que` |
| the oldest node waiting in a queue | 5 / 30 / 120 s | `thr_alm_lat` (ms) |
| one cycle running; a worker on one node; a `<con>`'s sessions not served | – / 10 / 60 s | `thr_alm_wdt` (s) |
| timer firings skipped for 5 s | WARNING | |
| a server `<con>`'s sessions at 90 % of `con_ses` | WARNING | |
| a client `<con>`'s own link down | off unless declared | `thr_alm_lnk` (s) |
| the root only: the durable log not written / free space low / a checkpoint failed | ALARM / WARNING / WARNING | [13_Durable_Documents](13_Durable_Documents.md) |

**Events** hold until acknowledged: work refused at `que_max` (ALARM), session list full
(ALARM), no memory for a session (EMERGENCY), and the document's own log lines: **FAIL →
ALARM, PANIC → EMERGENCY** (a plug-in that did not load, a script that does not compile).

Thresholds are `"warning,alarm,emergency"`, with `0` for an unused level:

```xml
<con id="CN_SQL" ... thr_alm_wdt="0,60,300"/>      <!-- its queries run long, legitimately -->
<con id="CN_UP"  ... thr_alm_lnk="5,15,60"/>       <!-- a link that matters -->
<thr id="TH_X"   ... thr_alm="0"/>                 <!-- off for this object -->
```

**A worker held by one long call is ALARM after 10 s.** That is a judgement, and it may be
the wrong one for a long SQL statement or a file transfer: set `thr_alm_wdt` on that object.

`thr_alm_lnk` watches the main session of a client `<con>` that dials by itself, not one
with a session per `<dev>`. The protocol has to notice the loss first: MQTT and `PRO.rep`
within their keep-alive, a client that only sends at its next send.

Every change is one log line, a rise at ERROR. This pair was measured with
`thr_alm_wdt="0,2,60"` and a script that sleeps 4.5 s:

```
TH_SLOW.hlt: sta alarm NORMAL -> ALARM+new [worker 0 running one node for 2 s] (sta=0x034B)
TH_SLOW.hlt: sta alarm ALARM+new -> ALARM [acknowledged by the operator] (sta=0x030B)
```

**To acknowledge**, write `sta` with NEW cleared and the same level: `sta &= ~0x0040`. A
condition still present stays, without NEW; a latched event goes. Write `0x00C0` to inhibit
the object, `0x0080` to show levels without NEW. A plain `0x0303` does not acknowledge.

With `alm_adr` on the document (`11_Records_and_Saving`) every change of the level is also a
record in the alarm list: `fnc` is `<kind>_<source>` (`thrsta_wdt`, `consta_lnk`,
`xdbsta_pnc`, and `_nrm` when it clears) and `why` is the reason in words. Nothing else is
needed. A spare document records nothing.

## Why a device is in alarm

`PRO.sta` runs `ALM.devsta` for every `<dev>`: ALARM when no block communicates or its state
falls, WARNING when some do and some do not. With `alm_adr`, the record says why:

| `fnc` | Level | Meaning |
|---|---|---|
| `devsta_pbi` | WARNING | some blocks do not communicate; `why` names them |
| `devsta_nbi` | ALARM | blocks exist, none communicates |
| `devsta_emp` | ALARM | no block running or waiting |
| `devsta_dwn` | ALARM | the device stopped answering |
| `devsta_con` | ALARM | its connection is not running |
| `devsta_stp` | ALARM | the device is commanded off |
| `devsta_nrm` | | back to normal |

A record with the same level and a new reason is a record of its own. A reader tells it from
a new alarm because its `stap` and `stan` carry the same level.

**What is not an alarm:**

* a device session starting. A settle window follows the start (one round of its first poll,
  1–120 s), and a device that never answers gets **one** `devsta_nbi` at its end
* a document going down: a stop, a pause, a demotion to spare
* a promotion (`10_Two_Engines`)
* a slow block not asked yet. A device with a 30 s block and an hourly one is not `devsta_pbi`
  for the first hour; the price is that a slow block whose **first** poll fails is counted from
  its second firing
* a session closed by `con_idletmo`

A device that does not answer is also asked less: after the requests of its budget
(`pro_try` + 1) fail, its polls pause for `pro_tmo`, then twice as long each time, up to
`con_rct`. The first answer ends it, and nothing is logged per poll.

A peer that keeps the socket and stops answering (a hung PLC, a firewall that lost its state)
is dialled again after `con_tmomax` timeouts in a row, 3 by default, `-1` off.

## Reading the load

The engine measures every thread and connection once a second and prints a `stats` line every
60 s, or every 10 s while something is near a limit. **A `stats` line that starts appearing
more often is itself the signal.**

```js
evt.GetValue("stat(id('CN_SQL'))")     // one, live
evt.GetValue("stat(//thr)")            // every thread, a JSON array
```

Read it in this order, not left to right:

| | Key | Question |
|---|---|---|
| 1 | `thr_win_ms` | Is the measurement sound? Near 1000 means yes. Much higher is a finding: the thread cannot get back |
| 2 | `*_lat_us`, `*_que_cnt` | Is it behind? These do not saturate |
| 3 | `*_tot_lps` | Is it busy? 0–100 %, and only meaningful with 2: 99 % with 40 µs is full and keeping up, 99 % with 165 ms is not |
| 4 | `*_cyc_ovr`, `tmr_skp` | What is being lost? |
| 5 | `thr_*` or `wrk_*` | `thr_*` is the thread itself, `wrk_*` its worker pool. With `thr_wrk="0"` every `wrk_*` is zero |

| Pattern | What it is | Next |
|---|---|---|
| `tot_lps` high, `lat` low, `cyc_ovr` 0 | healthy and full | nothing |
| `tot_lps` high, `lat` and `que_cnt` rising | a backlog: not enough capacity | raise `thr_wrk`, or split the elements |
| `tmr_skp` rising, `lat` low | firings dropped, not accumulating | is that `evt_per` really needed? |
| `wrk_tot_lps` low, `wrk_tot_lps_max` high | one worker loaded | `wrk_cpu_max_idx`, the `evt_thr` spread |
| `lat` high, `tot_lps` low | not busy, but work is waiting | a lock or a blocking call |
| `ses_cnt` at `con_ses` | new connections are refused | raise `con_ses` |

A `tmr_skp` is cumulative: it counts since the start, so look at whether it moves.

## The log

A document's log level is `xdb_log` (`0` PANIC … `4` WARN, `6` INFO, `7` DEBUG) and it can be
changed on one `<con>` or `<thr>` while the engine runs. The console gets its own level with
`AyXDB -console:N`. At the default level, successful traffic is not logged at all, so a device
that works is quiet: `xdb_log="7"` on the `<con>` shows every `M-Q` and `M-R` ([The element tree](01_The_Element_Tree.md)).

| To learn | Look for |
|---|---|
| Which engine this is | the first lines: `Version: 4.3.4.646` |
| What the licence decided | `XDB:LIC: enforced for this run:` ([What is free](04_Licensing.md)) |
| Whether something was refused | `ALERT` (a write `xdb_acl` refused), `ERROR` lines naming an element |
| A `<con>` that never came up | `NOT STARTED`, or `have pro_con="X" -- that <con> was not created` at the start of the document |
| A function name that is wrong | `CallScopeFunction: ... function 'X' not found` (before 4.3.4.647, `fonksiyonu bulunamadı`). **It stops the rest of that `xdb_fnc` list**, so every connection after it is missing too: read the first such line, not the last |
| Memory | `AyXDB.Listen: Memory usage: <peak>K (now <set>K, private <private>K)`, once a minute |
| A blob that stayed | `Clear: Done (blobs alive: N)` after a clean stop; 0 is right |

## Getting in while it runs

`PRJEDU_telnet` is a shell over TCP or TLS with `con_acl`, a login and `xdb_acl` in front of
it: `ver`, `log on 6` to follow the log live, `log 6 50` for the last lines, `cd` to another
document, and any address or expression. It runs with your role, so it is not a way round
anything. On a console, CTRL-X opens the same prompt with the engine's own rights.

## Stopping

CTRL-C stops the engine in order: documents, connections, safe levels on pins, a clean last log
line. Killing the process does none of that (`09_Pins_and_Buses`). A document can be stopped on
its own by writing its `<doc>`'s `sta`.

Run one project per process: each has its own log, licence (`-lic:`, [What is free](04_Licensing.md)) and working
directory. Before a machine is left to run unattended, see `06_Access_and_Safety` for what must
not stay as an example leaves it.

## Checklist

1. No script compares a whole `sta` with a number.
2. Objects whose work legitimately runs long declare their own `thr_alm_wdt`.
3. A link that matters declares `thr_alm_lnk`.
4. `alm_adr` is set, so that a health alarm lands where the operator looks.
5. The log directory has room: `log_cfg`, `log_lnk`.
6. Someone has read the `stats` line once under real load.
