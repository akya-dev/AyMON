# Data, history, mail and files

Where the values go: a database the engine writes and queries, and the mail and files it sends.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_sqlite](PRJEDU_sqlite/) | history in a database, nothing to install | nothing |
| [PRJEDU_odbc](PRJEDU_odbc/) | the same history on SQLite, SQL Server or PostgreSQL, chosen by a connection string | nothing for SQLite |
| [PRJEDU_records](PRJEDU_records/) | alarms, events and value history written by the engine, and a journal on disk that survives a kill | nothing |
| [PRJEDU_mirror](PRJEDU_mirror/) | a list that is the live window of a table: the engine loads it, writes back what changes and sees what others write | nothing |
| [PRJEDU_sqlxdb](PRJEDU_sqlxdb/) | a history table with no names in it: a query takes each row's name and unit from the tree, searches the names and turns work order keys into ids | nothing |
| [PRJEDU_xdbsql](PRJEDU_xdbsql/) | SQL on the tree: the documents queried as tables with the asker's role, a PostgreSQL port for any client, a database table joined in by a named query | nothing |
| [PRJEDU_durable](PRJEDU_durable/) | values that come back after a crash, no database: `xdb_dur`, a kill, `xdb.sync()` | nothing |
| [PRJEDU_net](PRJEDU_net/) | an alarm that sends mail, a shift report zipped and uploaded by FTP | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_sqlite
run.bat
```

On Linux: `cd PRJEDU_sqlite` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
