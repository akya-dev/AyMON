# SQL, history, files and the cluster

The scopes that reach outside the engine's memory: `SQL` for a database, `HIS` for records
and history, `File` for plain files, `LIC` for the licence, `CLT` / `REP` / `RPC` for a
cluster, `OPC` for OPC UA tools and `PY` for Python. The ideas behind them are in the guides:
[Scripting](../03_Scripting.md#sql-from-script) for SQL,
[Records and saving](../11_Records_and_Saving.md) for `HIS`, [Two engines](../10_Two_Engines.md)
for the cluster, and [Values that survive a restart](../13_Durable_Documents.md) for what needs no
database at all. Every result below was measured on engine 4.4.2.702.

* [SQL: a database](#sql-a-database)
* [SQL_CON and SQL_RS: the objects](#sql_con-and-sql_rs-the-objects)
* [HIS: records and history](#his-records-and-history)
* [File: plain files](#file-plain-files)
* [LIC: the licence](#lic-the-licence)
* [CLT: the election](#clt-the-election)
* [REP: replication](#rep-replication)
* [RPC: remote calls](#rpc-remote-calls)
* [OPC: OPC UA tools](#opc-opc-ua-tools)
* [PY: calling Python](#py-calling-python)

---

## SQL: a database

`SQL.*` works on a `<con>` whose `xdb_fnc` is `[CON.sql,PRO.sql]` (`CON.odbc` / `PRO.odbc` are
the same pair under their old names). `con_host` is the connection string and chooses the
driver: `DRIVER=SQLite3i;Database=<file>;` is the embedded SQLite, attached on first use; any
other string goes to ODBC. The connection itself is on
[page 09](09_Connection_and_Protocol_Types.md). The `<con>` used for every example below:

```xml
<con id="CN_SQL" xdb_fnc="[CON.sql,PRO.sql]"
     con_host="DRIVER=SQLite3i;Database=C:/data/t.db;"
     con_mod="CLIENT" con_ses="2" con_tmo="5" con_rct="2" con_keeptmo="0" con_idletmo="0"
     pro_role="MASTER" pro_tmo="2" pro_try="1" pro="1" pro_typ="0xC412" pro_fnc="[]"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
```

The directory of an SQLite file must exist: the file is made, the directory is not.

Every call has the same shape:

```js
var con = SQL.attach("CN_SQL");          // borrow a link from the <con>'s pool
var rs  = SQL.exec_direct(con, sql);     // or prepare / parameter / execute
while (SQL.fetch(rs)) { ... SQL.getdata(rs, 1) ... }
SQL.close(rs);                           // always
```

**A failed call does not throw**, not even inside `try`: it answers `undefined` or `0` and
writes one `ERROR` line with the driver's text. Test what comes back. `SQL.dia` is the
exception: it throws inside `try`.

### SQL.attach

`SQL.attach(con_id [, dev_id])` → `SQL_CON`, or undefined

Borrows one link from the pool of the `<con>` named `con_id`. The pool is the connection's
session list:

| On the `<con>` | Meaning |
|---|---|
| `con_ses` | how many links (one if absent or 0). `con_pool`, the old name, wins when written, with a `WARN` line |
| `con_idletmo` | a link not used for this long (s) is closed; the next borrow opens it again. `0` = never |
| `con_keeptmo` | an idle link is checked this often (s), from its own thread |
| `pro_tmo` | how long a borrower waits when every link is busy (s; `0` = 5) |
| `pro_role` | must be `MASTER`, else the borrow is refused |

| Argument | Meaning |
|---|---|
| `con_id` | the `id` of a `CON.sql` in this document |
| `dev_id` | optional: the `id` of a `<dev pro_con="con_id">`. A device is a database of its own: its `con_host` is its connection string, its `con_ses` the most links it may hold |

Returns a loan (it prints as `<SQL_CON>`). A link is opened when it is first borrowed. It goes
back with `SQL.disconnect(con)`, `con.disconnect()`, or by itself when the last copy of the
variable is gone. A result set opened through it keeps the link busy until it is closed.

Undefined, and nothing logged, when `con_id` names no `<con>` or the `<con>` is switched off.
Undefined with one line when the device is not one of this connection's
(`SQL.attach: 'NOPE' is no <dev pro_con="CN_SQL"> of this document`), when the database
cannot be reached (at once, not after `pro_tmo`), and when every link stays busy for
`pro_tmo`:

```js
var a1 = SQL.attach("CN_SQL");       // con_ses="2", pro_tmo="2"
var a2 = SQL.attach("CN_SQL");
var a3 = SQL.attach("CN_SQL");       // undefined, after 2001 ms
SQL.disconnect(a1);
var a4 = SQL.attach("CN_SQL");       // <SQL_CON>, at once
var d  = SQL.attach("CN_SQL", "DB2");  // a link of <dev id="DB2" pro_con="CN_SQL">
```

The third borrow writes a `FAIL` line that names who holds each link —
`PRO.sql: SQL pool exhausted, 2 connections busy for 2000 ms -- held by [0] XDB. (thr 8FE0) 2.0 s, ..`
— and raises the `<con>`'s health alarm. **A function that attaches and then waits holds its
link the whole time.** Give it back as soon as the query is done.

### SQL.disconnect

`SQL.disconnect(con)` → `1` given back now, `0` it was given back before

Gives a loan from `SQL.attach` back to its pool, for every copy of the variable at once. For a
connection made by `SQL.connect` it closes the connection (`1`), and later calls on it answer
undefined. A later call on a given-back loan answers undefined and writes one line:

```js
SQL.disconnect(con)                  // 1
SQL.disconnect(con)                  // 0
SQL.exec_direct(con, "SELECT 1")     // undefined
// ERROR | CallScopeFunction: .. 'exec_direct' refused [ERR_COMMON_NULL] -- SQL_CON: this pool
//         link was given back (SQL.disconnect / con.disconnect) -- SQL.attach again
```

### SQL.connect

`SQL.connect(connstr [, timeout])` → `SQL_CON`, or undefined

Opens a connection of its own, outside any pool. `timeout` is in seconds (10 if absent).
Close it with `SQL.disconnect`; it is also closed when the last copy of the variable is gone.

```js
var c = SQL.connect("DRIVER=SQLite3i;Database=C:/data/t.db;");   // <SQL_CON>
SQL.connect("DRIVER=SQLite3i;Database=Z:/no/such/dir/x.db;")     // undefined
// ERROR | SQL.connect: ERROR (con=DRIVER=SQLite3i;Database=Z:/no/such/dir/x.db;), unable to open database file
```

A password in the connection string is not written to the log. Prefer `SQL.attach`: a pool is
opened once, counted by the licence once, and watched by the engine.

### SQL.exec_direct

`SQL.exec_direct(con, sql)` → `SQL_RS`, or undefined

Runs a statement as it is. Use it for SQL with no value in it; the moment a value goes into
the statement, use `prepare` / `parameter` / `execute`.

| Argument | Meaning |
|---|---|
| `con` | a `SQL_CON` (`SQL.attach`, `SQL.connect`) |
| `sql` | the statement, UTF-8 |

Returns a result set for every statement that ran, an `UPDATE` or a `CREATE` too: close it.
Undefined when the statement failed, with
`SQL.exec_direct: ERROR (sql=SELEC nonsense), near "SELEC": syntax error, duration:0 ms`, and
for an empty text.

```js
var rs = SQL.exec_direct(con, "UPDATE t SET i = i + 1");   // <SQL_RS>
SQL.getrowqty(rs)                                          // 3: rows changed
SQL.close(rs);
SQL.exec_direct(con, "SELEC nonsense")                     // undefined
```

### SQL.prepare

`SQL.prepare(con, sql)` → `SQL_RS`, or undefined

Prepares a statement with `?` where the values go. Nothing runs yet. Undefined when the
database refuses it (`SQL.prepare: ERROR (sql=SELECT nope FROM nowhere), no such table: nowhere`)
or with fewer than two arguments.

```js
var rs = SQL.prepare(con, "INSERT INTO t (k,i,s) VALUES (?,?,?)");
SQL.parameter(rs, 1, 3);
SQL.parameter(rs, 2, -5);
SQL.parameter(rs, 3, "x'; DROP TABLE t; --");   // stored as text: a bound value is data
SQL.execute(rs);                                // 1
SQL.execute(rs);                                // 0: the same values again, key 3 exists
SQL.close(rs);
```

### SQL.parameter

`SQL.parameter(rs, n, v)` → `1` bound, `0` not

Binds `v` to the `n`-th `?`, **counting from 1**. A value stays bound: `execute` again runs the
statement again with it. `n` out of range answers `0` with
`SQL.parameter: ERROR column index out of range`.

What a value becomes, measured on SQLite:

| Value | Bound as |
|---|---|
| integer, `true` / `false` | integer (`true` = 1) |
| float | real |
| text | text |
| `null`, `undefined` | SQL NULL |
| decimal (`"12.50".toDEC()`) | a number on SQLite (`12.5`); exact text with its scale on ODBC |
| time (`toDTM()`, `Time.now()`) | ISO text in the local offset: `2026-10-01T02:00:00.000-07:00` for `"2026-10-01T12:00:00+03:00"`; on SQL Server by the column's type |
| date, time of day | text: `2026-10-01`, `09:30:00.000` |

SQLite stores by the column's affinity: the float `3.25` bound to a `TEXT` column comes back
as the text `"3.25"`.

### SQL.execute

`SQL.execute(rs)` → `1` done, `0` failed

Runs a prepared statement. A failure writes `SQL.execute: ERROR <driver text>`
(`UNIQUE constraint failed: t.k`); `SQL.errortext` reads the same text. An `UPDATE` that
touches no row is done (`1`). After `execute` a `SELECT` is read with `fetch`.

### SQL.fetch

`SQL.fetch(rs)` → `1` a row, `0` no more

Moves to the next row. `0` also for a statement with no rows (`UPDATE`), and for an `rs` that
is undefined — so `while (SQL.fetch(rs))` after a failed `exec_direct` simply does nothing.

### SQL.getdata

`SQL.getdata(rs, n)` → the value of column `n` of the current row

Columns count **from 1**. Column 0 or past the last answers undefined and writes
`SQL.getdata: ERROR` (with no text). What comes back:

| Column | SQLite | ODBC |
|---|---|---|
| integer | number | `TINYINT` `SMALLINT` `INTEGER` `BIGINT` `BIT`: number |
| floating | number | `FLOAT` `DOUBLE` `REAL`: number |
| `DECIMAL` / `NUMERIC` | a number (SQLite keeps it as a real or an integer) | a decimal; more than 28 digits stays text |
| text | text | text |
| date, time | text; with `con_dtm="1"` see below | text; with `con_dtm="1"` see below |
| binary | text; a zero byte ends it (`X'414243'` is `"ABC"`, `X'00FF'` is `""`) | text |
| SQL NULL | **undefined** | **undefined** |

SQLite answers by the type of the value stored, not of the column: `10/4` is `2`, `1.0` is `1`.
The numbers can be used at once: `SQL.getdata(rs, 1) + 1` adds.

**`con_dtm="1"`** on the `<con>` makes a date-and-time column answer a time value, a `DATE`
column a date and a `TIME` column a time of day. Text that does not read as one stays text;
a plain text column is unchanged. On SQLite the column's declared type decides:

```js
// t.dt DATETIME holding "2026-10-01T02:00:00.000-07:00", read through <con con_dtm="1">
var v = SQL.getdata(rs, 1);     // a time: 2026-10-01T02:00:00.000-07:00
v + 1000                        // 2026-10-01T02:00:01.000-07:00
SQL.getdata(rs, 2)              // the DATE column: a date, 2026-10-01
SQL.getdata(rs, 3)              // the TIME column: 09:30:00.000
```

Without `con_dtm` the same columns answer their text. An SQL NULL is undefined, never `""`:
test it with `v == null` ([Scripting](../03_Scripting.md#eight-places-this-is-not-javascript), item 2).

### SQL.getrowqty

`SQL.getrowqty(rs)` → integer

On SQLite: the number of rows of a `SELECT`, known **before the first fetch**, or the rows an
`INSERT` / `UPDATE` / `DELETE` changed. On ODBC: what the driver reports — rows changed by a
write; for a `SELECT` many drivers do not know it. Count by fetching when the database may not
be SQLite.

```js
rs = SQL.exec_direct(con, "SELECT k FROM t");
SQL.getrowqty(rs)        // 3, before any fetch (SQLite)
rs2 = SQL.exec_direct(con, "SELECT k FROM t WHERE k > 100");
SQL.getrowqty(rs2)       // 0
```

### SQL.getcolqty

`SQL.getcolqty(rs)` → integer

The number of columns. `0` for a statement that returns none.

### SQL.getcolname

`SQL.getcolname(rs, n)` → text

The name of column `n` (from 1), as the `SELECT` names it (`AS` included). Out of range:
undefined and `SQL.getcolname: ERROR`.

```js
var c = 1;
while (c <= SQL.getcolqty(rs)) { evt.Log(4, SQL.getcolname(rs, c) + "=" + SQL.getdata(rs, c)); c++; }
```

### SQL.close

`SQL.close(rs)` → `1`

Closes a result set and gives its hold on the link back. Closing twice answers `1` again;
closing undefined answers `0`. **This is what you owe**: a result set left open keeps its link
busy.

### SQL.errortext

`SQL.errortext(x, kind)` → text

The text of the last failure on a link. `x` is a `SQL_CON` (with `kind` 1 or 2) or a `SQL_RS`
(with any other `kind`); both read the same text. **Both arguments are required**: with one
the answer is undefined. The next call on the link clears it, so read it at once:

```js
if (!SQL.execute(rs)) evt.Log(3, SQL.errortext(con, 2));   // UNIQUE constraint failed: t.k
SQL.errortext(con)                                          // undefined
```

### SQL.dia

`SQL.dia(con)` → text

The SQL dialect of a connection — `mssql`, `pgsql`, `sqlite`, `mysql`, or the id of a
`<sqldia>` profile in the root document. This is what the engine writes its own SQL in (the
history sink, the mirror list). `con` is a `SQL_CON` or the id of a `CON.sql`.

The `<con>`'s `con_dia` wins; without it the driver names the database, which needs a link (the
call borrows one and gives it back). An id that is no `CON.sql` is refused: one `ERROR` line,
and inside `try` a throw.

```js
SQL.dia(con)            // "sqlite"
SQL.dia("CN_SQL")       // "sqlite"
SQL.dia("CN_DIA")       // "pgsql": <con id="CN_DIA" con_dia="pgsql" ..>, SQLite behind it
try { SQL.dia("NOPE"); } catch (e) { e.message; }   // SQL.dia: 'NOPE' is no CON.sql of this document
```

### SQL.qry

**In:** the `<atr>_fnc` of a list element, normally `qry_fnc`. **Reads:** `<atr>_con`,
`<atr>_max`, `<atr>_cls`, and whether `<atr>_out`, `<atr>_jsn`, `<atr>_row`, `<atr>_err` are
present. **Changes:** the element's children, then `<atr>_out`, `<atr>_err` and, last,
`<atr>_cnt`.

Runs the text written to `<atr>` on the connection and makes each row an `<item>` child,
replacing the old ones. With `qry_typ="0x1401"` it runs on the writer's thread: the rows are
there when `SetValue` returns.

| Attribute | Meaning |
|---|---|
| `<atr>_con` | the `CON.sql` that runs it. Required |
| `<atr>_max` | at most this many rows become items. Absent or 0: all |
| `<atr>_cls` | every item gets `xdb_cls` = this class, whose `*_typ` types the columns |
| `<atr>_cnt` | written **last**: the number of rows made, `0` after a failure. Wait for this one |
| `<atr>_out` | when present: all the rows as one JSON text |
| `<atr>_jsn` | with `<atr>_out`: no `<item>` is made, the JSON is built directly (a NULL is `null`). Refused, with a `WARN` line, without `<atr>_out` or with `<atr>_row` |
| `<atr>_row` | when present: each item gets `<atr>_row`, the JSON of **the items made so far**, itself included — not its own row alone |
| `<atr>_err` | when present: `""` after a success, the reason after a failure |
| `<atr>_xin_max` | at most this many values in one `/*xdb-in: */` list ([below](#xdb-values-in-the-result)). Absent: 1000 |

An item carries one attribute per column, as text (a class can type them), an SQL NULL as an
empty text, `<atr>_doc` = the document's name and `<atr>_idx` = its row number from 1:

```xml
<list id="L_R" qry="" qry_typ="0x1401" qry_fnc="[SQL.qry]" qry_max="3" qry_con="CN_SQL"
      qry_cnt="" qry_out="" qry_err="" qry_err_typ="0x0401" sta="0x0303" sta_typ="0x0142"/>
```

```js
evt.SetValue("id('L_R')/@qry", "SELECT k, i, s, n FROM t ORDER BY k");
evt.GetValue("id('L_R')/@qry_cnt")          // "3": text, because qry_cnt="" declares it so
evt.GetValue("id('L_R')/item[1]/@i")        // "43": text
evt.GetValue("id('L_R')/item[1]/@n")        // "": the NULL
```

```xml
<item qry_doc="XDB" k="1" i="43" s="abc" n="" qry_idx="1"/>
<item qry_doc="XDB" k="2" i="2" s="3.25" n="" qry_idx="2"/>
<item qry_doc="XDB" k="3" i="-4" s="x'; DROP TABLE t; --" n="" qry_idx="3"/>
```

`qry_out` then holds
`[{"xdb_elm":"item","qry_doc":"XDB","k":"1","i":"43","s":"abc","n":"","qry_idx":1}, ..]`.
With `qry_jsn="1"` the same rows come as `{"qry_doc":"XDB","k":"1","s":"abc","n":null,"qry_idx":1}`
and the list stays empty.

**A failed query leaves the old rows**: `<atr>_out` becomes `[]`, `<atr>_cnt` `0`, `<atr>_err`
the driver's text, and the log says `SQL.qry: 'L_R.qry' failed -- near "SELEC": syntax error`.
Before 4.4.2.704 a text over 2047 bytes was refused the same way (`query text too long`);
there is no limit since.

A column called **`id` becomes the item's id** and enters the document's id index:
`SELECT 'A2' AS id, 6 AS v` makes `id('A2')/@v` readable as `"6"`. Two rows with one id fight;
alias a key column that is not meant as one (`SELECT rowid AS rid ..`).

Every write of `<atr>` runs the query again. A list that is the live window of a table and
written back is a [mirror list](#a-mirror-list) instead; `SQL.qry` deletes and remakes its rows.

#### XDB values in the result

From 4.4.2.704, the id templates from 4.4.2.705; measured on 4.4.2.705 with
[PRJEDU_sqlxdb](../../examples/data/PRJEDU_sqlxdb/). Two SQL comments in the text are read by
the engine and taken out before the database gets it (`SQL.qry` only; `exec_direct` and
`prepare` send their text as it is):

| Comment | Does |
|---|---|
| `/*xdb: col = address ; col2 ?= address2 */` | fills column `col` of every row with what the address reads; `{column}` = that row's cell. A column the result has is filled in place, others are added after the SQL's columns. `?=` fills only a NULL cell. Nothing read = NULL |
| `/*xdb-in: address/@attr */` | becomes the SQL list of the values: `'a','b'` in the connection's dialect, `NULL` when there is none. More than `<atr>_xin_max` refuses the query |
| `/*xdb-in: address/@attr ~ WO{:010X} */` | reads each value through the template back into a number, written without quotes; a value that does not fit is left out |

A placeholder reads `{column[>>n][&mask][/n][%n][:[0][width](d|x|X)]}`: operations left to right,
then decimal or hex. `{wo_wid:010X}` of `4294967298` is `0100000002`, `{wo_wid>>32:d}` is `1`.

```sql
SELECT tim, doc, rid, val FROM his ORDER BY tim DESC, rid LIMIT 14
/*xdb: name = doc('{doc}')/id('{rid}')/@desc ;
       unit = doc('{doc}')/id('{rid}')/@val_unt */
```

With `qry_jsn="1"` the first row in `qry_out`, the two last columns from the tree (`@val_unt`
from the point's class):

```
{"qry_doc":"REP/S00","tim":"2026-11-13 14:47:41","doc":"LINE/L1","rid":"L1_LT1","val":"54.5702831473003","name":"Filler bowl level","unit":"%","qry_idx":1}
```

```sql
SELECT wo_wid, title, qty, made FROM wo
 WHERE wo_wid IN (/*xdb-in: doc('LINE/*')//order[@state='open']/@id ~ WO{wo_wid:010X} */)
/*xdb: wo     = doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@id ;
       title ?= doc('LINE/L{wo_wid>>32:d}')/id('WO{wo_wid:010X}')/@title */
```

The database got `WHERE wo_wid IN (4294967298,4294967299,8589934593)`; the first row:

```
{"qry_doc":"REP/S00","wo_wid":"4294967298","title":"Water 1.5 l","qty":"8000","made":"2283","wo":"WO0100000002", ..}
```

A row whose addresses read nothing gets NULL cells and one `WARN` line per query:
`SQL.qry: 'Q_HIS.qry' xdb: 2 of 16 addresses gave no value (..) -- first:
doc('LINE/L1')/id('L1_FT9')/@desc (14 rows)`. The reads run with the role of the query's event:
a value `xdb_acl` hides from it is NULL. An embedded column cannot be used in `WHERE` or
`ORDER BY`: the database never sees it. A refused command (an unknown `{column}`, a list
without `/@attr`, too many values) sends nothing and says why in `<atr>_err`.

---

## SQL_CON and SQL_RS: the objects

The values `SQL.*` hands out are objects with methods of their own. The two forms can be
mixed: `con.exec_direct(sql)` and `SQL.exec_direct(con, sql)` are the same call.

### SQL_CON

What `SQL.attach` and `SQL.connect` return, and what `new SQL_CON(connstr [, timeout])` makes:
a connection of its own, opened at once when `connstr` is given. `new SQL_CON()` makes an empty
one for `connect`; a string that does not open makes undefined.

| Member | Result |
|---|---|
| `con.exec_direct(sql)` | `SQL_RS` or undefined |
| `con.prepare(sql)` | `SQL_RS` or undefined |
| `con.connect(connstr [, timeout])` | **`0` connected, another number on failure** (`-2146828285` for a file that cannot be opened). Refused on a loan from `SQL.attach`: undefined and `a pool link is opened by its connection, not by con.connect` |
| `con.disconnect()` | `0`. On a loan it gives the link back, like `SQL.disconnect` |
| `con.error_text` | the last failure's text (`near "SELEC": syntax error`) |
| `con.timeout` | seconds a statement may take; writable. A loan has its `<con>`'s `pro_tmo`, `new SQL_CON` 10 |
| `con.duration` | ms the last **failed** statement took |
| `con.con` | the connection string |

```js
var o = new SQL_CON("DRIVER=SQLite3i;Database=C:/data/t.db;", 5);
var rs = o.exec_direct("SELECT k, s FROM t ORDER BY k");
rs.fetch();            // 1
rs.getdata(2);         // "abc"
rs.close();            // 0
o.exec_direct("SELEC x");   // undefined
o.error_text;               // near "SELEC": syntax error
o.disconnect();             // 0
```

### SQL_RS

What `exec_direct` and `prepare` return. **It cannot be made with `new`**:
`new SQL_RS(con, sql)` is undefined.

| Member | Result |
|---|---|
| `rs.fetch()` | `1` / `0`, as `SQL.fetch` |
| `rs.getdata(n)` | as `SQL.getdata` |
| `rs.getcolname(n)` | as `SQL.getcolname` |
| `rs.getcolqty()` | as `SQL.getcolqty` |
| `rs.getrowqty()` | as `SQL.getrowqty` |
| `rs.parameter(n, v)` | `1` / `0`, as `SQL.parameter` |
| `rs.execute()` | `1` / `0`, as `SQL.execute` |
| `rs.close()` | **`0`** (where `SQL.close` answers `1`) |
| `rs.duration` | ms the statement took |
| `rs.sql` | the text of a prepared statement until it is executed |

---

## HIS: records and history

A **record** is a small JSON text with an id of its own: an alarm (`alm`), an event (`evt`),
an audit line (`aud`), a value (`val`) or a row (`row`). Chain functions and script calls make
them; the engine carries them to the element that keeps them (a **sink**), and that element
writes the table. A third use of `HIS` is the **mirror list**, a list that is the live window
of a table. [Records and saving](../11_Records_and_Saving.md) explains all three; this section
lists every call and attribute.

Where a record goes is set on the root `<xdb>`; a document without one uses its parent's, and
`""` switches it off there:

| Root attribute | Meaning |
|---|---|
| `alm_adr` | the sink of alarm records (made by `ALM.*`, [page 05](05_Alarms_Conditions_and_Protocol_Chains.md)) |
| `evt_adr` | the sink of `evt` and `aud` records (`HIS.rec`, `HIS.evt`) |
| `his_adr` | the sink of `val` records (`HIS.val`) |
| `rec_nid` | 0..255, written into every record id. Different on every node; derived from `tid` when absent (`REC: record ids carry node 37, derived from tid 'S01'`) |
| `rec_max` `rec_tmo` `rec_dir` `rec_seg` `rec_sync` | the journal that holds records on their way ([Records and saving](../11_Records_and_Saving.md#over-several-nodes)) |

An address is `doc('HIS/S00')/id('EVT_H')`; the sink may be in the same document. A record as
it reaches the sink (here an `evt` from `HIS.rec`):

```
{"tim":1794389703504,"uid":111264167952400,"src":"S01","knd":"evt","rol":9,
 "doc":"XDB","rid":"XDB","atr":"","sta":257,"txt":"plain text event"}
```

`uid` (53 bits) is the row's key, `src` the node's `tid`, `rol` the role that made it (9 =
the engine), `doc` / `rid` / `atr` the event's document, element and attribute, `sta` 257
(`0x0101`, information) unless the caller gave one.

### HIS.cfg

**In:** the `xdb_fnc` of a `<his>` element. **Reads:** the `his_*` attributes below.
**Changes:** nothing in the document; it makes the sink or the mirror.

With `his_wri="row"` the `<his>` is a [mirror list](#a-mirror-list); without it, a sink.
A configuration fault is one `ERROR` line (`HIS(<id>): no sink -- <why>`) and nothing is made;
the document goes on. A good one says what it made:
`HIS(EVT_H): sink of 'evt,aud' records into table evt over CN_SQL, 13 column(s), key id, rows answered after they are written`.

**A sink.** The table must exist.

```xml
<his id="EVT_H" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142"
     his_rec="evt,aud" his_tbl="evt" qry_con="CN_SQL"
     his_col="id=uid,tim:loc,ms=tim,dt=tim:dtm,day=tim:day,knd,doc,rid,atr,txt,rol,sta,n:txt"
     new="" new_typ="0x1401" new_fnc="[HIS.new,ATR.nup]"/>
```

| Attribute | Meaning |
|---|---|
| `his_rec` | the kinds it takes: `alm`, `evt`, `aud`, `val`, comma-separated. Absent: any. A record of another kind is refused with a line |
| `his_tbl` | the table. Absent: a sink with no SQL (records are answered when applied) |
| `his_col` | the columns, a white list: `column[=field][:kind]`. `field` is a record field (the column's name if absent); `=uid` makes it the key. Up to 48 |
| `qry_con` | the `CON.sql` (same document) that writes the rows. Required with `his_tbl` |
| `his_bat` | rows per statement, 1..1000; 200 |
| `his_spl` | rows that may wait for the database, 16..1000000; 20000 |
| `his_ident` | `1` = the key column is an `IDENTITY` (SQL Server) |
| `his_row` | `hook` = a row only when the hook gives one with `HIS.row` |
| `new` `new_typ` `new_fnc` | where records arrive: `new_fnc="[HIS.new,ATR.nup]"`. `new_typ` must run a function (`0x1401` at once, `0xE401` on the document's own thread); one that does not is an `ERROR` line |
| `new_elm_new_*` | keep each record as an `<item>` too, through `ELM.new` ([page 04](04_Attribute_and_Element_Functions.md#elmnew)); its `new_elm_new_eval` hook may call `HIS.uid` and `HIS.row` |

The SQL dialect is the connection's (`SQL.dia`); `his_eng` is refused.

A column kind, measured on SQLite for a record made at 02:35:56.835 local time (−07:00):

| `his_col` | Writes |
|---|---|
| `ms=tim` (no kind) | the field as it is: `1794389756835` |
| `tim:loc` | local time text with its offset: `2026-11-11 02:35:56.835-07:00` |
| `dt=tim:dtm` | a time value: on SQLite `2026-11-11T02:35:56.835-07:00`; a `datetimeoffset` on SQL Server |
| `day=tim:day` | the date in the project's time zone: `2026-11-11` |
| `n:txt` | the field as text: `"5"` |

A field the record lacks is written as NULL. The connection writes ready rows once a second,
many per statement, and skips a key already in the table (the key column needs a unique
index). Every 10 s that something moved, one line counts it:
`HIS(EVT_H): rows taken 5 written 5 in 2 statement(s) | waiting 0 | dropped 0 | spool full 0`.

#### A mirror list

```xml
<tio id="cls_WO" sta_typ="0x0142" wo_id_typ="0x0208" prio_typ="0x0204" status_typ="0x0204"/>
<his id="ORDERS" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142" qry_con="CN_SQL"
     his_wri="row" his_tbl="wo" his_key="wo_id" his_rid="WO{wo_id}"
     his_col="wo_id,title,prio,status,opened:dtm"
     his_load="status &lt; 2" his_order="wo_id" his_cls="cls_WO"
     his_keygen="max" his_del="keep"
     ref="" ref_typ="0x1401" ref_fnc="[HIS.ref]"
     new="" new_typ="0xD402" new_fnc="[ELM.new,ATR.nup]"
     new_elm_new="item" new_elm_new_idatr="lid" new_elm_new_pos="+1" new_elm_new_max="N9999"
     new_elm_new_eval="return (main.new_wo(evt));"/>
```

With table `wo` holding orders 1 (status 0), 2 (status 1) and 3 (status 2), the list loads
`WO1` and `WO2`: `HIS(ORDERS): table wo loaded -- 2 row(s), 2 new, .. 0 removed, 1 ms`.

| Attribute | Default | Meaning |
|---|---|---|
| `his_wri` | | `row`: a mirror list |
| `his_tbl` | | the table; it must exist |
| `qry_con` | | the `CON.sql` that reads and writes; its thread does the work |
| `his_col` | | `column` or `column=attribute`, with kinds `:dtm` `:loc` `:day` `:txt`, `:num` (a number kept as text; empty = NULL), `:jsn` (JSON; empty = NULL), and `:ins` (written only when the row is new). `id` cannot be a column: it is the row's element id |
| `his_key` | | the key column(s), named in `his_col` |
| `his_rid` | `{<key>}` | a row's element id from its columns: `{col}`, `{col:x}` hex, `{col:016X}` padded |
| `his_load` | | the `WHERE` of the load. `his_load_<dialect>` (`his_load_pgsql` ..) for one dialect |
| `his_ro` | | `name=expression;..`: read-only columns or expressions read with the rows. `his_ro_<dialect>` for one dialect |
| `his_order` | | the `ORDER BY` of the load |
| `his_max` | 100000 | at most this many rows are loaded |
| `his_cls` | | the class of a loaded row: the types of its columns |
| `his_keygen` | | what `HIS.key` answers: `max` (the table's largest key + 1, one key column) or `uid` |
| `his_ref` | 0 | seconds: load the table again (merged) this often. At least 1; `0` = only at the start |
| `his_del` | `keep` | a row that leaves the list: `keep` it in the table, `delete` it, or `col=val` mark it |
| `his_wri_per` | 1000 | ms: changed rows are written at most this often (sooner when `his_bat` rows wait) |
| `his_bat` | 200 | rows per statement |
| `his_promo` | `all` | `all`: a promoted cluster node writes every row it holds once; `none`: it does not |
| `his_ident` | | `1` = SQL Server `IDENTITY_INSERT` |
| `his_rec` `his_spl` | | the mirror takes records too, answered once their row is in the table |
| `his_chg_fnc` | | runs when a load made or removed rows; `his_chg` holds how many |

The load runs once the document is master, on the connection's second, and is a merge: a row
the list has keeps its element, a row with a change not yet written keeps the list's values, a
row the table no longer returns leaves the list. The `_ms` / `_pg` / `_lite` suffixes and
`his_eng` of older engines are refused with the new name.

### HIS.new

**In:** the `new_fnc` of a sink: `new_fnc="[HIS.new,ATR.nup]"`. **Reads:** the record written
to `@new`. **Changes:** the sink's spool; with `new_elm_new_*` an `<item>` through `ELM.new`.

Takes the record into the sink: checks its kind against `his_rec`, runs the hook if there is
one, and puts the row in the spool. The record is answered (let go at its source) only after
its row is committed. Never stops the chain; `ATR.nup` after it keeps the text out of the
attribute. On a parked document (a cluster spare) it does nothing: the record goes back to its
source.

### HIS.val

**In:** a point's `val_fnc` (or `pro_fnc`), after `IF.chg`. **Reads:** `his_per`,
`his_dbd`, `xdb_tim`, `desc`, `pro_typ`, the root's `his_adr`. **Changes:** nothing; it makes a
`val` record.

| Attribute | Meaning |
|---|---|
| `his_per` | the period in seconds, ending at multiples of itself; 600 if absent |
| `his_dbd` | inside a period, a change closer than this to the value last written makes no record |

The first change of a period is a record at once; later changes in the period are **one
pending record**, replaced by each change and written when the period ends (or by the next
change after it), with its own time. Only a running point (`(sta & 3) == 3`) records. The record
holds `doc rid atr txt` (`desc`) `typ` (`pro_typ`) `pro val sta`; its time is `xdb_tim` when
that is fresh, else now. The pending record is in memory: a crash or a stop loses it (counted).

```xml
<var id="LEVEL" sta="0x0303" sta_typ="0x1142" val="50" val_typ="0x1308" val_rou="0.1"
     val_fnc="[ATR.rou,ALM.onlvl,IF.chg,HIS.val]" val_alm_onlhi_alm="85" his_per="3" desc="tank level"/>
```

Writing 51.04, 52 and 53 in one step made two rows, `51` at once and `53` when the 3 s period
ended; 90 two seconds later started a new period and was a row at once. A document with no
`his_adr` writes `HIS.val: id('HV') -- document XDB has no his_adr (nor its parents)`.
`HIS.val(evt)` may be called from a script function that is itself in such a chain; it
answers undefined.

### HIS.evt

**In:** any `<atr>_fnc`, usually after `IF.chg`. **Reads:** `desc`, the root's `evt_adr`.
**Changes:** nothing; it makes an `evt` record.

When the value changed, an event record with `txt` = `"<desc>: '<old>' -> '<new>'"` (the
element's id when there is no `desc`). Never stops the chain.

```xml
<var id="PUMP" sta="0x0303" sta_typ="0x142" val="0" val_typ="0x1104"
     val_fnc="[IF.chg,HIS.evt]" desc="fill pump"/>
```

Writing 1 makes the record `"txt":"fill pump: '0' -> '1'"`, `"rid":"PUMP"`, `"atr":"val"`.

### HIS.evtnew

**In:** an `<atr>_fnc` of a list element. **Reads:** `<atr>_evtnew_max` (1000 if absent),
the source element's `grp`. **Changes:** adds an `<item>` as the first child, removes the
oldest past the maximum.

A small event list kept in the document, with no table. The item has `xdb_cls="cls_EVT"`,
`sta="0x0002"`, `tim` (local time), `doc` / `rid` / `atr` of the event that made the write (not
of the list), `grp` and `txt` = the value written.

```xml
<list id="EVL" sta="0x0303" sta_typ="0x142" val="" val_typ="0x1401"
      val_fnc="[HIS.evtnew]" val_evtnew_max="2"/>
```

After writing `first`, `second`, `third`:

```xml
<item xdb_cls="cls_EVT" sta="0x0002" tim="2026-11-11T02:35:03-0700" doc="XDB" rid="XDB" atr="id" grp="" txt="third"/>
<item xdb_cls="cls_EVT" sta="0x0002" tim="2026-11-11T02:35:03-0700" doc="XDB" rid="XDB" atr="id" grp="" txt="second"/>
```

### HIS.alm

**In:** any `<atr>_fnc`. Does nothing and lets the chain go on; it is kept for old files.
Alarm records come from `ALM.*` and the root's `alm_adr`.

### HIS.ref

**In:** a mirror list's `ref_fnc`. Any write to `@ref` asks for a load at the connection's next
second, as [`HIS.refresh`](#hisrefresh) does.

### HIS.rec

`HIS.rec(evt, kind, what)` → the record's uid, or `0`

Makes an event or audit record and sends it to the document's `evt_adr`.

| Argument | Meaning |
|---|---|
| `evt` | the event the script runs with |
| `kind` | `"evt"` or `"aud"` |
| `what` | a text (it becomes `txt`) or an object whose fields go into the record. `tim`, `uid`, `src`, `knd`, `rol` are the engine's and are refused; a `sta` replaces 257 |

Refused (`0`, one `ERROR` line; inside `try` a throw with the reason): another kind, an engine
field, a third argument that is neither text nor object, no `evt`, a document with no
`evt_adr`.

```js
HIS.rec(evt, "evt", "plain text event")                  // 111264167952400
HIS.rec(evt, "aud", { txt: "set point changed", n: 5 })  // 111264167952401
HIS.rec(evt, "alm", "x")                                 // 0
// HIS.rec: kind 'alm' -- "evt" or "aud" (alarms come from ALM.*, values from HIS.val)
try { HIS.rec(evt, "evt", { uid: 5 }); } catch (e) { e.message; }  // HIS.rec: field 'uid' is the engine's
```

A record made while the sink's document is still starting waits in the journal and is
delivered once that document runs.

### HIS.put

`HIS.put(evt, sink, fields)` → the record's uid, or `0`

A history row written by a script outside any hook: a record of kind `row` sent to `sink`
(`"doc('X')/id('Y')"`, `/@new` optional). The sink runs no hook for it and `his_rec` does not
apply. `fields` must be an object; `uid`, `src`, `knd`, `rol` are refused.

```js
HIS.put(evt, "doc('XDB')/id('ROW_H')", { txt: "a row of my own", n: 7 })   // 111264167952402
```

The row holds `knd` = `row`, `doc`, `rid`, `tim` and the fields given.

### HIS.row

`HIS.row(evt, fields | null)` → `1`

Only inside a sink's `new_elm_new_eval` hook: the record's row takes these fields over its own
(`null`: this record writes no row). Elsewhere it is refused: `0`, and inside `try` a throw
`HIS.row: only inside a <his> sink's new_elm_new_eval hook`.

```js
function hook(evt)                       // new_elm_new_eval="return (main.hook(evt));"
{
    var r = JSON.parse(evt.valn);        // the record
    HIS.row(evt, { txt: "hooked: " + r.txt });
    return 1;                            // keep the item
}
```

The row's `txt` became `hooked: plain text event`.

### HIS.uid

`HIS.uid(evt)` → the record's uid

Inside a sink's hook: the id of the record it runs for, which is its row's key. Outside a hook:
`0`, one `ERROR` line, a throw inside `try`.

### HIS.pending

`HIS.pending(uid)` → `1` waiting, `0` not

`1` while that record's row waits in a sink's spool, taken but not yet written. An `UPDATE` of
your own of that row waits for `0`. `HIS.pending(0)` is `0`.

```js
var u = HIS.rec(evt, "evt", "from the timer");
HIS.pending(u)          // 1
// a second later
HIS.pending(u)          // 0: the row is in the table
```

### HIS.valstat

`HIS.valstat()` → object

The counters of `HIS.val` in this process: `points` (points seen), `pending` (records waiting
for their period's end), `now` (written at once), `end` (written at a period's end), `dbd`
(held back by `his_dbd`), `lost` (pending records lost at a stop), `refused` (not written).

```js
JSON.stringify(HIS.valstat())
// {"points":2,"pending":0,"now":4,"end":3,"dbd":0,"lost":0,"refused":0}
```

### HIS.key

`HIS.key(evt, list)` → a new key, or `0`

A key for a new row of a mirror list, by its `his_keygen`: `max` = the table's largest key + 1,
`uid` = a 53-bit id. **Every call uses a key up**: two calls answer 4 and 5. `list` is
`"id('X')"` or `"doc('D')/id('X')"`. Refused (`0`, a throw in `try`) before the first load has
read the largest key, with no `his_keygen`, or when `list` is no mirror here.

```js
function new_wo(evt)                     // the list's new_elm_new_eval
{
    var o = JSON.parse(evt.valn);
    var k = HIS.key(evt, "id('ORDERS')");
    if (!k) return 0;
    evt.obj.xdb_cls = "cls_WO";          // the column types, as a loaded row has
    evt.obj.id = "WO" + k;               // what his_rid makes of the key
    evt.obj.wo_id = k;
    evt.obj.title = o.title;
    evt.obj.prio = o.prio;
    evt.obj.status = 0;
    evt.obj.opened = Time.now();
    return 1;
}
// evt.SetValue("id('ORDERS')/@new", JSON.stringify({ title: "new one", prio: 4 }))
// makes <item id="WO5" .. wo_id="5" title="new one" prio="4" opened=".."/>, written within a second
```

The element's id must be the one `his_rid` makes, or the next load makes a second element for
the same row.

### HIS.dirty

`HIS.dirty(evt, list [, id])` → integer

Without `id`: how many rows wait to be written. With an element id: `1` if that row waits,
else `0`. A change made a moment ago may not be counted yet; `HIS.flush` waits for it.

### HIS.flush

`HIS.flush(evt, list [, ms])` → `1` written, `0` not in time

Waits until every change made before the call is in the table, at most `ms` (3000).
Refused on a connection's own thread (it would hold every device of it). Measured: `1` after
191 ms for one changed row and one new one.

```js
evt.SetValue("id('WO1')/@prio", 5);
HIS.flush(evt, "id('ORDERS')")       // 1: the table says prio = 5
```

### HIS.del

`HIS.del(evt, list, id)` → `1`

Deletes that row from the table (or marks it, with `his_del="col=val"`), even under
`his_del="keep"`. The row must be in the list, and stays there until the next load; taken out
of the list later, it is not written back. An id not in the list is refused:
`HIS.del: row 'WO99' is not in ORDERS`.

### HIS.refresh

`HIS.refresh(evt, list)` → `1`

Asks for a load of the table at the connection's next second, merged as always. A row someone
else inserted appears: `HIS(ORDERS): table wo loaded again -- 4 row(s), 1 new, ..`. On SQLite
every load reads the table; on PostgreSQL and SQL Server a periodic `his_ref` load is skipped
when the table's signature has not moved.

### HIS.stat

`HIS.stat(evt, list)` → object

What the mirror is doing: `rows` (in the list), `dirty`, `parked` (rows the table refused
alone), `loaded` (1 after the first load), `armed`, `written`, `deleted`, `statements`,
`refused`, `loaded_rows`, `loads`, `unchanged` (reloads a signature spared), `last_ok_s`
(seconds since the last good write, −1 never), `err` (the last failure, `""`). With `his_rec`
also `records_taken`, `records_answered`, `records_no_row`, `records_waiting`.

```js
JSON.stringify(HIS.stat(evt, "id('ORDERS')"))
// {"rows":3,"dirty":0,"parked":0,"loaded":1,"armed":1,"written":2,"deleted":1,"statements":2,
//  "refused":0,"loaded_rows":2,"loads":1,"unchanged":0,"last_ok_s":0,"err":""}
try { HIS.stat(evt, "id('NOPE')"); } catch (e) { e.message; }
// HIS.stat: XDB/NOPE is no SQL mirror (<his his_wri="row">) here
```

Before the table exists, `err` says so (`no such table: wo`) and the load is tried again every
10 s.

### HIS.sqltest

`HIS.sqltest()` → text

A diagnostic: every statement the mirror and the sink write, for every dialect, as
`name|dialect|rows per statement|bind order|text` lines. No database is touched. Useful to see
the SQL a dialect profile produces.

---

## File: plain files

Reads and writes a file through a handle. Path macros (`%PRJ%`, `%DB%`, `%BIN%`, `%ROOT%`) are
expanded and `/` works on Windows. For directories and ZIP files see `FILE` on
[page 08](08_Engine_Modules.md).

**Who may.** `File.open`, `File.remove` and `File.rename` check the calling script's role
against the document's `xdb_file_role` (3, Operator, if absent; the engine's own timers and
chains run as 9). `xdb_file_dirs` on a document (`;`-separated, macros allowed, inherited)
confines every script, the engine's included, to those directories; a path with a `..` part
is refused even when it would land inside. A refusal is undefined plus one `ERROR` line, and a
throw inside `try`. With `xdb_file_dirs="%PRJ%/ok"` on the root `<xdb>`:

```js
File.open("%PRJ%/db/AyXDB.xml", "r")        // undefined
try { File.open("%PRJ%/ok/../ok/in.txt", "r"); } catch (e) { e.message; }
// File.open: refused -- 'C:\..\ok\..\ok\in.txt' is outside xdb_file_dirs of document 'XDB'
```

The start-up log says what applies: `File.* needs role >= 3 (xdb_file_role), reaches .. (xdb_file_dirs)`.
See [Access and safety](../06_Access_and_Safety.md).

**Two traps.** Writes are buffered: a process killed before `File.close` loses them. And a
handle is not checked: a forgotten one stays open until the engine stops, and a closed one must
not be passed again.

### File.open

`File.open(path [, mode])` → a handle, or undefined

| Argument | Meaning |
|---|---|
| `path` | up to 255 bytes after the macros |
| `mode` | `"r"` read (default), `"w"` write (made or emptied), `"a"` append; add `"b"` for binary (`"rb"`, `"wb"`) and `"+"` to read and write (`"r+"`) |

Returns a handle (it prints as `<PVOID>`). A file that cannot be opened answers undefined with
no line, so test it:

```js
var f = File.open("%PRJ%/ok/in.txt", "r");
if (!f) return 0;
File.open("%PRJ%/ok/none.txt", "r")      // undefined
```

On Windows a text-mode file (no `"b"`) turns `\r\n` into `\n` and ends at a Ctrl-Z byte
(`0x1A`). Use `"rb"` / `"wb"` for bytes.

### File.close

`File.close(f)` → `1`

Closes the file and writes what was buffered. `File.close(undefined)` is `0`.

### File.gets

`File.gets(f [, max])` → text

Reads one line, **with its `\n`**, at most `max` − 2 characters (`max` is 2048 if absent).
At the end of the file it answers `""`; an empty line is `"\n"`, so `""` means the end.

```js
// in.txt: "line one\nline two is longer\n"
File.gets(f)         // "line one\n"
File.gets(f, 5)      // "lin"
File.gets(f)         // "e two is longer\n"
File.gets(f)         // "": the end
```

### File.puts

`File.puts(f, v)` → `0` written, −1 failed

Writes `v` as text (a number is written as its digits), with no line end added.

```js
File.puts(f, "héllo\n");   // 0
File.puts(f, 42);          // 0: writes "42"
```

### File.read

`File.read(f, n)` → a byte buffer

Reads up to `n` bytes; fewer at the end of the file. `buf.length` is the number read, and
`buf[i]` is a byte, 0..255. **Indexing goes past a zero byte, text does not**: `"" + buf`
stops at the first zero.

```js
// bin.dat holds 41 00 42 FF 80 7F
var f = File.open("%PRJ%/ok/bin.dat", "rb");
var b = File.read(f, 100);
File.close(f);
b.length              // 6
b[2]                  // 66
b[3]                  // 255
"" + b                // "A": the text stops at the zero byte
CODEC.HEX_enc(b)      // "410042ff807f"
```

Asking for more than the file holds is fine: `File.read(f, 1000000).length` is 28 for a
28-byte file.

`exc.buf_send.append(File.read(f, n))` hands the bytes to a connection as they are.

### File.write

`File.write(f, v)` → bytes written

Writes the bytes of a buffer, or the UTF-8 bytes of a text: `File.write(f, "héllo")` writes 6.

```js
File.write(w, b);                          // 6
File.write(w, CODEC.HEX_dec("00FF10"));    // 3
```

### File.seek

`File.seek(f, pos [, from])` → `0` done

`from` is 0 = from the start (default), 1 = from the current position, 2 = from the end.

```js
File.seek(f, 5, 0);     // 0: the next gets reads "one\n"
File.seek(f, -3, 2);    // 0
File.tell(f)            // 25 in a 28-byte file
```

### File.size

`File.size(f)` → bytes

The file's size; the position does not move.

### File.tell

`File.tell(f)` → the position, in bytes from the start

### File.remove

`File.remove(path)` → `0` removed, −1 not

```js
File.remove("%PRJ%/ok/w2.dat")   // 0
File.remove("%PRJ%/ok/w2.dat")   // -1: gone already
```

### File.rename

`File.rename(from, to)` → `0` done, −1 not

Both paths pass the gate. A file that is not there answers −1.

---

## LIC: the licence

What the licence allows, as the engine sees it. [Licensing](../04_Licensing.md) explains the
editions.

### LIC.list

`LIC.list()` → array of objects, or undefined

One row per licence and loaded module: AyMON itself, each plug-in licence, each engine module
(`UNDECLARED` when it said nothing) and each licence file nobody opened (`NOTOPENED`). Fields,
left out when empty: `product`, `module`, `load`, `state`, `source`, `edition`, `lic_id`,
`vendor`, `customer`, `expires`, `bind`, `key`, `akya`, `reason`, and on the AyMON row `used`
and `refused`. **Engineer and above**; below that it answers undefined.

```js
JSON.stringify(LIC.list()[0])
// {"product":"AyMON","module":"AyPRO","state":"PRJ","source":"core","edition":"EDU",
//  "lic_id":"AKYA-2026-000002","customer":"AyMON education use","akya":true,
//  "reason":"issued for project 'PRJEDU', this one is '..'",
//  "used":"doc 1/5 con 0/8 dev 0/8 cli 0/4 cam 0/2 sbdev 0/4",
//  "refused":"doc 0 con 0 dev 0 cli 0 cam 0 sbdev 0"}
```

### LIC.hostid

`LIC.hostid()` → array of four texts

The four machine ids a licence is issued against — the same the start-up log prints in its
`host ids` line.

```js
JSON.stringify(LIC.hostid())
// ["c6f32f74f5ca1714b8fc73d1aea5ebde","96e33e1801d6741dd2e1df6c42303b24",
//  "4f6fae9ec0ea222ecced087ddddbe49b","ad53ee5ca74187af3a02c2b0e585e866"]
```

---

## CLT: the election

The script and chain side of `PRO.clt`, which elects the master of a cluster. The protocol
and its `pro_clt_*` fields are on [page 09](09_Connection_and_Protocol_Types.md); the ideas in
[Two engines](../10_Two_Engines.md#the-election). Measured with one node, `S01`, and its peer
`S02` not running:

```xml
<tcon id="cls_CLU" sta_typ="0x1142" sta_fnc="[PRO.sta]"
      con_tmo="5" con_rct="2" con_clr="1" con_keeptmo="30.0" con_idletmo="0" con_acl="127.0.0.1"
      pro_ver="3.1.1" pro_tmo="5" pro_try="1" pro_typ="0xC412" pro_fnc="[]" pro_subqos="0"/>

<con id="CN_S01" xdb_cls="cls_CLU" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" sta="0x0303" con_host="" con_port="" pro=""
     pro_clt_link="#CN_EXT" pro_clt_path="/clt" pro_clt_host="127.0.0.1" pro_clt_port="47710"
     pro_clt_id="APP" pro_clt_pri="1" pro_clt_hb="2" pro_clt_expiry="2" pro_clt_elec="2" pro_clt_init="3"
     pro_clt_cmd="" pro_clt_cmd_typ="0x1401" pro_clt_cmd_fnc="[CLT.cmd]"
     pro_clt_role="" pro_clt_role_typ="0x1401" pro_clt_role_fnc="[main.on_role]"/>
<con id="CN_S02" xdb_cls="cls_CLU" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" sta="0x0303" con_host="" con_port="" pro=""
     pro_clt_link="#CN_EXT" pro_clt_path="/clt" pro_clt_host="127.0.0.1" pro_clt_port="47711"
     pro_clt_id="APP" pro_clt_pri="2" pro_clt_hb="2" pro_clt_expiry="2" pro_clt_elec="2" pro_clt_init="3"
     pro_clt_cmd="" pro_clt_cmd_typ="0x1401" pro_clt_cmd_fnc="[CLT.cmd]"/>
```

The class is in the document's `<config>`, `CN_EXT` is the node's `PRO.http` listener on
127.0.0.1:47710, the root says `tid="S01"`, and `APP/S00` is loaded with `sta="0x3200"`
([PRJEDU_cluster](../../examples/cluster/PRJEDU_cluster/) is the full two-node version).

### CLT.cfg

**In:** a `<con>`'s `xdb_fnc`, **before** `CON.*`: `[CLT.cfg,CON.ws,PRO.clt]`. **Reads:** the
root's `tid`, `pro_nid` (else what follows the last `_` of the id), `pro_clt_link`,
`pro_clt_path`, `pro_clt_host`, `pro_clt_port`. **Changes:** `con_mod`, `pro_role`, `con_ses`,
`con_host`, `con_port`, `con_ws_path`, `pro_cid`, `pro_nid`.

Works out whether the row is this node's own end (its `pro_nid` equals `tid`) or a peer's, and
writes the connection fields for it. Without `pro_clt_link` / `pro_clt_host` the address
fields are left as written. With no `tid` on the root it is an `ERROR` and the row does not
come up. Measured on `S01`:

| Row | `con_mod` | `pro_role` | `con_ses` | `con_host` | `con_port` | `con_ws_path` | `pro_cid` |
|---|---|---|---|---|---|---|---|
| `CN_S01` (own) | `SERVER` | `SLAVE` | 16 | `#CN_EXT` | `/clt` | | `CL_S01` |
| `CN_S02` (peer) | `CLIENT` | `MASTER` | 0 | `127.0.0.1` | `47711` | `/clt` | `CL_S01` |

Log: `CN_S01:CLT.cfg: topology self=S01 peer=S01 mod=SERVER cid=CL_S01`. After `CON.*` the
fields are already read: written after it, `CLT.cfg` comes too late.

### CLT.cmd

**In:** a cluster row's `pro_clt_cmd_fnc`. **Reads:** the text written to `pro_clt_cmd`.
**Changes:** queues a hand-over for this node.

| Command | On this node |
|---|---|
| `standdown` | if master: gives it up, its documents go spare, and it does not stand for 2 × `pro_clt_elec` s |
| `takeover` | if not master: opens an election the live master yields to, whatever `pro_clt_preempt` says |

The command is applied at the cluster's next tick, within about a second; one that does not
apply says why (`'takeover' IGNORED -- this node is ALREADY master`). Anything else is an
`ERROR` line (`CLT.cmd: unknown command 'bogus' -- 'standdown' or 'takeover'`). Write it on any
cluster row of the node that should act; it is an attribute write, so the row's `xdb_acl`
decides who may. The attribute keeps showing the last command written; writing the same
command again applies it again.

```js
evt.SetValue("id('CN_S01')/@pro_clt_cmd", "takeover");
// CN_S01:CLT.cmd: 'takeover' queued (applied within 1 s)
```

### CLT.info

`CLT.info([evt | doc [, group]])` → object, or undefined

The cluster's state as this node sees it. Read only.

| Argument | Meaning |
|---|---|
| `evt` | the state kept by the event's document; if that has none and there is exactly one in the engine, that one |
| `doc` | a document name, exact: `CLT.info("SYS/S00")` |
| `group` | with `doc`: a document group's `pro_clt_id` |
| none | the only state in the engine |

**The state belongs to the document that holds the `PRO.clt` rows**, not to the cluster's
documents: here `CLT.info("SYS/S00")` answers and `CLT.info("APP/S00")` is undefined. Undefined
also when nothing is found or the call is ambiguous (several states and no name); with `evt`
it writes `CLT.info: cluster context not found (document 'XDB') -- has this document a PRO.clt?`.

| Field | Meaning |
|---|---|
| `doc` `group` `docs` | the document, the state's key, the group's document list (`""` = none) |
| `nid` `app` `self_con` | this node's `tid`, the `pro_clt_id`, this node's own row |
| `role` | `MASTER`, `SPARE` or `ELECTION` |
| `pri` `term` `tick` | this node's priority, the election term, the cluster's tick count (one a second) |
| `mas_nid` `mas_pri` | the master as known |
| `mas_conf` | `1` the master was heard as master, `0` only a candidate. **Check it before showing "master"** |
| `preempt` `quorum` `heard` | `pro_clt_preempt`, `pro_clt_quorum`, nodes heard (itself included) |
| `peers` | `[{nid, alive, age}]`: `age` = seconds since heard, −1 never |

```js
JSON.stringify(CLT.info(evt))
// at start: {"doc":"SYS/S00","group":"SYS/S00","docs":"","nid":"S01","app":"APP","self_con":"CN_S01",
//            "role":"SPARE","pri":1,"term":0,"tick":0,"mas_nid":"","mas_pri":0,"mas_conf":0,
//            "preempt":0,"quorum":0,"heard":1,"peers":[{"nid":"S02","alive":0,"age":-1}]}
// tick 7:   {..,"role":"ELECTION","term":1,"tick":7,"mas_nid":"","mas_conf":0,..}
// tick 9:   {..,"role":"MASTER","term":1,"tick":9,"mas_nid":"S01","mas_pri":1,"mas_conf":1,..}
```

The same state is on the own row: `@pro_clt_role`, `@pro_clt_master`, `@pro_clt_term`. A
`pro_clt_role_fnc` (with `pro_clt_role_typ="0x1401"`) runs when the role changes, with
`evt.valp` the old role and `evt.valn` the new: here `""` → `ELECTION`, then `ELECTION` →
`MASTER`, while `APP/S00` went from `0x3202` to `0x1303`. `pro_clt_master_fnc` runs when the
master changes.

---

## REP: replication

The script and chain side of `PRO.rep`. The protocol is on
[page 09](09_Connection_and_Protocol_Types.md), the ideas in
[Two engines](../10_Two_Engines.md#replication).

### REP.cfg

**In:** a `<con>`'s `xdb_fnc`, **before** `CON.*`: `[REP.cfg,CON.ws,PRO.rep]`. **Reads:** the
root's `tid`, `pro_nid` (else what follows the last `_` of the id), `pro_rep_link`,
`pro_rep_path` (`/rep` if absent), `pro_rep_host`, `pro_rep_port`, `pro_rep_dial`,
`pro_rep_axis`. **Changes:** `con_mod`, `pro_role`, `con_ses`, `con_host`, `con_port`,
`con_ws_path`, `pro_cid`.

The same work as `CLT.cfg` for a replication row. Measured on `S01`:

| Row | `con_mod` | `pro_role` | `con_ses` | `con_host` | `con_port` | `con_ws_path` | `pro_cid` |
|---|---|---|---|---|---|---|---|
| `CN_R01 pro_nid="S01"` (own) | `SERVER` | `SLAVE` | 8 | `#CN_EXT` | `/rep` | | `RP_S01` |
| `CN_R02 pro_nid="S02"` (peer) | `CLIENT` | `MASTER` | 0 | `127.0.0.1` | `47711` | `/rep` | `RP_S01` |

**Write `pro_nid` on replication rows.** Without it `CN_R01` is read as node `R01`, a peer:
the row became a client dialling this node's own port. A peer row needs `pro_rep_host` and
`pro_rep_port`, else it is an `ERROR`. `pro_rep_dial="out"` with `pro_rep_axis="vert"` swaps
the protocol roles (the listening end subscribes), for a source that must dial out of its
network.

### REP.test

`REP.test()` → text

Runs the replication codec's self-tests; no communication. A failure is logged as `ALERT` too.

```js
REP.test()     // "15 tests, 0 failed -- all passed"
```

---

## RPC: remote calls

`PRO.rpc` lets a script read and write a document on another node with the same addresses
([Two engines](../10_Two_Engines.md#a-document-on-another-node)); its fields are on
[page 09](09_Connection_and_Protocol_Types.md).

### RPC.test

`RPC.test()` → text

Runs the self-tests of the call table that matches answers to calls (late answers, repeated
answers, a full table). No communication.

```js
RPC.test()     // "75 tests, 0 failed -- all passed"
```

---

## OPC: OPC UA tools

Tools for `PRO.opc`, the OPC UA client ([page 09](09_Connection_and_Protocol_Types.md)).
`OPC.test` and `OPC.cert` need no server; `browse`, `gen` and `call` need a `<dev>` of a
running `PRO.opc` connection. None of them throws: a failure comes back as text (a JSON
`{"error":..}` for `browse` and `call`). [PRJEDU_opcua](../../examples/protocols/PRJEDU_opcua/)
uses `cert`, `browse`, `gen` and `call`.

### OPC.test

`OPC.test()` → text

The encoder, decoder, crypto, subscription and browse self-tests. A failure is logged as
`ALERT`.

```js
OPC.test()     // "OPC: 339 passed / 0 failed; .. arrays: 17 passed / 0 failed"
```

### OPC.cert

`OPC.cert(cert, key [, app_uri, app_name, host])` → text

Makes a self-signed client certificate (RSA-2048, 10 years) and its key. Paths take macros;
missing directories are made. `app_uri` (`urn:AyMON:AyXDB`) must be the `<con>`'s
`pro_app_uri`; `app_name` is `AyMON`, `host` this computer's name. Mark the certificate
trusted on the server.

```js
OPC.cert("%PRJ%/log/pki/own/client.der", "%PRJ%/log/pki/own/client.key")
// "OPC.cert: generated. cert='..\client.der' key='..\client.key' uri='urn:AyMON:AyXDB' host='..'.
//  Mark it TRUSTED on the server (it lands in 'rejected' at the first connection)."
```

Make it once (the example does it in `xdb_init` when the file is missing): a new certificate
must be trusted again.

### OPC.browse

`OPC.browse(dev_id [, nodeid])` → JSON text

The children of a node (`i=85`, the Objects folder, if absent), as the text of an array:
`[{"id":"ns=3;i=1001","name":"Counter","cls":"Variable"}, ..]`. `JSON.parse` it. This is
where the NodeIds for `pro_adr` come from.

```js
OPC.browse("NODEV")     // {"error":"dev not found or not PRO.opc"}
var b = "" + OPC.browse("IMM", NSU + "IMM1");          // NSU: "nsu=<namespace URI>;s=", as PRJEDU_opcua
if (b.indexOf("[") == 0) n = JSON.parse(b).length;    // else not connected yet: try later
```

### OPC.gen

`OPC.gen(dev_id, file [, nodeid [, evt_thr [, "nsu" | "ns"]]])` → text

Walks the address space from `nodeid` and writes a draft `<bi>` / `<io>` block to `file`, typed
by reading each variable once. Give `evt_thr`: every `<bi>` of one `<dev>` must be on one
thread. `"nsu"` (default) writes addresses with the namespace URI, `"ns"` with today's index.
Answers a summary (`OPC.gen: N <bi>, M <io> generated .. -> file`), also written to the log.

```js
OPC.gen("NODEV", "%PRJ%/log/gen.xml")    // "OPC.gen: dev not found or not PRO.opc"
```

### OPC.call

`OPC.call(dev_id, object_nodeid, method_nodeid [, arg ..])` → JSON text

Calls a method on the server. `object_nodeid` is the object the method belongs to, not the
method. An argument's type comes from the script value: text → String, a float → Double, an
integer → Int32; when the server refuses one, the answer says which.

```js
OPC.call("NODEV", "i=85", "i=1")    // {"error":"dev not found or not PRO.opc"}
// on a server: {"ok":true,"out":[{"i":0,"typ":"Double","val":7}]}
```

---

## PY: calling Python

A `<script language="Python">` runs on the engine's one Python thread; how to write one is in
[Scripting](../03_Scripting.md#calling-python). Every call into it is queued: the caller gets
`1` (queued) or `0`, never the function's result. Python writes results into points. Measured
with Python 3.11 found on the search path, and this script:

```xml
<script id="py" xdb_fnc="[SCR.prs]" src="%DB%/p.py" language="Python" thr_per="20" thr_tmo="5"></script>
<var id="WAVE" sta="0x0303" sta_typ="0x142" val="" val_typ="0x1401" val_fnc="[py.on_evt]"/>
```

```python
from XDB import *

xdb = None
xdb_evt = []

def init(xdb_in):
    global xdb
    xdb = xdb_in

@xdb_fnc
def on_evt(evt):
    xdb.SetValue("id('PYOUT')/@val", "on_evt valn=" + str(evt.valn) + " atr=" + str(evt.atr))

@xdb_fnc
def add(a, b):
    xdb.SetValue("id('PYOUT2')/@val", "add=" + str(a + b) + " types=" + type(a).__name__ + "," + type(b).__name__)
```

A function marked `@xdb_fnc` with one parameter called `evt` is an event call, and
`[py.on_evt]` in a chain calls it. **The written value is stored after Python returns**: right
after `SetValue` of `WAVE`, `@val` still read `""`; a second later, `"block1"`.

### PY.CallEvt

`PY.CallEvt(scope, fnc, evt)` → `1` queued

Calls the event function `fnc` of the Python script whose `id` is `scope`, with this event.
Called inside a chain, it holds the write back as `[py.on_evt]` does: `evt.valn` becomes the
old value at once and the engine stores the new one after Python returns.

```js
function trig(evt)                      // val_fnc="[main.trig]" of TRIG
{
    PY.CallEvt("py", "on_evt", evt);    // 1
    // evt.valn is "" here; TRIG/@val becomes "t1" once on_evt has run
    return 0;
}
```

PYOUT then read `on_evt valn=t1 atr=val`. A function that does not exist is still queued (`1`)
and fails on the Python thread: `scr.Python(py.nofunc): PY.Call function not found`.

### PY.CallArg

`PY.CallArg(scope, fnc, arg ..)` → `1` queued, undefined refused

Calls `fnc` with the arguments, as `py.fnc(arg ..)` does. Numbers and text travel; an `evt`
or another engine object is refused (undefined and
`PY.CallArg(py.add): an object/evt argument cannot travel through the queue`). A function
that does not exist is queued all the same and fails on the Python thread
(`PY.CallArg function not found`).

```js
PY.CallArg("py", "add", 2, 3)     // 1
py.add(1.5, 2)                    // 1: the same call
// PYOUT2: "add=3.5 types=float,int"
PY.CallArg("py", "add", evt, 3)   // undefined
```

### #PyScript

`evt.QueValue("#PyScript", code)` → `1`

Queues Python source to run on the Python thread: as an expression (its result is logged at
`NOTICE`) or, when it is not one, as statements. It runs in the globals of the Python script
whose `id` is the event's element id, else of the first Python script loaded, so `xdb` is
there. The other `QueValue` arguments (priority, delay, thread) work as for `#JScript`
([page 03](03_Events_Documents_and_Addresses.md)). It runs any code, and MCP cannot reach it.

```js
evt.QueValue("#PyScript", "xdb.SetValue(\"id('PYOUT3')/@val\", str(6*7))");   // 1
// PYOUT3: "42"
```
