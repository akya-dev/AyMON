# Scripting

Run **PRJEDU_101** and **PRJEDU_sqlite** first. Between them they use most of
what is here.

---

## Where script lives

Scripts are elements, declared in the document's `<config>` section:

```xml
<config>
  <script id="main" xdb_fnc="[SCR.prs]" src="%DB%/db_HIS.js" language="JScript"
          sta="0x0303" sta_typ="0x142"></script>
</config>
```

| Field | Meaning |
|---|---|
| `id` | **The module name.** Its functions are reached as `main.foo()` — not the file name |
| `xdb_fnc="[SCR.prs]"` | Binds the loader. **Without it the script is never loaded and no error is given** |
| `src` | The file. Path macros work: `%DB%`, `%PRJ%`, `%BIN%`, `%ROOT%`. Leave it out and the element's own text is the source |
| `language` | `JScript` is the default. `Python` runs through the engine's Python module and needs a 64-bit Python 3.11 or 3.13: every `bin` directory has a module for each. On Windows a project's own `Python311-64` / `Python313-64` folder under its root wins, then the newest Python found on the search path; `AYMON_PYTHON_VER=3.11` pins one. See `PRJEDU_gauge` (numpy and camera frames), and `PRJEDU_pycall` for calling it (below) |

The file must be **UTF-8**. A small helper does not need a file at all:

```xml
<script id="util" xdb_fnc="[SCR.prs]"><![CDATA[
function kw(v) { return Number.toFixed((0.0 + v) / 1000, 2) + " kW"; }
]]></script>
```

## How the XML calls it

There is no `main()`. Script runs because the engine called it, mostly in three
situations (a protocol hook and a web page, further down, are two more):

**1 — A name in a `*_fnc` chain.**

```xml
<var id="T_READ" evt_fnc="[main.read]" .../>
<io  id="LEVEL"  val_fnc="[VAL.cnv,ATR.rou,main.log_it]" .../>
```

**2 — A life-cycle hook on the document root.** These are written as an
expression — a call, not just a name:

```xml
<xdb xdb_init="main.init(evt);" xdb_start="main.start(evt);">
```

`xdb_init` runs while the document is being set up (this is where you write
configuration such as a connection string); `xdb_wait` when its connections are
about to come up; `xdb_start` once everything is up. On a cluster's spare
`xdb_init` and `xdb_wait` run and `xdb_start` waits until it is master. A syntax
error inside a function is found when that function is first called, not when
the file loads.

A value written from `xdb_init` or `xdb_start` — or queued from there — counts
as an **update**, not a command: a `PRO.out` in its chain does not send it, and
several chain functions do nothing with it. An output that must go to a device
at start is written from a timer (an `evt_*` with a short delay), not from the
life-cycle hook.

**3 — Inside an address**, which is how a web front end reaches your code:

```
doc('HIS/S00')/api.recent(10)
```

> **The `api` module is a convention with teeth.** A call arriving from
> outside the engine can reach only the `api.` scope; other modules are
> reserved for local calls with an engineer-level role. Put the functions the
> outside world may call in a module named `api`.

## The function you write

```js
function read(evt)
{
    var n = evt.obj.cnt + 1;      // the element this event is on
    evt.obj.cnt = n;

    var v = 20.0 + 8.0 * Math.sin(0.05 * n);
    evt.SetValue("id('ALARM')/@val", v);
    return 0;
}
```

Every function called through a chain receives one argument, `evt`:

| | |
|---|---|
| `evt.obj` | The element this event is on |
| `evt.valn` / `evt.valp` | The value being written / the previous one |
| `evt.stan` / `evt.stap` | The same for `sta` |
| `evt.atr` | Which attribute is being written |
| `evt.user_role` | Who caused it (0–7 user, 8 document, 9 system) |

| Method | |
|---|---|
| `evt.GetValue('adr')` | Read |
| `evt.SetValue('adr', v)` | Write |
| `evt.MskValue` / `XorValue` / `AddValue` | Masked / bitwise / arithmetic update |
| `evt.GetElement` / `AddElement` / `DelElement` | Element operations |
| `evt.ForEach(adr, 'handler(evt, idx, prm)', prm)` | Loop over elements |
| `evt.QueValue(adr, v, pri, delay_ms, syn, thr)` | Do it later, or on another thread |
| `evt.Log(level, str)` | `0` PANIC · `3` ERROR · `4` WARN · `6` INFO · `7` DEBUG |

Adding an element built from text takes three steps, and the second is
easy to miss: parse it (`-1` turns the XDB fields on; older engines did not
index the new element without it), then take it out of the little document it
was parsed into, because `AddElement` only takes a node that belongs to no
document (it returns 0 otherwise). `PRJPER_adsb` does it once per aircraft:

```js
var x = new XML("<ac id=\"AC_4B1805\" sta=\"0x0303\" val=\"0\"/>", -1);
var ac = x['ac'];
x.removeChild(ac);
evt.AddElement("id('SKY')", ac);           // 1 = added
evt.DelElement("id('AC_4B1805')");          // and gone again
```

An element added this way is replicated like any other new element: a mirror
or a spare gets it at once, as long as it has an `id` of its own (engine
4.4.1.673 and later; older engines kept it in this engine only). A list that
must keep a fixed number of items and give each one an id is still simpler
with `ELM.new` — write what the new element should hold into the list's
`@new`, and a script of yours (`new_elm_new_eval`) fills it in.
`PRJEDU_cluster` keeps its batch list that way:

```xml
<list id="LOG" new="" new_typ="0x1401" new_fnc="[ELM.new]"
      new_elm_new="item" new_elm_new_pos="0" new_elm_new_idatr="id"
      new_elm_new_max="B10" new_elm_new_eval="main.fill_item(evt);"/>
```

`new_elm_new_max="B10"`: ids `B01` … `B10`, ten kept. In `fill_item`,
`evt.obj` is the new element and `evt.valn` what was written; return 1 to
keep it.

## Addresses

An address names an element and an attribute:

```js
evt.GetValue("id('LEVEL')/@val")                    // same document
evt.GetValue("doc('PRC/P01')/id('LEVEL')/@val")     // another document
evt.GetValue("doc('PRC/P01')/count(data/var)")      // a function over it
evt.GetValue("count(id('L_RECENT')/item)")          // same document, counted
```

`id('X')` is indexed — it does not walk the tree, so it is cheap even in a
document with thousands of elements.

> **`doc()` comes first, the function after it.**
> `doc('X')/count(data/var)` works; `count(doc('X')/data/var)` silently
> answers a wrong number (it counted 2 where there were 4). The same order
> applies to `xml(...)` and `json(...)`. Every address function is in
> [the reference](reference/03_Events_Documents_and_Addresses.md).

The document may live in another engine. The address stays the same: a
`<doc id="X" rpc_con="CN_S01">` line says how to reach it, and the same script reads
and writes it. Such a call waits on the thread that makes it, and inside a `try` a
failed one throws with the reason in `e.message`. `10_Two_Engines` has the rest and
`PRJEDU_remote` shows it.

## Eight places this is not JavaScript

The language is close enough to JavaScript to be readable and different enough
to bite. These eight are the ones that actually cost people an afternoon.

**1 — Arithmetic is typed, and the LEFT operand decides.**

```js
var c = 1234;               // an integer
c / 12                      // 102
c / 12.0                    // 102 as well: the left operand is still an integer
(0.0 + c) / 12              // 102.833333333333: what you meant
c.toFLT() / 12              // the same
20 + 0.22                   // 20
Math.round(x) / 100.0       // still an integer: Math.round returned one
```

There is no error and no log line. A decimal point on the **right** changes
nothing: make the **left** operand a float, with `0.0 + c` or `c.toFLT()`. A
value read from a `0x0308` attribute is a float already.

**2 — `x == ""` does not catch a missing value.** A missing JSON key, an
element that is not there, an attribute read as a member (`elm.nope`) and an
SQL NULL all arrive as `undefined`. One case does not: `evt.GetValue` of an
attribute that an existing element does not have answers an empty text `""`,
so `x == null` is false there. Use `!x` for "missing or empty" — it is true
for all of them — and `x == null` only where the value cannot be an empty text.

**3 — Ordering operators with `undefined` are not JS.** `undefined < 1` is
true. Do not rely on them; test for the missing value first.

**4 — Hex values stay hex.** Arithmetic on a hex-subtype value (such as
`evt.stan`) produces a hex result, so a result you print or concatenate reads as
hex. Comparing works by number, against a number or a hex text alike. Measured
on `sta` = `0x0303`:

```js
h + 1                 // 0x0304, not 772
h == 771              // true
h == "0x0303"         // true
(h & 3) == 3          // true: this is how to test a run state
```

**5 — `switch`, `do`, classes, `async`/`await`, template strings, destructuring,
spread and real regular expressions do not exist.** `var`/`let`/`const`,
`if`/`for`/`while`, `for (x in obj)`, `try`/`catch`/`finally`, `throw`,
`?:`, `??`, `?.`, arrow functions with their parentheses (`(x) => x + 1`, not
`x => x + 1`) and object/array literals all do. A `do` or a bare `x =>` is a
syntax error. Inside a function it is reported when that function is first
called, and only that function fails; at the top of the file, outside every
function, it takes the whole module with it (every call answers
`object.function not found`). A regex
literal is accepted only for plain text and is turned into a string at compile
time; a metacharacter in one is a **compile error** with a line and column,
not a silent wrong answer.

**6 — String indices are characters, not bytes.** `String.length` counts
characters, `String.size` counts bytes. The difference only shows up outside
ASCII — which means it shows up in production and not in your test.

**7 — An integer attribute can be unsigned.** In `val_typ` the class
`0x01..` is UNSIGNED and `0x02..` signed: `0x0104` is an unsigned 32-bit
integer, `0x0204` a signed one, `0x0108` / `0x0208` the 64-bit pair. Read an
unsigned value and subtract, and the result does not go negative, it wraps:

```js
// U32 is val="3" val_typ="0x0104",  I32 the same with val_typ="0x0204"
get(evt, "U32") - 5              // 4294967294
get(evt, "I32") - 5              // -2
parseInt("" + get(evt, "U32")) - 5   // -2
```

Keep time stamps and anything you subtract in a signed type (`0x0208` for
milliseconds), or read it through `parseInt`. `Time.GetTimeMs()` itself is
signed from engine 4.3.4.466 on; before that it was unsigned and
`now - later` wrapped the same way — `0.0 + Time.GetTimeMs()` is the old
remedy, and it still works.

**8 — The library's names mean something else.** Measured:

```js
"aXbXc".replace("X", "-")       // "a-b-c": every match, not the first
[1].push(5)                     // 0: a result code, not the new length
[10, 9, 1].sort()               // [1, 9, 10]: by value, not as text
if (true) { let q = 5; } q      // 5: let has no block scope
```

## Decimals and times

A `double` cannot hold money, and a number cannot hold an offset. Two types carry
more, and both live in an attribute with no allocation:

| | `val_typ` | Script | Text |
|---|---|---|---|
| decimal, 28 digits, scale kept | `0x030C` (`0x130C` with a chain) | `"12.50".toDEC()`, `x.toDEC(2)` | `12.50` |
| time, an instant with its offset | `0x0248` | `"2026-10-01T12:00:00+03:00".toDTM()`, `Time.now()` | `2026-10-01T12:00:00.000+03:00` |
| date, zone-free | `0x0244` | `"2026-10-01".toDATE()` | `2026-10-01` |
| time of day | `0x0254` | `x.toTIME()` | `09:30:00.123` |
| duration, with months and days | `0x0258` | `"P1M".toDUR()` | `P1M` |

```js
var a = "12.50".toDEC();
a + 1                    // 13.50: a decimal
1 + a                    // 14: the left operand decides, and it is an integer (difference 1)
var t = "2026-10-01T12:00:00+03:00".toDTM();
t + 1000                 // a second later: t ± a number keeps a time
t - t2                   // milliseconds
"2026-10-01".toDATE() + "P1M".toDUR()   // 2026-11-01
```

A decimal rounds half away from zero, and `x/0` is 0 as with floats. Times compare by
instant, whatever their offset. Text with no offset means **local** time. A value
that is not one of these, written to an attribute declared as one, is **refused** with
one `ERROR` line, and the attribute keeps its value.

SQL decimal columns answer decimals through ODBC (SQL Server, PostgreSQL); the
built-in SQLite driver answers a `DECIMAL` column as a float (`12.50` comes back
as `12.5`). Date-and-time columns answer time values when the
`<con>` says `con_dtm="1"`. In Python they arrive as `decimal.Decimal`, `datetime`,
`date` and `timedelta`, and go back the same way.

## What is built in

Every name below has a full entry — arguments, what comes back, an example
with its measured result — in the [Reference](reference/README.md). This
table is the map.

| Scope | | Reference |
|---|---|---|
| `Math` | `abs floor ceil round trunc sign min max pow sqrt log exp sin cos tan atan2 random` | [01_Language](reference/01_Language.md) |
| `String` | search, slice, case, trim, split, replace, pad, `fromCharCode` | [01_Language](reference/01_Language.md) |
| `Array` `Number` `Object` `JSON` `Buffer` | the usual, with the differences above | [01_Language](reference/01_Language.md) |
| `Time` | `now` `GetTimeStr` `FmtTimeStr` `GetTimeMs` `ParseTimeMs` `AddDurationMs` `SleepMs` | [02_Time_Text_and_Codecs](reference/02_Time_Text_and_Codecs.md) |
| `CODEC` | `B64_enc/dec` `Z64_enc/dec` `HEX_enc/dec` `JWT_sign/verify/dec` | [02_Time_Text_and_Codecs](reference/02_Time_Text_and_Codecs.md) |
| `RES` | the result codes a hook returns: `RES.OKY`, `RES.INF_SUB_CONTINUE` … | [02_Time_Text_and_Codecs](reference/02_Time_Text_and_Codecs.md) |
| `Blob` | `from`, `live`: large binary values, below | [02_Time_Text_and_Codecs](reference/02_Time_Text_and_Codecs.md) |
| `BYTES` | read and make bytes: `i16be`, `u32le`, `text`, `hex`, `make`, `crc8` … (`09_Pins_and_Buses`) | [02_Time_Text_and_Codecs](reference/02_Time_Text_and_Codecs.md) |
| `evt` `xdb` | the event and the document: `GetValue`, `SetValue`, `QueValue`, `ForEach`, `Log` … | [03_Events_Documents_and_Addresses](reference/03_Events_Documents_and_Addresses.md) |
| `File` | `open close read gets write puts seek size tell remove rename` | [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md) |
| `SQL` | see below | [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md) |
| `HIS` | records and history (`11_Records_and_Saving`) | [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md) |
| `CLT` `REP` | the cluster's state, replication (`10_Two_Engines`) | [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md) |
| `AUTH` `MQTT` `TOPIC` | logins and tokens; publishing and subscribing from script | [06_Sessions_and_Protocol_Scripts](reference/06_Sessions_and_Protocol_Scripts.md) |
| `LIC` | the licence's own list, `LIC.list()` | [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md) |
| `FILE` | `list exists mkdir rmdir move zip` — directories and ZIP archives, from the module `AyLIB_net` (`PRJEDU_net`) | [08_Engine_Modules](reference/08_Engine_Modules.md) |
| `IMG` `CAM` | image functions on blobs and the camera list, from the module `AyLIB_vision` (`PRJEDU_gauge`, `PRJEDU_vision`) | [08_Engine_Modules](reference/08_Engine_Modules.md) |
| `GPIO` `I2C` `SPI` | the board's lines and buses, from the module `AyLIB_hw` (`09_Pins_and_Buses`) | [08_Engine_Modules](reference/08_Engine_Modules.md) |

`FILE`, `IMG`, `CAM`, `GPIO`, `I2C` and `SPI` live in engine modules beside the
engine in `bin`; the first call attaches the module, no `xdb_lib` needed.

Reaching files takes a role. **`FILE` needs Engineer or above**, so it is refused
to a script started from a page or a command of anyone below that, logged in or
not; the engine's own timers run as the engine (`PRJEDU_net` makes its report on
a timer for that reason). `FILE.rmdir` and the source of `FILE.move` work only
below `%PRJ%` and `%DB%`. **`File.open`, `remove` and `rename` need role 3
(Operator) or above**: `xdb_file_role` on the root changes that, and
`xdb_file_dirs` confines every script, the engine's own too, to a list of
directories (`06_Access_and_Safety`).

There is no `Date`. `Time.now()` (engine 4.3.4.530 and later) is the instant
as a time value, with all the precision the clock has
(`2026-11-04T00:21:26.602876500-07:00`), and `t2 - t1` is milliseconds. The text
stamp most examples log is `Time.GetTimeStr(0)` → `2026-09-20 22:31:04`.

**Every scope documents itself**, and the key is always lower-case `help`
(the engine modules' scopes — `FILE`, `IMG`, `GPIO` … — keep theirs under a
function's name: `FILE.help_list`, `IMG.help_decode`):

```js
evt.Log(4, Math.help);
evt.Log(4, SQL.help);
evt.Log(4, evt.help);
evt.Log(4, Object.keys(Math));
```

That is the live list. If anything here disagrees with it, believe the engine.
The same texts answer in the console (CTRL-X, then `help` or `help Math`) and
in a telnet shell; [Ask the engine](reference/README.md#ask-the-engine) says
what to type for what, and which scopes the list leaves out.

## The engine functions you put in chains

These are normally written in **XML**, not called from script. The names you
will meet in the examples are below; every one of them, with the attributes it
reads, is in [04_Attribute_and_Element_Functions](reference/04_Attribute_and_Element_Functions.md),
[05_Alarms_Conditions_and_Protocol_Chains](reference/05_Alarms_Conditions_and_Protocol_Chains.md)
and, for `SQL.qry` and `HIS`, [07_SQL_History_Files_and_Cluster](reference/07_SQL_History_Files_and_Cluster.md).

| Scope | What it does | Seen in |
|---|---|---|
| `ATR.rou` `ATR.lmt` | round to `val_rou`, clamp to `val_min`/`val_max` | 101, modbus |
| `VAL.put` `VAL.cnv` | `pro` → `val`, and scale it | modbus |
| `ALM.onlvl` | compare with the six limits (warning, alarm, emergency; each low and high), set the alarm bits in `sta` | 101, modbus, rep |
| `PRO.pol` `PRO.sta` `PRO.inp` | poll, state, distribute a block | modbus |
| `EVT.sta` `THR.sta` | let `sta` start and stop a timer or thread | all |
| `XDB.evt` `THR.cre` `SCR.prs` | create the timer / thread / script object | all |
| `SQL.qry` | run the SQL in `@qry` and turn the rows into elements | sqlite |
| `IF.*` | when the condition fails, skip what follows up to its `IF.else` or `IF.end` (the value is still stored); `IF.chg` goes on only when the value changed | — |
| `HIS.val` `HIS.evt` | a value's history, an event record (`11_Records_and_Saving`) | — |
| `HIS.cfg` `HIS.new` | make a history sink, take a record into it | — |
| `REP.cfg` | work out this node's end of a replication link | rep, cluster |
| `CLT.cfg` `CLT.cmd` | the same for an election link; a hand-over written to `pro_clt_cmd` | cluster |
| `ELM.new` | make an element from what was written to `@new` | cluster |
| `PRO.out` | send what was written to `pro` to the device; the value is not stored and the chain ends there — the device's answer comes back into the same `pro` and runs the functions after `PRO.out` (4.3.4.559 and later) | snmp, mqtt, net |
| `PRO.outc` | the same, but the chain goes on with the value written — for a point nothing ever reads back | — |

## Script can also speak a protocol

A connection whose protocol is `PRO.raw` has none of its own: the engine moves
the bytes and `pro_onparse` hands them to a function of yours, which decides
where one frame ends and may answer on the same socket.

```js
function onparse(exc)
{
    var n = exc.buf_recv.len - exc.buf_recv.pos;
    var b = exc.buf_recv.copy(exc.buf_recv.pos, n);   // bytes; b[0] is a number
    exc.buf_recv.pos = exc.buf_recv.len;              // consumed

    exc.buf_send.remove();
    exc.buf_send.append(CODEC.HEX_dec("300b0201 00")); // text -> bytes
    exc.send();
    return RES.OKY;                                    // frame done
}
```

`CODEC.HEX_dec` and `HEX_enc` are how a script builds and reads binary: an
array of numbers is **not** a byte source, and a byte in a copied buffer
cannot be written through its index. Returning `RES.INF_SUB_CONTINUE` after
setting `exc.buf_recv.nxt` asks for more bytes instead.

Three things catch everyone:

* **Advance `pos`.** A hook that returns `RES.OKY` without moving it is called
  again with the same bytes; the engine stops after 200 turns with
  `on_parse2 cnt>200`.
* **A frame cut in two is kept if you ask for the rest.** Return
  `RES.INF_SUB_CONTINUE` with `exc.buf_recv.nxt` set and the bytes from `pos` on stay
  with the session: the next call sees them in front of what arrives next, on TCP
  too (`PI`, then `NG\n` 400 ms later, arrives as one `PING\n`). Two frames in one
  read are two calls. Anything else you need between calls — a counter, a state —
  goes in `exc.ses.mem`, an object per session that survives between calls.
* **A script error is not a return value.** It is logged and the engine falls back
  to its built-in behaviour for that exchange.

| Hook | When |
|---|---|
| `pro_onparse` | bytes arrived |
| `pro_onaccept` | a server's connection was accepted, before the first read: for a protocol whose server speaks first. `RES.OKY` keeps it, an error closes it |
| `pro_onclose` | an accepted connection ended, after its last bytes went through `pro_onparse`: an FTP upload ends this way |
| `pro_onpol`, `pro_onout` | a poll and a write, on a bus or any `PRO.raw` device (`09_Pins_and_Buses`) |

`PRJEDU_snmp` does this for real: its device end is an SNMP v2c agent in
script, because `PRO.snmp` is a manager and does not answer. Reach for it when
the protocol is not one the engine knows — and expect to keep the parsing
small; a format that turns out to matter belongs in a plug-in later.

## Script can also write a web page

A file under an HTTP connection's `pro_http_root` whose name ends in `.ayp`
is a **server page**: the engine runs it on every request and answers with
what it writes. It is a script with HTML around it, in the syntax ASP, JSP
and EJS use:

```html
<% var t = main.tank(evt, "T1"); -%>
<p><%= t.name %>: <%= t.level %> %</p>
<% if (t.alarm > 0) { %><p class="alarm"><%= t.text %></p><% } %>
```

An output tag with `=` escapes what it writes, one with `-` does not. Do not write
an empty one, even inside an HTML comment: the page is refused.

A page sees `evt`, `req` (`req.getForm("sp")` reads a form field), `res`
(`res.status`, `res.type`, `res.header`, `res.redirect`), `ses`, `exc` and your
modules by name — `main.tank()` above is an ordinary function in the
document's script. Everything in this guide holds inside a page: typed
arithmetic, `evt.GetValue` addresses, `return` to stop early. Statements need
their `;` (there are no automatic semicolons). A page that fails answers
**500** and logs why, with the template's line number; its source is never
sent.

`PRJEDU_pages` is built this way, and `PRJEDU_oee` adds a printable shift
report (`www\report.ayp`) to an existing project. A page runs with the
visitor's rights, and a visitor can log in with a plain form the engine
answers (`ses.user` and `ses.user_role` tell the page who it is) — see
`06_Access_and_Safety.md`.

## Calling Python

A Python script (`language="Python"`) runs on the engine's one Python thread.
A function in it marked `@xdb_fnc` becomes callable from the XML and from
JScript, under the script's `id`:

```python
@xdb_fnc
def analyse(evt):             # one parameter named evt: an EVENT call
    blk = json.loads(evt.valn)
    xdb.SetValue("id('RMS')/@val", rms)

@xdb_fnc
def forecast(limit, stamp):   # anything else: an ARGUMENT call
    xdb.SetValue("id('FORECAST')/@val", json.dumps(out))
```

```xml
<var id="WAVE" val_typ="0x1401" val_fnc="[vib.analyse]"/>
```

```js
var q = vib.forecast(4.5, Time.GetTimeMs());   // q = 1: queued
```

**Both are asynchronous.** The call goes into the Python thread's queue and
the caller goes on; JScript gets `1` ("queued") or `0` (it was not), never the
function's result.
The result comes back the way every value does: Python writes it into a point,
and that point runs its own `val_fnc` — rounding, alarms — like any
measurement. In an event call the engine stores the attribute itself after the
function returns. `PRJEDU_pycall` measures both calls on every call, and shows
what happens when Python is slower than the data.

## Pictures and other large values: blobs

A camera frame does not belong in a string. An attribute declared as a blob
(`val_typ="0x050E"`, `0x150E` with its `val_fnc`) holds large binary data by
reference: writing it, reading it, handing it to a `val_fnc` or to Python
never copies the bytes. MQTT and JSON show only a descriptor, and a saved
XML leaves the attribute empty (a blob is not persistent):

```
{"blob":1,"len":13890,"fmt":"jpeg","seq":24,"tim":0}
```

```js
var b = Blob.from(buf, { fmt: "jpeg", seq: n });  // bytes in: one copy, numbered
b.len  b.fmt  b.seq  b.w  b.h  b.dtype            // read-only; no b[i]
var s = IMG.stats(frame, { x: 60, y: 60, w: 120, h: 120 });   // AyLIB_vision, in C
var j = IMG.encode(frame, "jpeg", 80);
```

From Python a numpy array becomes a blob with one copy, and a raw blob comes back
as a read-only numpy view with none (an encoded one, a JPEG, as a read-only
`memoryview`). A `PRO.http` connection with `pro_blob="/blob"` serves the bytes
from memory, once (`GET /blob/DOC/NODE/ID/val`) or as an MJPEG stream
(`?stream=1`). The `IMG.*` functions come from the engine module `AyLIB_vision`,
attached by the first call. `PRJEDU_gauge` uses all of it, and keeps the old way
(a base64 PNG in a string on MQTT) one button away, to compare.

`xdb_blb_max` on the root limits one blob (64 MiB by default). Replication skips
blobs. `Clear: Done (blobs alive: N)` at a clean stop should say 0.

## SQL from script

The shape never changes:

```js
var con = SQL.attach('CN_SQL');          // borrow from the <con>'s pool
var rs  = SQL.exec_direct(con, sql);     // or prepare / parameter / execute
while (SQL.fetch(rs)) { ... SQL.getdata(rs, 1) ... }
SQL.close(rs);                           // always
```

`con` is a loan from the connection's pool and goes back by itself when the
variable dies, so a long function holds its link for as long as it runs:
`SQL.disconnect(con)` gives it back early, and a later call on that loan answers
null with one `ERROR` line. Closing the **result set** is what you owe.

The pool is the `<con>`'s session list: `con_ses` links (one if absent), each opened
when first needed and closed by its own `con_idletmo`. A borrower that finds them all
busy waits up to `pro_tmo`; `SQL pool exhausted` then names who holds each link.
A `<dev pro_con>` under a SQL connection is a database of its own: `SQL.attach("CN",
"DEV")`.

* Use `prepare` / `parameter` / `execute` the moment a **value** goes into the
  statement. A bound value is data and never becomes SQL. `PRJEDU_sqlite`
  proves it by storing a tag called `x'; DROP TABLE reading; --` every tenth
  reading; the table is still there.
* **`SQL.getdata(rs, n)` counts from 1**, not from 0.
* **An SQL NULL comes back as `undefined`** — see difference 2 above.
* `SQL.qry` is the other way in: write SQL into a `<list>` element's `@qry` and
  every row becomes an `<item>` whose attributes are named after the columns.
  After that the rows are addressable: `id('L_RECENT')/item[1]/@val`. The old rows
  go only after the query has run: a failed query leaves them, and `<atr>_err` and
  the log say why.
* History does not need any of this: the engine writes it (`11_Records_and_Saving`).

## Debugging

There are no breakpoints and no stepping, **on purpose**: a script runs on a
connection, timer or worker thread which may be holding a session lock, and
stopping it would not debug the system, it would freeze it. Instead:

| | |
|---|---|
| `evt.Log(4, ...)` | The first tool. The examples use nothing else |
| `SCR.trace` | Statement trace |
| `SCR.prof` | Function timings |
| `SCR.dump` | Dump a scope |

A syntax error is reported with line, column and the source line. A runtime
error is reported with a call stack — **unless it is inside a `try`/`catch`**,
which swallows it. If you expect an error in the log and there is none, look
for the `catch`.

## Checklist

1. Does the `<script>` element have `xdb_fnc="[SCR.prs]"`? Without it nothing
   loads and nothing is logged.
2. Are the functions the outside world may call in a module called `api`?
3. Where you meant a decimal, is the LEFT operand a float (`(0.0 + c) / 12`)? A point on the right is not enough.
4. Are you testing for a missing value with `!x` (or `x == null` where it cannot be `""`), not `x == ""`?
5. Is a run state tested with `(sta & 0x0003) == 3`, not by comparing a whole `sta`?
6. Every `SQL.exec_direct` / `prepare` matched by a `SQL.close`?
7. Is the `val_typ` of anything with a `val_fnc` carrying a run bit? ([Timers and events](02_Timers_and_Events.md))
8. Is everything you subtract signed - a time stamp in a `0x0208` attribute, an
   unsigned (`0x01..`) value read through `parseInt`? (item 7)
9. Does a function that runs because a page wrote into ANOTHER document (the
   page's MQTT connection belongs to one document, the element to another)
   write a local attribute (`val_typ` `0x4...`)? Local attributes refuse
   writes that come from outside their document - silently.
   (`PRJEDU_robotarm`, `PSTOP_MS`)
10. Is every `val_fnc`, `pro_fnc` and `sta_fnc` at most 63 characters long? A
    longer one is cut and none of it runs, with no log line
    ([Timers and events](02_Timers_and_Events.md)).
