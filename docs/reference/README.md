# Reference

The guides say why. These pages say exactly what: every built-in scope, object
and function of the script language, every function you put in an XML chain,
and every connection type and protocol — what to write, what it reads, what
comes back, and the trap. Every example on these pages was run on engine
4.4.2.702 and its result is written beside it.

Engine 4.4.2.703 fixed the bugs these pages found (crashes in custom time formats and
CODEC, hangs in `ELM.eval` and `jsn()`, the role of a `pro_onreq` handler, chains over 63
characters, rounding, and more). Where a function changed, its page says what it does
now and, in a sentence starting "Before 4.4.2.703", what an older engine does.

Read a guide first. [03_Scripting](../03_Scripting.md) explains where script
lives and how the XML calls it; [02_Timers_and_Events](../02_Timers_and_Events.md)
why a write runs a chain. This reference assumes both.

## The pages

| Page | What is on it |
|---|---|
| [01_Language](01_Language.md) | Types and literals, the global functions, `Math`, `Number`, `String`, `Array`, `Object`, `JSON`, `Buffer`, and the methods every value answers (`toINT`, `toDEC`, `toDTM` …) |
| [02_Time_Text_and_Codecs](02_Time_Text_and_Codecs.md) | `Time`, `TIME`, `CODEC` (Base64, hex, JWT), `BYTES`, `Blob`, `SOAP`, `SYS`, `LOG`, `RES` |
| [03_Events_Documents_and_Addresses](03_Events_Documents_and_Addresses.md) | `evt`, `xdb`, element objects, `new XML(..)`, threads, the address language and its functions (`count`, `json()`, `stat()` …), the special `#` addresses, `sta` and `STA` |
| [04_Attribute_and_Element_Functions](04_Attribute_and_Element_Functions.md) | Chain functions: `ATR`, `VAL`, `ELM`, `XDB`, `EVT`, `THR`, `SCR` |
| [05_Alarms_Conditions_and_Protocol_Chains](05_Alarms_Conditions_and_Protocol_Chains.md) | Chain functions: `ALM`, `IF`, `FILTER`, `CTRL`, and the `PRO` functions every protocol shares |
| [06_Sessions_and_Protocol_Scripts](06_Sessions_and_Protocol_Scripts.md) | `ses`, `exc`, buffers, connection objects, `req` and `res`, every protocol hook (`pro_onparse` …), `MQTT`, `TOPIC`, `AUTH`, LDAP |
| [07_SQL_History_Files_and_Cluster](07_SQL_History_Files_and_Cluster.md) | `SQL`, `HIS`, `File`, `LIC`, `CLT`, `REP`, `RPC`, `OPC`, `PY` |
| [08_Engine_Modules](08_Engine_Modules.md) | `FILE`, `IMG`, `CAM`, `GPIO`, `I2C`, `SPI`, `NET` — the scopes of the engine modules beside the engine |
| [09_Connection_and_Protocol_Types](09_Connection_and_Protocol_Types.md) | Every `CON.x` and `PRO.x` you put in a `<con>`'s `xdb_fnc`, and the `con_*` / `pro_*` fields each reads |

At the end of this page every name is listed once, with a link to its entry.

## Ask the engine

The engine documents itself. The reference is the long form; the engine's
`help` is the short one, always at hand and always the version you run. The
same commands answer in three places.

### In the console window

Start the engine in a console (`run.bat`, `./run.sh`, or
`AyXDB.exe -console <path>\db\AyXDB.xml`) and press **CTRL-X** (CTRL-R does the
same). The log keeps running and a prompt with the document's name appears:

```
EDU/S00> help Math
```

| Type | What happens |
|---|---|
| `help` or `?` | the commands, then every scope that documents itself, one line each |
| `help <SCOPE>` | that scope's help, and the names of its extra texts (`help CON` ends with `CON.help_tcp`, `CON.help_ser` …) |
| `ver` | version, current document, its log file, the licence |
| `pwd` / `cd NAME` | the document the prompt evaluates in / switch to another one |
| `log [lvl] [lines]` | the latest records of the current document's log |
| `log on [lvl]` / `log off` | how much of the log the console shows |
| `exit` or CTRL-X | leave the prompt; the engine runs on |
| `quit` | stop the engine |
| anything else | evaluated as script in the current document, and the value printed |

The console runs **as the engine**: no `xdb_acl` applies to it, it can read and
write everything. It exists only while the engine has a console of its own — an
engine that AySVC runs as a service has none. For that, the shell below.

### In a telnet shell

A `<con xdb_fnc="[CON.tcp,PRO.telnet]">` is the same prompt over a socket,
with a login. [PRJEDU_telnet](../../examples/web/PRJEDU_telnet/) is a
complete one (log in as `admin` / `admin123` on `127.0.0.1:2323`). It knows the
same commands, plus `who` and `history`, and the arrow keys walk the history.
What you type runs with **your session's role**, so `xdb_acl` applies exactly
as it does to any other remote caller. The help itself is open to every role.

A session, as it comes back (trimmed):

```
SHL/S00> help CON
CON : General configuration fields
    con_host : address to connect to
    ...
More under CON (type the whole name):
  CON.help_sql
  CON.help_tcp
  ...
SHL/S00> CON.help_tcp
TCP connection
CON.tcp : CLIENT/CONNECT mode: makes a TCP connection to a server
CON.tcp : SERVER/LISTEN mode: works as a server taking TCP connection requests
con_host='10.40.1.51' con_port='502'
SHL/S00> Object.keys(Time)
["help","GetTimeStr","FmtTimeStr","GetTimeMs","now","ParseTimeMs","GetTimeZoneMs","GetTimeDstMs","tz","AddDurationMs","SleepMs"]
```

### From a script

Every scope's help is a value under the key `help` (lower case; an engine
module's scope keeps its text under a function's name, below):

```js
evt.Log(4, Math.help);                       // the text into the log
evt.Log(4, Object.keys(Math));               // every name in the scope, as JSON text
var all = evt.AskValue("#shell", "help");    // what 'help' prints, as a string
var pro = evt.AskValue("#shell", "help PRO");
```

### What to type for what

| You want | Type |
|---|---|
| every scope that has a help text | `help` |
| one scope | `help Math` or `Math.help` |
| every name in a scope, help or not | `Object.keys(Math)` — the complete list |
| one connection type or protocol | `help CON` / `help PRO`, then the name it lists: `CON.help_tcp`, `PRO.help_modbus` |
| the event object | `Object.XDB_EVT.help` (or `evt.help` in a script) |
| the document object | `Object.XDB_DOC.help` (or `xdb.help`) |
| the other objects | `Object.keys(Object)` names them: `XDB_ELM`, `XDB_THR`, `XDB_CON`, `CON_SES`, `CON_EXC`, `CON_BUF`, `CON_PRO`, `SQL_CON`, `SQL_RS`, `HTTP_MSG`, `HTTP_RES`, `LDAP_CON`; then `Object.CON_SES.help` … |
| an engine module's scope | `FILE.help_list`, `IMG.help_decode`, `CAM.help_list`, `GPIO.help_chips`, `I2C.help_scan`, `SPI.help_sim`; `NET.help_ver` once `AyLIB_net` is attached (by `FILE.help_list`, a mail or file-transfer connection, or `xdb_lib="AyLIB_net"`) |
| SQL | `PRO.help_sql` (and `Object.keys(SQL)`) |
| the values of `log_cfg`, `xdb_log`, `sta` and the type codes | the root help, a value called `help`: in the console or the shell type `"" + help` (a bare `help` is the command), in a script `evt.Log(4, help)` |

Three things the list does not show, measured on 4.4.2.702:

* **`SQL` is not in the list** — it has no help text. `help SQL` says
  `SQL has no help text`; its functions are described in `PRO.help_sql`.
* **The engine modules' scopes are not in the list** (`FILE`, `IMG`, `CAM`,
  `GPIO`, `I2C`, `SPI`, `NET`), and `help FILE` answers `no such scope`. Their
  texts are named after a function: type `FILE.help_list` — that attaches the
  module and prints the text. Before the module is attached
  `Object.keys(FILE)` answers `[]`. `NET` alone is not attached by its own
  name: it appears when something else attaches `AyLIB_net`.
* **`help CON` and `help PRO` list a module's transports and protocols only
  once that module is attached.** `PRO.help_gpio` prints nothing before;
  type `GPIO.help_chips` (or use the module) and `help PRO` then lists
  `PRO.help_gpio` and `PRO.help_reg`. The same goes for `AyLIB_net`
  (`FILE.help_list` → `PRO.help_smtp`, `PRO.help_ftp`, `PRO.help_sftp`,
  `CON.help_ssh`) and `AyLIB_vision` (`IMG.help_decode` → `CON.help_cam`,
  `PRO.help_cam`, `PRO.help_vision`).

A help line is one line. Where it is too short, or a few still carry an
internal change number in brackets, this reference is the long form.

## How to read an entry

**A script function** starts with its call and what it gives back:

`Math.round(v)` → integer

then what it does, its arguments, what comes back on a bad argument, an example
with the measured result as a comment, and the trap if there is one.

**A chain function** — one you write in XML, in a `*_fnc` attribute — starts
with three facts:

**In:** where it goes. **Reads:** the attributes it takes its parameters from.
**Changes:** what it writes.

`<atr>` stands for the attribute whose chain it is in. `ATR.rou` in a `val_fnc`
reads `val_rou`; the same function in a `pro_fnc` reads `pro_rou`.

**Roles** are numbers: 0 Guest, 1 Customer, 2 Monitor, 3 Operator, 4 Supervisor,
5 Manager, 6 Engineer, 7 Admin, and two that are not people — 8 Document (a
replication peer) and 9 System (the engine itself). The engine's own timers and
chains run as System. A script started by a page, a telnet line or an MQTT
command runs with that user's role, and a function that needs "Engineer or above"
refuses anyone below with one `ERROR` line.

**Types** are the `val_typ` codes — `0x0308` a double, `0x0104` an unsigned 32-bit
integer, `0x0401` a string. [01_Language](01_Language.md#types-and-literals) lists
the ones a script meets.

## Every name

<!-- index:begin -->

### Language

* **[Types and literals](01_Language.md#types-and-literals)** — [Arithmetic follows the left operand](01_Language.md#arithmetic-follows-the-left-operand)
* **[Global functions](01_Language.md#global-functions)** — [`parseInt`](01_Language.md#parseint) · [`parseFloat`](01_Language.md#parsefloat) · [`isNaN`](01_Language.md#isnan) · [`isFinite`](01_Language.md#isfinite) · [`debug`](01_Language.md#debug) · [`addressOf`](01_Language.md#addressof)
* **[Math](01_Language.md#math)** — [`Math.abs`](01_Language.md#mathabs) · [`Math.floor`](01_Language.md#mathfloor) · [`Math.ceil`](01_Language.md#mathceil) · [`Math.round`](01_Language.md#mathround) · [`Math.trunc`](01_Language.md#mathtrunc) · [`Math.sign`](01_Language.md#mathsign) · [`Math.min`](01_Language.md#mathmin) · [`Math.max`](01_Language.md#mathmax) · [`Math.pow`](01_Language.md#mathpow) · [`Math.sqrt`](01_Language.md#mathsqrt) · [`Math.log`](01_Language.md#mathlog) · [`Math.log10`](01_Language.md#mathlog10) · [`Math.exp`](01_Language.md#mathexp) · [`Math.sin`](01_Language.md#mathsin) · [`Math.cos`](01_Language.md#mathcos) · [`Math.tan`](01_Language.md#mathtan) · [`Math.asin`](01_Language.md#mathasin) · [`Math.acos`](01_Language.md#mathacos) · [`Math.atan`](01_Language.md#mathatan) · [`Math.atan2`](01_Language.md#mathatan2) · [`Math.random`](01_Language.md#mathrandom) · [Math constants](01_Language.md#math-constants)
* **[Number](01_Language.md#number)** — [`Number.toFixed`](01_Language.md#numbertofixed) · [`Number.toString`](01_Language.md#numbertostring) · [`Number.isInteger`](01_Language.md#numberisinteger) · [`Number.isNaN`](01_Language.md#numberisnan) · [`Number.isFinite`](01_Language.md#numberisfinite) · [`Number.parse`](01_Language.md#numberparse) · [Number constants](01_Language.md#number-constants)
* **[String](01_Language.md#string)** — [`String.length`](01_Language.md#stringlength) · [`String.size`](01_Language.md#stringsize) · [`String.substr`](01_Language.md#stringsubstr) · [`String.slice`](01_Language.md#stringslice) · [`String.substring`](01_Language.md#stringsubstring) · [`String.at`](01_Language.md#stringat) · [`String.charAt`](01_Language.md#stringcharat) · [`String.charCodeAt`](01_Language.md#stringcharcodeat) · [`String.codePointAt`](01_Language.md#stringcodepointat) · [`String.fromCharCode`](01_Language.md#stringfromcharcode) · [`String.indexOf`](01_Language.md#stringindexof) · [`String.lastIndexOf`](01_Language.md#stringlastindexof) · [`String.includes`](01_Language.md#stringincludes) · [`String.startsWith`](01_Language.md#stringstartswith) · [`String.endsWith`](01_Language.md#stringendswith) · [`String.replace`](01_Language.md#stringreplace) · [`String.replaceAll`](01_Language.md#stringreplaceall) · [`String.toUpperCase`](01_Language.md#stringtouppercase) · [`String.toLowerCase`](01_Language.md#stringtolowercase) · [`String.trim`](01_Language.md#stringtrim) · [`String.trimStart`](01_Language.md#stringtrimstart) · [`String.trimEnd`](01_Language.md#stringtrimend) · [`String.padStart`](01_Language.md#stringpadstart) · [`String.padEnd`](01_Language.md#stringpadend) · [`String.repeat`](01_Language.md#stringrepeat) · [`String.concat`](01_Language.md#stringconcat) · [`String.split`](01_Language.md#stringsplit) · [`String.utf8`](01_Language.md#stringutf8) · [`String.utf16`](01_Language.md#stringutf16)
* **[Array](01_Language.md#array)** — [`Array.push`](01_Language.md#arraypush) · [`Array.pop`](01_Language.md#arraypop) · [`Array.shift`](01_Language.md#arrayshift) · [`Array.unshift`](01_Language.md#arrayunshift) · [`Array.slice`](01_Language.md#arrayslice) · [`Array.splice`](01_Language.md#arraysplice) · [`Array.join`](01_Language.md#arrayjoin) · [`Array.indexOf`](01_Language.md#arrayindexof) · [`Array.includes`](01_Language.md#arrayincludes) · [`Array.reverse`](01_Language.md#arrayreverse) · [`Array.sort`](01_Language.md#arraysort) · [`Array.concat`](01_Language.md#arrayconcat) · [`Array.length`](01_Language.md#arraylength) · [`Array.isArray`](01_Language.md#arrayisarray) · [`Array.create`](01_Language.md#arraycreate) · [`Array.ins`](01_Language.md#arrayins) · [`Array.del`](01_Language.md#arraydel) · [`Array.put`](01_Language.md#arrayput) · [`Array.get`](01_Language.md#arrayget)
* **[Object](01_Language.md#object)** — [`Object.type`](01_Language.md#objecttype) · [`Object.isArray`](01_Language.md#objectisarray) · [`Object.length`](01_Language.md#objectlength) · [`Object.keys`](01_Language.md#objectkeys) · [`Object.item`](01_Language.md#objectitem) · [`Object.toUNS`](01_Language.md#objecttouns) · [`Object.toINT`](01_Language.md#objecttoint) · [`Object.toFLT`](01_Language.md#objecttoflt) · [`Object.toSTR`](01_Language.md#objecttostr) · [`Object.create`](01_Language.md#objectcreate)
* **[JSON](01_Language.md#json)** — [`JSON.parse`](01_Language.md#jsonparse) · [`JSON.stringify`](01_Language.md#jsonstringify)
* **[Buffer](01_Language.md#buffer)** — [`Buffer.create`](01_Language.md#buffercreate) · [`Buffer.ins`](01_Language.md#bufferins) · [`Buffer.del`](01_Language.md#bufferdel) · [`Buffer.put`](01_Language.md#bufferput) · [`Buffer.get`](01_Language.md#bufferget)
* **[Value methods](01_Language.md#value-methods)** — [`value.toINT`](01_Language.md#valuetoint) · [`value.toUNS`](01_Language.md#valuetouns) · [`value.toHEX`](01_Language.md#valuetohex) · [`value.toFLT`](01_Language.md#valuetoflt) · [`value.toSTR`](01_Language.md#valuetostr) · [`value.toS08`](01_Language.md#valuetos08) · [`value.toS16`](01_Language.md#valuetos16) · [`value.toDEC`](01_Language.md#valuetodec) · [`value.toDTM`](01_Language.md#valuetodtm) · [`value.toDATE`](01_Language.md#valuetodate) · [`value.toTIME`](01_Language.md#valuetotime) · [`value.toDUR`](01_Language.md#valuetodur)

### Time, text and codecs

* **[Time](02_Time_Text_and_Codecs.md#time)** — [`Time.GetTimeStr`](02_Time_Text_and_Codecs.md#timegettimestr) · [`Time.FmtTimeStr`](02_Time_Text_and_Codecs.md#timefmttimestr) · [`Time.GetTimeMs`](02_Time_Text_and_Codecs.md#timegettimems) · [`Time.now`](02_Time_Text_and_Codecs.md#timenow) · [`Time.ParseTimeMs`](02_Time_Text_and_Codecs.md#timeparsetimems) · [`Time.GetTimeZoneMs`](02_Time_Text_and_Codecs.md#timegettimezonems) · [`Time.GetTimeDstMs`](02_Time_Text_and_Codecs.md#timegettimedstms) · [`Time.tz`](02_Time_Text_and_Codecs.md#timetz) · [`Time.AddDurationMs`](02_Time_Text_and_Codecs.md#timeadddurationms) · [`Time.SleepMs`](02_Time_Text_and_Codecs.md#timesleepms)
* **[TIME: a chain function](02_Time_Text_and_Codecs.md#time-a-chain-function)** — [`TIME.str`](02_Time_Text_and_Codecs.md#timestr)
* **[CODEC](02_Time_Text_and_Codecs.md#codec)** — [`CODEC.B64_enc`](02_Time_Text_and_Codecs.md#codecb64_enc) · [`CODEC.B64_dec`](02_Time_Text_and_Codecs.md#codecb64_dec) · [`CODEC.HEX_enc`](02_Time_Text_and_Codecs.md#codechex_enc) · [`CODEC.HEX_dec`](02_Time_Text_and_Codecs.md#codechex_dec) · [`CODEC.Z64_enc`](02_Time_Text_and_Codecs.md#codecz64_enc) · [`CODEC.Z64_dec`](02_Time_Text_and_Codecs.md#codecz64_dec) · [`CODEC.JWT_sign`](02_Time_Text_and_Codecs.md#codecjwt_sign) · [`CODEC.JWT_verify`](02_Time_Text_and_Codecs.md#codecjwt_verify) · [`CODEC.JWT_dec`](02_Time_Text_and_Codecs.md#codecjwt_dec)
* **[BYTES](02_Time_Text_and_Codecs.md#bytes)** — [`BYTES.u16be`](02_Time_Text_and_Codecs.md#bytesu16be) · [`BYTES.u16le`](02_Time_Text_and_Codecs.md#bytesu16le) · [`BYTES.i16be`](02_Time_Text_and_Codecs.md#bytesi16be) · [`BYTES.i16le`](02_Time_Text_and_Codecs.md#bytesi16le) · [`BYTES.u24be`](02_Time_Text_and_Codecs.md#bytesu24be) · [`BYTES.u32be`](02_Time_Text_and_Codecs.md#bytesu32be) · [`BYTES.u32le`](02_Time_Text_and_Codecs.md#bytesu32le) · [`BYTES.i32be`](02_Time_Text_and_Codecs.md#bytesi32be) · [`BYTES.text`](02_Time_Text_and_Codecs.md#bytestext) · [`BYTES.hex`](02_Time_Text_and_Codecs.md#byteshex) · [`BYTES.make`](02_Time_Text_and_Codecs.md#bytesmake) · [`BYTES.crc8`](02_Time_Text_and_Codecs.md#bytescrc8)
* **[Blob](02_Time_Text_and_Codecs.md#blob)** — [`new Blob`](02_Time_Text_and_Codecs.md#new-blob) · [`Blob.from`](02_Time_Text_and_Codecs.md#blobfrom) · [`Blob.live`](02_Time_Text_and_Codecs.md#bloblive) · [`b.toBuffer`](02_Time_Text_and_Codecs.md#btobuffer)
* **[SOAP](02_Time_Text_and_Codecs.md#soap)** — [`SOAP.parse`](02_Time_Text_and_Codecs.md#soapparse) · [`SOAP.stringify`](02_Time_Text_and_Codecs.md#soapstringify)
* **[SYS](02_Time_Text_and_Codecs.md#sys)** — [`SYS.GetProcessId`](02_Time_Text_and_Codecs.md#sysgetprocessid) · [`SYS.GetComputerName`](02_Time_Text_and_Codecs.md#sysgetcomputername)
* **[LOG](02_Time_Text_and_Codecs.md#log)** — [`LOG.wrt`](02_Time_Text_and_Codecs.md#logwrt)
* **[RES](02_Time_Text_and_Codecs.md#res)** — [`RES.GRP_GET`](02_Time_Text_and_Codecs.md#resgrp_get) · [`RES.SUB_GET`](02_Time_Text_and_Codecs.md#ressub_get) · [`RES.grp_str`](02_Time_Text_and_Codecs.md#resgrp_str) · [`RES.sub_str`](02_Time_Text_and_Codecs.md#ressub_str)

### Events, documents and addresses

* [The sample document](03_Events_Documents_and_Addresses.md#the-sample-document)
* **[evt: the event](03_Events_Documents_and_Addresses.md#evt-the-event)** — [Inside a chain](03_Events_Documents_and_Addresses.md#inside-a-chain) · [`evt.GetValue`](03_Events_Documents_and_Addresses.md#evtgetvalue) · [`evt.SetValue`](03_Events_Documents_and_Addresses.md#evtsetvalue) · [`evt.MskValue`](03_Events_Documents_and_Addresses.md#evtmskvalue) · [`evt.XorValue`](03_Events_Documents_and_Addresses.md#evtxorvalue) · [`evt.AddValue`](03_Events_Documents_and_Addresses.md#evtaddvalue) · [`evt.AskValue`](03_Events_Documents_and_Addresses.md#evtaskvalue) · [`evt.QueValue`](03_Events_Documents_and_Addresses.md#evtquevalue) · [`evt.UpdValue`](03_Events_Documents_and_Addresses.md#evtupdvalue) · [`evt.PubValue`](03_Events_Documents_and_Addresses.md#evtpubvalue) · [`evt.AddElement`](03_Events_Documents_and_Addresses.md#evtaddelement) · [`evt.GetElement`](03_Events_Documents_and_Addresses.md#evtgetelement) · [`evt.DelElement`](03_Events_Documents_and_Addresses.md#evtdelelement) · [`evt.ForEach`](03_Events_Documents_and_Addresses.md#evtforeach) · [`evt.Log`](03_Events_Documents_and_Addresses.md#evtlog) · [`new XDB_EVT`](03_Events_Documents_and_Addresses.md#new-xdb_evt)
* [evt.flg and the EVT.FLG constants](03_Events_Documents_and_Addresses.md#evtflg-and-the-evtflg-constants)
* **[xdb: the document](03_Events_Documents_and_Addresses.md#xdb-the-document)** — [`xdb.doc`](03_Events_Documents_and_Addresses.md#xdbdoc) · [`xdb.elm`](03_Events_Documents_and_Addresses.md#xdbelm) · [`xdb.GetValue`](03_Events_Documents_and_Addresses.md#xdbgetvalue) · [`xdb.SetValue`](03_Events_Documents_and_Addresses.md#xdbsetvalue) · [`xdb.MskValue`](03_Events_Documents_and_Addresses.md#xdbmskvalue) · [`xdb.XorValue`](03_Events_Documents_and_Addresses.md#xdbxorvalue) · [`xdb.AddValue`](03_Events_Documents_and_Addresses.md#xdbaddvalue) · [`xdb.AskValue`](03_Events_Documents_and_Addresses.md#xdbaskvalue) · [`xdb.QueValue`](03_Events_Documents_and_Addresses.md#xdbquevalue) · [`xdb.UpdValue`](03_Events_Documents_and_Addresses.md#xdbupdvalue) · [`xdb.PubValue`](03_Events_Documents_and_Addresses.md#xdbpubvalue) · [`xdb.AddElement`](03_Events_Documents_and_Addresses.md#xdbaddelement) · [`xdb.GetElement`](03_Events_Documents_and_Addresses.md#xdbgetelement) · [`xdb.DelElement`](03_Events_Documents_and_Addresses.md#xdbdelelement) · [`xdb.ForEach`](03_Events_Documents_and_Addresses.md#xdbforeach) · [`xdb.Log`](03_Events_Documents_and_Addresses.md#xdblog) · [`xdb.normalizePath`](03_Events_Documents_and_Addresses.md#xdbnormalizepath) · [`xdb.toID`](03_Events_Documents_and_Addresses.md#xdbtoid) · [`xdb.newID`](03_Events_Documents_and_Addresses.md#xdbnewid) · [`xdb.newUUID`](03_Events_Documents_and_Addresses.md#xdbnewuuid) · [`xdb.lockID`](03_Events_Documents_and_Addresses.md#xdblockid) · [`xdb.unlockID`](03_Events_Documents_and_Addresses.md#xdbunlockid) · [`xdb.lock`](03_Events_Documents_and_Addresses.md#xdblock) · [`xdb.unlock`](03_Events_Documents_and_Addresses.md#xdbunlock) · [`xdb.save`](03_Events_Documents_and_Addresses.md#xdbsave) · [`xdb.sync`](03_Events_Documents_and_Addresses.md#xdbsync) · [`xdb.dur`](03_Events_Documents_and_Addresses.md#xdbdur) · [`xdb.ShellExecute`](03_Events_Documents_and_Addresses.md#xdbshellexecute) · [`xdb.exitProgram`](03_Events_Documents_and_Addresses.md#xdbexitprogram) · [`xdb.eval`](03_Events_Documents_and_Addresses.md#xdbeval) · [`xdb.callFunction`](03_Events_Documents_and_Addresses.md#xdbcallfunction) · [`xdb.sta`](03_Events_Documents_and_Addresses.md#xdbsta)
* **[Element objects](03_Events_Documents_and_Addresses.md#element-objects)** — [`elm.xdb_elm`](03_Events_Documents_and_Addresses.md#elmxdb_elm) · [`elm.xdb_doc`](03_Events_Documents_and_Addresses.md#elmxdb_doc) · [`elm.xdb_obj`](03_Events_Documents_and_Addresses.md#elmxdb_obj)
* **[new XML: the DOM](03_Events_Documents_and_Addresses.md#new-xml-the-dom)** — [`new XML`](03_Events_Documents_and_Addresses.md#new-xml)
* **[Thread objects](03_Events_Documents_and_Addresses.md#thread-objects)** — [`thr.lock`](03_Events_Documents_and_Addresses.md#thrlock) · [`thr.unlock`](03_Events_Documents_and_Addresses.md#thrunlock)
* **[Addresses](03_Events_Documents_and_Addresses.md#addresses)** — [Steps and predicates](03_Events_Documents_and_Addresses.md#steps-and-predicates) · [Other documents](03_Events_Documents_and_Addresses.md#other-documents)
* **[Address functions](03_Events_Documents_and_Addresses.md#address-functions)** — [`count`](03_Events_Documents_and_Addresses.md#count) · [`sum`](03_Events_Documents_and_Addresses.md#sum) · [`min`](03_Events_Documents_and_Addresses.md#min) · [`max`](03_Events_Documents_and_Addresses.md#max) · [`xml`](03_Events_Documents_and_Addresses.md#xml) · [`json`](03_Events_Documents_and_Addresses.md#json) · [`stat`](03_Events_Documents_and_Addresses.md#stat) · [`api`](03_Events_Documents_and_Addresses.md#api) · [`rpc`](03_Events_Documents_and_Addresses.md#rpc) · [`xdb`](03_Events_Documents_and_Addresses.md#xdb) · [`jsn`](03_Events_Documents_and_Addresses.md#jsn) · [`sql`](03_Events_Documents_and_Addresses.md#sql)
* **[Special addresses](03_Events_Documents_and_Addresses.md#special-addresses)** — [`#JScript`](03_Events_Documents_and_Addresses.md#jscript) · [`#PyScript`](03_Events_Documents_and_Addresses.md#pyscript) · [`#shell`](03_Events_Documents_and_Addresses.md#shell) · [`#save`](03_Events_Documents_and_Addresses.md#save) · [`#xdb_log`](03_Events_Documents_and_Addresses.md#xdb_log) · [`#log_cfg`](03_Events_Documents_and_Addresses.md#log_cfg) · [`#dur`](03_Events_Documents_and_Addresses.md#dur) · [`#eval`](03_Events_Documents_and_Addresses.md#eval)
* **[STA: the sta word](03_Events_Documents_and_Addresses.md#sta-the-sta-word)** — [The word](03_Events_Documents_and_Addresses.md#the-word) · [`STA.get_run_eng`](03_Events_Documents_and_Addresses.md#staget_run_eng) · [`STA.get_run_alm`](03_Events_Documents_and_Addresses.md#staget_run_alm) · [`STA.get_run`](03_Events_Documents_and_Addresses.md#staget_run) · [`STA.get_cmd`](03_Events_Documents_and_Addresses.md#staget_cmd) · [`STA.set_run_eng`](03_Events_Documents_and_Addresses.md#staset_run_eng) · [`STA.set_run_alm`](03_Events_Documents_and_Addresses.md#staset_run_alm) · [`STA.set_run`](03_Events_Documents_and_Addresses.md#staset_run) · [`STA.set_cmd`](03_Events_Documents_and_Addresses.md#staset_cmd) · [`STA.upd`](03_Events_Documents_and_Addresses.md#staupd) · [`STA.lnk`](03_Events_Documents_and_Addresses.md#stalnk) · [`STA.onstalnk`](03_Events_Documents_and_Addresses.md#staonstalnk)

### Attribute and element functions

* **[How a chain runs](04_Attribute_and_Element_Functions.md#how-a-chain-runs)** — [The run bits in <atr>_typ](04_Attribute_and_Element_Functions.md#the-run-bits-in-atr_typ) · [What a function sees](04_Attribute_and_Element_Functions.md#what-a-function-sees) · [How a chain ends](04_Attribute_and_Element_Functions.md#how-a-chain-ends) · [Three traps that silence a function](04_Attribute_and_Element_Functions.md#three-traps-that-silence-a-function)
* **[ATR: attribute functions](04_Attribute_and_Element_Functions.md#atr-attribute-functions)** — [`ATR.and`](04_Attribute_and_Element_Functions.md#atrand) · [`ATR.or`](04_Attribute_and_Element_Functions.md#atror) · [`ATR.xor`](04_Attribute_and_Element_Functions.md#atrxor) · [`ATR.tog`](04_Attribute_and_Element_Functions.md#atrtog) · [`ATR.set`](04_Attribute_and_Element_Functions.md#atrset) · [`ATR.rst`](04_Attribute_and_Element_Functions.md#atrrst) · [`ATR.put`](04_Attribute_and_Element_Functions.md#atrput) · [`ATR.eval`](04_Attribute_and_Element_Functions.md#atreval) · [`ATR.inc`](04_Attribute_and_Element_Functions.md#atrinc) · [`ATR.dec`](04_Attribute_and_Element_Functions.md#atrdec) · [`ATR.hrec`](04_Attribute_and_Element_Functions.md#atrhrec) · [`ATR.vrec`](04_Attribute_and_Element_Functions.md#atrvrec) · [`ATR.cnv`](04_Attribute_and_Element_Functions.md#atrcnv) · [`ATR.cnvr`](04_Attribute_and_Element_Functions.md#atrcnvr) · [`ATR.lmt`](04_Attribute_and_Element_Functions.md#atrlmt) · [`ATR.rou`](04_Attribute_and_Element_Functions.md#atrrou) · [`ATR.tim`](04_Attribute_and_Element_Functions.md#atrtim) · [`ATR.timstr`](04_Attribute_and_Element_Functions.md#atrtimstr) · [`ATR.tot`](04_Attribute_and_Element_Functions.md#atrtot) · [`ATR.upd`](04_Attribute_and_Element_Functions.md#atrupd) · [`ATR.nup`](04_Attribute_and_Element_Functions.md#atrnup) · [`ATR.tmr`](04_Attribute_and_Element_Functions.md#atrtmr) · [`ATR.map`](04_Attribute_and_Element_Functions.md#atrmap) · [`ATR.mapr`](04_Attribute_and_Element_Functions.md#atrmapr) · [`ATR.json`](04_Attribute_and_Element_Functions.md#atrjson)
* **[VAL: functions that write val](04_Attribute_and_Element_Functions.md#val-functions-that-write-val)** — [`VAL.put`](04_Attribute_and_Element_Functions.md#valput) · [`VAL.cnv`](04_Attribute_and_Element_Functions.md#valcnv) · [`VAL.cnvr`](04_Attribute_and_Element_Functions.md#valcnvr) · [`VAL.set`](04_Attribute_and_Element_Functions.md#valset) · [`VAL.rst`](04_Attribute_and_Element_Functions.md#valrst) · [`VAL.tog`](04_Attribute_and_Element_Functions.md#valtog) · [`VAL.inc`](04_Attribute_and_Element_Functions.md#valinc) · [`VAL.dec`](04_Attribute_and_Element_Functions.md#valdec) · [`VAL.map`](04_Attribute_and_Element_Functions.md#valmap) · [`VAL.mapr`](04_Attribute_and_Element_Functions.md#valmapr) · [`VAL.upd`](04_Attribute_and_Element_Functions.md#valupd)
* **[ELM: functions on another attribute of the element](04_Attribute_and_Element_Functions.md#elm-functions-on-another-attribute-of-the-element)** — [`ELM.sta`](04_Attribute_and_Element_Functions.md#elmsta) · [`ELM.put`](04_Attribute_and_Element_Functions.md#elmput) · [`ELM.and`](04_Attribute_and_Element_Functions.md#elmand) · [`ELM.or`](04_Attribute_and_Element_Functions.md#elmor) · [`ELM.xor`](04_Attribute_and_Element_Functions.md#elmxor) · [`ELM.tog`](04_Attribute_and_Element_Functions.md#elmtog) · [`ELM.set`](04_Attribute_and_Element_Functions.md#elmset) · [`ELM.rst`](04_Attribute_and_Element_Functions.md#elmrst) · [`ELM.inc`](04_Attribute_and_Element_Functions.md#elminc) · [`ELM.dec`](04_Attribute_and_Element_Functions.md#elmdec) · [`ELM.get`](04_Attribute_and_Element_Functions.md#elmget) · [`ELM.upd`](04_Attribute_and_Element_Functions.md#elmupd) · [`ELM.tim`](04_Attribute_and_Element_Functions.md#elmtim) · [`ELM.timstr`](04_Attribute_and_Element_Functions.md#elmtimstr) · [`ELM.tim2int`](04_Attribute_and_Element_Functions.md#elmtim2int) · [`ELM.eval`](04_Attribute_and_Element_Functions.md#elmeval) · [`ELM.new`](04_Attribute_and_Element_Functions.md#elmnew) · [`ELM.del`](04_Attribute_and_Element_Functions.md#elmdel) · [`ELM.json`](04_Attribute_and_Element_Functions.md#elmjson)
* **[XDB: functions on an address](04_Attribute_and_Element_Functions.md#xdb-functions-on-an-address)** — [`XDB.get`](04_Attribute_and_Element_Functions.md#xdbget) · [`XDB.put`](04_Attribute_and_Element_Functions.md#xdbput) · [`XDB.msk`](04_Attribute_and_Element_Functions.md#xdbmsk) · [`XDB.xor`](04_Attribute_and_Element_Functions.md#xdbxor) · [`XDB.add`](04_Attribute_and_Element_Functions.md#xdbadd) · [`XDB.tog`](04_Attribute_and_Element_Functions.md#xdbtog) · [`XDB.upd`](04_Attribute_and_Element_Functions.md#xdbupd) · [`XDB.fmt`](04_Attribute_and_Element_Functions.md#xdbfmt) · [`XDB.eval`](04_Attribute_and_Element_Functions.md#xdbeval) · [`XDB.qry`](04_Attribute_and_Element_Functions.md#xdbqry) · [`XDB.evt`](04_Attribute_and_Element_Functions.md#xdbevt) · [`XDB.sta`](04_Attribute_and_Element_Functions.md#xdbsta) · [`XDB.elmnew`](04_Attribute_and_Element_Functions.md#xdbelmnew) · [`XDB.elmsub`](04_Attribute_and_Element_Functions.md#xdbelmsub) · [`XDB.elmdel`](04_Attribute_and_Element_Functions.md#xdbelmdel) · [`XDB.elmmod`](04_Attribute_and_Element_Functions.md#xdbelmmod)
* **[EVT: timers](04_Attribute_and_Element_Functions.md#evt-timers)** — [`EVT.cre`](04_Attribute_and_Element_Functions.md#evtcre) · [`EVT.sta`](04_Attribute_and_Element_Functions.md#evtsta) · [`EVT.put`](04_Attribute_and_Element_Functions.md#evtput) · [`EVT.set`](04_Attribute_and_Element_Functions.md#evtset) · [`EVT.rst`](04_Attribute_and_Element_Functions.md#evtrst) · [`EVT.flgclrdir`](04_Attribute_and_Element_Functions.md#evtflgclrdir)
* **[THR: threads](04_Attribute_and_Element_Functions.md#thr-threads)** — [`THR.cre`](04_Attribute_and_Element_Functions.md#thrcre) · [`THR.sta`](04_Attribute_and_Element_Functions.md#thrsta)
* **[SCR: scripts](04_Attribute_and_Element_Functions.md#scr-scripts)** — [`SCR.prs`](04_Attribute_and_Element_Functions.md#scrprs) · [`SCR.sta`](04_Attribute_and_Element_Functions.md#scrsta) · [`SCR.trace`](04_Attribute_and_Element_Functions.md#scrtrace) · [`SCR.prof`](04_Attribute_and_Element_Functions.md#scrprof) · [`SCR.dump`](04_Attribute_and_Element_Functions.md#scrdump) · [`SCR.test`](04_Attribute_and_Element_Functions.md#scrtest)

### Alarms, conditions and protocol chains

* [How these functions run](05_Alarms_Conditions_and_Protocol_Chains.md#how-these-functions-run)
* **[ALM: alarms](05_Alarms_Conditions_and_Protocol_Chains.md#alm-alarms)** — [`ALM.onlvl`](05_Alarms_Conditions_and_Protocol_Chains.md#almonlvl) · [`ALM.onequ`](05_Alarms_Conditions_and_Protocol_Chains.md#almonequ) · [`ALM.onand`](05_Alarms_Conditions_and_Protocol_Chains.md#almonand) · [`ALM.onin`](05_Alarms_Conditions_and_Protocol_Chains.md#almonin) · [`ALM.onsta`](05_Alarms_Conditions_and_Protocol_Chains.md#almonsta) · [`ALM.onalmlnk`](05_Alarms_Conditions_and_Protocol_Chains.md#almonalmlnk) · [`ALM.onstalnk`](05_Alarms_Conditions_and_Protocol_Chains.md#almonstalnk) · [`ALM.put`](05_Alarms_Conditions_and_Protocol_Chains.md#almput) · [`ALM.msk`](05_Alarms_Conditions_and_Protocol_Chains.md#almmsk) · [`ALM.lnk`](05_Alarms_Conditions_and_Protocol_Chains.md#almlnk) · [`ALM.tim`](05_Alarms_Conditions_and_Protocol_Chains.md#almtim) · [`ALM.timstr`](05_Alarms_Conditions_and_Protocol_Chains.md#almtimstr) · [`ALM.devsta`](05_Alarms_Conditions_and_Protocol_Chains.md#almdevsta) · [`ALM.xdbsta`](05_Alarms_Conditions_and_Protocol_Chains.md#almxdbsta) · [`ALM.consta`](05_Alarms_Conditions_and_Protocol_Chains.md#almconsta) · [`ALM.thrsta`](05_Alarms_Conditions_and_Protocol_Chains.md#almthrsta) · [`ALM.send`](05_Alarms_Conditions_and_Protocol_Chains.md#almsend)
* **[IF: conditions](05_Alarms_Conditions_and_Protocol_Chains.md#if-conditions)** — [`IF.equ`](05_Alarms_Conditions_and_Protocol_Chains.md#ifequ) · [`IF.neq`](05_Alarms_Conditions_and_Protocol_Chains.md#ifneq) · [`IF.grt`](05_Alarms_Conditions_and_Protocol_Chains.md#ifgrt) · [`IF.gre`](05_Alarms_Conditions_and_Protocol_Chains.md#ifgre) · [`IF.les`](05_Alarms_Conditions_and_Protocol_Chains.md#ifles) · [`IF.lse`](05_Alarms_Conditions_and_Protocol_Chains.md#iflse) · [`IF.set`](05_Alarms_Conditions_and_Protocol_Chains.md#ifset) · [`IF.rst`](05_Alarms_Conditions_and_Protocol_Chains.md#ifrst) · [`IF.chg`](05_Alarms_Conditions_and_Protocol_Chains.md#ifchg) · [`IF.and`](05_Alarms_Conditions_and_Protocol_Chains.md#ifand) · [`IF.nand`](05_Alarms_Conditions_and_Protocol_Chains.md#ifnand) · [`IF.in`](05_Alarms_Conditions_and_Protocol_Chains.md#ifin) · [`IF.else`](05_Alarms_Conditions_and_Protocol_Chains.md#ifelse) · [`IF.end`](05_Alarms_Conditions_and_Protocol_Chains.md#ifend) · [`IF.alone`](05_Alarms_Conditions_and_Protocol_Chains.md#ifalone) · [`IF.edge`](05_Alarms_Conditions_and_Protocol_Chains.md#ifedge) · [`IF.hub`](05_Alarms_Conditions_and_Protocol_Chains.md#ifhub) · [`IF.any`](05_Alarms_Conditions_and_Protocol_Chains.md#ifany)
* **[FILTER: holding a change back](05_Alarms_Conditions_and_Protocol_Chains.md#filter-holding-a-change-back)** — [`FILTER.setcnt`](05_Alarms_Conditions_and_Protocol_Chains.md#filtersetcnt) · [`FILTER.rstcnt`](05_Alarms_Conditions_and_Protocol_Chains.md#filterrstcnt) · [`FILTER.rpttim`](05_Alarms_Conditions_and_Protocol_Chains.md#filterrpttim) · [`FILTER.chgtim`](05_Alarms_Conditions_and_Protocol_Chains.md#filterchgtim)
* **[CTRL: the on-off controller](05_Alarms_Conditions_and_Protocol_Chains.md#ctrl-the-on-off-controller)** — [`CTRL.inpOOC`](05_Alarms_Conditions_and_Protocol_Chains.md#ctrlinpooc) · [`CTRL.outOOC`](05_Alarms_Conditions_and_Protocol_Chains.md#ctrloutooc)
* **[PRO: the protocol chain functions](05_Alarms_Conditions_and_Protocol_Chains.md#pro-the-protocol-chain-functions)** — [`PRO.cre`](05_Alarms_Conditions_and_Protocol_Chains.md#procre) · [`PRO.sta`](05_Alarms_Conditions_and_Protocol_Chains.md#prosta) · [`PRO.open`](05_Alarms_Conditions_and_Protocol_Chains.md#proopen) · [`PRO.pol`](05_Alarms_Conditions_and_Protocol_Chains.md#propol) · [`PRO.inp`](05_Alarms_Conditions_and_Protocol_Chains.md#proinp) · [`PRO.vrec`](05_Alarms_Conditions_and_Protocol_Chains.md#provrec) · [`PRO.out`](05_Alarms_Conditions_and_Protocol_Chains.md#proout) · [`PRO.outc`](05_Alarms_Conditions_and_Protocol_Chains.md#prooutc) · [`PRO.outf`](05_Alarms_Conditions_and_Protocol_Chains.md#prooutf) · [`PRO.put`](05_Alarms_Conditions_and_Protocol_Chains.md#proput) · [`PRO.set`](05_Alarms_Conditions_and_Protocol_Chains.md#proset) · [`PRO.rst`](05_Alarms_Conditions_and_Protocol_Chains.md#prorst) · [`PRO.cnv`](05_Alarms_Conditions_and_Protocol_Chains.md#procnv) · [`PRO.cnvr`](05_Alarms_Conditions_and_Protocol_Chains.md#procnvr) · [`PRO.map`](05_Alarms_Conditions_and_Protocol_Chains.md#promap) · [`PRO.mapr`](05_Alarms_Conditions_and_Protocol_Chains.md#promapr) · [`PRO.req`](05_Alarms_Conditions_and_Protocol_Chains.md#proreq) · [`PRO.upd`](05_Alarms_Conditions_and_Protocol_Chains.md#proupd)

### Sessions and protocol scripts

* [How a script reaches a connection](06_Sessions_and_Protocol_Scripts.md#how-a-script-reaches-a-connection)
* **[con: a connection](06_Sessions_and_Protocol_Scripts.md#con-a-connection)** — [`con.get_ses`](06_Sessions_and_Protocol_Scripts.md#conget_ses) · [`con.add_ses`](06_Sessions_and_Protocol_Scripts.md#conadd_ses) · [`con.lock`](06_Sessions_and_Protocol_Scripts.md#conlock) · [`con.unlock`](06_Sessions_and_Protocol_Scripts.md#conunlock)
* [con.pro: the connection's protocol](06_Sessions_and_Protocol_Scripts.md#conpro-the-connections-protocol)
* **[ses: a session](06_Sessions_and_Protocol_Scripts.md#ses-a-session)** — [`ses.user_role`](06_Sessions_and_Protocol_Scripts.md#sesuser_role) · [`ses.send`](06_Sessions_and_Protocol_Scripts.md#sessend) · [`ses.receive`](06_Sessions_and_Protocol_Scripts.md#sesreceive) · [`ses.connect`](06_Sessions_and_Protocol_Scripts.md#sesconnect) · [`ses.disconnect`](06_Sessions_and_Protocol_Scripts.md#sesdisconnect) · [`ses.close`](06_Sessions_and_Protocol_Scripts.md#sesclose) · [`ses.start`](06_Sessions_and_Protocol_Scripts.md#sesstart) · [`ses.stop`](06_Sessions_and_Protocol_Scripts.md#sesstop) · [`ses.wait_start`](06_Sessions_and_Protocol_Scripts.md#seswait_start) · [`ses.wait_stop`](06_Sessions_and_Protocol_Scripts.md#seswait_stop)
* **[exc: an exchange](06_Sessions_and_Protocol_Scripts.md#exc-an-exchange)** — [`new CON_EXC`](06_Sessions_and_Protocol_Scripts.md#new-con_exc) · [`exc.send`](06_Sessions_and_Protocol_Scripts.md#excsend) · [`exc.exchange`](06_Sessions_and_Protocol_Scripts.md#excexchange) · [`exc.complete`](06_Sessions_and_Protocol_Scripts.md#exccomplete) · [`exc.starttls`](06_Sessions_and_Protocol_Scripts.md#excstarttls) · [`exc.wr`](06_Sessions_and_Protocol_Scripts.md#excwr) · [`exc.rd`](06_Sessions_and_Protocol_Scripts.md#excrd) · [`exc.wrrd`](06_Sessions_and_Protocol_Scripts.md#excwrrd) · [`exc.xfer`](06_Sessions_and_Protocol_Scripts.md#excxfer) · [`exc.result`](06_Sessions_and_Protocol_Scripts.md#excresult) · [`exc.err`](06_Sessions_and_Protocol_Scripts.md#excerr)
* **[CON_BUF: a byte buffer](06_Sessions_and_Protocol_Scripts.md#con_buf-a-byte-buffer)** — [`new CON_BUF`](06_Sessions_and_Protocol_Scripts.md#new-con_buf) · [`buf.append`](06_Sessions_and_Protocol_Scripts.md#bufappend) · [`buf.insert`](06_Sessions_and_Protocol_Scripts.md#bufinsert) · [`buf.remove`](06_Sessions_and_Protocol_Scripts.md#bufremove) · [`buf.copy`](06_Sessions_and_Protocol_Scripts.md#bufcopy) · [`buf.find`](06_Sessions_and_Protocol_Scripts.md#buffind) · [`buf.split`](06_Sessions_and_Protocol_Scripts.md#bufsplit)
* **[Protocol hooks](06_Sessions_and_Protocol_Scripts.md#protocol-hooks)** — [How a hook is written](06_Sessions_and_Protocol_Scripts.md#how-a-hook-is-written) · [`pro_onparse`](06_Sessions_and_Protocol_Scripts.md#pro_onparse) · [`pro_onaccept`](06_Sessions_and_Protocol_Scripts.md#pro_onaccept) · [`pro_onclose`](06_Sessions_and_Protocol_Scripts.md#pro_onclose) · [`pro_onpol`](06_Sessions_and_Protocol_Scripts.md#pro_onpol) · [`pro_onout`](06_Sessions_and_Protocol_Scripts.md#pro_onout) · [`pro_onreq`](06_Sessions_and_Protocol_Scripts.md#pro_onreq) · [`pro_oninp`](06_Sessions_and_Protocol_Scripts.md#pro_oninp) · [`pro_oncon`](06_Sessions_and_Protocol_Scripts.md#pro_oncon) · [`pro_onconack`](06_Sessions_and_Protocol_Scripts.md#pro_onconack) · [`pro_onsub`](06_Sessions_and_Protocol_Scripts.md#pro_onsub) · [`pro_onunsub`](06_Sessions_and_Protocol_Scripts.md#pro_onunsub) · [`pro_onlogin`](06_Sessions_and_Protocol_Scripts.md#pro_onlogin) · [`pro_oncmd`](06_Sessions_and_Protocol_Scripts.md#pro_oncmd) · [`xdb_pub`](06_Sessions_and_Protocol_Scripts.md#xdb_pub)
* **[req: the HTTP request](06_Sessions_and_Protocol_Scripts.md#req-the-http-request)** — [`req.getParam`](06_Sessions_and_Protocol_Scripts.md#reqgetparam) · [`req.getForm`](06_Sessions_and_Protocol_Scripts.md#reqgetform) · [`req.getHeader`](06_Sessions_and_Protocol_Scripts.md#reqgetheader) · [`req.fileServe`](06_Sessions_and_Protocol_Scripts.md#reqfileserve)
* **[res: a server page's answer](06_Sessions_and_Protocol_Scripts.md#res-a-server-pages-answer)** — [`res.write`](06_Sessions_and_Protocol_Scripts.md#reswrite) · [`res.writeText`](06_Sessions_and_Protocol_Scripts.md#reswritetext) · [`res.escape`](06_Sessions_and_Protocol_Scripts.md#resescape) · [`res.header`](06_Sessions_and_Protocol_Scripts.md#resheader) · [`res.redirect`](06_Sessions_and_Protocol_Scripts.md#resredirect) · [`res.clear`](06_Sessions_and_Protocol_Scripts.md#resclear)
* **[MQTT](06_Sessions_and_Protocol_Scripts.md#mqtt)** — [`MQTT.publish`](06_Sessions_and_Protocol_Scripts.md#mqttpublish) · [`MQTT.subscribe`](06_Sessions_and_Protocol_Scripts.md#mqttsubscribe) · [`MQTT.unsubscribe`](06_Sessions_and_Protocol_Scripts.md#mqttunsubscribe) · [`MQTT.sessions`](06_Sessions_and_Protocol_Scripts.md#mqttsessions)
* **[TOPIC](06_Sessions_and_Protocol_Scripts.md#topic)** — [`TOPIC.local`](06_Sessions_and_Protocol_Scripts.md#topiclocal) · [`TOPIC.xpath`](06_Sessions_and_Protocol_Scripts.md#topicxpath) · [`TOPIC.test`](06_Sessions_and_Protocol_Scripts.md#topictest)
* **[AUTH](06_Sessions_and_Protocol_Scripts.md#auth)** — [`AUTH.hash`](06_Sessions_and_Protocol_Scripts.md#authhash) · [`AUTH.hash_ok`](06_Sessions_and_Protocol_Scripts.md#authhash_ok) · [`AUTH.login`](06_Sessions_and_Protocol_Scripts.md#authlogin) · [`AUTH.verify`](06_Sessions_and_Protocol_Scripts.md#authverify) · [`AUTH.resend`](06_Sessions_and_Protocol_Scripts.md#authresend) · [`AUTH.token`](06_Sessions_and_Protocol_Scripts.md#authtoken) · [`AUTH.check`](06_Sessions_and_Protocol_Scripts.md#authcheck) · [`AUTH.logoff`](06_Sessions_and_Protocol_Scripts.md#authlogoff) · [`AUTH.list`](06_Sessions_and_Protocol_Scripts.md#authlist) · [`AUTH.unlock`](06_Sessions_and_Protocol_Scripts.md#authunlock)
* **[LDAP_CON](06_Sessions_and_Protocol_Scripts.md#ldap_con)** — [`new LDAP_CON`](06_Sessions_and_Protocol_Scripts.md#new-ldap_con) · [`ld.connect`](06_Sessions_and_Protocol_Scripts.md#ldconnect) · [`ld.bind`](06_Sessions_and_Protocol_Scripts.md#ldbind) · [`ld.search`](06_Sessions_and_Protocol_Scripts.md#ldsearch) · [`ld.modify`](06_Sessions_and_Protocol_Scripts.md#ldmodify) · [`ld.disconnect`](06_Sessions_and_Protocol_Scripts.md#lddisconnect)

### SQL, history, files and the cluster

* **[SQL: a database](07_SQL_History_Files_and_Cluster.md#sql-a-database)** — [`SQL.attach`](07_SQL_History_Files_and_Cluster.md#sqlattach) · [`SQL.disconnect`](07_SQL_History_Files_and_Cluster.md#sqldisconnect) · [`SQL.connect`](07_SQL_History_Files_and_Cluster.md#sqlconnect) · [`SQL.exec_direct`](07_SQL_History_Files_and_Cluster.md#sqlexec_direct) · [`SQL.prepare`](07_SQL_History_Files_and_Cluster.md#sqlprepare) · [`SQL.parameter`](07_SQL_History_Files_and_Cluster.md#sqlparameter) · [`SQL.execute`](07_SQL_History_Files_and_Cluster.md#sqlexecute) · [`SQL.fetch`](07_SQL_History_Files_and_Cluster.md#sqlfetch) · [`SQL.getdata`](07_SQL_History_Files_and_Cluster.md#sqlgetdata) · [`SQL.getrowqty`](07_SQL_History_Files_and_Cluster.md#sqlgetrowqty) · [`SQL.getcolqty`](07_SQL_History_Files_and_Cluster.md#sqlgetcolqty) · [`SQL.getcolname`](07_SQL_History_Files_and_Cluster.md#sqlgetcolname) · [`SQL.close`](07_SQL_History_Files_and_Cluster.md#sqlclose) · [`SQL.errortext`](07_SQL_History_Files_and_Cluster.md#sqlerrortext) · [`SQL.dia`](07_SQL_History_Files_and_Cluster.md#sqldia) · [`SQL.qry`](07_SQL_History_Files_and_Cluster.md#sqlqry)
* **[SQL_CON and SQL_RS: the objects](07_SQL_History_Files_and_Cluster.md#sql_con-and-sql_rs-the-objects)** — [`SQL_CON`](07_SQL_History_Files_and_Cluster.md#sql_con) · [`SQL_RS`](07_SQL_History_Files_and_Cluster.md#sql_rs)
* **[HIS: records and history](07_SQL_History_Files_and_Cluster.md#his-records-and-history)** — [`HIS.cfg`](07_SQL_History_Files_and_Cluster.md#hiscfg) · [`HIS.new`](07_SQL_History_Files_and_Cluster.md#hisnew) · [`HIS.val`](07_SQL_History_Files_and_Cluster.md#hisval) · [`HIS.evt`](07_SQL_History_Files_and_Cluster.md#hisevt) · [`HIS.evtnew`](07_SQL_History_Files_and_Cluster.md#hisevtnew) · [`HIS.alm`](07_SQL_History_Files_and_Cluster.md#hisalm) · [`HIS.ref`](07_SQL_History_Files_and_Cluster.md#hisref) · [`HIS.rec`](07_SQL_History_Files_and_Cluster.md#hisrec) · [`HIS.put`](07_SQL_History_Files_and_Cluster.md#hisput) · [`HIS.row`](07_SQL_History_Files_and_Cluster.md#hisrow) · [`HIS.uid`](07_SQL_History_Files_and_Cluster.md#hisuid) · [`HIS.pending`](07_SQL_History_Files_and_Cluster.md#hispending) · [`HIS.valstat`](07_SQL_History_Files_and_Cluster.md#hisvalstat) · [`HIS.key`](07_SQL_History_Files_and_Cluster.md#hiskey) · [`HIS.dirty`](07_SQL_History_Files_and_Cluster.md#hisdirty) · [`HIS.flush`](07_SQL_History_Files_and_Cluster.md#hisflush) · [`HIS.del`](07_SQL_History_Files_and_Cluster.md#hisdel) · [`HIS.refresh`](07_SQL_History_Files_and_Cluster.md#hisrefresh) · [`HIS.stat`](07_SQL_History_Files_and_Cluster.md#hisstat) · [`HIS.sqltest`](07_SQL_History_Files_and_Cluster.md#hissqltest)
* **[File: plain files](07_SQL_History_Files_and_Cluster.md#file-plain-files)** — [`File.open`](07_SQL_History_Files_and_Cluster.md#fileopen) · [`File.close`](07_SQL_History_Files_and_Cluster.md#fileclose) · [`File.gets`](07_SQL_History_Files_and_Cluster.md#filegets) · [`File.puts`](07_SQL_History_Files_and_Cluster.md#fileputs) · [`File.read`](07_SQL_History_Files_and_Cluster.md#fileread) · [`File.write`](07_SQL_History_Files_and_Cluster.md#filewrite) · [`File.seek`](07_SQL_History_Files_and_Cluster.md#fileseek) · [`File.size`](07_SQL_History_Files_and_Cluster.md#filesize) · [`File.tell`](07_SQL_History_Files_and_Cluster.md#filetell) · [`File.remove`](07_SQL_History_Files_and_Cluster.md#fileremove) · [`File.rename`](07_SQL_History_Files_and_Cluster.md#filerename)
* **[LIC: the licence](07_SQL_History_Files_and_Cluster.md#lic-the-licence)** — [`LIC.list`](07_SQL_History_Files_and_Cluster.md#liclist) · [`LIC.hostid`](07_SQL_History_Files_and_Cluster.md#lichostid)
* **[CLT: the election](07_SQL_History_Files_and_Cluster.md#clt-the-election)** — [`CLT.cfg`](07_SQL_History_Files_and_Cluster.md#cltcfg) · [`CLT.cmd`](07_SQL_History_Files_and_Cluster.md#cltcmd) · [`CLT.info`](07_SQL_History_Files_and_Cluster.md#cltinfo)
* **[REP: replication](07_SQL_History_Files_and_Cluster.md#rep-replication)** — [`REP.cfg`](07_SQL_History_Files_and_Cluster.md#repcfg) · [`REP.test`](07_SQL_History_Files_and_Cluster.md#reptest)
* **[RPC: remote calls](07_SQL_History_Files_and_Cluster.md#rpc-remote-calls)** — [`RPC.test`](07_SQL_History_Files_and_Cluster.md#rpctest)
* **[OPC: OPC UA tools](07_SQL_History_Files_and_Cluster.md#opc-opc-ua-tools)** — [`OPC.test`](07_SQL_History_Files_and_Cluster.md#opctest) · [`OPC.cert`](07_SQL_History_Files_and_Cluster.md#opccert) · [`OPC.browse`](07_SQL_History_Files_and_Cluster.md#opcbrowse) · [`OPC.gen`](07_SQL_History_Files_and_Cluster.md#opcgen) · [`OPC.call`](07_SQL_History_Files_and_Cluster.md#opccall)
* **[PY: calling Python](07_SQL_History_Files_and_Cluster.md#py-calling-python)** — [`PY.CallEvt`](07_SQL_History_Files_and_Cluster.md#pycallevt) · [`PY.CallArg`](07_SQL_History_Files_and_Cluster.md#pycallarg) · [`#PyScript`](07_SQL_History_Files_and_Cluster.md#pyscript)

### Engine modules

* [How a module attaches](08_Engine_Modules.md#how-a-module-attaches)
* **[FILE](08_Engine_Modules.md#file)** — [`FILE.list`](08_Engine_Modules.md#filelist) · [`FILE.exists`](08_Engine_Modules.md#fileexists) · [`FILE.mkdir`](08_Engine_Modules.md#filemkdir) · [`FILE.rmdir`](08_Engine_Modules.md#filermdir) · [`FILE.move`](08_Engine_Modules.md#filemove) · [`FILE.zip`](08_Engine_Modules.md#filezip)
* **[IMG](08_Engine_Modules.md#img)** — [`IMG.decode`](08_Engine_Modules.md#imgdecode) · [`IMG.encode`](08_Engine_Modules.md#imgencode) · [`IMG.gray`](08_Engine_Modules.md#imggray) · [`IMG.hsv`](08_Engine_Modules.md#imghsv) · [`IMG.crop`](08_Engine_Modules.md#imgcrop) · [`IMG.resize`](08_Engine_Modules.md#imgresize) · [`IMG.threshold`](08_Engine_Modules.md#imgthreshold) · [`IMG.inrange`](08_Engine_Modules.md#imginrange) · [`IMG.stats`](08_Engine_Modules.md#imgstats) · [`IMG.hist`](08_Engine_Modules.md#imghist) · [`IMG.count`](08_Engine_Modules.md#imgcount) · [`IMG.moments`](08_Engine_Modules.md#imgmoments) · [`IMG.absdiff`](08_Engine_Modules.md#imgabsdiff) · [`IMG.blur`](08_Engine_Modules.md#imgblur) · [`IMG.label`](08_Engine_Modules.md#imglabel) · [`IMG.rect`](08_Engine_Modules.md#imgrect) · [`IMG.line`](08_Engine_Modules.md#imgline) · [`IMG.text`](08_Engine_Modules.md#imgtext) · [`IMG.lut`](08_Engine_Modules.md#imglut) · [`IMG.grid`](08_Engine_Modules.md#imggrid) · [`IMG.align`](08_Engine_Modules.md#imgalign) · [`IMG.shift`](08_Engine_Modules.md#imgshift) · [`IMG.lines`](08_Engine_Modules.md#imglines) · [`IMG.channel`](08_Engine_Modules.md#imgchannel) · [`IMG.erode`](08_Engine_Modules.md#imgerode) · [`IMG.dilate`](08_Engine_Modules.md#imgdilate) · [`IMG.sobel`](08_Engine_Modules.md#imgsobel) · [`IMG.match`](08_Engine_Modules.md#imgmatch)
* **[CAM](08_Engine_Modules.md#cam)** — [`CAM.list`](08_Engine_Modules.md#camlist)
* **[GPIO](08_Engine_Modules.md#gpio)** — [`GPIO.chips`](08_Engine_Modules.md#gpiochips) · [`GPIO.info`](08_Engine_Modules.md#gpioinfo) · [`GPIO.pwm`](08_Engine_Modules.md#gpiopwm) · [`GPIO.sim`](08_Engine_Modules.md#gpiosim)
* **[I2C and SPI](08_Engine_Modules.md#i2c-and-spi)** — [`I2C.scan`](08_Engine_Modules.md#i2cscan) · [`I2C.sim`](08_Engine_Modules.md#i2csim) · [`SPI.sim`](08_Engine_Modules.md#spisim)
* **[NET](08_Engine_Modules.md#net)** — [`NET.ver`](08_Engine_Modules.md#netver)

### Connection and protocol types

* [The shape of a connection](09_Connection_and_Protocol_Types.md#the-shape-of-a-connection)
* [Fields every connection reads](09_Connection_and_Protocol_Types.md#fields-every-connection-reads)
* [Fields every protocol reads](09_Connection_and_Protocol_Types.md#fields-every-protocol-reads)
* **[Transports](09_Connection_and_Protocol_Types.md#transports)** — [`CON.tcp`](09_Connection_and_Protocol_Types.md#contcp) · [`CON.udp`](09_Connection_and_Protocol_Types.md#conudp) · [`CON.tls`](09_Connection_and_Protocol_Types.md#contls) · [`CON.ser`](09_Connection_and_Protocol_Types.md#conser) · [`CON.ws`](09_Connection_and_Protocol_Types.md#conws) · [`CON.wss`](09_Connection_and_Protocol_Types.md#conwss) · [`CON.sql`](09_Connection_and_Protocol_Types.md#consql) · [`CON.sqlite`](09_Connection_and_Protocol_Types.md#consqlite) · [`CON.ssh`](09_Connection_and_Protocol_Types.md#conssh) · [`CON.cam`](09_Connection_and_Protocol_Types.md#concam) · [`CON.gpio`](09_Connection_and_Protocol_Types.md#congpio) · [`CON.i2c`](09_Connection_and_Protocol_Types.md#coni2c) · [`CON.spi`](09_Connection_and_Protocol_Types.md#conspi) · [`CON.raw`](09_Connection_and_Protocol_Types.md#conraw) · [`CON.hid`](09_Connection_and_Protocol_Types.md#conhid) · [`#link`](09_Connection_and_Protocol_Types.md#link)
* **[Protocols](09_Connection_and_Protocol_Types.md#protocols)** — [`PRO.raw`](09_Connection_and_Protocol_Types.md#proraw) · [`PRO.sql`](09_Connection_and_Protocol_Types.md#prosql) · [`PRO.modbus`](09_Connection_and_Protocol_Types.md#promodbus) · [`PRO.http`](09_Connection_and_Protocol_Types.md#prohttp) · [`PRO.rest`](09_Connection_and_Protocol_Types.md#prorest) · [`PRO.soap`](09_Connection_and_Protocol_Types.md#prosoap) · [`PRO.mcp`](09_Connection_and_Protocol_Types.md#promcp) · [`PRO.telnet`](09_Connection_and_Protocol_Types.md#protelnet) · [`PRO.rfid`](09_Connection_and_Protocol_Types.md#prorfid) · [`PRO.bridge`](09_Connection_and_Protocol_Types.md#probridge) · [`PRO.mqtt`](09_Connection_and_Protocol_Types.md#promqtt) · [`PRO.clt`](09_Connection_and_Protocol_Types.md#proclt) · [`PRO.rep`](09_Connection_and_Protocol_Types.md#prorep) · [`PRO.rpc`](09_Connection_and_Protocol_Types.md#prorpc) · [`PRO.snmp`](09_Connection_and_Protocol_Types.md#prosnmp) · [`PRO.opc`](09_Connection_and_Protocol_Types.md#proopc) · [`PRO.smtp`](09_Connection_and_Protocol_Types.md#prosmtp) · [`PRO.ftp`](09_Connection_and_Protocol_Types.md#proftp) · [`PRO.sftp`](09_Connection_and_Protocol_Types.md#prosftp) · [`PRO.cam`](09_Connection_and_Protocol_Types.md#procam) · [`PRO.vision`](09_Connection_and_Protocol_Types.md#provision) · [`PRO.gpio`](09_Connection_and_Protocol_Types.md#progpio) · [`PRO.reg`](09_Connection_and_Protocol_Types.md#proreg)
* **[Not in this repository's bin](09_Connection_and_Protocol_Types.md#not-in-this-repositorys-bin)** — [`PRO.s7pro`](09_Connection_and_Protocol_Types.md#pros7pro)

<!-- index:end -->
