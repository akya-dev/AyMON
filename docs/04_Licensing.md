# 4 — What is free, and what is not

Every example in this repository runs **with no licence at all**. This guide
explains why, and where the line is.

---

## The FREE tier

An engine with no licence file is not crippled. It is a small plant:

| | FREE |
|---|---|
| Documents (root included) | 5 |
| `<con>` elements | 8 |
| Devices | 8 |
| Logged-in users | 4 |
| Protocols | Modbus, MQTT, HTTP / REST / SOAP, SNMP, OPC UA, RFID, bridge, SQL, telnet — **and every plug-in**: SQLite, ODBC, S7, HID, Python. A board's own pins (GPIO, I²C, SPI, `AyLIB_hw`) are not a licence feature at all; a chip is a device like any other |
| Counted, never refused by address | cameras (`vision`): 2 with a real source — `link:` views and the `IMG.*` functions are free; smart-building devices (`sb`: ATEIS, AyBUS, VISCA, BLE RTU): 4; mail and file transfer (`net`): 20 operations a day, in memory, so a restart starts the count again |
| Not included | cluster, replication, RPC, MCP — but see below |

FREE is also the edition for personal use; there is no separate personal
licence.

Every example stays inside those numbers — measured on all of them by asking
the running engine (`LIC.list()`): the most any one uses is 4 documents
(`PRJEDU_robot_mcp`), 7 connections (`PRJEDU_robot_mcp`) and 3 devices
(`PRJEDU_opcua`). Connections go faster than you might think: a live page costs
two (the web listener and the MQTT mounted on it), and an example that brings
its own simulated machine runs that machine's connections in the same engine.
`PRJEDU_web` uses six because it serves the same three services twice, once
plain and once over TLS.

What the four numbers actually count is worth one line each:

* **documents** as they are loaded, root first — which is what keeps the other
  three meaningful; otherwise one plant could be split into many small ones.
* **`<con>` elements** as they are created, in document order. The same
  configuration therefore loses the same connections on every start; it is
  never a race.
* **devices** — every `<dev>` the engine polls or writes, however it is
  connected: eight units behind one gateway are eight devices. A device is
  counted at its first poll, so on an engine above the limit *which* devices
  get the slots can differ between starts.
* **logged-in users**, not connections: distinct user names. One browser opens
  half a dozen HTTP connections for one page, and one person with two tabs, a
  phone and the telnet shell is still one user. A page nobody logged in to is
  not counted.

## An unlicensed feature is a *local* feature

This is the rule that makes `PRJEDU_rep` possible.

Cluster, replication, RPC and MCP are not in FREE — but they are not simply
switched off. **They work on a local connection and are refused on a remote
one.** Local means a loopback address (`127.*`, `localhost`, `::1`) *and*
every non-IP transport: serial, BLE, HID, SQL, a plug-in transport.

So you can run two engines on one machine and try replication, a cluster
fail-over, RPC or MCP end to end, with no licence, for as long as you like
(`PRJEDU_rep`, `PRJEDU_cluster`, `PRJEDU_remote`).
The same configuration is not a free plant: the moment the peer is on another
machine the connection is refused, and the log says exactly that.

A document on another node (`<doc rpc_con>`) takes no document slot on the engine that
asks: the engine that has it counts it.

```
CN_REP:PRO.rep(0).register_pro: NOT STARTED -- 'rep' is refused on a REMOTE
    connection: an unlicensed feature works on LOCAL connections only
```

**What is sold is the second machine.** That is the honest summary of the
whole licensing model, and it is why the examples can teach the commercial
features without pretending.

## The licence in this repository

`bin/lic/AyMON.lic` is an **EDU** licence: FREE's numbers (5 documents, 8
connections, 8 devices) and **32 logged-in users** — a classroom that shares
one engine. Delete it and every example still runs.

It is bound to the directory names `PRJEDU_*` and `PRJDEV_*` (the `PRJPER_*` and `PRJHW_*`
examples run on FREE), so
dropping it into a real project's `db\lic\` does nothing useful: the engine
reports it and falls back. That binding is guidance, not security — a
directory can be renamed — and it exists so that a published file cannot
quietly look like a production licence somewhere it does not belong.

## Where a licence goes

The engine looks in this order and the log says which one it used:

| | Where | When |
|---|---|---|
| 1 | `AyXDB.exe -lic:<dir or file>` | **one process, one licence.** Several projects on one machine, each under its own licence. **What the examples use** |
| 2 | The `AYMON_LIC` environment variable, a full path | tests; anything started from the same session inherits it |
| 3 | `<project>\db\lic\AyMON.lic` | **the normal place** — the licence is backed up with the project |
| 4 | `<directory of AyXDB.exe>\lic\AyMON.lic` | a fallback for one binary directory shared by several projects |

`-lic:` takes a directory (the file in it is `AyMON.lic`) or, if the value
ends in `.lic`, the file itself. **A relative path is relative to the
executable, not to the current directory** — so `-lic:..\lic` with the engine
in `bin\win-x64` means `bin\lic`, wherever you start it from. The `run.bat` of every
`PRJEDU_*` example passes it as an absolute path, because you may point it at an
engine of your own; the `PRJPER_*` and `PRJHW_*` ones pass none and run on FREE.

```bat
AyXDB.exe -console C:\plants\north\db\AyXDB.xml -lic:C:\licences\north
AyXDB.exe -console C:\plants\south\db\AyXDB.xml -lic:C:\licences\south
```

**An explicit source is final.** If `-lic:` or `AYMON_LIC` names a file that
is not there, the engine runs FREE and the log names the path it tried — it
does not quietly fall back to another licence behind a typo:

```
XDB:LIC: no licence file (C:\licences\nroth\AyMON.lic) (-lic parameter) -- FREE edition: ...
```

The file is plain text and signed. Do not edit it: any change breaks the
signature and the engine falls back to FREE with a `REJECTED` line.

The account running the engine needs **write** access to that `lic\`
directory — the engine keeps a small state file beside the licence.

## Reading the start-up log

One line is the truth for the whole run, with what it leaves open right after it.
On FREE:

```
XDB:LIC: enforced for this run: edition FREE, con 8 / dev 8 / cli 4, features off: cluster,rep,rpc,mcp,net,vision,sb
XDB:LIC: documents allowed: 5
XDB:LIC: cluster,rep,rpc,mcp are not licensed: they work on LOCAL connections (loopback, non-IP) and are refused on remote ones
XDB:LIC: net is not licensed: mail and file transfer (PRO.smtp / ftp / sftp) work at any address and are COUNTED, 20 operations a day
XDB:LIC: vision is not licensed: 2 camera(s) (CON.cam with a real source; link: and none: are free)
XDB:LIC: sb is not licensed: 4 device(s) of PRO.ateis / aybus / visca / blertu
```

Everything above those lines explains how the engine got there; everything it
refuses later follows from them. The licence file's own key for devices is still
called `max_ses`; a licence with `vision` may limit cameras with `max_cam`. On a
running engine the same thing is one command away in the maintenance shell:

```
XDB> ver
```

and in script `LIC.list()` shows each count, used and refused.

## The decision is made at start

A licence that expires while the engine is running changes nothing until the
next start, and nothing tightens at run time. A plant does not stop because of
a date.

The practical consequence for you: **a new licence file means a restart.**

## When something does not start

| What you see | What it usually is |
|---|---|
| `NOT STARTED -- 'rep' is refused on a REMOTE connection` | The locality rule — the peer is not on this machine |
| `LIC: camera CN_C3 (usb:2) NOT STARTED -- licence feature 'vision' is not in edition FREE: 2 camera(s) allowed` | One unit too many. A `link:` view takes none; `con_rct` tries again |
| A `<con>` late in the document never appears | `max_con` reached; connections are taken in document order |
| A device never polls, others do | the device limit reached (`max_ses`, shown as `dev`); devices are first come, first served |
| `REJECTED` | The file was edited, so its signature no longer holds. FREE applies |
| `-- licence still holds, N tolerance day(s) left` | The machine differs from the one it was issued for: 30 days' tolerance, then `tolerance used up` and FREE |
| `the licence is for another project` | A licence bound to other directories: this is the `PRJEDU_*` file in a real project |
| Everything runs but `LIC:` says FREE | No file was found — the line names the path it tried and, for `-lic:` or `AYMON_LIC`, which one |
