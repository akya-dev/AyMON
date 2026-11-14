# PRJEDU_sqlxdb — names from the tree in a query

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a Raspberry Pi; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8118/**: two production lines' latest readings, a search
over the points' names, and the lines' work orders.

**Needs an engine of 4.4.2.705 or later.** The line `XDB.xdb_init: Version:` in the log
names yours; [Older engines](#older-engines) says what an older one shows.

A history table grows by a row for every reading. What the point *is* — its name, its
unit, its class — is in the document already, and writing it into every row again is a
second copy that grows with the table and goes stale the day a point is renamed. Here
the table `his` holds a time, a document, a point's id and a value, and nothing else.
The queries take the name and the unit from the tree while the engine builds their
result, with two SQL comments that never reach the database:

```sql
SELECT tim, doc, rid, val FROM his ORDER BY tim DESC, rid LIMIT 14
/*xdb: name = doc('{doc}')/id('{rid}')/@desc ;
       unit = doc('{doc}')/id('{rid}')/@val_unt */
```

```sql
SELECT tim, doc, rid, val FROM his
 WHERE rid IN (/*xdb-in: doc('LINE/*')//io[contains-ci(@desc, 'pressure')]/@id */)
```

Nothing to install: the tables are one file, `log\plant.db`.

## What it teaches

* **a column from the tree.** `/*xdb: name = address */` fills column `name` of every
  row with what the address reads. `{doc}` and `{rid}` are that row's own cells, so each
  row reads its own point. The unit is not on any point: `@val_unt` is read through the
  point's class, as any address reads it.
* **a list from the tree.** `/*xdb-in: address/@id */` becomes the SQL list of the
  values the address selects: `rid IN ('L1_PT1','L2_PT1')`. The search box looks for a
  text in the points' **names**, which the table does not have. `contains-ci` ignores
  case: `TEMP` finds "Shrink tunnel temperature". A text no name holds gives
  `IN (NULL)`: no row, which is the right answer.
* **a rename is one write.** The page renames a point in the tree. Every row of it, old
  rows too, shows the new name at the next query; the table was never told.
* **an id made from a key.** The table `wo` knows a work order by a number, `wo_wid` =
  line × 2³² + order number. The tree knows it as `WO0100000002` in the document
  `LINE/L1`. A placeholder makes one of the other: `{wo_wid:010X}` is the key in 10 hex
  digits, `{wo_wid>>32:d}` its top 32 bits in decimal, the line.
* **`?=` keeps what a row has.** The two old orders carry a title of their own, written
  by an older program; `title ?=` keeps it and fills only the rows whose title is NULL.
  `=` would replace it.
* **ids read back into keys.** *open in the tree* asks which orders the tree says are
  open, as numbers the table can compare: `~ WO{:010X}` after the list reads
  `WO0100000002` back as `4294967298`, written without quotes, so the `INTEGER` column is
  compared as a number.
* **a point the tree does not have.** Its name and unit are null, and the log says so
  once per query.

## Try it

1. **Search** `pressure`, then `TEMP`, then `speed`. Each search is one XPath over both
   lines' documents (`doc('LINE/*')`); the SQL gets only ids.
2. **Rename L1_PT1.** Its rows say "Filler pressure, sensor B" at once, the old ones too.
   Rename it back.
3. **A row for a point the tree does not have.** A row for `L1_FT9`, a flow meter taken
   off the line, appears with `null` for its name and unit, and the console writes:

   ```
   REP/S00:SQL.qry: 'Q_HIS.qry' xdb: 2 of 16 addresses gave no value (no such element or attribute, xdb_acl refused it, or its document is not reachable) -- first: doc('LINE/L1')/id('L1_FT9')/@desc (14 rows)
   ```

   one line per query, until the row leaves the latest 14.
4. **Close an order**, then switch to **open in the tree**. The order leaves the list,
   and its counter in the table stops: the script that counts asks the tree too. Reopen
   it.
5. Look at **The SQL** at the bottom of the page: the four texts as the engine gets
   them. The database gets them without the comments, the lists already written out.

The changes in the tree (a name, an order's state) are in memory: a restart brings the
file's values back. The tables are the record: stop the engine with CTRL-C and run it
again, and the history and the counters are still there. Delete `log\plant.db` to begin
again.

## The queries

`REP/S00` holds four `<list>` elements of the class `cls_Q`: `SQL.qry` over `CN_SQL`,
synchronous (`qry_typ="0x1401"`: the rows are there when `SetValue` returns), the rows
as one JSON text in `qry_out` (`qry_jsn`: no `<item>` is made), a refusal's reason in
`qry_err`. Once a second `main.view` writes the four texts and copies each answer into a
`<var>` the page reads.

| List | Text |
|---|---|
| `Q_HIS` | the latest 14 readings + `/*xdb: name = ..; unit = .. */` |
| `Q_FIND` | the same, `WHERE rid IN (/*xdb-in: doc('LINE/*')//io[contains-ci(@desc, '<text>')]/@id */)` |
| `Q_WO` | every order + `/*xdb: wo = ..; line = ..; title ?= ..; state = .. */` |
| `Q_OPEN` | the same, `WHERE wo_wid IN (/*xdb-in: doc('LINE/*')//order[@state='open']/@id ~ WO{wo_wid:010X} */)` |

The work order embedding, whole:

```sql
SELECT wo_wid, title, qty, made FROM wo ORDER BY wo_wid
/*xdb: wo     = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@id ;
       line   = doc('LINE/L{wo_wid>>32:d}')/xdb/@desc ;
       title ?= doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@title ;
       state  = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@state */
```

For `wo_wid` = 4294967298 = `0x0100000002` the addresses read
`doc('LINE/L1')/id('WO0100000002')/@title` and so on. Each address is read once per
query, however many rows name it.

## The page

`REP/S00` serves it: `CN_WEB` (HTTP, `www\`) and `CN_LIVE` (MQTT inside a WebSocket on the
same port, `/mqtt`). The page writes one point, `ACT/@val`, with `xdb_acl="0xFFFFFFF3"`;
the documents' `xdb_acl="0xFFFFFFF1"` gives a Guest read and nothing else. A `val` chain
runs as the engine, so `main.act` may change the tree for the page.

| `ACT` | Does |
|---|---|
| `{"cmd":"find","txt":"temp"}` | the text `Q_FIND` looks for |
| `{"cmd":"rename"}` | renames `L1_PT1` in `LINE/L1`, and back |
| `{"cmd":"state","id":"WO0100000002"}` | closes / reopens an order in the tree |
| `{"cmd":"gone"}` | a history row for `L1_FT9`, which the tree does not have |

## Rules the example keeps

* **The search text goes into an XPath literal, not into the SQL.** A `'` would end the
  literal and `{ }` would be a placeholder, so `main.act` takes them out. The SQL list is
  escaped by the engine, by the connection's dialect: a value with a quote cannot break
  the statement.
* **A point's id is unique across the lines.** The list holds ids only (`rid IN (..)`):
  with the same id in two documents a search would also find the other line's rows.
* **The database never sees an embedded column.** `name` cannot be used in `WHERE`,
  `ORDER BY` or `GROUP BY`: filter by a name with a list, sort by `rid` or by time.
* **Who reads.** The reads run with the role of the query's event. `main.view` runs on
  a timer, as the engine, and reads everything; a query a logged-in user writes reads
  what that user may read, and a point `xdb_acl` hides is null for them.
* **A list is never cut.** More than `qry_xin_max` values (1000 if the element or its
  class does not say) refuses the query with *list too long*: a cut list would give a
  wrong answer without a sign.
* **The counters ask the tree too.** `main.made` reads the open orders' ids from the tree
  and turns them into keys by hand (`parseInt(id.substr(2), 16)`): the work `~ WO{:010X}`
  does inside a query. `SQL.exec_direct` and `SQL.prepare` do not read the comments.

## Older engines

* **4.4.2.704** reads the comments but not the templates: `Q_HIS` and `Q_FIND` work,
  `Q_WO` and `Q_OPEN` are refused and `qry_err` (under the SQL on the page) says why —
  704 takes `{wo_wid:010X}` for a column of that name, and a `{` in a list for a column
  too. Visible, never a wrong row.
* **Before 4.4.2.704** the comments go to the database as comments. The readings come
  without a name or a unit, the orders with only the table's own columns, and the search
  and *open in the tree* come back empty **without an error**: the list becomes `IN ()`,
  which SQLite takes as an empty list. PostgreSQL and SQL Server refuse it as a syntax
  error.

## Not shown

* PostgreSQL or SQL Server: the same SQL runs there; a list is written in the dialect's
  literals (`N'..'` on SQL Server). [PRJEDU_odbc](../PRJEDU_odbc/) shows how a connection
  string picks the database.
* A document on another node: `doc('X@CN')` in an address reads it over PRO.rpc, as any
  address does ([PRJEDU_remote](../../cluster/PRJEDU_remote/)).
* The history written by the engine itself (`[HIS.val]`, a `<his>` sink):
  [PRJEDU_records](../PRJEDU_records/). Such a table keeps a name column only if you ask
  for one; with this embedding it does not need one.

The guide for this is [11_Records_and_Saving](../../../docs/11_Records_and_Saving.md),
section "Names from the tree in a query".
