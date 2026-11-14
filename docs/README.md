# The guides

Short guides, written for someone who has just run the examples. They are
not the product reference — they are the *why* behind what you have already
seen working.

| | Read it when |
|---|---|
| [01_The_Element_Tree.md](01_The_Element_Tree.md) | You want to talk to a real device. `<con>` / `<dev>` / `<bi>` / `<io>`, addresses, `sta`, how a value gets from the wire into the tree. |
| [02_Timers_and_Events.md](02_Timers_and_Events.md) | You want something to happen on its own. Threads, `evt_*`, why a write runs a chain of functions. |
| [03_Scripting.md](03_Scripting.md) | You want to write the logic. Where script lives, how XML calls it, the eight places the language is **not** JavaScript, decimals and times, and web pages written in script (`.ayp`). |
| [04_Licensing.md](04_Licensing.md) | You want to know what is free, what is not, and why the replication example runs anyway. |
| [05_Connections_and_Protocols.md](05_Connections_and_Protocols.md) | You want to reach something outside the engine. Transports and protocols, who dials and who asks, one port for several services, polled against subscribed, mail, file transfer and cameras, and what to do about a protocol AyMON does not speak. |
| [06_Access_and_Safety.md](06_Access_and_Safety.md) | You are about to let something in. The three gates — `con_acl`, the login, `xdb_acl` — TLS, what the examples deliberately leave open, and the fields that close the rest before a plant faces a network. |
| [07_Real_Hardware.md](07_Real_Hardware.md) | You want to put a real device where an example has a simulated one. What each simulation stands for, what to get, roughly what it costs, and where the example's README tells how to connect it. |
| [08_In_the_Field.md](08_In_the_Field.md) | You want to know whether it holds up. A production DCIM system's size, the engine's measured throughput, and the regression rigs every change goes through. |
| [09_Pins_and_Buses.md](09_Pins_and_Buses.md) | You want a board's own pins. GPIO, interrupts, counters, encoders, PWM, servos, HC-SR04, DHT, key matrices, I²C and SPI chips in XML or in script — and what has not been tried with real parts. |
| [10_Two_Engines.md](10_Two_Engines.md) | You want a second engine. Replication, the election, what a failover changes and what it leaves, a majority, a master per document group, a field node, a document on another node. |
| [11_Records_and_Saving.md](11_Records_and_Saving.md) | You want something kept. Alarm, event and value history written by the engine, a journal that survives a node going down, a list that is a table, a history query that takes each point's name from the tree, and saving a document without losing its comments. |
| [12_Keeping_It_Running.md](12_Keeping_It_Running.md) | You are running it for real. Health in `sta`, why a device is in alarm, reading the `stats` line, the log, and getting in while it runs. |
| [13_Durable_Documents.md](13_Durable_Documents.md) | You want a value to survive a restart without a database. `xdb_dur`, what a crash and a power cut cost, waiting for the disk, an SD card's wear, the newest copy in a cluster. |
| [14_SQL_Both_Ways.md](14_SQL_Both_Ways.md) | You want the tree and a database in one query. A database table in XDB SQL (`sql()`, named queries `<sqlq>`), a table of the tree in the database's own SQL (`xdb()`), who may do which, the limits, and which bridge to choose. |
| [reference/](reference/README.md) | You need the exact call. Every built-in scope, object and function, every chain function and every connection type and protocol — arguments, results, measured examples — and how to ask the engine itself with `help`. |

## Suggested order

Run the example, then read the guide. Not the other way round — every guide
assumes you have seen the thing work.

```
PRJEDU_101      →  02_Timers_and_Events   →  03_Scripting
PRJEDU_modbus   →  01_The_Element_Tree    →  05_Connections_and_Protocols
PRJEDU_sqlite   →  03_Scripting  (the SQL section)
PRJEDU_odbc     →  03_Scripting
PRJEDU_records  →  11_Records_and_Saving
PRJEDU_mirror   →  11_Records_and_Saving  (A list that is a table)
PRJEDU_sqlxdb   →  11_Records_and_Saving  (Names from the tree in a query)
PRJEDU_xdbsql   →  11_Records_and_Saving  (SQL on the tree)
PRJEDU_durable  →  13_Durable_Documents  →  11_Records_and_Saving
PRJEDU_mqtt     →  05_Connections_and_Protocols
PRJEDU_snmp     →  05_Connections_and_Protocols
PRJEDU_net      →  05_Connections_and_Protocols  →  04_Licensing
PRJEDU_opcua    →  05_Connections_and_Protocols  →  06_Access_and_Safety
PRJEDU_web      →  05_Connections_and_Protocols  →  06_Access_and_Safety
PRJEDU_pages    →  03_Scripting          →  06_Access_and_Safety
PRJEDU_telnet   →  06_Access_and_Safety
PRJEDU_hardening → 06_Access_and_Safety
PRJEDU_mcp      →  06_Access_and_Safety   →  04_Licensing
PRJEDU_rep      →  10_Two_Engines         →  04_Licensing
PRJEDU_cluster  →  10_Two_Engines         →  04_Licensing
PRJEDU_remote   →  10_Two_Engines         →  06_Access_and_Safety
PRJEDU_gauge    →  03_Scripting
PRJEDU_pycall   →  03_Scripting
PRJEDU_vision   →  03_Scripting          →  05_Connections_and_Protocols
PRJEDU_pid      →  02_Timers_and_Events  →  03_Scripting
PRJEDU_plc      →  01_The_Element_Tree   →  05_Connections_and_Protocols
PRJEDU_oee      →  03_Scripting          →  05_Connections_and_Protocols
PRJEDU_robotarm →  05_Connections_and_Protocols  →  03_Scripting
PRJEDU_robot_mcp → 06_Access_and_Safety  →  04_Licensing
PRJPER_tello    →  05_Connections_and_Protocols  →  06_Access_and_Safety
PRJPER_adsb     →  01_The_Element_Tree   →  05_Connections_and_Protocols
PRJPER_phone    →  01_The_Element_Tree   →  06_Access_and_Safety
PRJHW_fan       →  09_Pins_and_Buses     →  03_Scripting
PRJHW_lock      →  09_Pins_and_Buses     →  06_Access_and_Safety
PRJHW_reverse   →  09_Pins_and_Buses
```

`PRJEDU_101` is the one to run first. It has no hardware, no database and no
second engine: a thread, a timer, a value, a calculated value and an alarm —
which is most of AyMON in forty lines of XML.

If you are here because of one particular job, start at the example that does
it: a device to poll (`PRJEDU_modbus`, `PRJEDU_snmp`), a machine with an OPC
UA server (`PRJEDU_opcua`), values to publish or
subscribe (`PRJEDU_mqtt`), a page to put them on (`PRJEDU_web`), history to
keep (`PRJEDU_sqlite`, `PRJEDU_odbc`), history the engine writes and a journal that survives a crash (`PRJEDU_records`), a list kept as the window of a table (`PRJEDU_mirror`), the documents asked with SQL, from a page or any PostgreSQL client (`PRJEDU_xdbsql`), values that come back after a restart without a database (`PRJEDU_durable`), a second engine to feed (`PRJEDU_rep`),
a second engine to take over (`PRJEDU_cluster`), a document to read and write on another node (`PRJEDU_remote`),
a way in while it runs (`PRJEDU_telnet`), a plant's access to harden (`PRJEDU_hardening`), an AI assistant to let in
(`PRJEDU_mcp`), Python and image processing next to the engine
(`PRJEDU_gauge`), Python called from the XML and from script (`PRJEDU_pycall`), a camera to inspect a line with
(`PRJEDU_vision`), mail to send and files to upload (`PRJEDU_net`), a control loop to tune (`PRJEDU_pid`), a machine to
program (`PRJEDU_plc`), a line's OEE to account for (`PRJEDU_oee`), a robot arm to run in a cell (`PRJEDU_robotarm`) and
an AI assistant to let run it (`PRJEDU_robot_mcp`),
a drone to fly (`PRJPER_tello`), the aircraft overhead to track
(`PRJPER_adsb`), a phone's sensors to watch (`PRJPER_phone`), a Raspberry Pi's own
pins to use (`PRJHW_fan`, `PRJHW_lock`, `PRJHW_reverse`).

## One page of vocabulary

Everything in AyMON is an **element** with **attributes**, arranged in a tree
that looks like XML because it is:

```xml
<var id="LEVEL" val="72.4" val_typ="0x1308" sta="0x0303" val_unt="%"/>
```

* **`id`** addresses it. `id('LEVEL')` finds it anywhere in the document
  without walking the tree.
* **`val`** is a value; so is `sta`, so is `evt`, so is `pro`. There is nothing
  special about `val` — an attribute is an attribute.
* **`val_typ`** says what kind of value it is. Types are real: `0x0308` is a
  double, `0x0104` an unsigned 32-bit integer, `0x0401` a string. A value keeps
  its type when it is written to a database, published over MQTT or replicated
  to another engine.
* **`sta`** is the element's state — one 16-bit word that carries "is it
  running", "is it in alarm" and "what has the operator asked for".
* **`val_fnc`** is a chain of functions that runs **when `val` is written**.
  That is the whole event model: a write runs a chain, and the chain may write
  again.
* **`pro`** is the same idea on the wire side: what the device said, before
  anyone decided what it means. `pro_fnc="[VAL.put]"` is what carries it
  across.

A **document** is a file of elements with a name like `HIS/S00`. One engine
runs several documents; they can address each other
(`doc('PRC/P01')/id('LEVEL')/@val`) and a document is also the unit that gets
replicated, logged and licensed.

## Where the full reference is

These guides are deliberately small. **[The reference](reference/README.md)**
is the other half: every built-in scope, object and function of the script
language, every function you put in an XML chain, and every connection type
and protocol with the fields it reads — each with its arguments, what it
gives back and a measured example. It also says how to ask the running engine
itself (`help` in the console or a telnet shell).

The longer field notes — SNMP, OPC UA, MQTT, cluster and replication, the
record pipeline, saving documents, access control, authentication, security
hardening, the plug-in SDK, the Python module, telnet, RPC, raw protocols,
load metrics, mail (SMTP), file transfer (FTP, SFTP), camera capture, GPIO and
I²C / SPI, installation as a service — come with the licensed product.
