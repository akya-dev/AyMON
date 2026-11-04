# PRJEDU_records — the engine keeps the history, and a journal survives a kill

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8116/**: a tank filling and draining, and beside it what
is in the database, read back from the tables.

[PRJEDU_sqlite](../PRJEDU_sqlite) writes its history with `INSERT`s in script. Here no
script writes a row. A tank makes **records**, three addresses on the root say who
keeps each kind, and the engine carries them to SQLite: alarms, events and value
history. Nothing to install: the database is one file, `log\history.db`.

The guide for all of this is [11_Records_and_Saving](../../../docs/11_Records_and_Saving.md).

## What it teaches

* **a record, and the three addresses.** `alm_adr`, `evt_adr` and `his_adr` are written
  once, on the root in `AyXDB.xml`. `TANK/S00` has none of them, no SQL and no table
  name, and its records still reach the tables.
* **the sink.** `<his xdb_fnc="[HIS.cfg]">` in `HIS/S00`: `his_rec` (which kinds),
  `his_tbl`, `qry_con` and `his_col`, the white list of columns. A field a record carries
  reaches SQL only if it is named there.
* **a value's history.** `[IF.chg,HIS.val]` with `his_per="10"`: a value that changes
  twice a second writes at most two rows a period, the first change at once and the last
  when the period ends. On the page, the line is what the tank did and a dot is a row.
* **a deadband.** `TEMP` adds `his_dbd="1"`: most of its changes make no row, and
  `HIS.valstat()` counts them.
* **events and audit lines.** `[IF.chg,HIS.evt]` on the pump, `HIS.rec(evt, "evt", ..)`
  for a numbered dose, `HIS.rec(evt, "aud", ..)` when the page changes the set point.
  The record carries the role that made it, and a script cannot give it: an engine chain
  writes `rol` 9, the page's audit line `rol` 0.
* **the journal.** With `rec_dir` a record goes to disk first and leaves only after its
  row is committed. The next section is the proof.
* **a table comes first.** A sink never makes a table. `main.start` does, with
  `PRIMARY KEY (id)`, and `id=uid` makes the record's id the key: a record that comes
  twice is one row.

## Kill it

Stop the writer, kill the engine, and start it again.

1. On the page press **Stop the writer**. The doses keep coming and *waiting for a row*
   climbs. The records are in `log\rec`, and the table has stopped growing.
2. From a second window: `kill.bat` (`./kill.sh` on Linux). This is a crash: no CTRL-C,
   no clean stop. It kills this example's engine and no other.
3. Look at the file: `python check.py` shows how many rows the run has now.
4. `run.bat` again. The console says what came back:

   ```
   REC: journal on disk ...\log\rec -- 61 record(s) taken back from 1 segment(s) (197 frames, 31 KB), 0 segment(s) deleted
   ```

5. `python check.py` again, or the page's table of runs. Measured on Windows: the run had
   51 rows at the kill and 104 after the restart, numbers 1 .. 104, no gap.

Without step 1 it works the same with fewer rows: the writer runs once a second, so a
kill catches only what the last second made. Some of what comes back already has a row,
because the mark that a record is finished is written a moment after the row. The key
skips those, and the table does not change.

The numbers show a gap *inside* a run. A run that lost its last rows looks like a shorter
run with no gap, which is why step 3 counts the rows first.

One thing is not in the journal: the **pending record** of `HIS.val`, the last change of
the period, lives in memory. A crash or a stop loses it. A clean stop counts it in the
log (`1 pending value record(s) of TANK/S00 lost at the stop`).

### Engines before 4.3.4.649

An older engine could hand the records back before the `<his>` element existed. They went
to `@new` with no sink behind them: no row and no error line, and they left the journal
too. That gap at a start is short, so it was rare on a fast disk: one record in 5 kills on
a Linux disk, none in 6 on Windows. A project on a slow disk was the bad case: under WSL,
with the project on `/mnt/c`, all 52 waiting records were lost. From 4.3.4.649 a record
waits in the journal until its document runs: the same test had 24 rows at the kill and 67
after, no gap. The line `XDB.xdb_init: Version:` in the log names the engine.

## The page

`HIS/S00` serves it: `CN_WEB` (HTTP, `www\`) and `CN_LIVE` (MQTT inside a WebSocket on the
same port, `/mqtt`). Once a second `main.view` writes each table into a `<list>`'s `@qry`
(`SQL.qry`, over `CN_READ`, not the connection that writes) and hands the rows to the page as JSON.
The pipeline has no query path of its own.

The page may write two things, each with its own `xdb_acl`; `xdb_acl="0xFFFFFFF1"` on the
document gives a Guest read and nothing else.

| Point | Does |
|---|---|
| `SET_SP/@opr` | The tank's set point, and an audit record. At 90 every fill passes the alarm limit of 85; at 78 the alarms end. It is `@opr` and not `@val` because a `val` chain runs as the engine, and the audit line would say role 9 |
| `HOLD/@val` | Stops or starts `CN_SQL`, the connection that writes |

A button that stops the history is for this demonstration, on `127.0.0.1`. On a plant
that write belongs to an Engineer.

## Check it

`check.py` needs Python and nothing else (its own `sqlite3`). It only reads, so it can run
beside the engine. The exit code is the number of failed checks.

```
rows: alm 8, evt 168, val 29

the numbered events, run by run
  ok    run 1793778366131: 104 rows, numbers 1 .. 104
  ok    run 1793778423233: 59 rows, numbers 1 .. 59

value history
  ok    LEVEL: 18 rows in 10 periods, at most two a period
  ok    TEMP: 11 rows in 10 periods, at most two a period
  ok    TEMP: no change under the deadband inside a period

alarms and events
  alm by function: {'onlhi': 6, 'onlvl': 2}
  ok    every alarm row says which limit
  ok    HIS.evt wrote the pump's changes: 4
  audit: 'set point changed to 78 %', role 0, sta 0x0101

the journal
  ok    log/rec holds 1 segment(s)

all checks passed
```

Any SQLite tool opens the file too:

```bat
sqlite3 log\history.db "SELECT tim, rid, fnc, valn FROM alm ORDER BY id DESC LIMIT 5;"
```

In table `alm`, `onlhi` is a high limit crossed and `onlvl` is the value back at normal.
`stap` and `stan` are the `sta` before and after, and their bits 2-3 are the level: 1
warning, 2 alarm. Delete `log\history.db` and `log\rec` to begin from empty.

## What the log looks like

```
HIS/S00:HIS(ALM_H): sink of 'alm' records into table alm over CN_SQL, 12 column(s), key id, rows answered after they are written
HIS/S00:HIS: tables ready in log/history.db -- the engine writes the rows from here on
HIS/S00:HIS(EVT_H): rows taken 41 written 39 in 19 statement(s) | waiting 2 | dropped 0 | spool full 0
XDB:REC: journal 2 (oldest 0 s) | journalled 0 sent 0 answered 0
XDB:HIS.val: points 2, pending 2 | written at once 2, at period end 0, held by deadband 0, lost 0, refused 0
```

## Not shown

The open alarms kept as elements (`new_elm_new_*` and `HIS.row`), `HIS.put`, and records
travelling to a sink on another node over `PRO.rep`. A second engine is the guide's
"Over several nodes". The same sinks write to SQL Server and PostgreSQL: only the `<con>`
changes (see [PRJEDU_odbc](../PRJEDU_odbc)) and, on SQL Server, `his_ident` for an
`IDENTITY` key.
