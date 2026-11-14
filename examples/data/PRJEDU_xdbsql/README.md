# PRJEDU_xdbsql — SQL on the tree

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`, or `linux-arm64` on a
Raspberry Pi; see "On Linux" in the top README).

Then open **http://127.0.0.1:8119/** and press the buttons from left to right. Or ask from any PostgreSQL client:

```
psql "host=127.0.0.1 port=15432 user=eng dbname=SQL/S00"
python pg_try.py "SELECT id, desc, val FROM \"LINE/*\".io"
```

**Needs an engine of 4.4.3 or later.** The line `XDB.xdb_init: Version:` in the log names yours.

The documents are already tables. An element name is a table, an element is a row, an attribute is a column, a
document is a schema. Two production lines are two documents; to SQL their points are one table:

```sql
SELECT _doc AS line, id, desc, round(val, 2) AS val, val_unt AS unit, hi
  FROM "LINE/*".io
 ORDER BY line, id
```

```
line     id      desc                               val     unit   hi
-------  ------  ---------------------------------  ------  -----  ---
LINE/L1  L1_LT1  Filler bowl level                  57.45   %      68
LINE/L1  L1_PT1  Filler pressure                    2.82    bar    3.5
LINE/L1  L1_ST1  Capper motor speed                 482.55  1/min  510
LINE/L2  L2_PT1  Compressed air pressure            5.88    bar    6.3
LINE/L2  L2_ST1  Conveyor speed                     20.59   1/min  27
LINE/L2  L2_TT1  Shrink tunnel temperature, inlet   187.87  °C     186
LINE/L2  L2_TT2  Shrink tunnel temperature, outlet  166.38  °C     167
(SELECT 7)
```

(`pg_try.py`'s output; the values move.)

**XDB SQL** reads them where they are, with the role of whoever asks — no copy, no export, nothing to keep in step.
The same query can take in a table of a real database, and a database's own SQL can take in a table of the tree.
Nothing to install: the history table is one file, `log\plant.db` (SQLite).

## What it teaches

* **the tree as tables.** `"LINE/*".io` is every `<io>` of both line documents; `_doc` says which document a row came
  from. A column is an attribute, also one the row inherits: `val_unt` is on no point, it comes from the point's class.
  `WHERE`, `GROUP BY`, `ORDER BY`, aggregates, joins and sub-queries work as in PostgreSQL.
* **who asks decides what is read.** The page is a Guest. The PostgreSQL port 15432 gives its sessions the role
  Engineer, 15433 the role Monitor and no writes. Every row, every column and every write is judged by the role
  (`xdb_acl`): a point hidden from a role is a row it does not get.
* **a named query.** `sqlq('HIS_LAST', 'L1_PT1', 5)` runs a statement written in the engine (`<sqlq>` in
  `db_SQL.xml`); the caller gives the name and the values, which are **bound**, never written into the SQL. The
  `<sqlq>`'s own `xdb_acl` says who may run it — here everybody, the page too.
* **the tree joined with a database.** One query, two sources: the points from the tree, the readings of the last ten
  minutes from SQLite through a named query, joined on the point's id.
* **raw database SQL is an engineer's.** `sql('CN_HIS', 'SELECT ..')` sends a text to the database as it is: only
  from the role Engineer up, only to a connection that allows it (`pro_sql_xql="1"`) and that the way in lists
  (`sql=` of CN_XQL, `pro_pg_sql` of the port). The page gets *role 0 may not read it*.
* **the other way round.** SQLite's own query with a table of the tree in it:
  `JOIN xdb('SELECT _doc AS line, id, desc AS name, val_unt AS unit FROM "LINE/*".io') AS x ON x.id = h.rid`. The engine
  runs the XDB SQL first and hands SQLite the rows as an inline table. The table `his` has no names and no units; the
  result has both.
* **writes go the point's way.** `UPDATE "LINE/L1".io SET hi = 70 WHERE id = 'L1_LT1'` writes the attribute as a
  script would, through the role check and the point's own chain. From 15432 it changes the limit; from the page it
  writes 0 rows and the log names the refused value; 15433 refuses the statement.
* **any PostgreSQL client.** psql, Python (psycopg, or `pg_try.py` here, standard library only), Excel and Power BI
  through psqlODBC (the navigator lists the tables), Grafana. The database name is a document.

## Try it

1. **Both lines**, **Over their limit**, **Per line**: the tree as one table. Run *Over their limit* again in a while:
   the values swing.
2. **Named query**: the last five readings of `L1_PT1`, from SQLite. The page never sends SQL to the database.
3. **The tree + the history**: every point with its count, lowest, highest and mean of the last ten minutes.
4. **Raw SQL (refused)**: the reason is under the text — `XDB SQL: sql('CN_HIS'): role 0 may not read it
   (pro_sql_xql_role 6)`.
5. **A write (refused)**: *0 row(s) written*; the console shows
   `LINE/L1:L1_LT1.hi: xdb_acl refused the write (role 0)`.
6. **The other way round** (the lower panel): refreshed every 5 s by the script, its SQL below the table.
7. From a terminal in this folder:

   ```
   python pg_try.py "SELECT * FROM sql('CN_HIS', 'SELECT count(*) AS n FROM his') h"
   python pg_try.py --port 15433 "SELECT * FROM sql('CN_HIS', 'SELECT count(*) AS n FROM his') h"
   python pg_try.py "UPDATE \"LINE/L1\".io SET hi = 70 WHERE id = 'L1_LT1'"
   python pg_try.py --port 15433 "UPDATE \"LINE/L1\".io SET hi = 68 WHERE id = 'L1_LT1'"
   python pg_try.py --db LINE/L1 "SELECT id, hi FROM io"
   ```

   (`python3` on Linux.) The first runs (an Engineer), the second is refused (a Monitor), the third writes the
   limit — run *Both lines* on the page and see it — the fourth is refused (15433 is read only), the fifth reads a
   table without naming its document: `--db` chose it. Write the limit back from 15432 (`SET hi = 68`).
8. With psql: `\dt` lists the tables of the database (document) you connected to, `\dn` the documents.

The limits you write are in memory: a restart brings the file's values back. The history is the record: it survives a
restart; delete `log\plant.db` to begin again.

## The pieces (`db\db_SQL.xml`)

| Element | What it is |
|---|---|
| `CN_HIS` | SQLite, `log/plant.db`: table `his (tim, doc, rid, val)`, a reading of every point every 2 s; `pro_sql_xql="1"` = XDB SQL may read it |
| `CN_XQL` | XDB SQL: `con_host="xdb:doc=LINE/*,SQL/S00;sql=CN_HIS;max=5000"` — the documents a query sees without naming one, the one database it may take in, a row limit (a query over it is refused, never cut) |
| `HIS_LAST`, `HIS_STATS` | named queries: `sqlq_con`, `sqlq_sql` with `?` for the values, `sqlq_prm` (how many), `xdb_acl` (who may run it) |
| `Q` | the page's query: the page writes XDB SQL to `@qry`; `SQL.qry` runs it on `CN_XQL` with the page's role; the rows come back as JSON in `@qry_out`, a refusal's reason in `@qry_err`, published at every run |
| `Q_X` | SQLite's query with `xdb('..')` in it, run by `main.view` every 5 s |
| `CN_PG`, `CN_PGM` | `[CON.tcp,PRO.pgwire]` on 15432 (`con_role="6"`) and 15433 (`con_role="2"`, `pro_pg_read="1"`): `pro_pg_doc` = the documents a session may read, `pro_pg_sql` = the databases its queries may take in |
| `CN_WEB`, `CN_LIVE` | the page and its MQTT-over-WebSocket link, 8119 |

## Rules the example keeps

* **The page never sends database SQL.** It sends XDB SQL, which reads the tree with the page's role and reaches the
  database only through a named query. Database SQL with `xdb()` in it is the script's (`Q_X`): a page that could
  send it could send anything.
* **A value is bound, never pasted.** In `sqlq('HIS_LAST', 'L1_PT1', 5)` the two values go to the statement's `?`s;
  a quote in a value is a quote in a value.
* **The permission to write `@qry` is on the class.** `cls_Q` declares `qry`, and the element that declares an
  attribute decides who may write it: `xdb_acl="0xFFFFFFF3"` on `cls_Q` lets a Guest write the query, `0xFFFFFFF1` on
  the line documents lets a Guest read them and nothing else.
* **The PostgreSQL ports listen on 127.0.0.1 only and ask no password**: the port gives the role. On a network,
  give them `con_auth` and TLS (a password goes over TLS only) and a `con_acl` of the clients' addresses.
* **A row limit refuses, it never cuts.** `max=5000` on CN_XQL, `qry_max="500"` on the page's query: a result over it
  is an error, not the first rows of it.

## Not shown

* PostgreSQL or SQL Server instead of SQLite: `CN_HIS` takes their connection string (see
  [PRJEDU_odbc](../PRJEDU_odbc/)); a named query may carry one text per database (`sqlq_sql_mssql`,
  `sqlq_sql_pgsql`), the connection's dialect picks.
* A login on the PostgreSQL port (`con_auth`), and TLS (`CON.tls`, or STARTTLS on `CON.tcp` with a certificate).
* Documents on another engine: a table `"X@CN".io` runs the statement there, over PRO.rpc
  ([PRJEDU_remote](../../cluster/PRJEDU_remote/) shows the link).
* `INSERT` / `DELETE` on a list (they go through the list's own `ELM.new` / `ELM.del`), the MCP tool `xdb_sql` and the
  `sql` command of the telnet shell.

The other way of joining the tree and a table — names written into a query's result while it is built — is
[PRJEDU_sqlxdb](../PRJEDU_sqlxdb/).
