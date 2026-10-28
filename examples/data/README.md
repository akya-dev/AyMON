# Data, history, mail and files

Where the values go: a database the engine writes and queries, and the mail and files it sends.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_sqlite](PRJEDU_sqlite/) | history in a database, nothing to install | nothing |
| [PRJEDU_odbc](PRJEDU_odbc/) | the same history on SQLite, SQL Server or PostgreSQL, chosen by a connection string | nothing for SQLite |
| [PRJEDU_net](PRJEDU_net/) | an alarm that sends mail, a shift report zipped and uploaded by FTP | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_sqlite
run.bat
```

On Linux: `cd PRJEDU_sqlite` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
