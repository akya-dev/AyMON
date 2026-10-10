# The guides

Six short guides, written for someone who has just run the examples. They are
not the product reference — they are the *why* behind what you have already
seen working.

| | Read it when |
|---|---|
| [01_The_Element_Tree.md](01_The_Element_Tree.md) | You want to talk to a real device. `<con>` / `<dev>` / `<bi>` / `<io>`, addresses, `sta`, how a value gets from the wire into the tree. |
| [02_Timers_and_Events.md](02_Timers_and_Events.md) | You want something to happen on its own. Threads, `evt_*`, why a write runs a chain of functions. |
| [03_Scripting.md](03_Scripting.md) | You want to write the logic. Where script lives, how XML calls it, the six places the language is **not** JavaScript, and web pages written in script (`.ayp`). |
| [04_Licensing.md](04_Licensing.md) | You want to know what is free, what is not, and why the replication example runs anyway. |
| [05_Connections_and_Protocols.md](05_Connections_and_Protocols.md) | You want to reach something outside the engine. Transports and protocols, who dials and who asks, one port for several services, polled against subscribed, and what to do about a protocol AyMON does not speak. |
| [06_Access_and_Safety.md](06_Access_and_Safety.md) | You are about to let something in. The three gates — `con_acl`, the login, `xdb_acl` — TLS, and what the examples deliberately leave open. |

## Suggested order

Run the example, then read the guide. Not the other way round — every guide
assumes you have seen the thing work.

```
PRJEDU_101      →  02_Timers_and_Events   →  03_Scripting
PRJEDU_modbus   →  01_The_Element_Tree    →  05_Connections_and_Protocols
PRJEDU_sqlite   →  03_Scripting  (the SQL section)
PRJEDU_odbc     →  03_Scripting
PRJEDU_mqtt     →  05_Connections_and_Protocols
PRJEDU_snmp     →  05_Connections_and_Protocols
PRJEDU_net      →  05_Connections_and_Protocols  →  04_Licensing
PRJEDU_opcua    →  05_Connections_and_Protocols  →  06_Access_and_Safety
PRJEDU_web      →  05_Connections_and_Protocols  →  06_Access_and_Safety
PRJEDU_pages    →  03_Scripting          →  06_Access_and_Safety
PRJEDU_telnet   →  06_Access_and_Safety
PRJEDU_hardening → 06_Access_and_Safety
PRJEDU_mcp      →  06_Access_and_Safety   →  04_Licensing
PRJEDU_rep      →  04_Licensing
PRJEDU_cluster  →  04_Licensing          →  03_Scripting
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
```

`PRJEDU_101` is the one to run first. It has no hardware, no database and no
second engine: a thread, a timer, a value, a calculated value and an alarm —
which is most of AyMON in forty lines of XML.

If you are here because of one particular job, start at the example that does
it: a device to poll (`PRJEDU_modbus`, `PRJEDU_snmp`), a machine with an OPC
UA server (`PRJEDU_opcua`), values to publish or
subscribe (`PRJEDU_mqtt`), a page to put them on (`PRJEDU_web`), history to
keep (`PRJEDU_sqlite`, `PRJEDU_odbc`), a second engine to feed (`PRJEDU_rep`),
a second engine to take over (`PRJEDU_cluster`),
a way in while it runs (`PRJEDU_telnet`), a plant's access to harden (`PRJEDU_hardening`), an AI assistant to let in
(`PRJEDU_mcp`), Python and image processing next to the engine
(`PRJEDU_gauge`), Python called from the XML and from script (`PRJEDU_pycall`), a camera to inspect a line with
(`PRJEDU_vision`), mail to send and files to upload (`PRJEDU_net`), a control loop to tune (`PRJEDU_pid`), a machine to
program (`PRJEDU_plc`), a line's OEE to account for (`PRJEDU_oee`), a robot arm to run in a cell (`PRJEDU_robotarm`) and
an AI assistant to let run it (`PRJEDU_robot_mcp`),
a drone to fly (`PRJPER_tello`), the aircraft overhead to track
(`PRJPER_adsb`), a phone's sensors to watch (`PRJPER_phone`).

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

These guides are deliberately small. The complete field notes — SNMP, OPC UA,
MQTT, cluster and replication, access control, authentication, the plug-in SDK,
the Python module, telnet, raw protocols, load metrics, mail (SMTP), file
transfer (FTP, SFTP) and file functions, camera capture and image functions,
blob, decimal and time values — come with the licensed
product. If you are doing something the examples do not cover, that is where to
look.
