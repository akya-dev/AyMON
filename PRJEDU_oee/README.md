# PRJEDU_oee — OEE of a production line, shift by shift

A line makes parts. It breaks down now and then, jams, runs slow, waits for
material, stops for a changeover between lots, and makes a bad part every
so often. All it tells the outside world is **seven Modbus registers** —
running or not, a reason if it knows one, two counters, the product. A small
**MES** (manufacturing execution system) reads them twice a second and turns
them into what an industrial engineering course is about: **where the time
went**, and **OEE**.

```bat
run.bat
```

On Linux: `./run.sh`. Then open **http://127.0.0.1:8100/**.

| Document | What it is |
|---|---|
| `LINE/S00` | **the machine**, simulated: products A and B in lots, breakdowns, jams, slow spells, missing material, changeovers, bad parts. A Modbus TCP slave on 127.0.0.1:1505 |
| `OEE/S00` | **the MES**: a Modbus master that polls the line, the time accounting, OEE, the stop and shift records in SQLite (`log\oee.db`), and the page |

A shift lasts **eight minutes** here (`SHIFT_S`), with a 30 s planned break
after four — so a lesson sees several shifts. Everything else is real seconds.

## OEE in one picture

The page draws it as a waterfall, live for the running shift:

```
shift time
 - planned break                        = planned production time
 - downtime (breakdowns, changeover,
   waiting, other, not assigned yet)     = run time
 - minor stops, running slow             = ideal time of all parts made
 - bad parts                             = fully productive time

availability  A = run time / planned production time
performance   P = ideal time / run time
quality       Q = good parts / all parts
OEE           = A × P × Q  =  fully productive time / planned production time
```

The last equality is the **check** under the four numbers: the MES computes
OEE both ways, from different sums. In a shift that made one product they
agree to the last digit. In one that made both they drift a little apart
(measured: 64.83 % against 64.70 %) — not an error: Q counts *parts*, while
fully productive time weighs each good part by its own ideal cycle, and a
bad B part (2.5 s) costs more time than a bad A part (2.0 s). The time
formula is the exact one; A × P × Q is the one on the posters.

The six big losses of TPM land here like this:

| Loss | Where it comes from | Counts against |
|---|---|---|
| breakdowns | the machine's fault codes 10–12; a long jam the operator names | availability |
| setup and adjustment | the changeover between lots (reason 30) | availability |
| (waiting, other) | material missing, operator away, quality check — the operator says which | availability |
| minor stops | any stop shorter than `MINOR_S` (5 s): jams | performance |
| reduced speed | the slow spells — the machine never says so; the parts just come too slowly | performance |
| startup rejects, production rejects | bad parts; the first parts after a changeover are bad more often | quality |

## What the MES has to decide

Seven registers are not much. Most of an MES is decisions about them — each
one is a few lines in `db/db_OEE.js`, and each one changes the number:

- **The counters wrap.** They are 16-bit: after 65535 comes 0, and they start
  near the top on purpose. The MES counts the difference since the last poll,
  modulo 65536. A difference larger than `CNT_MAX` is taken as a reset at the
  machine and not counted (a log line says so).
- **The ideal cycle is master data**, kept in the MES (`PRODUCTS`), not
  something the machine reports. Parts are credited with the ideal time of
  the product being made when they were counted.
- **A stop shorter than `MINOR_S` is a minor stop**: it stays in run time and
  shows up as performance loss.
- **The machine does not always know why it stopped.** A jam and a missing
  pallet both say reason 0. A stop that ends up longer than a minor one and
  has no reason waits for the **operator**, who picks one on the page — for
  the stop going on, or for one that is over (a select in the stop list).
  Only reasons marked `by="operator"` in the catalogue are offered or taken.
- **The plan decides planned time, not the machine.** From `BREAK_AT_S` for
  `BREAK_S` the time is planned, whatever the machine does. The MES holds the
  line through register 6; if the machine is broken down when the break
  begins, the breakdown ends at the break, and whatever is left of it after
  the break is downtime again.
- **A stop whose reason changes is two stops.** A breakdown that ends
  straight into a missing pallet, with no running in between, is booked as a
  breakdown and then as waiting — not all as the breakdown.
- **A stop cut by the shift change or the break is not a minor stop**, however
  short the piece: it was not over.
- **No answer from the line for `POLL_LOST_S` is downtime too**: reason 99.
- **The part is counted in the shift in which it is counted.** A part that was
  mostly made in the last shift lands in this one — so for the first minute
  of a shift performance can read over 100 %. It evens out; the page says so.

All of these are XML attributes in `db/db_OEE.xml` (`SHIFT_S`, `BREAK_AT_S`,
`BREAK_S`, `MINOR_S`, `POLL_LOST_S`, `CNT_MAX`, `PRODUCTS`, `REASONS`).

## The record

`log\oee.db` (SQLite, nothing to install) keeps every stop and every
finished shift:

```sql
stop  (sid, shift, start, dur_s, reason, kind, by)    -- kind: down, minor, planned
shift (no, name, start, end, length_s, planned_s, run_s, down_s, minor_s,
       ideal_s, good_ideal_s, total, good, scrap, scrap_su, a, p, q, oee)
```

The page's history table and the "last 10 shifts" Pareto are queries on it;
**Download CSV** writes the history for a spreadsheet. A restart of the
engine begins a new shift — the half-shift in memory is not kept.

## What it measured

On a Windows 11 laptop, engine 4.3.4.467, two full eight-minute shifts with
the default settings, a script naming one of the unnamed stops ("material
missing", after the fact) and leaving the rest unnamed:

| | shift A #1 | shift B #2 |
|---|---|---|
| planned production time | 449 s | 449 s |
| downtime | 116.5 s | 147.5 s |
| run time | 332.5 s | 301.5 s |
| minor stops (in run time) | 24.0 s | 24.5 s |
| ideal time of all parts | 297.5 s | 256.5 s |
| parts, good | 139, 136 | 113, 107 |
| **A / P / Q** | 74.1 / 89.5 / 97.8 % | 67.1 / 85.1 / 94.7 % |
| **OEE** = A × P × Q | **64.8 %** | **54.1 %** |
| fully productive / planned | 64.7 % | 54.3 % |

- **Every part counted, across the wrap.** The MES counted 262 parts, 10 of
  them bad, in the two shifts and the start of the third; the machine's own
  count, which does not wrap, said 262 and 10. The total register went
  65507 → 13 in shift B.
- Planned production time is 480 s − 31 s: the 30 s break and, as a planned
  stop of its own, the half-second or so the line still reports "held" after
  the MES has released it.
- Downtime by reason over both shifts: not assigned yet 89.5 s, changeover
  80 s, hydraulic pressure low 67 s, motor overload 25.5 s, material missing
  21.5 s; 24 minor stops, 49.5 s.
- A breakdown running into the break (a shorter test shift): booked as
  downtime up to the break, the break as planned, what was left of the
  breakdown after it as downtime again. A breakdown that ended straight into
  a missing pallet: two stops, not one.
- On the page: **Take the material away**, then **operator away** in the
  "Why?" box → the stop is booked with reason 21, by the operator.
- The engine: 36.9 s of CPU in 1002 s (3.7 % of one core), 33 MB.

On Linux (WSL, Ubuntu 22.04), the same engine, one shift: A / P / Q
71.2 / 91.5 / 97.1 %, OEE 63.2 %, 137 parts, 133 good; counted 142 and 4
bad against the machine's 142 and 4, across the wrap (65517 → 1). The
line's Modbus switched off for 15 s (`CN_SLV` sta `0x0000`, then `0x0303`):
one stop of 13.5 s booked as reason 99, no signal, and two ERROR lines from
the MES's Modbus master as the connection dropped. CTRL-C (SIGINT): exit 0.

## Try this

| Do | See |
|---|---|
| set product A's `ideal_ms` in `PRODUCTS` to 1500 (faster than the machine can go) | performance never gets near 100 %; the waterfall calls the gap "running slow" — wrong master data looks exactly like a slow machine |
| … or to 3000 | performance over 100 %: an impossible number is the sign that the standard is wrong |
| `MINOR_S` 5 → 2 | jams move from performance to availability. The OEE hardly moves; what it is blamed on does |
| leave stops unassigned for a shift | the Pareto's biggest bar may be "not assigned yet" — the data tells you nothing until someone says why |
| lot size 100 → 30 | changeover time grows; availability falls; this is the SMED argument |
| slide "bad parts" to 10 % | quality falls, and so does OEE — by the same factor |
| stop the line's Modbus (`CN_SLV` sta `0x0000` in `LINE/S00`) | the MES books what it cannot see as downtime, reason 99 - is that fair to the line? (`POLL_LOST_S`) |
| write a query | e.g. `SELECT reason, sum(dur_s) FROM stop WHERE kind='down' GROUP BY reason` in any SQLite tool on `log\oee.db` |

## Licence

**Five connections** (the line's Modbus slave; the MES's Modbus master,
SQLite, web and live values) and two documents: inside the **FREE** edition.
