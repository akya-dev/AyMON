# Course labs

Labs for a course: a simulated machine on one side, the program a student writes on the other.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_plc](PRJEDU_plc/) | a PLC program for a bottle filling line: remote I/O over Modbus, a step sequence, interlocks, an HMI | nothing |
| [PRJEDU_pid](PRJEDU_pid/) | a PID lab: a heater, its controller, step responses and a suggested tuning | nothing |
| [PRJEDU_oee](PRJEDU_oee/) | OEE of a production line, shift by shift: a machine behind seven Modbus registers, an MES, losses, a shift report in SQLite | nothing |
| [PRJEDU_robotarm](PRJEDU_robotarm/) | a robot arm in a cell: a six-axis cobot (dashboard + Modbus, as on a UR) and the cell controller around it | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_plc
run.bat
```

On Linux: `cd PRJEDU_plc` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
