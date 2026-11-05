# PRJEDU_durable — values that come back after a crash, no database

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8124/**: a mixer that makes a batch every second, what it
keeps and what it does not, and the state of the log that keeps it.

The engine holds its values in memory. That is what makes it fast, and it is why a
counter used to start from the XML file again after every restart, unless a script wrote
it to a database. Here nothing is written by a script. Six elements carry **`xdb_dur`**, and
the engine keeps those values on disk as they change and puts them back at the next start:
after CTRL-C, after a kill, after a power cut. The XML file is never written.

The guide for all of this is [13_Durable_Documents](../../../docs/13_Durable_Documents.md).

## What it teaches

* **`xdb_dur` on a value.** `BATCHES`, `HOURS`, `SP`, `LAST` and `SHIFT` in `db\db_MIX.xml`
  carry `xdb_dur="val"`. `SINCE` counts the same batches without it: it is back to 0 at every
  start, and the page shows the two side by side.
* **`xdb_dur="*"` on a list.** `JOBS` keeps its rows: one is made every batch and the oldest
  removed after ten, at run time, and the list comes back as it was. A row needs an id of its
  own (`J123`): it is found again by its id.
* **a set point an operator changed.** The page's form writes `SP`. Kill the engine and start
  it again: the new set point is still there, not the file's `50`.
* **waiting for the disk.** Every 20th batch closes a shift and calls `xdb.sync()`, which answers
  once every kept value written before it is on the disk. The console says
  `MIX: shift 3 closed at batch 60, on the disk`. Use it for an answer someone acts on; a
  value written a thousand times a second does not need it.
* **the log's state.** A timer copies `xdb.dur()` into `DUR` once a second, and the page shows
  it: whether the log writes, its segments, commits and fsyncs, checkpoints, the longest fsync,
  the free space. The root's health is there too: if the disk stops taking the log, the root's
  `sta` goes to ALARM (`durable log ...: open failed`).
* **nothing to set up.** `rec_dir` on the root is the only thing a project adds. `rec_flush`,
  `rec_sync` and `rec_ckp` have their defaults written out in `db\AyXDB.xml`, with what each one
  means.

## Kill it

1. Let it run for half a minute; change the set point on the page.
2. From a second window: `kill.bat` (`./kill.sh` on Linux). This is a crash: no CTRL-C, no clean
   stop. It kills this example's engine and no other.
3. `run.bat` again. The console says what came back:

   ```
   DUR: 'MIX/S00' -- 6 element(s) durable, 0 refused; 123 value(s), 40 row(s), 30 removal(s) of the last run back in 0 ms, ...
   MIX: came back with 40 batches, 0.011 h, set point 61.5 kg, 10 rows in the job list, shift 2; not kept: 0
   ```

   (the log reads every change since the last checkpoint: 40 rows made, 30 of them removed again)

4. The page goes on from batch 41. "Batches since this start" begins at 1.

A killed process loses at most the changes of the last `rec_flush` (10 ms here). A machine that
loses power loses at most `rec_sync` (1 s here) plus an fsync that was running; this was
measured by pulling the plug of a Raspberry Pi six times: 100–800 ms lost, every row consistent.

To begin from the XML file again, stop the engine and delete `log\rec`.

## Prove it

`prove.py` does the steps above by itself: it starts the engine, changes the set point through the
page, kills the engine, starts it again and compares. Python's standard library only. Close a
running PRJEDU_durable first (it holds port 8124).

```
python prove.py
engine: C:\AyMON\AyMON\bin\win-x64
killed at: 4 batches, set point 61.5, shift 0, 4 rows, since this start 4
back with: 4 batches, set point 61.5, shift 0, 4 rows, since this start 0
  ok    the batch counter came back (a kill loses at most rec_flush, 10 ms)
  ok    the set point changed through the page came back
  ok    the job list came back, rows made at run time
  ok    the counter without xdb_dur began at 0 again
  ok    the durable log writes
5/5
```

## Three traps of the script, all in this example

The language looks like JavaScript and is not ([03_Scripting](../../../docs/03_Scripting.md)).
Arithmetic keeps the **left** operand's type:

* `BATCHES` is an unsigned counter, so `n % 11 - 5` would wrap around below zero:
  `parseFloat` makes it a double first.
* `Math.round` answers an integer, so `Math.round(x * 10) / 10` divides as integers (61.5 → 61):
  `tenth()` in `db_MIX.js` goes through a double.
* A list's `length` is unsigned, so `for (i = length - 1; i >= 0; i--)` never ends — it held the
  web listener's thread the first time this page was written. `index.ayp` counts up instead.

## Files

| File | What it is |
|---|---|
| `db\AyXDB.xml` | the root: `rec_dir` and the log's timing, with what each means |
| `db\db_MIX.xml` | the mixer: the kept values, the counter that is not kept, the timers, the web listener |
| `db\db_MIX.js` | a batch, the shift's `xdb.sync()`, `xdb.dur()` for the page, the page's data |
| `www\index.ayp`, `www\api.ayp` | the page and the same data as JSON (`prove.py` reads it) |
| `prove.py` | start, change, kill, start, compare |
| `run.bat`, `run.sh`, `kill.bat`, `kill.sh` | start it, kill it as a crash would |

Needs: nothing. Engine 4.4.1.667 or later (`xdb_dur` itself from 4.4.1.663, `xdb.sync` and
`xdb.dur()` from 4.4.1.667).
