# In the field: what the engine carries

The examples run against simulators, and their *Real hardware* sections say
honestly that most of those paths have not been tried with the device on a
desk. That is about the **examples**. The **engine** itself is not new: it
is the same engine that runs production systems today, and it is tested
the same way every time it changes.

## Data-centre monitoring (DCIM)

The engine is the core of several **data centre infrastructure monitoring**
(DCIM) systems, set up and run by different teams. Every UPS, PDU, cooling
unit, generator, sensor and meter of the site is a device of the engine; it
polls them, keeps their alarms, writes their history and serves the
operators' web application.

One of them, as configured today:

| | |
|---|---|
| devices | **1 837** — 1 510 over SNMP, 325 over Modbus TCP |
| points (`<io>`) | **272 042**, in 7 517 blocks |
| documents | 14 per node: the field (one document per floor), alarms, events, history, assets, work orders, the web back end |
| connections (`<con>`) | **85**: 26 SNMP, 14 SQL, Modbus TCP, HTTP / REST / SOAP, MQTT over WebSocket for the browsers, cluster and replication links, SMTP, SFTP, an MCP endpoint and a telnet maintenance shell |
| engine threads | about **330**: a thread per document, connection and thread element, and 207 workers |
| nodes | **three**, every document a master on one node and a spare on the others; failover, replication and a journal of records that survives a node going down |
| databases | PostgreSQL (TimescaleDB for the value history) over ODBC: alarms, events and value history written by the engine's own record pipeline, assets and work orders read and written by the documents |
| in front | a load balancer and web servers; the operators' Angular application talks to the engine over HTTPS and WebSocket |

One measured figure from that system's logs: a single floor document
replicates about **1 000 value changes a second** to the other nodes, all
day.

The configuration is large, and it is still the same kind of XML as in
`PRJEDU_modbus`: `<con>`, `<dev>`, `<bi>`, `<io>`, classes, `*_fnc` chains.
Nothing in it needs a different engine or a different build.

## Measured in the lab

Figures from the engine's own measurements, on a laptop (Intel Core
i7-12700H) unless it says Linux. They are what one process does, not a
limit: a system that needs more spreads its documents over threads,
processes and nodes.

| | |
|---|---|
| Modbus master, 1 000 polls a second of 100 registers each (**100 000 values a second**), each value scaled, rounded and checked against alarm limits by its function chain | about **one third of one CPU core** |
| MQTT broker on Linux, **10 000 connected clients** | idle: 2.5 % of a core, 99 % of messages within 1.6 ms |
| MQTT broker on Linux, 10 000 subscribers at 1 000 messages a second | 7 % of a core, 99 % within 0.28 ms |
| camera capture and inspection in the engine | about **600 frames a second** captured, every one inspected |
| `PRJEDU_robotarm` (robot at 20 steps a second, cell polling every 100 ms) | 16 % of one core, 31 MB |

## How it is tested

Every change to the engine goes through the same checks before a release:

- **More than 100 regression rigs.** Each is a small project of its own —
  an XML configuration, scripts, often a fake device or server written in
  Python — with a test script that starts the engine, drives it, and checks
  what it did, value by value and log line by log line. A rig is written
  for every fault found in the field and for every new feature, and kept:
  record pipeline, cluster failover, Modbus, SNMP, OPC UA, SQL pools, MQTT,
  TLS, cameras, licences, health alarms, scripts, time and decimal values
  and many more. Many run on Linux as well as on Windows.
- **The examples in this repository** are run too, on Windows, Linux x64
  and Linux arm64 (Raspberry Pi), when the engine changes under them —
  the Python examples, for instance, under both Python versions on all
  three.
- **Unit tests** of the core library (types, the XML engine, XPath,
  values): 1 282 checks, on Windows and Linux.
- **Linux CI** builds everything with gcc and clang, and once more with
  `char` unsigned, as ARM sees it, on every push.

A fault found in the field is first reproduced in a rig, then fixed, and
the rig stays in the set — the reason a later change cannot quietly bring it
back.
