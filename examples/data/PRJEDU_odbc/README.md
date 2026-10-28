# PRJEDU_odbc — one plant, any SQL database, chosen by a connection string

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8107/** — the history's page: the reading
written a second ago, what the database says every ten seconds, the last five
rows, and a box that counts the rows of any tag you type — with the tag
**bound**, so typing `x'; DROP TABLE reading; --` finds the rows that carry
that text and the table stays.

Out of the box this runs at once: the database is the embedded SQLite and
the file `log\plant.db` appears by itself. Stop it with CTRL-C and start it
again — the readings are still there.

This is the twin of [PRJEDU_sqlite](../PRJEDU_sqlite). The plant, the timers
and the SQL calls are the same. What is new is **where the database comes
from**: the `<con>` has an empty `con_host`, and the connection string is
picked from a short list in the root document when the history document
starts. Move the plant to SQL Server or PostgreSQL by swapping two ids — the
script does not change.

## What it teaches

* **the connection string is the whole choice** — `DRIVER=SQLite3i;...`
  reaches the embedded SQLite, anything no driver claims goes to ODBC. Both
  drivers are plug-ins (`AyPRO_sqlite.dll`, `AyPRO_odbc.dll`) that attach
  themselves on first use; neither is named anywhere in the XML
* **connection strings kept in one place** — `<var id="ConnStr">` in
  `AyXDB.xml`, read by every document that needs the database, written into
  `CN_SQL/@con_host` in `xdb_init`, before the connection exists
* **path macros are yours to expand** — `con_host` is handed to the driver
  exactly as written, so the script turns `%PRJ%` into a path with
  `xdb.normalizePath()`
* **one script, three databases** — every statement is written once, in SQL
  that SQLite, SQL Server and PostgreSQL all accept; the single exception
  (does the table exist?) is chosen by the entry's `eng`
* **a write that did not happen is not counted** — `SQL.execute(rs)` answers
  1 when the row is stored and 0 when the database refused it (the reason is
  in the log); the sequence number moves only on 1. This needs an engine of
  4.3.4.440 or later — older ones answered 0 in both cases
* the lessons of PRJEDU_sqlite still hold: bound parameters are never SQL
  (the tag `x'; DROP TABLE reading; --` is stored as text, on every
  database), `SQL.qry` turns rows into elements, an SQL NULL is `undefined`

## Choosing the database

`db\AyXDB.xml`:

```xml
<var id="ConnStr"      eng="SQLITE3" val="DRIVER=SQLite3i;Database=%PRJ%/log/plant.db;"/>
<var id="ConnStrMSSQL" eng="MSSQL"   val="DRIVER={SQL Server};SERVER=.\SQLEXPRESS;DATABASE=aymon_edu;Trusted_Connection=Yes;APP=AyMON;"/>
<var id="ConnStrPGSQL" eng="PGSQL"   val="DRIVER={PostgreSQL Unicode(x64)};SERVER=127.0.0.1;PORT=5432;DATABASE=aymon_edu;UID=postgres;PWD=change-me;"/>
```

The entry whose id is exactly **`ConnStr`** is the one in use; the others are
parked. To use SQL Server, rename `ConnStr` to `ConnStrSQLITE` and
`ConnStrMSSQL` to `ConnStr`. Then create the empty database the string names:

| Database | Create `aymon_edu` once |
|---|---|
| SQL Server (Express is enough) | `sqlcmd -S .\SQLEXPRESS -E -Q "CREATE DATABASE aymon_edu"` |
| PostgreSQL | `createdb -U postgres aymon_edu` — and put your user and password in the string |

The script creates the table itself. For PostgreSQL, use the driver name
*ODBC Data Sources (64-bit)* shows on your machine; installers name it
differently (`PostgreSQL Unicode(x64)`, `PostgreSQL ODBC Driver(UNICODE)`).

A password in a connection string is written to the log as `PWD=***`, but it
is in `AyXDB.xml` in clear text — that file is as secret as the password.
Windows authentication (`Trusted_Connection=Yes`) keeps it out altogether.

## Why the string is set in `xdb_init`

A document starts in a fixed order:

```
<script> elements are parsed      the functions exist
xdb_init                          main.init()  -> CN_SQL/@con_host
every element's xdb_fnc           CN_SQL is created and dials
xdb_start                         main.start() -> find or create the table
```

A value written into `con_host` in `xdb_init` is what `CON.sql` reads a
moment later. Written in `xdb_start`, it would come too late — the connection
would already be dialling an empty string. `main.init()` is four lines, and a
real plant repeats them in every document that shares the database; only the
root document knows where the database is.

## Writing SQL that runs everywhere

| Habit | Why it is avoided here | What the script does instead |
|---|---|---|
| `LIMIT 5` / `TOP 5` | SQLite and PostgreSQL say LIMIT, SQL Server TOP | `WHERE seq > (SELECT max(seq) - 5 FROM reading)` |
| `round(val, 2)` | PostgreSQL has no `round()` for a float | round in script, `CAST(val AS DECIMAL(6,2))` in a query |
| `AUTOINCREMENT` / `IDENTITY` / `SERIAL` | three spellings of one idea | the script owns `seq`, starting from `max(seq)` |
| a `TIMESTAMP` column | in SQL Server `TIMESTAMP` is a row version, not a time | text `YYYY-MM-DD hh:mm:ss`, which sorts correctly |
| `FLOAT` | 32-bit in some databases | `DOUBLE PRECISION` |
| `CREATE TABLE IF NOT EXISTS` | SQL Server does not have it | ask the catalogue, keyed by `eng` |

Owning `seq` in script has a price: only one writer may use the table. A
table two plants write into wants the database's own counter, and with it a
line of engine-specific SQL.

## Traps

| | |
|---|---|
| **`con_host` is not macro-expanded** | a connection string reaches the driver as written. `%PRJ%` there is five characters, and SQLite says *unable to open database file*. Expand it in script, as `main.init()` does. |
| **Turkish collation: `i` is not `I`** | on a SQL Server installed with `Turkish_CI_AS`, `information_schema.tables` is *Invalid object name*; `INFORMATION_SCHEMA.TABLES` works. PostgreSQL folds unquoted names to lower case, so the capitals work there too. Write every name in one case, everywhere. |
| **what `getdata()` returns depends on the driver** | the embedded SQLite answers `max(seq)` as text, so `last + 1` is `"11"`. Write it into a typed attribute (`cnt`) and read that back. |
| **`SQL.qry` stores a cell as the driver prints it** | SQL Server hands a float 25.45 over as `25.449999999999999`. Cast in the query if the attribute is for people. |
| **An SQL NULL comes back as `undefined`** | through every driver. `(v == null)` catches it, `(v == "")` does not. |
| **Do not `SELECT` a column called `id` into a `<list>`** | `id` is the element identifier in AyMON. Alias it. |

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

The page's header names the engine in use (`eng` of the `ConnStr` entry). The
search is ordinary SQL, the same on all three databases.


## What the log looks like

First run, embedded SQLite. The first summary comes six seconds in and then
every ten — both timers carry `evt_cfg="0x4042"`, whose `0x4000` bit fires
the first time at start + `evt_dly` instead of after a whole period (engine
4.3.4.441 or later; an older one runs the example the same way, only the
first summary comes at 16 seconds):

```
HIS: database engine SQLITE3, connection string from ConnStr
HIS: created table 'reading'
HIS: empty table, starting fresh
HIS: writing one reading a second, next seq 1
HIS: 6 readings, 20.4 .. 22.36 C, mean 21.39 C
HIS: 0 rows whose TAG looks like an attack, stored as text
HIS: an SQL NULL reads back as typeof=undefined, (v == null)=true, (v == '')=false
HIS: L_RECENT now holds 5 <item> elements; newest is #6, 22.36 C at 2026-09-22 14:12:29
HIS: 15 readings, 20.4 .. 25.74 C, mean 23.17 C
HIS: 1 rows whose TAG looks like an attack, stored as text
```

The same lines appear for SQL Server and PostgreSQL, with the engine's name
in the first one. On the second run:

```
HIS: 28 readings already stored, 2026-09-22 13:03:52 .. 2026-09-22 13:04:19
HIS: writing one reading a second, next seq 29
```

If the database cannot be reached at start, `CN_SQL` dials again every
`con_rct` seconds, and the script does not give up either: `T_READ/@rdy`
stays 0 and every tick looks for the table again until it succeeds.
