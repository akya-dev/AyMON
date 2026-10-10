# 3 — Scripting

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
| `language` | `JScript` is the default. `Python` runs through the engine's Python module (`AyLIB_Python`, in `bin\win-x64`) and needs an installed 64-bit Python 3.11 — see `PRJEDU_gauge` (numpy and camera frames), and `PRJEDU_pycall` for calling it (below) |

The file must be **UTF-8**. A small helper does not need a file at all:

```xml
<script id="util" xdb_fnc="[SCR.prs]"><![CDATA[
function kw(v) { return Number.toFixed(v / 1000.0, 2) + " kW"; }
]]></script>
```

## How the XML calls it

There is no `main()`. Script runs in exactly three situations:

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
configuration such as a connection string); `xdb_start` runs once everything
is up.

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

Adding an element built from text takes three steps, and the first two are
easy to miss: parse it with `-1` (the XDB fields on — without it `id()`
never finds the new element), then take it out of the little document it
was parsed into, because `AddElement` only takes a node that belongs to no
document (it returns 0 otherwise). `PRJPER_adsb` does it once per aircraft:

```js
var x = new XML("<ac id=\"AC_4B1805\" sta=\"0x0303\" val=\"0\"/>", -1);
var ac = x['ac'];
x.removeChild(ac);
evt.AddElement("id('SKY')", ac);           // 1 = added
evt.DelElement("id('AC_4B1805')");          // and gone again
```

An element added this way lives in **this engine only**: replication does not
carry it, so a mirror or a spare never sees it. When the list is part of a
replicated document, let the list make its own elements with `ELM.new` —
write what the new element should hold into the list's `@new`, and a script
of yours (`new_elm_new_eval`) fills it in. `PRJEDU_cluster` keeps its batch
list that way:

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
> answers `0`. The same order applies to `xml(...)` and `json(...)`.

## Seven places this is not JavaScript

The language is close enough to JavaScript to be readable and different enough
to bite. These seven are the ones that actually cost people an afternoon.

**1 — Arithmetic is typed, and the LEFT operand decides.**

```js
c / 12        // integer division if c is an integer
c / 12.0      // what you meant
20 + 0.22     // 20
Math.round(x) / 100.0   // still an integer — Math.round returned one
```

There is no error and no log line. Write the decimal point.

**2 — `x == ""` does not catch a missing value.** A missing attribute, a
missing JSON key, an element that is not there and an SQL NULL all arrive as
`undefined`. Use `!x` for "missing or empty", `x == null` for "missing".

**3 — Ordering operators with `undefined` are not JS.** `undefined < 1` is
true. Do not rely on them; test for the missing value first.

**4 — Hex values stay hex.** Arithmetic on a hex-subtype value (such as
`evt.stan`) produces a hex result, and comparing it with `1` fails:

```js
if (evt.stan == "0x0303") { ... }     // correct
```

**5 — `switch`, classes, `async`/`await`, template strings, destructuring,
spread and real regular expressions do not exist.** `var`/`let`/`const`,
`if`/`for`/`while`/`do`, `for (x in obj)`, `try`/`catch`/`finally`, `throw`,
`?:`, `??`, `?.`, arrow functions and object/array literals all do. A regex
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

## What is built in

| Scope | |
|---|---|
| `Math` | `abs floor ceil round trunc sign min max pow sqrt log exp sin cos tan atan2 random` |
| `String` | search, slice, case, trim, split, replace, pad, `fromCharCode` |
| `Array` `Number` `Object` `JSON` `Buffer` | the usual, with the differences above |
| `Time` | `now` `GetTimeStr` `FmtTimeStr` `GetTimeMs` `ParseTimeMs` `AddDurationMs` `SleepMs` |
| `File` | `open close read gets write puts remove rename` |
| `CODEC` | `B64_enc/dec` `Z64_enc/dec` `HEX_enc/dec` `JWT_sign/verify/dec` |
| `SQL` | see below |
| `FILE` | `list exists mkdir rmdir move zip` — directories and ZIP archives, from the module `AyLIB_net`; Engineer and above (`PRJEDU_net`) |
| `IMG` `CAM` | image functions on blobs and the camera list, from the module `AyLIB_vision` (`PRJEDU_gauge`, `PRJEDU_vision`) |

`FILE`, `IMG` and `CAM` live in engine modules beside the engine in `bin`; the
first call attaches the module, no `xdb_lib` needed. `FILE` is refused to a
script started from a page that did not log in: it runs with the page's role,
and the engine's own timers run as the engine (`PRJEDU_net` makes its report
on a timer for that reason).

There is no `Date`. `Time.now()` (engine 4.3.4.530 and later) is the instant
as a time value — it prints as `2026-10-01T12:00:00.123+03:00`, and
`t2 - t1` is milliseconds. The text stamp most examples log is
`Time.GetTimeStr(0)` → `2026-09-20 22:31:04`.

**Every scope documents itself**, and the key is always lower-case `help`:

```js
evt.Log(4, Math.help);
evt.Log(4, SQL.help);
evt.Log(4, evt.help);
evt.Log(4, Object.keys(Math));
```

That is the live list. If anything here disagrees with it, believe the engine.

## The engine functions you put in chains

These are normally written in **XML**, not called from script. The names you
will meet in the examples:

| Scope | What it does | Seen in |
|---|---|---|
| `ATR.rou` `ATR.lmt` | round to `val_rou`, clamp to `val_min`/`val_max` | 101, modbus |
| `VAL.put` `VAL.cnv` | `pro` → `val`, and scale it | modbus |
| `ALM.onlvl` | compare with the four limits, set the alarm bits in `sta` | 101, modbus, rep |
| `PRO.pol` `PRO.sta` `PRO.inp` | poll, state, distribute a block | modbus |
| `EVT.sta` `THR.sta` | let `sta` start and stop a timer or thread | all |
| `XDB.evt` `THR.cre` `SCR.prs` | create the timer / thread / script object | all |
| `SQL.qry` | run the SQL in `@qry` and turn the rows into elements | sqlite |
| `IF.*` | cut the rest of the chain on a condition | — |
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
<p><%= t.name %>: <%= t.level %> %</p>     <!-- <%= %> escapes, <%- %> does not -->
<% if (t.alarm > 0) { %><p class="alarm"><%= t.text %></p><% } %>
```

A page sees `evt`, `req` (`req.getForm("sp")` reads a form field), `res`
(`res.status`, `res.type`, `res.header`, `res.redirect`), `ses` and your
modules by name — `main.tank()` above is an ordinary function in the
document's script. Everything in this guide holds inside a page: typed
arithmetic, `evt.GetValue` addresses, `return` to stop early. Statements need
their `;` (there are no automatic semicolons). A page that fails answers
**500** and logs why, with the template's line number; its source is never
sent.

`PRJEDU_pages` is built this way, and `PRJEDU_oee` adds a printable shift
report (`www\report.ayp`) to an existing project. A page runs with the
visitor's rights — see `06_Access_and_Safety.md`.

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
the caller goes on; JScript gets `1` ("queued"), never the function's result.
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

From Python a numpy array becomes a blob with one copy, and a blob comes back
as a read-only numpy view with none. A `PRO.http` connection with
`pro_blob="/blob"` serves the bytes from memory, once
(`GET /blob/DOC/NODE/ID/val`) or as an MJPEG stream (`?stream=1`). The
`IMG.*` functions come from the engine module `AyLIB_vision`, named on the
root document (`xdb_lib="AyLIB_vision"`; up to 4.3.4.562 the plug-in
`AyPRO_img`). `PRJEDU_gauge` uses all of it, and keeps the old way
(a base64 PNG in a string on MQTT) one button away, to compare.

## SQL from script

The shape never changes:

```js
var con = SQL.attach('CN_SQL');          // borrow from the <con>'s pool
var rs  = SQL.exec_direct(con, sql);     // or prepare / parameter / execute
while (SQL.fetch(rs)) { ... SQL.getdata(rs, 1) ... }
SQL.close(rs);                           // always
```

You never disconnect `con` — it belongs to the connection's pool and goes back
by itself. Closing the **result set** is what you owe.

* Use `prepare` / `parameter` / `execute` the moment a **value** goes into the
  statement. A bound value is data and never becomes SQL. `PRJEDU_sqlite`
  proves it by storing a tag called `x'; DROP TABLE reading; --` every tenth
  reading; the table is still there.
* **`SQL.getdata(rs, n)` counts from 1**, not from 0.
* **An SQL NULL comes back as `undefined`** — see difference 2 above.
* `SQL.qry` is the other way in: write SQL into a `<list>` element's `@qry` and
  every row becomes an `<item>` whose attributes are named after the columns.
  After that the rows are addressable: `id('L_RECENT')/item[1]/@val`.

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
3. Are your divisions written with a decimal point where you meant a decimal?
4. Are you testing for a missing value with `x == null`, not `x == ""`?
5. Are hex values compared with a hex string?
6. Every `SQL.exec_direct` / `prepare` matched by a `SQL.close`?
7. Is the `val_typ` of anything with a `val_fnc` carrying `0x1000`? (guide 2)
8. Is everything you subtract signed - a time stamp in a `0x0208` attribute, an
   unsigned (`0x01..`) value read through `parseInt`? (item 7)
9. Does a function that runs because a page wrote into ANOTHER document (the
   page's MQTT connection belongs to one document, the element to another)
   write a local attribute (`val_typ` `0x4...`)? Local attributes refuse
   writes that come from outside their document - silently.
   (`PRJEDU_robotarm`, `PSTOP_MS`)
