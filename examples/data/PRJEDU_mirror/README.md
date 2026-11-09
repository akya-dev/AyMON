# PRJEDU_mirror — a list that is a table

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8117/**: a maintenance board. On the left the open work
orders as the engine holds them, on the right the table as the database holds it.

**Needs an engine of 4.4.1.680 or later.** The line `XDB.xdb_init: Version:` in the log
names yours.

Many projects keep a list in a document as the window of a SQL table: work orders, jobs,
locations, a catalogue. The usual way is a script that loads it at start, and every other
script that changes a row writes its own `UPDATE` or `INSERT`, in each database's
dialect. Here no script writes SQL for an order. The list is declared a **mirror** of the
table, and the engine does the rest: it loads the table into the list, writes back every
row the list changes, and reads the table again to see what someone else wrote to it.
Nothing to install: the table is one file, `log\orders.db`.

The guide for this is [11_Records_and_Saving](../../../docs/11_Records_and_Saving.md),
section "A list that is a table".

## What it teaches

* **the mirror.** `<his xdb_fnc="[HIS.cfg]" his_wri="row">` in `WO/S00`, named `ORDERS`:
  `his_tbl` the table, `his_col` its columns (`opened:dtm` = a time), `his_key` the key,
  `his_rid` how a row's element id is made from its columns (`WO17`). There is no other
  configuration and no SQL in the script for an order.
* **a load is a merge.** At start the rows `his_load` selects become `<item>`s with the
  class `his_cls` (the types of the columns). A load again keeps every element the list
  already has and only changes what the table changed.
* **a change is a write.** A script sets an attribute (`status`, `started`, `done`) and
  the mirror writes the row within a second, many rows in one statement. On the page a
  row says *not written yet* for that moment.
* **the list is a window.** `his_load="status < 2"`: only the open orders are in the list.
  A finished order is written, the next load leaves it out, and the table keeps it
  (`his_del="keep"`).
* **a new row.** `ELM.new` makes an element, `HIS.key` gives it the next key
  (`his_keygen="max"`: the table's largest key + 1), and the hook sets the element's id the
  way `his_rid` would. The mirror writes it as a new row.
* **someone else writes the table.** `CN_OTHER` plays another program, a planning tool or
  a terminal at the machine, and writes the table directly. Nothing tells the engine:
  `his_ref="3"` loads the table again every three seconds and the list follows.
* **the table is the record.** Stop the engine and start it again: the list comes back
  from the table, and the next new order takes the next free key.

## Try it

1. **New order.** A row appears in the list, then in the table with the next number.
2. **Start**, then **Finish** an order. The table's `status` and times change within a
   second; a finished order leaves the list at the next load and stays in the table.
3. **Raise a priority.** The other program writes `prio = 1` into the table. Within three
   seconds the list shows it, in red.
4. **Close an order at the machine.** The other program closes an order in the table. It
   leaves the list at the next load: the engine never wrote it.
5. Stop the engine with CTRL-C and run it again. The console says what it loaded:

   ```
   WO/S00:HIS(ORDERS): table wo loaded -- 2 row(s), 2 new, 0 kept as the list had them (not yet written), 0 removed, 2 ms
   ```

Any SQLite tool may be the other program too. With the engine running:

```bat
sqlite3 log\orders.db "UPDATE wo SET title = 'Replace the filter and the gasket' WHERE wo_id = 3;"
```

Delete `log\orders.db` to begin again from the first four orders.

## The page

`WO/S00` serves it: `CN_WEB` (HTTP, `www\`) and `CN_LIVE` (MQTT inside a WebSocket on the
same port, `/mqtt`). Once a second `main.view` writes the list, the table and the
mirror's own counters (`HIS.stat`) into three `<var>`s as JSON. The table is read through
`CN_READ`, a connection the mirror does not use, with `SQL.qry`.

The page writes one point, `ACT/@val`, with `xdb_acl="0xFFFFFFF3"`; the document's
`xdb_acl="0xFFFFFFF1"` gives a Guest read and nothing else. A `val` chain runs as the
engine, so `main.act` may change the list for the page.

| `ACT` | Does |
|---|---|
| `{"cmd":"new"}` | a new order through `ORDERS/@new` |
| `{"cmd":"start","id":"WO3"}` | `status` 1 and `started` |
| `{"cmd":"finish","id":"WO3"}` | `status` 2 and `done` |
| `{"cmd":"prio"}`, `{"cmd":"close"}` | `CN_OTHER` writes the table, not the list |

## Rules the example keeps

* **A table comes first.** A mirror never makes a table. `main.start` does, and writes the
  first orders as any program would; the list gets them by loading.
* **An element's id is its row's.** A row the hook makes takes the id `his_rid` would
  give it (`"WO" + key`). With another id the next load would not find it and would make a
  second element for the same row.
* **The class gives the types.** Without `his_cls` a number loaded from the table is text.
  `cls_WO` declares only types, so every value stays the row's own.
* **A row with a change not yet written wins over the table.** A load that does not return
  such a row keeps it, and the mirror writes it. A row with no change of its own takes the
  table's values.
* **Keys from `max` assume one writer of new rows.** `HIS.key` reads the table's largest
  key at every load (from 4.4.1.680), but a row another program adds between two loads is
  not seen: the next new order would take its key. Here the other program only changes
  rows. When others add rows too, use `his_keygen="uid"` or keys of the database's own.
* **SQLite loads every time.** On PostgreSQL and SQL Server `his_ref` reads a signature of
  the table first and loads nothing when it has not moved; SQLite has none.

## What the log looks like

```
WO/S00:HIS(ORDERS): SQL mirror of table wo over CN_SQL, 8 column(s) written, 0 read only, key wo_id, rows that leave the list stay in SQL, keys from HIS.key (max + 1)
WO/S00:WO: table wo made in log/orders.db, with 4 orders (one of them done)
WO/S00:HIS(ORDERS): table wo loaded -- 3 row(s), 3 new, 0 kept as the list had them (not yet written), 0 removed, 24 ms
WO/S00:HIS(ORDERS): table wo loaded again -- 2 row(s), 0 new, 0 kept as the list had them (not yet written), 1 removed, 0 ms
```

A load that changed nothing writes no line.

## Not shown

* A row the database refuses. A statement refused is tried row by row: a row refused alone
  is **parked** with one ERROR line and the others go in; when every row is refused it is
  the database, and the mirror waits.
* Read-only columns (`his_ro`), a dialect's own text (`his_load_pgsql`, `his_ro_mssql`, ...;
  before 4.4.1.685 `his_load_pg`, `his_ro_ms`, ...), several key columns.
* A mirror that takes records (`his_rec`): an event list whose record is answered only once
  its row is in the table.
* A durable mirror (`xdb_dur="*"`, [PRJEDU_durable](../PRJEDU_durable/)): changes not yet
  written survive a kill, and a change made to the table while the engine was down is kept.
* Two engines: only the master loads and writes; a promoted spare writes its rows once and
  loads the table again. See [PRJEDU_cluster](../../cluster/PRJEDU_cluster/).
