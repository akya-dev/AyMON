# Records, history and saving

Two jobs that keep something after the engine stops: **history** in a database and
**configuration** in the document's own file. Both are done by the engine. Run
[PRJEDU_records](../examples/data/PRJEDU_records/) first: a tank whose alarms, events and
value history go through these sinks into SQLite, and a kill that shows the journal read
back. A list kept as the live window of a table, written back by the engine, is
[A list that is a table](#a-list-that-is-a-table), shown by
[PRJEDU_mirror](../examples/data/PRJEDU_mirror/). A history query that takes each point's name and
unit from the tree instead of from a column is
[Names from the tree in a query](#names-from-the-tree-in-a-query), shown by
[PRJEDU_sqlxdb](../examples/data/PRJEDU_sqlxdb/).

A third way to keep something, with no database and no save: a value that comes back with
its last state after a restart is [13_Durable_Documents](13_Durable_Documents.md).

---

## Records

Every alarm, every event or audit line and every recorded value is a **record**: a
small JSON text with an id of its own. The engine carries it from the node that makes
it to the node that keeps it, holds it while that node or its database is away, and
writes the history row itself. **A row is in the table once, and a record is let go
only after its row is committed.** Scripts no longer build `INSERT`s for history.

| Field | Meaning |
|---|---|
| `uid` | 53 bits, time-ordered, never repeated by a node; the table's key |
| `src` | the node that made it (`tid`) |
| `knd` | `alm`, `evt`, `aud`, `val`, `row` |
| `rol` | the role that made an `evt`, `aud` or `row`. The engine writes it; a script cannot give it |
| `tim` | milliseconds; for a value, the value's own time |
| the rest | the kind's fields: an alarm's `doc rid atr valp valn stap stan fnc pri desc why`, a value's `doc rid atr txt typ pro val sta` |

### Where records go

```xml
<xdb id="XDB" tid="S01" rec_nid="1" rec_dir="%PRJ%/log/rec"
     alm_adr="doc('HIS/S00')/id('ALM_H')"
     evt_adr="doc('HIS/S00')/id('EVT_H')"
     his_adr="doc('HIS/S00')/id('VAL_H')" ...>
```

Write the three addresses once on the root. A document without one uses its parent's,
and `""` switches it off for that document.

| Attribute | Records | Made by |
|---|---|---|
| `alm_adr` | alarms, device alarms, the engine's health | `ALM.*`, `ALM.devsta`, the health bits |
| `evt_adr` | events and audit lines | `HIS.rec`, `[HIS.evt]` |
| `his_adr` | value history | `[HIS.val]` |

### The sink

The document that keeps the history declares it. A table must already exist:

```xml
<con id="CN_SQL" xdb_fnc="[CON.sqlite,PRO.sql]" con_host="%PRJ%/log/h.db" con_mod="CLIENT" con_ses="0"
     con_tmo="5" con_rct="2" con_keeptmo="0" con_idletmo="0" pro_role="MASTER" pro_tmo="10" pro_try="1"
     pro="1" pro_typ="0xC412" pro_fnc="[]" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>

<his id="ALM_H" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142"
     his_rec="alm" his_tbl="ALM" qry_con="CN_SQL"
     his_col="id=uid,tim:loc,doc,rid,atr,fnc,stap,stan,why"
     new="" new_typ="0x1401" new_fnc="[HIS.new,ATR.nup]"/>

<his id="VAL_H" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142"
     his_rec="val" his_tbl="VAL" qry_con="CN_SQL"
     his_col="id=uid,tim:loc,doc,rid,val,sta"
     new="" new_typ="0x1401" new_fnc="[HIS.new,ATR.nup]"/>
```

`CON.sqlite` needs `xdb_lib="AyPRO_sqlite"` on the root (`05_Connections_and_Protocols`).

| Attribute | Meaning |
|---|---|
| `his_rec` | the kinds it takes: `alm`, `evt,aud`, `val`. Absent = any |
| `his_tbl` | the table. Absent = a sink with no SQL |
| `his_col` | the columns, a **white list**: `column[=field][:kind]`. `id=uid` is the key. Nothing a record carries reaches SQL unless named here |
| `qry_con` | the `CON.sql` of the same document that writes the rows |
| `his_bat` | rows per statement (default 200) |
| `his_spl` | rows that may wait for the database (default 20000) |
| `his_ident` | `1`: the key is an `IDENTITY` column (SQL Server) |
| `new_typ` | `0x1401` runs at once on the writer's thread; `0xE401` on the sink document's own thread, one record after another (for a hook that does SQL or mail) |
| `new_elm_new_*` | keep the open items as elements too, as `ELM.new` does (`03_Scripting`); the hook gives or changes the row with `HIS.row(evt, {..})` |

A column kind: none = as the field is; `:dtm` = a millisecond field as a time value;
`:loc` = this machine's local time text with its offset; `:txt` = as text.

Once a second the connection writes the ready rows in multi-row statements, skipping a
key already there. **Repeats need a unique key that holds the key column**: on
PostgreSQL and SQLite it is the table's own unique key (`PRIMARY KEY (id)`, or
`(id, tim)` on a TimescaleDB hypertable), and a table with none takes every repeat.

| When | What happens |
|---|---|
| The database refuses the statement | the rows **wait** (1, 2, 4 … 30 s), one ERROR line a minute with the driver's text |
| One row refused alone while others go in | that row is dropped, with one ERROR line |
| The waiting room is full | a record stays at its source and comes again |
| The sink's document is demoted or stops | its waiting rows go back to their sources |

### A value's history

```xml
<var id="LEVEL" sta="0x0303" sta_typ="0x1142" val="0" val_typ="0x1308" val_rou="0.1"
     val_fnc="[ATR.rou,ALM.onlvl,IF.chg,HIS.val]" val_alm_onlhi_alm="95"
     his_per="600" his_dbd="0.5"/>
```

`his_per` is a period in seconds (600 by default), ending at multiples of itself. The
first change of a period is a record at once, and the last change is one pending record
per point, written when the period ends. A point therefore writes at most two rows a
period; a quiet one, one. With `his_dbd` a change closer than that to the value last
written makes none. Only a running point records.

**The pending record is in memory**: a crash, or a document stopping, loses it (it is
counted). `HIS.valstat()` answers `{points, pending, now, end, dbd, lost, refused}`.

### From script

| Call | Does |
|---|---|
| `HIS.rec(evt, "evt" \| "aud", text \| {fields})` | an event or audit record into `evt_adr`; answers its uid |
| `[..,HIS.evt]` | in a chain: an event `"<desc>: 'old' -> 'new'"` when the value changed |
| `HIS.row(evt, {fields} \| null)` | inside a sink's hook: the row takes these fields / no row |
| `HIS.uid(evt)` | inside a hook: the record's uid, which is the row's key |
| `HIS.put(evt, "doc('X')/id('Y')", {fields})` | a history row outside a hook |
| `HIS.pending(uid)` | 1 while that row waits: an `UPDATE` of your own row waits for it |

```js
HIS.rec(evt, "aud", { txt: "set point changed" });
```

A record made by a low role is safe to send: where the sink's `xdb_acl` would refuse it,
an `evt` or `aud` is written as information only (it says what happened, and cannot start
a job), and a `row` is refused with one line.

### Over several nodes

| Sink's document | The record |
|---|---|
| loaded here, not parked, running | is written here now |
| loaded here, not parked, still loading | waits in the journal until the document runs (engine 4.3.4.649) |
| loaded here, parked (spare, transit) | goes into this node's **journal** |
| not loaded here (a field node) | goes into the journal |
| no link carries it yet | waits in the journal; after 30 s with no link it is written directly, once |

A journalled record travels over every `PRO.rep` link whose `pro_rep_doc` names the
sink's document, and is sent again after `rec_tmo` seconds without an answer. No
connection has to be added. The sink remembers the last 4096 uids of each source, so a
record may arrive twice and be written once.

| Root attribute | Default | Meaning |
|---|---|---|
| `rec_nid` | from `tid` | 0..255, written into every uid. **Write it on every node, different on each:** two nodes with one number can make the same id |
| `rec_max` | 20000 | records the journal holds. Full: the oldest `val`, then `evt`, `aud`, `alm` goes |
| `rec_tmo` | 5 | seconds before a journalled record is sent again |
| `rec_dir` | | a directory: the journal is on disk too |
| `rec_seg` | 4096 | KB per journal file |
| `rec_sync` | 1000 | ms between disk commits |

With `rec_dir` a killed process loses nothing journalled, and a power cut at most
`rec_sync` ms. Without it, a node that dies loses what its journal held. On an engine
before 4.3.4.649 a record read back before the sink's document had made its `<his>` could
still be lost, with no line (`PRJEDU_records` says how often).

### What it is not

A history sink only adds rows: no row updates or deletes, and no query path (`SQL.qry`
reads a table back into elements). Rows that change, a list loaded from a table at a
start, a table others write too: that is a mirror list, the next section. The pipeline is
part of the engine on Linux too, but its test rigs have run on Windows, against SQLite,
SQL Server and PostgreSQL.

### Reading the log

| Line | Meaning |
|---|---|
| `HIS(ALM_H): sink of 'alm' records into table ALM over CN_SQL, 9 column(s), key id, ..` | the sink was made |
| `HIS(<id>): no sink -- <why>` | the configuration is wrong; nothing is kept |
| `HIS(<id>): N row(s) wait -- table T refused them: <driver text>` | the database is away, or `his_col` names a column the table lacks |
| `HIS(<id>): rows taken N written N in N statement(s) \| waiting N \| dropped N \| spool full N` | every 10 s when it moved |
| `HIS.val: id('..') -- document D has no his_adr` | the point's document names no value sink |
| `REC: record ids carry node 1 (rec_nid), tid 'S01'` | at start; "derived from tid" means write `rec_nid` |
| `REC: journal N (oldest S s) \| journalled .. sent .. answered ..` | every 10 s when it moved |
| per `PRO.rep` link: `records out put= answered= \| in written= repeats= not ours= refused=` | that link's share |

---

## A list that is a table

From 4.4.1.680. Run [PRJEDU_mirror](../examples/data/PRJEDU_mirror/) first: a maintenance
board whose open work orders are a list, and the same rows a table in SQLite.

Many projects keep a list as the window of a table: work orders, jobs, locations. A
**mirror list** does the SQL for it. Once the document runs as master the engine loads
the table into the list, writes back every row the list changes within about a second
(many rows in one statement), and, with `his_ref`, loads the table again to see what
someone else wrote. Scripts change rows as they change any element; none writes an
`UPDATE` or an `INSERT`.

```xml
<tio id="cls_WO" wo_id_typ="0x0208" prio_typ="0x0204" status_typ="0x0204"/>

<his id="ORDERS" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142" qry_con="CN_SQL"
     his_wri="row" his_tbl="wo" his_key="wo_id" his_rid="WO{wo_id}"
     his_col="wo_id,title,asset,prio,status,opened:dtm,started:dtm,done:dtm"
     his_load="status &lt; 2" his_order="wo_id" his_cls="cls_WO"
     his_keygen="max" his_ref="3" his_del="keep"/>
```

| Attribute | Meaning |
|---|---|
| `his_wri` | `row`: a mirror list. Without it the `<his>` is a history sink |
| `qry_con` | the `CON.sql` (or `CON.sqlite`) that reads and writes; its thread does the work |
| `his_tbl` | the table. It must exist: a mirror never makes one |
| `his_col` | the columns, `column` or `column=attribute`, `,` between them. Kinds: `:dtm` a time, `:txt` text, `:num` a number kept as text (empty = NULL), `:jsn` JSON (empty = NULL), `:ins` written only when the row is new |
| `his_key` | the key column(s), named in `his_col` |
| `his_rid` | a row's element id from its columns: `{col}`, `{col:x}` hex, `{col:016X}` padded |
| `his_load` | the `WHERE` of the load: which rows are in the list at all |
| `his_order` | the `ORDER BY` of the load |
| `his_cls` | the class of a loaded row: the types of its columns |
| `his_keygen` | what `HIS.key` answers: `max` (the table's largest key + 1) or `uid` (a 53-bit id) |
| `his_ref` | seconds: load the table again, merged. `0` = only at the start |
| `his_del` | a row that leaves the list: `keep` it in the table (its last state written), `delete` it, or `col=val` |

**A load is a merge, not a rebuild.** A row the list already has keeps its element and
takes the table's values; a row the table no longer returns leaves the list; a new one is
made with `his_cls`. A row with a change not yet written wins: it stays, and the mirror
writes it. `SQL.qry` is the other way: it deletes the list's rows and makes them again.

**A new row** is an element the script adds, usually by `ELM.new`. Its key comes from
`HIS.key(evt, "id('ORDERS')")` and its id must be the one `his_rid` makes of it, or the
next load would make a second element for the same row.

**Someone else writes the table.** `his_ref` sees it: on PostgreSQL and SQL Server a
signature of the table is read first and nothing is loaded when it has not moved; SQLite
has no signature and loads every time. `max` keys assume that new rows come only through
the engine: a row another program adds between two loads takes a key the next `HIS.key`
also gives. When others add rows, use `uid` or the database's own keys.

**A row the database refuses.** A refused statement is tried row by row: a row refused
alone is parked with one ERROR line and the others go in. When every row is refused it is
the database, and the mirror waits, 1 s, then 2, 4 .. 30 s.

From script: `HIS.flush(evt, list[, ms])` (1 = every change made before it is in the
table; not on a connection's own thread), `HIS.dirty(evt, list[, id])`, `HIS.key`,
`HIS.del(evt, list, id)` (the row leaves the table, even with `keep`),
`HIS.refresh(evt, list)`, `HIS.stat(evt, list)`. In a cluster only the master loads and
writes; a promoted spare writes the rows it holds once and loads the table again.

| Line | Meaning |
|---|---|
| `HIS(ORDERS): SQL mirror of table wo over CN_SQL, 8 column(s) written, ..` | the mirror was made |
| `HIS(ORDERS): table wo loaded -- 3 row(s), 3 new, 0 kept .., 0 removed, 24 ms` | the first load |
| `HIS(ORDERS): table wo loaded again -- ..` | a later load that changed the list; one that changed nothing writes no line |
| `HIS(ORDERS): table wo not loaded -- <why> (tried again every 10 s)` | once per outage |
| `HIS(ORDERS): row 'R' PARKED -- table wo refused it alone: <why>` | one bad row |

---

## Names from the tree in a query

From 4.4.2.704; the id templates from 4.4.2.705. Run
[PRJEDU_sqlxdb](../examples/data/PRJEDU_sqlxdb/) first: two production lines' history in
SQLite, with no name in it, and a page that shows every query's text.

A history table says when a point had which value. What the point *is* — its name, its
unit, its class — is in the document. Writing it into every row too is a second copy:
it grows with the table, and it is wrong for every old row the day the point is
renamed. A `SQL.qry` text may instead carry two SQL comments the engine reads and takes
out before the database sees the text:

```sql
SELECT tim, doc, rid, val FROM his
 WHERE rid IN (/*xdb-in: doc('LINE/*')//io[contains-ci(@desc, 'pressure')]/@id */)
 ORDER BY tim DESC LIMIT 20
/*xdb: name = doc('{doc}')/id('{rid}')/@desc ;
       unit = doc('{doc}')/id('{rid}')/@val_unt */
```

**`/*xdb: col = address */` fills a column of every row.** `{column}` in the address is
that row's cell, so each row reads its own point; the address is any address
`evt.GetValue` takes, the class chain included. A column the result has is filled in
place, any other is added after the SQL's columns. `col ?= address` fills only a NULL
cell: rows that carry a value of their own keep it, which is how a table that used to
store names moves off them. An address that reads nothing gives NULL, and the log counts
it once per query. Each address is read once per query, however many rows name it
(about 2 µs a read on a document of 110 000 points).

**`/*xdb-in: address/@attr */` becomes a SQL list** of the values the address selects:
`'L1_PT1','L2_PT1'`, written in the connection's dialect (`'` doubled, `N'..'` on SQL
Server). None is `NULL`, so `IN (NULL)` selects no row. More than `qry_xin_max` values
(1000 if the element or its class does not say) refuses the query: a list is never
cut. `contains-ci` is `contains` with upper and lower case alike, Turkish `İ ı` too.

**A placeholder can make an id of a number.** `{col:010X}` is the cell in 10 hex digits,
`{col>>32:d}` its top 32 bits in decimal; `&mask`, `/n` and `%n` too, left to right,
`0` + width pads. A list reads such ids back: `/*xdb-in: ..//order/@id ~ WO{:010X} */`
gives the keys as numbers without quotes, so an integer column is compared as one.

```sql
SELECT wo_wid, title, made FROM wo
 WHERE wo_wid IN (/*xdb-in: doc('LINE/*')//order[@state='open']/@id ~ WO{wo_wid:010X} */)
/*xdb: title ?= doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@title ;
       state  = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@state */
```

What it does not do:

* **The database never sees an embedded value.** It cannot be in `WHERE`, `ORDER BY` or
  `GROUP BY`: filter by a name with a list, sort by the key or the time.
* **The reads have the role of the query's event.** A timer's query reads as the
  engine; a query a logged-in user's page writes reads what that user may read, and a
  point `xdb_acl` hides from them is NULL.
* **Only `SQL.qry`.** `SQL.exec_direct` and `SQL.prepare` send their text as it is.
* **An older engine** sends the comments to the database as comments: the rows come
  without the filled columns, and a list becomes `IN ()` — a syntax error on PostgreSQL
  and SQL Server, an empty list on SQLite. 4.4.2.704 refuses a template visibly.

| Line | Meaning |
|---|---|
| `SQL.qry: 'Q.qry' xdb: 2 of 16 addresses gave no value (..) -- first: doc('LINE/L1')/id('L1_FT9')/@desc (14 rows)` | some rows name what the tree does not have: their cells are NULL |
| `SQL.qry: 'Q.qry' xdb: N reads took T ms (R rows)` | the reads of one query took over a second |
| `<atr>_err`: `xdb-in: '..' -- list too long (more than 1000 values, qry_xin_max); a list is never cut` | the query was not sent; the old rows stay |

## SQL on the tree

From 4.4.3. Run [PRJEDU_xdbsql](../examples/data/PRJEDU_xdbsql/) first: two lines' points
as one table, a page that sends XDB SQL as a Guest, and two PostgreSQL ports.

The documents are tables already: an element name is a table, an element a row, an
attribute a column, the document the schema. **XDB SQL** reads them where they are,
with the role of whoever asks:

```sql
SELECT _doc AS line, id, desc, val, val_unt AS unit
  FROM "LINE/*".io
 WHERE val > hi
```

`"LINE/*".io` is every `<io>` of the documents the pattern names, `_doc` the document a
row came from; a column the row inherits (`val_unt` from the class) is a column like its
own. `WHERE`, `GROUP BY` / `HAVING`, `ORDER BY`, aggregates, `CASE`, joins and
sub-queries work as in PostgreSQL; `UPDATE`, `INSERT` and `DELETE` write through the
same path a script's write takes (the role check, the point's chain).

**Three ways in.** A `SQL.qry` list over a connection `con_host="xdb:doc=LINE/*;max=5000"`
(what a page writes to `@qry` runs with the page's role); a `PRO.pgwire` port that any
PostgreSQL client opens (psql, psycopg, psqlODBC for Excel and Power BI, Grafana, pgAdmin 4), the
database name being a document and the port's `con_role` or login the role; and the
`sql` command of the telnet shell or the MCP tool `xdb_sql`. On the PostgreSQL port and through
MCP an attribute that holds a password, a key or a token reads NULL and a password inside a
text (`PWD=x;`) reads `***`; a `WHERE` cannot test one either.

**Another database in the same query.** `sql('CN', 'SELECT ..') AS h` is a table read
from a SQL connection once, before the walk — for an Engineer, from a connection with
`pro_sql_xql="1"` that the way in lists (`sql=` / `pro_pg_sql`). Anybody else uses a
**named query**: `sqlq('HIS_LAST', 'L1_PT1', 5) AS h` runs a `<sqlq>` the engineer wrote,
the values bound to its `?`, its `xdb_acl` deciding who may run it. The other way round,
a database's own SQL (`SQL.qry` on that connection) may hold
`xdb('SELECT .. FROM "LINE/*".io') AS x`: the engine runs it first and hands the rows to
the database as an inline table.

What it does not do:

* **Cut a result.** A connection's `max=`, a list's `qry_max` and a named query's
  `sqlq_max` refuse a result over them; they never give the first rows of it.
* **Keep a transaction.** Every value of an `UPDATE` is written on its own; a refused one
  is left and the log names it.
* **Compare text the database's way.** `ORDER BY` on text is by code point; `lower()`
  gives a case-insensitive order. `=` is case-sensitive.

The field note `XDB_SQL.md` (in the engine's documents) has the whole language.

See also [14_SQL_Both_Ways](14_SQL_Both_Ways.md): `sql()`, named queries and `xdb()` side by side, with their gates,
limits and log lines.

---

## Saving a document

A save **edits the file the document was loaded from** (engine 4.3.4.640 and later).
The file is read, its start tags are walked beside the live elements, and only the
values that differ are replaced. Comments, blank lines, line ends, the DOCTYPE, the
attribute order and the spacing keep their bytes. The text goes to a temporary file and
then replaces the original, so if anything is wrong nothing is written.

| Call | Meaning |
|---|---|
| `doc('X')/#save` = `1`, `xdb.save()` | **Whole:** every attribute written in the file is brought up to date. Nothing is added |
| `doc('X')/#save` = `"//dev/bi/@evt_per"`, `xdb.save("//dev/bi/@evt_per")` | **Selector:** only what it names |
| `xdb.save(["id('A')/@a", "id('B')/@c"])` | several selectors, one write |
| `xdb.save(sel, path)`, `xdb.save("%DB%/copy.xml")` | the edited text goes to another file |

A text is a selector when it starts with `/`, `[` or `id(`. Both forms need role Engineer
or above; `SetValue` answers 0 when the save failed, and the log says why.

| Selector | Effect |
|---|---|
| `path/@atr` | that attribute, added behind the tag's last attribute if the tag lacks it |
| `path` | an element, added at its parent's end if the file lacks it |
| `id('X')` with no live X | X is taken out of the file with its lines |

So a device added at run time is saved by naming it after it is added, and a deleted one
by naming it after it is deleted:

```js
evt.SetValue("doc('PLT/S00')/#save", "id('" + id + "')");
```

An element it selects that is not in the file (a list row made at run time) refuses the
whole save: all or nothing.

### What a whole save writes

| Attribute | Whole save | Named |
|---|---|---|
| An ordinary attribute | written | written |
| `sta` of `thr`, `con`, `dev`, `bi`, `io`, `var`, `list` | live high byte + the file's low byte | the same |
| `sta` of `<xdb>`, `<doc>` | no | the same as above |
| `pro`, `val` of an `<io>` | no | no: it is the field's value |
| `pro` of another element | no | written |
| `val` of another element | written when it has no `pro` | written |
| A volatile type (`0x8000`) | no | no |
| An attribute with its own chain (`evt`, `qry`, `opr`, `new`, `ref`, `his`) | no | written |
| `con_host` empty in the file | no | written |
| `*_fnc`, `xdb_cls`, `xdb_acl`, `id`, `*_typ`, counters | no | written |

Of `sta`, the high byte is the command and the role, so an operator's stop is kept. The
low byte stays as the file has it because the engine raises it at every start. While a
document is not running or is parked no `sta` is written.

### Limits

* The source must be UTF-8.
* A document not read from a file (a mirror, `new XML(text)`) is written whole.
* A whole save writes a value a script changed at start, a `con_host` for example. Use a
  selector when that matters.
* A hand edit made while the engine runs is overwritten by a whole save with the old live
  value. A selector touches only what it names.
* Only this node's file is written: the other nodes of a cluster keep theirs.
* An element with no `id` goes by its place among its siblings, so if one is deleted the
  save is refused. Give it an `id`.
* An engine before 4.3.4.640 ignores the value of `#save` and rewrites the whole file.

| Line | Cause |
|---|---|
| `EvtSaveDoc OK: ..\db_T.xml (1 value(s) edited)` | done |
| `.. is not in the file, nothing was written` | the selector chose a run-time element |
| `an element without id is no longer in the document` | give it an id |
| `the source file ... cannot be read` | the file was moved or removed |
| `line N: ...` | the file was edited by hand and is no longer well formed |
