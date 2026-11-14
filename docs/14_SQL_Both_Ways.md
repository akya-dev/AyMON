# SQL both ways: the tree and a database in one query

The engine's documents can be asked with SQL — **XDB SQL**, an element name being a table, an element a row, an
attribute a column ([SQL on the tree](11_Records_and_Saving.md#sql-on-the-tree)). A real database — PostgreSQL, SQL
Server, SQLite, MySQL or MariaDB — has its own SQL. From 4.4.3 each can take a table of the other into one query:

* **XDB SQL reads a database table:** `sql('CN', 'SELECT ..') AS h` for an engineer, `sqlq('NAME', values) AS h` — a
  query the engineer wrote — for everybody else.
* **A database's SQL reads a table of the tree:** `xdb('SELECT .. FROM "LINE/*".io') AS x`. The engine runs the XDB SQL
  first and hands the database the rows as an inline table.

Run [PRJEDU_xdbsql](../examples/data/PRJEDU_xdbsql/) first: two production lines' points in the tree, their history in
SQLite, a page that sends XDB SQL as a Guest, and two PostgreSQL ports any client can open. Everything below is in its
`db/db_SQL.xml`.

---

## The picture

```
  XDB SQL  ── sql('CN', 'SELECT ..') ─────────►  the database        the database runs the statement,
           ── sqlq('NAME', values) ───────────►                      XDB SQL joins it with the tree

  the database's SQL ── xdb('SELECT .. FROM io') ──►  the tree      XDB SQL runs first,
  (SQL.qry, or the text inside sql())                               the database joins
```

The side that holds the big table does the work. A history table of millions of rows and a few hundred points:
`xdb()`, and the database uses its own index. A database statement that already narrows to a few thousand rows, or a
large part of the tree: `sql()` / `sqlq()`, and XDB SQL joins. **A page of a large history with names from a large
tree: neither — `/*xdb: */` (below) names only the page's rows.**

## A database table in XDB SQL: `sql()`

```sql
SELECT * FROM sql('CN_HIS', 'SELECT count(*) AS n FROM his') h
```

`sql('CN', 'statement' [, value, ..]) AS h` sends the statement to the SQL connection `CN` **as written**, in that
database's own dialect, and reads its rows as a table `h`. It may stand wherever a table stands: a `JOIN` with the tree,
`IN (SELECT h.x FROM sql(..) h)`, a value sub-query. It runs **once**, before any row of the tree is walked.

* **The alias is required**; the columns are read as `h.name`, with the names the database gives (case ignored when
  there is no exact match). Give every computed column an alias: `COUNT(*) AS n`.
* **Values are bound** to the statement's `?`: `sql('CN', 'SELECT .. WHERE tim > ?', $1)`. A value may be a constant,
  a parameter of the outer statement or `now()`, but not a column of the row: that would be one database round trip per
  row, and it is refused.
* **Read only.** `UPDATE sql(..)` and `INSERT INTO sql(..)` are refused; write a database with `SQL.qry`.
* **One node.** With a document of another engine in the same statement it is refused.

### Who may

Raw SQL reaches the database as it is, so three things must agree, and all three are **off** until you set them:

| Where | What |
|---|---|
| the SQL `<con>` | `pro_sql_xql="1"`: it serves XDB SQL. `pro_sql_xql_role` is the lowest role (default 6, Engineer) |
| the way in | an XDB SQL connection lists it, `con_host="xdb:doc=LINE/*,SQL/S00;sql=CN_HIS"`; a PostgreSQL port lists it, `pro_pg_sql="CN_HIS"`. The MCP tool and the telnet shell list none |
| the statement | one statement that reads: it starts with `SELECT`, `WITH` or `VALUES`, a `;` only at its end |

The last check stops an accident, **not an attacker**: a `SELECT` can call a function that writes. The real protection
is the database account. Give a connection with `pro_sql_xql` a **read-only login of its own**.

## A query the engineer wrote: `<sqlq>` and `sqlq()`

A page or an operator should not send database SQL at all. A **named query** keeps the SQL in the XML; the caller names
it and gives the values, which are bound to its `?`, never pasted into the text:

```xml
<sqlq id="HIS_LAST" xdb_acl="0xFFFFFFF1" sqlq_con="CN_HIS" sqlq_prm="2" sqlq_max="100"
      desc="the last readings of a point: rid, how many"
      sqlq_sql="SELECT tim, rid, val FROM his WHERE rid = ? ORDER BY tim DESC LIMIT ?"/>
```

```sql
SELECT * FROM sqlq('HIS_LAST', 'L1_PT1', 5) h

SELECT i.id, i.desc, i.val, s.n AS readings, s.lo, s.top, s.mean
  FROM "LINE/*".io i
  JOIN sqlq('HIS_STATS', 10) s ON s.rid = i.id
 ORDER BY i.id
```

| Attribute | |
|---|---|
| `sqlq_con` | the SQL `<con>`: looked for in the `<sqlq>`'s document, then in the root. It still needs `pro_sql_xql="1"`, and the way in must list it |
| `sqlq_sql` | the statement, in the database's dialect, `?` for the values |
| `sqlq_sql_mssql`, `sqlq_sql_pgsql`, `sqlq_sql_sqlite`, `sqlq_sql_mysql` | a text for one dialect; the connection's dialect picks it, else `sqlq_sql`. One `<sqlq>` then runs on a SQL Server site and a PostgreSQL site alike |
| `sqlq_prm` | how many values it takes; another number is refused |
| `sqlq_max` | rows at most |
| `xdb_acl` | **who may run it** — any role whose read right it gives; the role floor `pro_sql_xql_role` is not asked |

`sqlq('ID')` looks in the documents the connection reads, then in the root; `"SQL/S00".sqlq('ID')` in that document only.
In the example both named queries let everybody run them: the page's Guest joins the tree with the history, while the
same Guest's raw `sql('CN_HIS', ..)` is refused with `role 0 may not read it (pro_sql_xql_role 6)`.

A value used twice needs two `?`, or a CTE that names it once:
`WITH p AS (SELECT CAST(? AS varchar(40)) AS rid) SELECT h.tim, h.val FROM his h, p WHERE (p.rid IS NULL OR h.rid = p.rid)`.

### Keys that are numbers

A database often keys a row by a number where the tree's id is text made from it — a work order `4294967298` is the
element `WO0100000002`. Two functions turn one into the other:

| Call | Gives |
|---|---|
| `idfmt('WO{:010X}', 4294967298)` | `'WO0100000002'` |
| `idnum('WO{:010X}', 'WO0100000002')` | `4294967298` |

The placeholder is the template of [Names from the tree in a query](11_Records_and_Saving.md#names-from-the-tree-in-a-query)
without a column name: `>>n`, `&mask`, `/n`, `%n`, then `:d` / `:x` / `:X` with an optional `0` and width (`idnum`
takes a format only). A value that does not fit gives NULL. In a join the call is the lookup key:
`JOIN sql('CN', 'SELECT wo_wid, qty FROM wo') w ON idfmt('WO{:010X}', w.wo_wid) = o.id`.

## A table of the tree in the database's SQL: `xdb()`

```sql
SELECT x.line, x.name, x.unit, COUNT(*) AS n, ROUND(AVG(h.val), 2) AS mean, ROUND(MAX(h.val), 2) AS top
  FROM his h
  JOIN xdb('SELECT _doc AS line, id, desc AS name, val_unt AS unit FROM "LINE/*".io') AS x ON x.id = h.rid
 WHERE h.tim >= datetime('now', 'localtime', '-10 minutes')
 GROUP BY x.line, x.name, x.unit
 ORDER BY x.line, x.name
```

This is SQLite's own SQL, run by `SQL.qry` on the history connection (the example's `Q_X`, every 5 s). The table `his`
has no names and no units; the result has both. The engine:

1. finds `xdb('..')` where a table stands (outside quotes and comments; the alias is required),
2. runs the XDB SQL inside it with the role of the query — a point a role may not read is no row,
3. writes the result into the text as an inline table in the connection's dialect, and sends the text.

| Database | What it receives |
|---|---|
| PostgreSQL | one JSON text read by `json_array_elements(..)`, each column cast to its type |
| SQLite | one JSON text read by `json_each(..)` |
| MySQL, MariaDB | `JSON_TABLE(..)` with a type per column |
| SQL Server | `(VALUES (..), (..)) AS x(..)` |

The forms were chosen by measurement: PostgreSQL reads one JSON text about four times faster than a long `VALUES`, and
SQLite refuses a `VALUES` of a thousand rows. Values go in as text, never as SQL: a point named `x'); DROP TABLE his; --`
arrives as that name. Column types come from the cells — integer, float, decimal, time, date, boolean, else text.

* **Where it works:** `SQL.qry` on a database connection, and the text inside `sql()` / `sqlq()` (one level: the XDB SQL
  in it cannot use `sql()` again). `SQL.exec_direct` and `SQL.prepare` send their text as it is. On an XDB SQL
  connection `xdb('address')` is XDB SQL's own function that reads one value.
* **At most 10 000 rows** (`qry_xtab_max` on the query element or its class) and 16 MiB of text; more refuses the query,
  it never cuts. The inline table goes through the database's parser: thousands of rows are fine, hundreds of
  thousands are not — read the database from XDB SQL instead.
* **Names in the outer query** follow the database's rules: on PostgreSQL a reserved word is `x."desc"`. Lower-case
  aliases inside (`desc AS name`) save the quotes.
* **It opens no new right — and that is the point to watch.** Whoever writes the text decides what SQL the database
  runs. A page must never be able to write the `@qry` of a list whose connection is a database. In the example the page
  writes XDB SQL to an XDB SQL list; the database SQL with `xdb()` in it is the script's.

## Names into a result: `/*xdb: */` — the first choice for a history list

A `SQL.qry` text can hold two comments the database never sees — `/*xdb: name = doc('{doc}')/id('{rid}')/@desc */`
fills a column of every row from the tree, `/*xdb-in: address/@id */` becomes the list of an `IN (..)`
([Names from the tree in a query](11_Records_and_Saving.md#names-from-the-tree-in-a-query),
[PRJEDU_sqlxdb](../examples/data/PRJEDU_sqlxdb/)). They are not replaced by `sql()` and `xdb()`: for **a paged history
list whose rows need the point's name** — the database sorts and pages, the tree names — they are the fastest way and
the one to use.

* `/*xdb: */` reads only the rows of the page, each by the element's id: about 2 µs a value on a document of 110 000
  points, a 1000-row page about 2.5 ms more than the bare query. A name search goes into the database as
  `rid IN (..)` (`/*xdb-in: */`), so the database still uses its index and pages.
* The same list in XDB SQL — `sqlq(..) h LEFT JOIN "CMR/*".io i ON i.id = h.rid` — reads every point of those documents
  for every page (a joined table is read whole; only `id = 'X'` uses the index): about 30–45 ms per 100 000 points,
  refused over the connection's `max=`. With `xdb()` the whole tree side would become part of the statement (over
  10 000 rows refused).
* Use XDB SQL when the question starts from the tree (points over their limit, with their last hour from the
  history), when it groups or totals by the tree's attributes, and for a PostgreSQL client — pgAdmin, Power BI,
  Grafana — that cannot write the comments.

| You want | Use |
|---|---|
| each row of a (paged) history query to show its point's name or unit; the result keeps its shape | `/*xdb: */` — the fastest |
| the database to filter by a set of points the tree selects | `/*xdb-in: */` — also inside `sql()` |
| the database to join, group or sort by columns of the tree | `xdb()` |
| a page, an operator or a BI tool to join a database table with the tree | `sqlq()` |
| an engineer's one-off question across both | `sql()` |
| a small table read all the time | a mirror list ([A list that is a table](11_Records_and_Saving.md#a-list-that-is-a-table)): no database trip at all |

The database never sees a `/*xdb: */` value, so it cannot filter or sort by it; an `xdb()` column it can.

## Connecting with psql and pgAdmin 4

A `PRO.pgwire` port speaks PostgreSQL's own protocol, so its clients connect as to a PostgreSQL server. The database
name is a document (or `postgres` for every document the port lets the session read); without `con_auth` the user name
is anything and there is no password — the port's `con_role` is the role. In the example:

```
psql "host=127.0.0.1 port=15432 user=eng dbname=SQL/S00"
psql "host=127.0.0.1 port=15433 user=mon dbname=postgres"
```

`\dt` lists the tables of the database (document) you connected to, `\dn` the documents; any statement of this page
runs at the prompt (`\x` for wide rows). On Windows run `chcp 65001` first, or psql sends a statement in the ANSI code
page and a `ı` or `ş` in it is refused (SQLSTATE 22021).

pgAdmin 4: *Object > Register > Server*:

| Tab | Field | Value |
|---|---|---|
| General | Name | anything, `AyMON 15432` |
| Connection | Host name/address | `127.0.0.1` |
| | Port | `15432` (Engineer) or `15433` (Monitor, read only) |
| | Maintenance database | `postgres` |
| | Username | anything, `postgres` |
| | Password | empty (*Save password* off) |
| Parameters | SSL mode | `prefer` (the example has no certificate) |

*Databases* then holds one database, *Schemas* the documents, *Tables* the element names, *Columns* the attributes;
right-click a table > *View/Edit Data* reads it (read only: no primary key), the *Query Tool* takes any statement of
this page. *Catalogs* lists `pg_catalog` and `information_schema`. Not working: the database's *SQL* tab. The
dashboards' graphs stay at 0.

On a PostgreSQL port the engine follows PostgreSQL's rules: an alias written without quotes comes back in lower case
(`AS Total` gives `total`, `AS "Total"` keeps it), `SELECT *` gives a table's columns as the catalog lists them, and
every integer column is plain digits (`sta` `0x0300` is `768`).

Secrets stay in the engine: an attribute whose name says it is a password, a key or a token (`pro_pwd`, `pro_pass`,
`pro_priv_key`, `api_token` ..) reads NULL and is not in the catalog, and a password inside a text (a connection string's
`PWD=x;`) reads `***`. A `WHERE` or a join cannot test such a value. `qty_okey` or `his_keygen` are plain data and stay.
The MCP tool `xdb_sql` hides by the rule of the other MCP tools: any name holding `pwd`, `pass`, `key`, `secret` or
`token`.

With `con_auth` the login is a real one and its password goes over TLS only: give the port `con_ssl_cert` (STARTTLS) or
make it `CON.tls`, and set SSL mode `require` in pgAdmin / `sslmode=require` for psql.

## Limits and time

| Limit | Default | Over it |
|---|---|---|
| rows of an XDB SQL statement (`max=` of the connection, `pro_pg_max` of a port) | 100 000 | refused |
| rows of one `sql()` (`pro_sql_xql_max` on the SQL `<con>`) | 50 000 | refused |
| rows of a named query (`sqlq_max`) | none | refused |
| rows of an `xdb()` (`qry_xtab_max`) | 10 000 | refused |
| values in a `/*xdb-in: */` list (`qry_xin_max`) | 1000 | refused |

None of them cuts: a result over a limit is an error, never its first rows.

* The database call gets what the XDB SQL statement has left of its time limit (`tmo=` of the connection, `pro_pg_tmo`
  of a port); reading the rows looks at the clock as well. A long SQLite query is stopped too.
* **Cancel:** psql's Ctrl-C, or a tool's stop button, on a PostgreSQL port stops the database call running under that
  statement — about a second on PostgreSQL, SQL Server and SQLite, and the connection stays usable. Deploy the SQL driver
  DLLs that came with the engine.
* `sql()` reads its rows into memory: 100 000 rows of 3 columns took 40–160 ms, of 8 columns 100–470 ms. An `xdb()` of
  50 000 rows took the database 8 ms (SQLite) to 48 ms (PostgreSQL) to read.
* A statement runs on the caller's thread: give a PostgreSQL port `thr_wrk`, and put a heavy `SQL.qry` on a worker
  (`evt_thr`).

## Reading the log

With `xdb_log="5"` or more on the document:

| Line | Meaning |
|---|---|
| `XDB SQL: sql('CN_HIS') read 1 rows x 1 columns in 0 ms (role 6)` | a raw `sql()` ran |
| `XDB SQL: sqlq('HIS_LAST') over CN_HIS read 5 rows x 3 columns in 1 ms (role 0)` | a named query ran |
| `XDB SQL: xdb() gave 7 rows x 4 columns, written as json_each (.. bytes) in 0 ms` | an `xdb()` became an inline table |
| `XDB SQL: <reason> (role N)` | a `sql()` / `sqlq()` was refused |

And at the default level:

| Line | Meaning |
|---|---|
| `SQL.qry: 'Q.qry' failed -- XDB SQL: sql('CN_HIS'): role 0 may not read it (pro_sql_xql_role 6)` | the query was refused; `qry_err` says the same |

The reasons you will meet first:

| Reason | What to do |
|---|---|
| `sql('CN') is not open here -- ..` | list `CN` in `sql=` of the XDB SQL connection, or in `pro_pg_sql` of the port |
| `sql('CN'): this connection does not serve XDB SQL (..)` | `pro_sql_xql="1"` on the SQL `<con>` — with a read-only login |
| `sql('CN'): role 3 may not read it (pro_sql_xql_role 6)` | raw SQL is an engineer's: write a `<sqlq>` |
| `sqlq('ID'): role 0 may not run it (its xdb_acl)` | the `<sqlq>`'s `xdb_acl` does not let that role read it |
| `sqlq('ID') takes 2 parameter(s), 1 given` | `sqlq_prm` |
| `sql() reads: its statement starts with SELECT, WITH or VALUES, not 'DELETE'` | `sql()` only reads |
| `sql('CN') gave more than 50000 rows -- narrow it in the statement (..)` | a `WHERE` in the database statement |
| `xdb() needs an alias: xdb('..') AS x` | add one |
| `xdb(): the connection's SQL dialect is unknown -- ..` | set `con_dia` on the `<con>` |

A PostgreSQL client gets the same text, with SQLSTATE 42501 when a gate refused and 57014 for a time limit or a cancel.

## What it does not do

* **Write through `sql()`.** A database is written with `SQL.qry`, a mirror list or the record pipeline.
* **Ask the database per row.** `sql()` runs once; a value that reads the row is refused.
* **Join across engines.** One statement runs on one node; `sql()` names a connection of this engine.
* **Know your database account.** The engine cannot tell whether a login can write: give a `pro_sql_xql` connection a
  read-only one.
* **Expand `xdb()` in `SQL.exec_direct` or `SQL.prepare`.** Only `SQL.qry` and the text inside `sql()`.

The field notes `XDB_SQL.md` and `XDB_SQL_Databases.md` (in the engine's documents) list every refusal and the exact
forms each database receives.
