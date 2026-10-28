# PRJEDU_sqlite — history in a database, with nothing to install

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8106/** — the history's page: the reading
written a second ago, what the database says every ten seconds, the last five
rows, and a box that counts the rows of any tag you type — with the tag
**bound**, so typing `x'; DROP TABLE reading; --` finds the rows that carry
that text and the table stays.

Stop it with CTRL-C and start it again. The readings are still there — that
is the whole point.

A plant that only shows the current value forgets everything. This example
keeps its readings in a database: one timer writes, another asks the
database what it has, and a third query comes back as **elements you can
address**, not rows you have to loop over.

The database is SQLite, embedded in the engine through a plug-in. **Nothing
to install**: no server, no ODBC data source, no driver, no password, no
port. The whole database is one file, `log\plant.db`.

## What it teaches

* **the connection is a file** — `con_host="%PRJ%\log\plant.db"` with the
  path macros expanded, and the driver plug-in named once in `AyXDB.xml`
* **two ways to run SQL, and when each is right**
  * `SQL.exec_direct` for a fixed statement with nothing variable in it
  * `SQL.prepare` / `SQL.parameter` / `SQL.execute` the moment a **value**
    goes into the statement — and the example proves why by storing a tag
    called `x'; DROP TABLE reading; --` every tenth reading. The table is
    still there. A bound value is data; it never becomes SQL.
* **`SQL.qry`: a query that becomes elements.** Writing SQL into a `<list>`
  element's `@qry` is the entire call. Each row becomes an `<item>`, each
  **column becomes an attribute named after the column**, and from then on
  the rows are read by address:

  ```
  id('L_RECENT')/item[1]/@val
  ```

  That is how a web front end, a script or a replication peer gets a table
  out of AyMON without anyone writing a loop.
* **what an SQL NULL is in script** — see the traps below
* that plain SQL is not a licensed feature: this runs unlicensed

## The shape of every SQL call

```js
var con = SQL.attach('CN_SQL');        // borrow from the <con>'s pool
var rs  = SQL.exec_direct(con, sql);   // or prepare / parameter / execute
while (SQL.fetch(rs)) { ... SQL.getdata(rs, 1) ... }
SQL.close(rs);                         // always
```

You never disconnect `con` — it belongs to the `<con>` element's pool and
goes back by itself. Closing the **result set** is what you owe.

## Three traps

| | |
|---|---|
| **`SQL.getdata(rs, n)` counts from 1** | not from 0. The first column is 1. |
| **An SQL NULL comes back as `undefined`** | not `""`, not `0`, not `"NULL"`. `(v == null)` is true and catches it; `(v == "")` is **false**, so the habit of testing for an empty string misses it silently. The example prints all three every ten seconds. |
| **Do not `SELECT` a column called `id` into a `<list>`** | `id` is the element identifier in AyMON and goes into the document's id index. Alias it: `SELECT rowid_ AS rid`. |

## The page

`HIS/S00` serves it with two more connections: `CN_WEB` (HTTP, `www\`) and
`CN_LIVE` (MQTT inside a WebSocket on the same port, `/mqtt`). The script
writes what the page shows into five `<var>`s — `NOW`, `STATS`, `RECENT`,
`FIND`, `FOUND` — and the page subscribes to `HIS/S00/+/val`. `RECENT` is
`L_RECENT`'s rows as one JSON value (`json(id('L_RECENT')/item)`): the
rows `SQL.qry` made into elements, read back by address.

The page writes one thing, `FIND`: its `val_fnc` is `main.find`, which runs
`SELECT count(*), max(ts) FROM reading WHERE tag = ?` with the typed text as
the parameter and answers in `FOUND`. `FIND` has `val_typ="0x1401"` — the
`0x1000` bit is what makes a `val_fnc` run at all; with `0x0401` the write is
stored and nothing happens. `xdb_acl="0xFFFFFFF1"` on the document gives a
page that did not log in (a Guest) read and nothing else; `FIND`'s own
`xdb_acl` adds that one write. Both connections listen on `127.0.0.1` only.


## What the log looks like

```
HIS: empty database, starting fresh
HIS: writing one reading a second into log\plant.db
HIS: 14 readings, 20.4 .. 25.45 C, mean 22.99 C
HIS: 1 rows whose TAG looks like an attack, stored as text
HIS: an SQL NULL reads back as typeof=undefined, (v == null)=true, (v == '')=false
HIS: L_RECENT now holds 5 <item> elements; newest is 25.45 C at 2026-09-20 22:21:17
```

and on the second run:

```
HIS: 28 readings already in the file, 2026-09-20 22:21:03 .. 2026-09-20 22:21:30
```

## Looking at the file yourself

`log\plant.db` is an ordinary SQLite database. Any SQLite tool opens it —
the `sqlite3` command line, a GUI browser, Python's `sqlite3` module:

```bat
sqlite3 log\plant.db "SELECT ts, tag, round(val,2) FROM reading ORDER BY rowid_ DESC LIMIT 5;"
```

Nothing about the file is AyMON-specific. That is worth knowing before you
decide where a plant's history should live.

## Pointing it at a real database

The same script runs against PostgreSQL, SQL Server or anything else with an
ODBC driver — `SQL.attach`, `exec_direct`, `prepare` and `SQL.qry` do not
change. What changes is the `<con>`:

```xml
<con id="CN_SQL" xdb_fnc="[CON.sql,PRO.sql]"
     con_host="DRIVER={PostgreSQL Unicode(x64)};Server=10.0.0.5;Port=5432;Database=plant;UID=aymon;PWD=..." />
```

`CON.sql` with a full connection string goes to whichever driver claims it,
falling back to ODBC. `CON.sqlite` with a file path is the shortcut this
example uses because it needs no set-up at all.

Two differences to expect when you move: SQLite locks the **whole file**
while writing (`con_tmo` is what a second writer waits), and it types
columns loosely where a server does not.
