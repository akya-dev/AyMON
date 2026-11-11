# Events, documents and addresses

This page is the reference for what a script uses to reach the engine: the event `evt`
every function receives, the document object `xdb`, element objects, the XML DOM of
`new XML(..)`, thread objects, the address language that `GetValue` and `SetValue` take,
the address functions (`count`, `json`, `api.` …), the `#` command addresses, and the
`sta` word with its `STA` functions. The ideas behind it are in
[Timers and events](../02_Timers_and_Events.md) and [Scripting](../03_Scripting.md);
read those first. Every result below was measured on engine 4.4.2.702.

* [The sample document](#the-sample-document)
* [evt: the event](#evt-the-event)
* [evt.flg and the EVT.FLG constants](#evtflg-and-the-evtflg-constants)
* [xdb: the document](#xdb-the-document)
* [Element objects](#element-objects)
* [new XML: the DOM](#new-xml-the-dom)
* [Thread objects](#thread-objects)
* [Addresses](#addresses)
* [Address functions](#address-functions)
* [Special addresses](#special-addresses)
* [STA: the sta word](#sta-the-sta-word)

---

## The sample document

The examples on this page read this root document and a second document `PLANT/S00`.
Their results are written as comments.

```xml
<xdb id="XDB" tid="S01" sta="0x0300" xdb_start="main.start(evt);" ...>
  <config>
    <script id="main" xdb_fnc="[SCR.prs]" src="%DB%/main.js" sta="0x0303" sta_typ="0x142"></script>
    <script id="api"  xdb_fnc="[SCR.prs]" src="%DB%/api.js"  sta="0x0303" sta_typ="0x142"></script>
    <doc id="PLANT/S00" sta="0x0300" src="%DB%/db_PLANT.xml"/>
    <cls id="cls_PRESS" val_typ="0x1308" val_unt="bar"/>
  </config>
  <data>
    <thr id="TH_MAIN" xdb_fnc="[THR.cre]" thr_per="50" thr_wrk="1" sta="0x0303" sta_typ="0x142" sta_fnc="[THR.sta]"/>
    <var id="POWER" val="0" val_typ="0x1308" val_unt="kW" val_fnc="[main.on_power]" sta="0x0303" sta_typ="0x142"/>
    <var id="SPEED" val="0" val_typ="0x0308" sta="0x0303" sta_typ="0x142"/>
    <var id="COUNT" val="5" val_typ="0x1204" sta="0x0303" sta_typ="0x142"/>
    <var id="FLAGS" val="0x0010" val_typ="0x0142" sta="0x0303" sta_typ="0x142"/>
    <var id="NOTE"  val="abc" sta="0x0303" sta_typ="0x142"/>
    <var id="PRESS" xdb_cls="cls_PRESS" val="2" sta="0x0303" sta_typ="0x142"/>
    <list id="TANKS" sta="0x0303" sta_typ="0x142">
      <item id="T1" val="10"   val_typ="0x0308" sta="0x0303" name="one"/>
      <item id="T2" val="20.5" val_typ="0x0308" sta="0x0303" name="two"/>
      <item id="T3" val="-3"   val_typ="0x0308" sta="0x0303" name="three"/>
      <item         val="7"    val_typ="0x0308" sta="0x0303" name="spare"/>
    </list>
    <list id="NEW_ROWS" sta="0x0303" sta_typ="0x142"/>
  </data>
</xdb>
```

`PLANT/S00` holds `<var id="LEVEL" val="42.5" val_typ="0x1308" .../>` and three more
`<var>`s under its `<data>`.

---

## evt: the event

Every function the engine calls gets one argument, `evt`: a chain function
(`val_fnc="[main.f]"`), a life-cycle hook (`xdb_start="main.start(evt);"`), a `ForEach`
handler, a server page, a protocol hook. It says what is happening (which element,
which attribute, the new and the old value, who caused it) and it is the handle every
read and write goes through.

| Field | Holds | Write |
|---|---|---|
| `evt.doc` | The id of the document the event runs in (`"XDB"`) | no |
| `evt.id` | The id of the element the event is on; `""` when it has none | no |
| `evt.atr` | The attribute being written: `val`, `sta`, `evt`, `pro`, … `""` in `xdb_start` and in a queued script | no |
| `evt.flg` | Flags: where the write came from, its direction — [below](#evtflg-and-the-evtflg-constants) | **yes** |
| `evt.user_role` | Who caused it: `0`–`7` a user's role, `8` a document, `9` the engine itself | no |
| `evt.cnt` | How deep in chains: `0` in `xdb_start`, `1` in a chain a script's write started, one more per chain a chain starts. Above 100 the chain is not run (`PANIC ... nested call limit`) | no |
| `evt.obj` | The element the event is on, as an [element object](#element-objects). `evt.elm` is the same | no |
| `evt.cls` | The element named in the element's `xdb_cls`, as an element object; `undefined` without one | no |
| `evt.val_typ` | The type code of `evt.valn`, as hex (`0x0308`) | no |
| `evt.valn` | The value being written. `evt.val` is the same | **yes** |
| `evt.valp` | The value stored before this write | **yes** |
| `evt.stan` | The element's `sta` as it will be after this event | **yes** |
| `evt.stap` | The element's `sta` before it | **yes** |
| `evt.thr` | The thread the event runs on: the document (`XDB_DOC`), a `<thr>` (`XDB_THR`) or a connection | no |
| `evt.ses` | The connection session the event came through (a page's visitor, a server connection); `undefined` otherwise | no |
| `evt.src` | The event that caused this one | no |
| `evt.src_doc`, `evt.src_id`, `evt.src_atr` | `doc`, `id` and `atr` of `evt.src` | no |

What the fields hold depends on who called. Measured: `POWER` written from `xdb_start`,
a timer on `TH_MAIN`, a GPIO `<bi>` polled on a simulated connection `CN_G`, a server
page:

| | `xdb_start` | `val_fnc` | `sta_fnc` | `evt_fnc` (timer) | `pro_fnc` (device) | `ForEach` handler | page |
|---|---|---|---|---|---|---|---|
| `evt.atr` | `""` | `val` | `sta` | `evt` | `pro` | `sta`, or the attribute named | `pro` |
| `evt.valn` | `undefined` | the value written | the new `sta` | `1` | the device's value | the attribute's value | — |
| `evt.valp` | `undefined` | the stored value | the old `sta` | `0` | the stored value | the same | — |
| `evt.flg` | `0x0300` | the writer's source `+ 0x0800` (`0x0B00` from `xdb_start`); `0x0100` through an element object | `0x8B00` | `0x0207` | `0x0140` | `0x8900` | `0x0140` |
| `evt.thr.id` | `XDB` | the writer's thread | the writer's thread | `TH_MAIN` | `CN_G` | `XDB` | the HTTP `<con>` |
| `evt.user_role` | `9` | `9` | `9` | `9` | `9` | the caller's | the visitor's (`0` before login) |

**`sta_fnc`, `pro_fnc` and `val_fnc` run as the engine (role 9)** whoever wrote: they
are the engine's own cascade, which writes across elements. Every other `<atr>_fnc`
(`opr_fnc`, `qry_fnc`, …) runs with the writer's role. Measured from a page with a
Guest visitor: `val_fnc` saw `9`, `opr_fnc` saw `0`.

### Inside a chain

The chain runs **before** the value is stored. In a `val_fnc`, `evt.obj.val` is still
the old value and `evt.valn` the new one:

```js
function on_power(evt)
{
    evt.Log(4, evt.valn + " over " + evt.obj.val);   // "7.5 over 0" for a write of 7.5
    return 0;
}
```

**What a chain function returns is ignored.** Measured, a `val_fnc` returning `1` or
`99` changed nothing: the value was stored. A chain function changes the outcome
through the event:

| To | Write | Measured |
|---|---|---|
| store another value | `evt.valn = 100;` | a write of 500 stored 100 |
| keep the old value | `evt.valn = evt.valp;` | a write of 5000 left 10; nothing is stored or published |
| store nothing | set bit `0x2000` of `evt.flg` (below) | a write of -5 left 10 |
| change the element's `sta` | `evt.stan = STA.set_run_alm(evt.stan, STA.ALARM);` | `sta` 0x0303 became 0x030B when the event ended |

```js
function guard(evt)            // val_fnc
{
    if (evt.valn < 0) evt.flg = evt.flg | 0x2000;   // not stored, not published
    return 0;
}
```

A change of `evt.stan` is applied as a write of `sta` when the event ends, so the
element's `sta_fnc` runs then. [`STA.upd`](#staupd) applies it at once, in the middle of
the chain. The functions after yours in the chain see what you wrote into `evt.valn`.

In a `sta_fnc` the new `sta` is `evt.valn` and the old one `evt.valp`. `evt.stan` may
already show the new one or not, depending on how `sta` was written: read `evt.valn`.

### evt.GetValue

`evt.GetValue(adr)` → the value, or `undefined`

Reads one attribute. `adr` is an [address](#addresses) ending in `/@attribute`, or an
[address function](#address-functions).

| Argument | Meaning |
|---|---|
| `adr` | Text. `"id('POWER')/@val"`, `"count(id('TANKS')/item)"`, `"doc('PLANT/S00')/id('LEVEL')/@val"` |

Returns the attribute's value with its own type: a number for a `0x0308`, hex for a
`0x0142`, text for an untyped attribute. When the address matches several elements, the
**first** one's. A missing element, an address with no `@attribute`, an unknown document
or a read the role may not make gives `undefined`. **A missing attribute of an element
that exists gives `""`**, not `undefined`.

```js
evt.GetValue("id('POWER')/@val")          // 0
evt.GetValue("id('POWER')/@val_unt")      // "kW"
evt.GetValue("id('FLAGS')/@val")          // 0x0010
evt.GetValue("id('PRESS')/@val_unt")      // "bar": from its class
evt.GetValue("id('TANKS')/item/@name")    // "one": the first of four
evt.GetValue("id('POWER')/@nope")         // "": the element exists
evt.GetValue("id('NOPE')/@val")           // undefined
evt.GetValue("id('POWER')")               // undefined: no attribute named
```

Test a read that may be missing with `!x`, which catches both: `x == null` is false for
the `""` of a missing attribute.

### evt.SetValue

`evt.SetValue(adr, value)` → `1` or `0`

Writes `value` into the attribute: it is converted to the attribute's type, the
attribute's chain runs (when its type has a run bit), it is stored and published. When
the address matches several elements, **every one** is written.

| Argument | Meaning |
|---|---|
| `adr` | An address ending in `/@attribute`, a `#` command, or an `api.` call |
| `value` | Any value. An object or array is stored as its JSON text |

Returns `0` when the role may not write (`xdb_acl`; one `ALERT` line), when the
document is unknown, or when the argument count is wrong. **Everything else returns
`1` — also an address that matched nothing.** It is not an existence test.

```js
evt.SetValue("id('SPEED')/@val", 1.23456)    // 1, SPEED = 1.23456
evt.SetValue("id('POWER')/@val", "8.25")      // 1, POWER = 8.25: text is converted
evt.SetValue("id('POWER')/@val", "abc")       // 1, POWER = 0, no line in the log
evt.SetValue("id('NOPE')/@val", 1)            // 1: nothing was written
evt.SetValue("id('SPEED')/@newatr", 5)        // 1, creates newatr = "5" (text)
evt.SetValue("id('TANKS')/item/@tag", "x")    // 1, all four items get tag="x"
evt.SetValue("id('NOTE')/@val", { "a": 1 })   // 1, NOTE = '{"a":1}'
evt.SetValue("doc('NOPE')/id('X')/@val", 2)   // 0
```

Three traps:

* An attribute that does not exist is created, as text. A typing error in the name
  creates a new attribute and leaves the real one alone, silently.
* A **local** attribute (type `0x4xxx`) written from another document is not stored:
  its chain runs, the call returns `1`, and one `WARN` line (then one every 10 minutes)
  says `value not stored -- the attribute is LOCAL (0x4000) and the write came from
  another document`. From inside its own document it is written.
* A write made from `xdb_init` or `xdb_start` — or from work queued there — carries the
  update flag (`EVT.FLG_SRC_UPD`), and **`PRO.out` does not send an update to the
  device**: measured, a GPIO output written from `xdb_start` stored `1` and the pin
  stayed low; the same write from a timer's `evt_fnc` drove it. Write device outputs
  from a timer or an event, not from the start hook.

### evt.MskValue

`evt.MskValue(adr, value, mask)` → `1` or `0`

Writes `old & mask | value`: the bits in `mask` are kept, then `value` is OR-ed in.
For integer and hex attributes; on a float the result means nothing (measured
`10.73 → 1` for `MskValue(.., 1, 0)`). Returns as `SetValue`.

```js
// FLAGS = 0x00F0
evt.MskValue("id('FLAGS')/@val", 0x0003, 0xFF0F)   // FLAGS = 0x0003
```

On `sta` the engine derives the run state from the command:
`MskValue("id('X')/@sta", 0x0100, 0xF0FF)` on a running `0x0303` gives `0x0101`, not
`0x0103`.

### evt.XorValue

`evt.XorValue(adr, value)` → `1` or `0`

Writes `old ^ value`, bit by bit. For integer and hex attributes.

```js
// FLAGS = 0x0003
evt.XorValue("id('FLAGS')/@val", 0x0101)   // FLAGS = 0x0102
```

### evt.AddValue

`evt.AddValue(adr, value)` → `1` or `0`

Writes `old + value`, in one step, under the attribute's own type.

```js
evt.AddValue("id('SPEED')/@val", 10)     // 1.23456 -> 11.23456
evt.AddValue("id('SPEED')/@val", -0.5)   // -> 10.73456
```

### evt.AskValue

`evt.AskValue(adr, prm)` → the answer

The write that answers. Its use is with `#JScript` and with functions:

| `adr` | What happens | Returns |
|---|---|---|
| `"#JScript"` | `prm` is script text, evaluated here | the value of the last expression |
| `"doc('X')/#JScript"` | the same, in document `X`: `xdb`, `evt.obj` and the modules are `X`'s | the same |
| `"api.f(a, b)"` | `api.f` is called with `prm` as its last argument ([api](#api)) | the function's answer |
| `"#shell"` | a console command (`help`, `ver`, `log 4 20`) | its text; `0` for an unknown one |
| a value address | written, as `SetValue` | `undefined` |

```js
evt.AskValue("#JScript", "1+2")                          // 3
evt.AskValue("#JScript", "var a=5; a*2")                 // 10
evt.AskValue("api.plain()", "hello")                     // "plain:hello:0"
evt.AskValue("doc('PLANT/S00')/#JScript", "xdb.id")      // "PLANT/S00"
evt.AskValue("#shell", "ver")                            // "platform : 4.4.2 build 702 ..."
```

`#JScript` runs with the caller's role.

### evt.QueValue

`evt.QueValue(adr, value, pri, delay, syn, thr)` → `1` or `0`

Does it later, or on another thread: a write, a script, or a function call goes into a
thread's queue. Only the first two arguments are required.

| Argument | Meaning |
|---|---|
| `adr` | A value address (`"id('X')/@val"`), `"#JScript"`, `"#PyScript"`, or an [`api.`](#api) call (`"api.f(1)"`) |
| `value` | The value to write; the script text for `#JScript` / `#PyScript`; for an `api.` call, its last argument |
| `pri` | How a second entry with the same identity merges, `THR.QUEADD_*` below. Default `THR.QUEADD_MULTI` |
| `delay` | **Milliseconds** to wait. Default `0` |
| `syn` | For `QUEADD_LOOP`: align the repeats to a wall-clock boundary of this many ms. Default `0` |
| `thr` | The thread: a `<thr>` or `<con>` id, `"/"` for the document's own thread. Default: the caller's thread. `"TH_MAIN/@LABEL"`, `"/@LABEL"`, `"@LABEL"` add a label to a script or call |

| `pri` | Value | A second entry with the same identity |
|---|---|---|
| `THR.QUEADD_MULTI` | `2` | is queued too: both run |
| `THR.QUEADD_LAST` | `3` | replaces the first: new value, new time |
| `THR.QUEADD_FIRST` | `4` | is dropped: old value, old time |
| `THR.QUEADD_VALUE` | `5` | new value, old time |
| `THR.QUEADD_TIME` | `6` | old value, new time |
| `THR.QUEADD_LOOP` | `7` | the entry repeats every `delay` ms until deleted |
| `+ THR.QUEADD_DELETE` | `0x20` | nothing is queued: the waiting entry is deleted |

The identity of an entry is its priority, the element and the attribute. A script or a
call has no attribute, so two of them from the same element are one entry: give each a
label in `thr`. Measured, all queued to `TH_MAIN` at the same instant:

```js
evt.QueValue("id('SPEED')/@val", 11, THR.QUEADD_LAST, 300, 0, "TH_MAIN");
evt.QueValue("id('SPEED')/@val", 12, THR.QUEADD_LAST, 300, 0, "TH_MAIN");   // SPEED = 12 at 300 ms
evt.QueValue("id('COUNT')/@val", 40, THR.QUEADD_TIME, 500, 0, "TH_MAIN");
evt.QueValue("id('COUNT')/@val", 41, THR.QUEADD_TIME, 100, 0, "TH_MAIN");   // COUNT = 40 at 100 ms

evt.QueValue("#JScript", "main.scan(evt)", THR.QUEADD_LOOP, 300, 0, "TH_MAIN/@SCAN"); // at 300, 600, 900 ms ...
evt.QueValue("#JScript", "", THR.QUEADD_LOOP | THR.QUEADD_DELETE, 0, 0, "TH_MAIN/@SCAN"); // stopped
```

In a queued script `evt.obj` is the element that queued it and `evt.thr` the thread it
runs on; with a label, `evt.id` is the thread's id and `evt.atr` the label (else `""`).
To run a function of another module later, queue `#JScript` with the call as text: a
call form such as `"main.f(evt)"` in `adr` is accepted (`1`) and never runs (measured).

**`1` means accepted, not done.** A thread name that matches nothing returns `1` and
drops the work with one `ERROR` line (`queued work names thread 'X', which is no <thr>
or <con> of this document -- DROPPED`); `#PyScript` with no Python script loaded returns
`1` with an `ALERT` line. A value write the role may not make is not queued and returns
`0`. Queued work runs only after the function that queued it returns, when the target
is its own thread.

### evt.UpdValue

`evt.UpdValue(adr)` → `1` or `0`

Runs the attribute's chain again with the value it already has, stores it and publishes
it, as if it had just been written. In the chain `evt.valn` equals `evt.valp` and
`evt.flg` carries `0x4000`. An address with no `@attribute`, or `/@*`, does it for every
attribute of the element. Returns `1` also when nothing matched.

### evt.PubValue

`evt.PubValue(adr)` → `1`

Sends the attribute's current value to whoever subscribes to it (MQTT, replication)
without writing it and without running its chain. `/@*` or no attribute: all of them.
Returns `1` also when nothing matched.

### evt.AddElement

`evt.AddElement(adr, node)` → `1` or `0`

Puts a new element, made with [`new XML`](#new-xml-the-dom), at the end of the element
`adr` names. The new element is published like any new element: a mirror gets it at
once when it has an `id`.

| Argument | Meaning |
|---|---|
| `adr` | The parent: `"id('NEW_ROWS')"` |
| `node` | A node taken out of its `XML` document with `removeChild` |

Returns `0` when the parent is not there, when `node` still belongs to its document,
when `node` is an element object of the engine (an element cannot be moved or copied
this way), and when the role has no NEW right on the parent (one `ALERT` line).

```js
var x = new XML("<row id=\"R7\" val=\"0\" val_typ=\"0x0308\" sta=\"0x0303\"/>", -1);
var row = x['row'];
x.removeChild(row);
evt.AddElement("id('NEW_ROWS')", row);       // 1
evt.GetValue("id('R7')/@val");               // 0: a number, found by id()

var y = new XML("<row id=\"R8\"/>", -1);
evt.AddElement("id('NEW_ROWS')", y['row']);  // 0: the node is still in y
```

The added element is a full engine element: its `*_typ` declarations, its class, its
children and its chains work. Measured on 4.4.2.702, the same with and without the
`-1` of `new XML`.

### evt.GetElement

`evt.GetElement(adr)` → an [element object](#element-objects) or `undefined`

The first element `adr` selects.

```js
evt.GetElement("id('POWER')").val_unt   // "kW"
evt.GetElement("id('TANKS')/item").name // "one"
evt.GetElement("id('NOPE')")            // undefined
```

### evt.DelElement

`evt.DelElement(adr)` → how many were deleted

Deletes every element `adr` selects, with their children, and publishes the deletion.
An element the role may not delete (no DEL in its `xdb_acl`) is skipped, with one
`ALERT` line.

```js
evt.DelElement("id('R7')")         // 1
evt.DelElement("id('NOPE')")       // 0
evt.DelElement("id('NEW_ROWS')/*") // every child
```

### evt.ForEach

`evt.ForEach(adr, handler, prm)` → `1`

Calls `handler` once for every element `adr` selects.

| Argument | Meaning |
|---|---|
| `adr` | Elements (`"id('TANKS')/item"`), or one attribute of them (`"id('TANKS')/item/@val"`) |
| `handler` | Text, `"main.f(evt, idx, prm)"`, or a function literal whose parameters are named **`evt`, `idx`, `prm`** |
| `prm` | Optional. Any value; the handler gets it as `prm` and what it changes in an object stays changed |

In the handler `evt` is an event on that element: `evt.atr` is the attribute named in
`adr`, or `sta` when none is; `evt.valn` is its value; relative addresses start at the
element. `idx` counts from `0`. Returning `0` (or nothing) goes on; **any other value
stops the walk**. Elements the role may not read are skipped. `ForEach` returns `1`
however many it visited, `0` only when the handler is missing.

```js
function show(evt, idx, prm)
{
    prm.s = prm.s + idx + ":" + evt.id + "=" + evt.GetValue("@name") + " ";
    return 0;
}

var p = { "s": "" };
evt.ForEach("id('TANKS')/item", "main.show(evt, idx, prm)", p);
// p.s = "0:T1=one 1:T2=two 2:T3=three 3:=spare "

var q = { "n": 0 };
evt.ForEach("id('TANKS')/item", (evt, idx, prm) => { prm.n = prm.n + 1; return 0; }, q);
// q.n = 4
```

A literal with other parameter names (`(e, i, r) => ...`) fails on every element with
`object variable not found`: the engine passes the three by name. `"…/@*"` visits
nothing.

### evt.Log

`evt.Log(level, a, b, ...)` → `undefined`

Writes one line to the document's log. The arguments after the level are joined with a
space; an object or array is written as JSON, an element as `<XDB_ELM>`.

| `level` | Line | Written when |
|---|---|---|
| `0` | `PANIC` | always |
| `1` | `ALERT` | `xdb_log` ≥ 1 |
| `2` | `FAIL` | `xdb_log` ≥ 2 |
| `3` | `ERROR` | `xdb_log` ≥ 3 |
| `4` | `WARN` | `xdb_log` ≥ 4 (the examples' setting) |
| `5` | `NOTICE` | `xdb_log` ≥ 5 |
| `6` | `INFO` | `xdb_log` ≥ 6 |
| `7` | `DEBUG` | `xdb_log` = 7 |
| `-1` … `-8` | `TEXT1` … `TEXT8` | always in the file |
| none | `TEXT4` | always in the file |

```js
evt.Log(4, "tank", 2.5, { "a": 1 }, [1, 2]);   // WARN  | XDB:tank 2.5 {"a":1} [1,2]
evt.Log("no level");                           // TEXT4 | XDB:no level
```

**A `PANIC` (and a `FAIL`) line puts the document in alarm**: its `sta` shows
EMERGENCY (ALARM for `FAIL`) until acknowledged — the health a log watcher reads
([Keeping it running](../12_Keeping_It_Running.md)). Measured, one `evt.Log(0, ..)` took
the document to `0x034F`. A script error is a `PANIC` line too. Use `0` for what really
is one.

### new XDB_EVT

`new XDB_EVT(evt)` exists, but in a script it makes an empty object: no fields, and
calling a method fails with `object.function not found` (measured). Pass `evt` itself.

---

## evt.flg and the EVT.FLG constants

`evt.flg` is a 16-bit word. Its parts:

| Bits | Mask | Values |
|---|---|---|
| `0x00C0` direction | `EVT.FLG_PRO_MSK` | `0` none · `EVT.FLG_PRO_INP` `0x0040` came from the device · `EVT.FLG_PRO_OUT` `0x0080` going to the device · `EVT.FLG_PRO_STA` `0x00C0` a protocol state change |
| `0x0700` source | `EVT.FLG_SRC_MSK` | `EVT.FLG_SRC_RMT` `0x0000` from another document · `EVT.FLG_SRC_LOC` `0x0100` inside the document · `EVT.FLG_SRC_EVT` `0x0200` a timer · `EVT.FLG_SRC_UPD` `0x0300` an update, not a change · `EVT.FLG_SRC_FIX` `0x0700` |
| `0x003F` command | `EVT.FLG_CMD_MSK` | `EVT.FLG_VAL_SET` `0` · `_MSK` `1` · `_XOR` `2` · `_ADD` `3` · `_MUL` `4` · `_UPD` `5` · `_ASK` `6` · `7` a timer's pulse (no constant) |
| `0x0030` class | `EVT.FLG_CLS_MSK` | `EVT.FLG_CLS_VAL` `0x00` · `_TMR` `0x10` · `_CON` `0x20` · `_FNC` `0x30` (a queued script or call) |
| `0x0800` | — | the event is a copy an address write made |
| `0x2000` | — | do not store: set it in a chain to veto the write |
| `0x4000` | — | a forced update (`UpdValue`) |
| `0x8000` | — | the attribute is `sta` |

`EVT.FLG_CLS_*` are the top two bits of the command field.

**Direction** is what a `pro_fnc` asks. A value the device sent — a poll's answer, a
subscription, the read-back after a write, a job's reply — carries `FLG_PRO_INP`.
`FLG_PRO_OUT` is set by `PRO.put` / `PRO.set` on the value they hand to `pro`. A script's
own write carries neither:

```js
function on_rly(evt)            // pro_fnc="[main.on_rly,PRO.out,main.on_rly]"
{
    if ((evt.flg & EVT.FLG_PRO_MSK) == EVT.FLG_PRO_INP) {
        // the device says it: valn is what the pin reads now
    }
    return 0;
}
```

Measured on a GPIO output written from a timer: the first `on_rly` saw `0x0A00` (no
direction), `PRO.out` sent the value and ended the chain, and the pin's read-back came
into the same `pro` with `0x0140`, running `on_rly` twice more (before and after
`PRO.out`, which lets an input pass).

---

## xdb: the document

`xdb` is the document the script belongs to. It reaches the same values as `evt`, with
two differences: **relative addresses start at the document's root element**, not at
an element, and it acts with **the role of the script that calls it** — a page's visitor
through `xdb` is still the visitor. `xdb.doc('X')` gives another document as the same
kind of object.

| Property | Gives |
|---|---|
| `xdb.id` | The document's id: `"XDB"`, `"PLANT/S00"` |
| `xdb.sta` | Its `sta` (hex) |
| `xdb.evt` | The document's own event (role 9 to read; a write through it acts with the caller's role) |
| `xdb.eng_mode` | What kind of engine object it is, as bits (help: `0x1n` thread, `0x2n` connection, `0x4n` script, `0x8n` document; `n` = `1` server, `2` client, `4` server session, `8` client session). Measured: a document `0xB0`, a `<thr>` `0x30`, a client connection `0x72` |
| `xdb.run_mode` | `0x00` standalone, `0x01` load share, `0x02` standby, `0x03` hot |
| `xdb.root` | The root `<xdb>` element as an element object: `xdb.root.tid` → `"S01"` |
| `xdb.con` | The connections, by id: `xdb.con['CN_WEB']` ([Sessions and protocol scripts](06_Sessions_and_Protocol_Scripts.md)). `for (k in xdb.con)` lists the ids |
| `xdb.thr` | The threads, by id: `xdb.thr['TH_MAIN']`, a [thread object](#thread-objects) |
| `xdb.mem` | The document's variables: `xdb.mem['PRJ']`, `['DB']`, `['BIN']`, `['ROOT']`, `['TID']`, and the script modules (`xdb.mem['main']`) |

`Object.keys()` does not list `xdb.con`, `xdb.thr` or `xdb.mem`; `for (k in ..)` does.

### xdb.doc

`xdb.doc(id)` → a document object, or `undefined`

Another document of this engine; the name is not case sensitive.

```js
xdb.doc('plant/s00').id                                // "PLANT/S00"
xdb.doc('PLANT/S00').GetValue("id('LEVEL')/@val")       // 42.5
xdb.doc('NOPE')                                         // undefined
```

### xdb.elm

`xdb.elm(id)` → an [element object](#element-objects), or `undefined`

The element with that `id`, through the index: the fastest way to an element.

```js
xdb.elm('POWER').val     // 0
xdb.elm('NOPE')          // undefined
```

### xdb.GetValue

`xdb.GetValue(adr)` — as [`evt.GetValue`](#evtgetvalue), relative addresses from the
root: `xdb.GetValue("@tid")` → `"S01"` from any function, `xdb.GetValue("count(data/var)")`
counts the root's `<data>` vars.

### xdb.SetValue

`xdb.SetValue(adr, value)` — as [`evt.SetValue`](#evtsetvalue).

### xdb.MskValue

`xdb.MskValue(adr, value, mask)` — as [`evt.MskValue`](#evtmskvalue).

### xdb.XorValue

`xdb.XorValue(adr, value)` — as [`evt.XorValue`](#evtxorvalue).

### xdb.AddValue

`xdb.AddValue(adr, value)` — as [`evt.AddValue`](#evtaddvalue).

### xdb.AskValue

`xdb.AskValue(adr, prm)` — as [`evt.AskValue`](#evtaskvalue). `#JScript` runs with the
document's event as `evt`.

### xdb.QueValue

`xdb.QueValue(adr, value, pri, delay, syn, thr)` — as [`evt.QueValue`](#evtquevalue).

### xdb.UpdValue

`xdb.UpdValue(adr)` — as [`evt.UpdValue`](#evtupdvalue).

### xdb.PubValue

`xdb.PubValue(adr)` — as [`evt.PubValue`](#evtpubvalue).

### xdb.AddElement

`xdb.AddElement(adr, node)` — as [`evt.AddElement`](#evtaddelement).

### xdb.GetElement

`xdb.GetElement(adr)` — as [`evt.GetElement`](#evtgetelement).

### xdb.DelElement

`xdb.DelElement(adr)` — as [`evt.DelElement`](#evtdelelement).

### xdb.ForEach

`xdb.ForEach(adr, handler, prm)` — as [`evt.ForEach`](#evtforeach).

### xdb.Log

`xdb.Log(level, a, b, ...)` — as [`evt.Log`](#evtlog).

### xdb.normalizePath

`xdb.normalizePath(text)` → text

Replaces the path macros and answers with the platform's separators.

```js
xdb.normalizePath("%DB%/x.txt")  // "C:\...\PRJ_X\db\x.txt"
xdb.normalizePath("%PRJ%")       // the project: the directory above db
xdb.normalizePath("%ROOT%")      // the directory above the project
xdb.normalizePath("%BIN%")       // the engine's directory
```

### xdb.toID

`xdb.toID(pattern, n)` → text

Puts `n` into the digits of `pattern`. The digits after the letters say the width and
the largest number; `n` wraps above it. No digits: the pattern `N9999` is used.

```js
xdb.toID('K9999', 123)   // "K0123"
xdb.toID('K99', 123)     // "K23"
xdb.toID('W0999', 7)     // "W0007"
xdb.toID('AB', 5)        // "N0005"
```

### xdb.newID

`xdb.newID(pattern [, n])` → text, or `undefined`

The next number of a counter kept in the file `%DB%/<pattern>.txt` (made at the first
call), formatted as in `toID`. With `n` the counter is set to `n` first. The pattern may
hold only letters, digits, `_` and `-` (else `undefined` and one `ALERT` line).

```js
xdb.newID('WR9999')       // "WR0001"
xdb.newID('WR9999')       // "WR0002"
xdb.newID('WR9999', 50)   // "WR0050"
xdb.newID('WR9999')       // "WR0051"
xdb.newID('K9999')        // "N0001": a one-letter prefix is lost
```

Give the pattern at least two characters before the digits: a single letter is replaced
by `N`.

### xdb.newUUID

`xdb.newUUID()` → text

A random (version 4) UUID: `"9b141070-9198-435c-87c1-7a82ac369793"`.

### xdb.lockID

`xdb.lockID(name, ms)` → `0`

Meant to take a named lock, waiting up to `ms` ms. **It does not lock**: measured, a
second `lockID` of a name already taken returned at once (0 ms, with `ms` = 300), and
every call returns `0`. Use [`xdb.lock`](#xdblock).

### xdb.unlockID

`xdb.unlockID(name)` → `0` when the name was taken, `2147483650` when it was not

### xdb.lock

`xdb.lock([ms])` → `1` taken, `0` the time ran out

Takes the document's script lock, waiting `ms` ms (without `ms`: for ever). The same
thread may take it again; each `lock` needs an `unlock`. Keep what runs under it short:
every other script that asks waits.

### xdb.unlock

`xdb.unlock()` → `1` released, `0` this thread did not hold it

### xdb.save

`xdb.save([sel [, path]])` → `1` or `0`

Writes the document's values back into its XML file — every attribute written in the
file, or only what `sel` names. Needs **role 6 (Engineer)** or above: from a page with a
Guest visitor it returns `0` with `xdb.save() refused (role 0 insufficient)`. What a
save writes and the selector forms: [Saving a document](../11_Records_and_Saving.md#saving-a-document).

```js
xdb.save()                    // 1
xdb.save("id('SPEED')/@val")  // 1: this attribute only
```

### xdb.sync

`xdb.sync([ms])` → `1`, `0` or `-1`

Waits until every durable value written before the call is on the disk:
`1` on the disk, `0` not within `ms` (default 3000, at most 30000) or the disk fails,
`-1` nothing on this node is durable (measured). Refused on a connection's thread.
[Values that survive a restart](../13_Durable_Documents.md#waiting-for-the-disk).

### xdb.dur

`xdb.dur()` → an object, or `undefined`

The durable log's state (directory, writes, free space, documents). Role 6 or above.
Measured `undefined` on a node with nothing durable.

### xdb.ShellExecute

`xdb.ShellExecute(verb, file [, params [, dir [, show]]])` → `0`

Starts a program (`verb` `"open"` when empty). Role 6 or above. **It always returns
`0`**: a file that is not there is one `ERROR` line (`ShellExecute(open,) : File not
found`). On Linux the file is run as a program; `verb` and `show` mean nothing there.

### xdb.exitProgram

`xdb.exitProgram()`

Ends the engine process 100 ms after the call, with exit code 0: no clean stop of the
documents. Role 6 or above; below it one `ALERT` line and nothing happens. Not run here.

### xdb.eval

`xdb.eval(text [, evt])` → the value of the last expression

Not in the help. Runs script text with the document's event (or the event given) as
`evt`, with the caller's role: `xdb.eval('evt.id')` → `"XDB"`. The same as
`AskValue("#JScript", text)`.

### xdb.callFunction

`xdb.callFunction(name, a, b, ...)` → the function's answer

Not in the help. Calls a script function by its name with the arguments given — no
`evt` is put in front: `xdb.callFunction('main.add2', 2, 3)` → `5`.

### xdb.sta

Reading gives the document's `sta`. Writing (`xdb.sta = 0x0100`) sets its command,
later, on the document's thread: measured, `xdb.doc('PLANT/S00').sta = 0x0100` stopped
that document (read `0x0100` 1.5 s later) and writing `0x0300` back did not start it
again within 2 s. Do not switch documents from a script this way.

---

## Element objects

`evt.obj`, `evt.cls`, `xdb.elm(id)`, `evt.GetElement(adr)` and `xdb.root` give an
element object (`XDB_ELM`): a handle on a live element of the document. Its attributes
are its properties.

| Use | Does |
|---|---|
| `e.val`, `e.name`, `e.val_unt` | Reads the attribute with its type; a class-declared one too. A missing attribute is `undefined` |
| `e.val = 3.25` | Writes it through the same path as `SetValue`: type conversion, chain, store, publish |
| `e.newone = "hello"` | Creates the attribute when it is not there |
| `delete e.x` | Empties the attribute (it is not removed) |
| `JSON.stringify(e)` | The element's own attributes as JSON, with `"xdb_elm"` = the tag |

```js
var e = xdb.elm('POWER');
e.val                // 0
e.val_unt            // "kW"
e.nope               // undefined (GetValue would give "")
JSON.stringify(e)    // {"xdb_elm":"var","id":"POWER","sta_typ":322,"sta":771,"val_typ":4872,"val":0,"val_fnc":"[main.on_power]","val_unt":"kW"}
e.val = 3.25;        // POWER's val_fnc runs, POWER = 3.25
```

A write through an element object carries `EVT.FLG_SRC_LOC`, not the caller's source:
written from `xdb_start` it is a change, not an update.

Reading another element's attribute needs the REA right in its `xdb_acl` (the element
the event is on is always readable); a refused read looks like a missing attribute.

An element object does not walk its children. For that use addresses
(`evt.GetValue("id('TANKS')/item[2]/@name")`, `evt.ForEach`) or `xdb_obj`.

### elm.xdb_elm

`e.xdb_elm` → the tag name: `xdb.elm('POWER').xdb_elm` → `"var"`.

### elm.xdb_doc

`e.xdb_doc` → the document object of the script that reads it — not necessarily the
element's: `xdb.doc('PLANT/S00').elm('LEVEL').xdb_doc.id` read from the root's script
→ `"XDB"`.

### elm.xdb_obj

`e.xdb_obj` → the element as a raw [XML node](#new-xml-the-dom), or `undefined`

The whole DOM, from this element: `parentNode`, `childNodes`, `selectNodes`,
`setAttribute`, `removeChild`. **Role 6 (Engineer) or above**: below it `undefined` and
one `ALERT` line. The DOM writes past every engine gate — no chain, no publish, no
`xdb_acl` — so read with it; write with `SetValue`.

```js
var n = xdb.elm('TANKS').xdb_obj;
n.childCount                      // 4
n[0].getAttribute('name')         // "one"
n['item'].getAttribute('id')      // "T1": the first child with that tag
n.selectNodes('item').length      // 4
xdb.elm('POWER').xdb_obj.parentNode.nodeName   // "data"
```

---

## new XML: the DOM

`new XML(text, -1)` parses XML text into a small document of its own. It is how a script
builds an element to add ([`evt.AddElement`](#evtaddelement)) and how it reads an XML
answer.

### new XML

`new XML(text [, flags])` → an XML document

| Argument | Meaning |
|---|---|
| `text` | XML text, or a file name |
| `flags` | `-1`: the engine's own rules inside the little document — `*_typ` declarations give typed values, `sta` / `pro` / `val` / `id` are the engine's fields |

Text that does not parse gives an XML object that is false: test `if (!x)`.

```js
var x = new XML("<root a=\"1\"><row id=\"R1\" v=\"5\" v_typ=\"0x0308\">t1</row><row id=\"R2\" v=\"6\"/></root>", -1);
var r = x['root'];
r.getAttribute('a')              // "1"
r['row'].v                       // 5: a number, v_typ applied
r['row'].text                    // "t1"
x.getElementById('R2').v         // "6"
r.selectNodes('row').length      // 2
x.selectNodes('count(//row)').value      // 2
x.selectNodes('sum(//row/@v)').value     // 11
var bad = new XML("<a><b/>");     // bad is false
```

The node members:

| Member | Gives |
|---|---|
| `n['tag']` | The first child element with that tag |
| `n[i]` | The child at index `i` (from 0) |
| `n.attr`, `n['@attr']`, `n.getAttribute('attr')` | An attribute's value; `undefined` when missing |
| `n.setAttribute('attr', v)` | `true`; writes it |
| `n.removeAttribute('attr')` | `true`; removes it |
| `n.nodeName` | The tag (`undefined` on the document itself) |
| `n.nodeType` | `1` the document, `2` an element |
| `n.text` | The text inside, all levels joined |
| `n.xml` | The node as XML text |
| `n.childCount`, `n.childNodes` | The number of children; the children as a list (`.length`, `[i]`) |
| `n.firstChild`, `n.lastChild`, `n.nextSibling`, `n.previousSibling`, `n.parentNode`, `n.ownerDocument` | The neighbours |
| `n.selectNodes(xpath)` | A list (`.length`, `[i]`); for `count(..)` `sum(..)` `min(..)` `max(..)` its `.value` |
| `n.selectSingleNode(xpath)` | The first match |
| `n.getElementById(id)`, `n.getElementsByTagName(tag)` | Look-ups (`'*'` for every tag) |
| `doc.createElement(tag)`, `doc.createTextNode(text)` | A new detached node |
| `n.appendChild(c)`, `n.insertBefore(c, before)`, `n.removeChild(c)` | Tree changes; each gives back the node |
| `doc.save(file)`, `doc.load(file)`, `doc.loadXml(text)` | `true` / `false` |

`n.attributes` and `x.help` give `undefined`.

The three steps that add an element — parse, take the node out, add it:

```js
var x = new XML("<ac id=\"AC_4B1805\" sta=\"0x0303\" val=\"0\"/>", -1);
var ac = x['ac'];
x.removeChild(ac);                         // AddElement takes only a node with no document
evt.AddElement("id('NEW_ROWS')", ac);      // 1
```

---

## Thread objects

`xdb.thr['id']` and the `evt.thr` of an event on a `<thr>` give a thread object
(`XDB_THR`).

| Member | Gives |
|---|---|
| `t.id` | `"TH_MAIN"` |
| `t.sta` | Its `sta` (hex). Writing it switches the thread, later: `0x0100` read `0x0101` after 1.5 s, `0x0303` brought it back |
| `t.evt` | The thread's own event |
| `t.xdb` | The document it belongs to |
| `t.con` | The connection, for a connection's thread; `undefined` for a `<thr>` |
| `t.ses` | The session, for a session's thread; `undefined` otherwise |
| `t.eng_mode` | `0x30` a `<thr>`; `0x72` a client connection — see `xdb.eng_mode` |
| `t.run_mode` | As `xdb.run_mode` |

`xdb.thr` holds the `<thr>` threads; a connection's thread is in `xdb.con`
([Sessions and protocol scripts](06_Sessions_and_Protocol_Scripts.md)).

### thr.lock

`t.lock([ms])` → `1` taken, `0` the time ran out

This thread's script lock, as [`xdb.lock`](#xdblock): one lock per thread object,
separate from the document's.

### thr.unlock

`t.unlock()` → `1` released, `0` not held by this thread

---

## Addresses

An address names elements and an attribute. It is XPath with the engine's own start:

| Form | Example | Starts at |
|---|---|---|
| `id('X')/...` | `id('POWER')/@val` | the element with that id, through the index — cheap at any size |
| `/xdb/...` | `/xdb/data/var[1]/@id` | the document's root element |
| `//tag...` | `//var[@id='SPEED']/@val_typ` | every element of the document |
| `@attr`, `tag/...`, `../...` | `@val_unt`, `../var[2]/@id` | **relative**: see below |
| `doc('X')/...` | `doc('PLANT/S00')/id('LEVEL')/@val` | in document `X` |

**Where a relative address starts:**

| Who | Relative to |
|---|---|
| `evt` in a chain or a `ForEach` handler | the element the event is on: `@val_unt` is its own |
| `evt` in `xdb_start`, `xdb_init` | the root element |
| `xdb.*` | the root element, always |
| after `doc('X')/` | `X`'s root element — also when `X` is the document you are in |

```js
// in POWER's val_fnc
evt.GetValue("@val_unt")              // "kW"
evt.GetValue("../var[2]/@id")         // "SPEED"
evt.GetValue("count(data/var)")       // 0: relative to POWER
evt.GetValue("count(/xdb/data/var)")  // 6
evt.GetValue("doc('XDB')/@tid")       // "S01": the root, not POWER
```

**One element is read, every element is written.** `GetValue` takes the first match,
`SetValue` and the other writes take all of them.

### Steps and predicates

| Write | Means | Measured |
|---|---|---|
| `item[2]` | the second item (from 1) | `id('TANKS')/item[2]/@name` → `"two"` |
| `item[last()]` | the last | → `"spare"` |
| `(//item)[3]` | the third of all of them | → `"three"` |
| `*`, `@*` | any element, any attribute | `id('TANKS')/*[1]/@id` → `"T1"` |
| `[@id]`, `[not(@id)]` | has the attribute / has not | `count(//item[not(@id)])` → 1 |
| `[@val>15]` | `=` `!=` `<` `>` `<=` `>=`, numbers compared as numbers | `item[@val>15]/@name` → `"two"` |
| `[a and b]`, `[a or b]` | both, either | `//item[@val>=10 and @val<20]/@name` → `"one"` |
| `[contains(@name,'hr')]`, `[starts-with(@name,'t')]` | text tests | → `"three"`, 2 items |
| ``[@name=`t%`]`` | a pattern: `%` / `*` any run of characters, `?` one character | → `"two"` |
| `[@sta bwand 0x0300]` | `(value & mask) != 0`; also `bwor`, `bwnot` | `count(//var[@sta bwand 0x0300])` → 6 |
| `[position() mod 2 = 0]`, `[string-length(@name)=3]`, `[name()='item']` | position and text functions | 2, 2, 4 |
| `following-sibling::`, `preceding-sibling::`, `..`, `.`, `//` | axes | `id('T1')/following-sibling::item` → 3 |

A `|` between two paths joins their sets: `count(//var|//item)` → 10.

Traps, measured:

* **An unquoted hex number never matches.** `count(//var[@val_typ=0x1308])` → `0`;
  write `[@val_typ='0x1308']` or the decimal `[@val_typ=4872]`.
* **An unknown function matches nothing**: `[translate(@name,'a','b')='x']` → 0. There
  is no error. `translate`, `local-name`, `boolean`, `lang`, `id()` inside a predicate
  and `$variables` do not exist.
* **An unknown axis acts as `child::`** (`//nope::item` → 4), and `ancestor::` is one of
  them: `count(id('T1')/ancestor::list)` → 0. Use `..`.
* Count a new XPath before you trust it.

### Other documents

`doc('X')/` in front of an address reaches document `X`, wherever the address is used:

```js
evt.GetValue("doc('PLANT/S00')/id('LEVEL')/@val")    // 42.5
evt.GetValue("doc('plant/s00')/id('LEVEL')/@val")    // 42.5: the name is not case sensitive
evt.GetValue("doc('PLANT/S00')/@sta")                // 0x0303: its root's sta
evt.GetValue("doc('PLANT/S00')/count(data/var)")     // 4
evt.GetValue("doc('NOPE')/id('X')/@val")             // undefined
evt.SetValue("doc('PLANT/S00')/id('LEVEL')/@val", 50) // 1; a val_fnc there sees evt.src_doc = "XDB"
```

In the other document the write's `evt.flg` source is `FLG_SRC_RMT`, and `LOCAL`
(`0x4xxx`) attributes there refuse it (see [`evt.SetValue`](#evtsetvalue)).

**`doc()` comes first, the function after it.** `doc('PLANT/S00')/count(data/var)` → `4`;
`count(doc('PLANT/S00')/data/var)` gives a wrong number (measured `2`) and no error.
The same for every [address function](#address-functions).

**A wildcard reaches several documents** and answers a JSON list of `{doc, val}`,
the values as text, `""` where a document has no such attribute:

```js
evt.GetValue("doc('*')/id('LEVEL')/@val")
// [{"doc":"XDB","val":""},{"doc":"PLANT/S00","val":"42.5"}]
evt.GetValue("doc('PLANT/*')/id('LEVEL')/@val")   // only those whose id starts PLANT/
evt.SetValue("doc('*')/id('LEVEL')/@val", 9)       // writes it in every one that has it
```

**A document on another engine** is reached through a PRO.rpc connection:
`<doc id="X" rpc_con="CN_S01"/>` in the root lets every address above work unchanged,
and `doc('X@CN_S01')` names the connection in the address itself. Such a call waits for
the answer on the caller's thread; a failed one is `undefined` (a write `0`) with one
`ERROR` line, and **inside a `try` it throws** with the reason in `e.message`:

```js
try { evt.GetValue("doc('LINE@CN_X')/id('A')/@val"); }
catch (e) { e.message }   // "doc('LINE') over 'CN_X': no PRO.rpc connection has this id or talks to this host"
```

[Two engines](../10_Two_Engines.md#a-document-on-another-node) has the rest.

---

## Address functions

A function name in front of an address makes `GetValue` answer about a set of elements
instead of one attribute. They work in every document form
(`doc('X')/count(...)`). An unknown name gives `undefined`, without a log line.

### count

`count(xpath)` → a number

How many nodes match. **Not filtered by `xdb_acl`**: a Guest visitor's `count(//var)`
counted an element it could not read.

```js
evt.GetValue("count(id('TANKS')/item)")   // 4
evt.GetValue("count(//nope)")             // 0
```

### sum

`sum(xpath/@attr)` → a number (double)

The sum of the attribute over the matches; text that is not a number counts as 0.

```js
evt.GetValue("sum(id('TANKS')/item/@val)")   // 34.5
evt.GetValue("sum(//nope/@val)")             // 0
```

### min

`min(xpath/@attr)` → a number

```js
evt.GetValue("min(id('TANKS')/item/@val)")   // -3
evt.GetValue("min(//nope/@val)")             // 1.79769313486232e+308
```

### max

`max(xpath/@attr)` → a number

```js
evt.GetValue("max(id('TANKS')/item/@val)")   // 20.5
evt.GetValue("max(//nope/@val)")             // -1.79769313486232e+308
```

`min` of nothing is the largest double and `max` of nothing its negative — not 0 and
not `undefined`: test `count` first.

### xml

`xml(xpath)` → text

The matching elements as XML, one after the other, with their children. An `@attr` at
the end is ignored: the elements come whole. Elements the role may not read are left
out, at every level.

```js
evt.GetValue("xml(id('T1'))")
// <item id="T1" sta="0x0303" val_typ="0x0308" val="10" name="one"/>
```

### json

`json(xpath [, 'fields'])` → JSON text

The matching elements as a JSON list. Each element is an object of its own attributes
(not its class's) plus `"xdb_elm"` = its tag; numbers are numbers, hex values numbers too.
With `/@attr` at the end, one `{attr: value}` per element. `'fields'` keeps only those
attributes. Elements the role may not read are left out; a page gets only what its
visitor may read.

```js
evt.GetValue("json(id('TANKS')/item/@val)")
// [{"val":10},{"val":20.5},{"val":-3},{"val":7}]
evt.GetValue("json(id('TANKS')/item, 'id,val')")
// [{"xdb_elm":"item","id":"T1","val":10},{"xdb_elm":"item","id":"T2","val":20.5},
//  {"xdb_elm":"item","id":"T3","val":-3},{"xdb_elm":"item","val":7}]
evt.GetValue("json(id('T1'))")
// [{"xdb_elm":"item","id":"T1","sta":771,"val_typ":776,"val":10,"name":"one"}]
```

This is a web front end's main read: `doc('X')/json(...)` over MQTT or HTTP.

### stat

`stat(xpath)` → JSON text

The load figures of the `<thr>`, `<con>` and `<xdb>` elements matched: queue depth,
rates, latency, skipped timers. Other elements give an empty `{}`. The fields are
explained in [Keeping it running](../12_Keeping_It_Running.md#reading-the-load).

```js
evt.GetValue("stat(id('TH_MAIN'))")
// [ { "id":"TH_MAIN", "sta":"0x0303", "eng_mode":"0x30", "tmr_cnt":1, "tmr_rrb":0, "tmr_skp":0, "thr_wrk":1, ... } ]
evt.GetValue("stat(/xdb)")      // the document itself
```

### api

`api.name(a, b, ...)` → the function's answer

Calls a function of the module `api` from an address — the way a web front end calls
script (`doc('X')/api.recent(10)` over MQTT or HTTP). Only the `api` module (and `rpc`,
below) can be called this way: `main.f()` in an address gives `undefined`.

The arguments are literals: numbers, `'text'` or `"text"`. Unquoted text arrives empty
and an array arrives empty. With `AskValue` / `SetValue` the value given is added as the
last argument.

The engine calls the function with four arguments in front of yours,
`f(evt, idx, qry, rsp, a, b, ...)`, and maybe more than once:

1. first with `idx = 0`. A **number** returned means "go on" (`1` forward, `-1`
   backward, `0` stop); anything else is the answer, and it ends here.
2. when it went on: once for every `idx` from 1 to `qry.cnt` (set `qry.cnt` in the first
   call), each returning a number again (`0` stops early);
3. then once more with `idx = qry.cnt + 1`; what that returns is the answer.

`rsp` is an empty object kept for you across the calls.

```js
// api.js
function plain(evt, idx, qry, rsp, a)
{
    return "plain:" + a + ":" + idx;
}
function three(evt, idx, qry, rsp, a, b)
{
    if (idx == 0) { qry.cnt = 3; rsp.list = []; rsp.a = a; rsp.b = b; return 1; }
    if (idx <= qry.cnt) { rsp.list.push(idx); return 1; }
    return "done:" + JSON.stringify(rsp);
}
```

```js
evt.GetValue("api.plain('x')")      // "plain:x:0"
evt.GetValue("api.plain(5)")        // "plain:5:0"
evt.GetValue("api.plain(x)")        // "plain::0": unquoted text is lost
evt.GetValue("api.three(1,'b')")    // 'done:{"list":[1,2,3],"a":1,"b":"b"}'
evt.AskValue("api.plain()", "hello") // "plain:hello:0"
```

Two answers that surprise:

* **An object returned comes back as the text `"null"`.** Return
  `JSON.stringify(obj)`.
* **A number returned is "go on / stop", not an answer**: a function that returns `0`
  at once gives `undefined`.

A function that throws gives `undefined` and two `PANIC` lines (`'uncaught exception'`,
`value thrown: ...`); the caller's `try` does not see it (measured). Only a remote call
that fails throws into the caller.

### rpc

`rpc.name(a, b, ...)` → the function's answer

The same as `api.`, for the module `rpc`, but when the root has `rpc_con` the call runs
on the other engine. Without `rpc_con` it runs here, as `api.`.
[Two engines](../10_Two_Engines.md) covers it.

### xdb

`xdb(api.f, a, b, ...)` → the function's answer, as JSON when it is an object

A walk over a query. `f(evt, idx, qry, rsp, a, ...)` is called with `idx = 0` and
`qry = {adr: ".", cnt: 0}`; it sets `qry.adr` to an address and returns `1`. The engine
counts the address's matches into `qry.cnt`, calls `f` once for each (`idx` 1 …
`qry.cnt`), then once with `idx = qry.cnt + 1` for the answer:

```js
function walk(evt, idx, qry, rsp, tag)
{
    if (idx == 0) { qry.adr = "id('TANKS')/item/@val"; rsp.n = 0; rsp.tag = tag; return 1; }
    if (idx <= qry.cnt) { rsp.n = rsp.n + 1; return 1; }
    return rsp;
}
// evt.GetValue("xdb(api.walk, 'T')")  ->  {"n":4,"tag":"T"}
```

**The per-element calls get the caller's `evt`, not the element's** (measured: `evt.id`
was the caller's in all four): the function can count matches but cannot read them. Use
[`evt.ForEach`](#evtforeach) to visit elements.

### jsn

`jsn(xpath, 'fields', api.f, prm)` → JSON text

Meant as `json()` with a filter: `api.f(evt, idx, cnt, rsp, prm)` is called for each
match and an element is kept when it returns non-zero. Measured, it is not usable:

* like `xdb()`, the filter's `evt` is the caller's, so it cannot see the element;
* without a parameter after the function it gives `undefined`;
* **without a filter function (`jsn(//item, 'id')`) it never returns: the document's
  thread and the threads that wait on it stop**.

Use `json()`, and filter with a predicate (`json(//item[@val>5])`).

### sql

`sql(api.f, a, ...)` → the function's answer

A walk over an SQL result, called like `xdb()`: in the first call `f` sets `qry.con`
(a connection from `SQL.attach`) and `qry.sql`, then it is called once per row
(`qry.cols`, `qry.row`) and once for the answer. Not measured here (it needs a
database); [SQL, history, files and the cluster](07_SQL_History_Files_and_Cluster.md)
covers SQL from script.

`api(...)` as a function — the form `api(id('x')/@val, api.f, prm)` in the help — does not
exist: it gives `undefined`.

---

## Special addresses

An address that starts with `#` is a command to the document, not a value. They work
with `doc('X')/#...` too. Each has a fixed role floor, since there is no element whose
`xdb_acl` could decide. A refused one returns `0` and writes one `ALERT` line
(`command '#save' refused (role 0 too low)`).

| Address | With | Role |
|---|---|---|
| `#JScript` | `AskValue`, `QueValue` | the caller's role governs what the script does |
| `#PyScript` | `QueValue` | as `#JScript` |
| `#shell` | `AskValue` | none asked: `help`, `ver` and `log` answer any role |
| `#save` | `SetValue` | 6 (Engineer) |
| `#xdb_log`, `#log_cfg`, `#log_cfg_stdout` | `SetValue` | 6 |
| `#dur` | `SetValue` | 6 |
| `#eval` | `SetValue` | 9: the engine only |

An unknown `#` command returns `0`. `GetValue` of a `#` address gives `undefined`.

### #JScript

`evt.AskValue("#JScript", text)` → the value of the last expression
`evt.QueValue("#JScript", text, pri, delay, syn, thr)` → `1`

Runs script text. `AskValue` runs it now and answers; `QueValue` runs it later on a
thread. In the text, `evt` is the caller's event (with `doc('X')/#JScript`: an event on
`X`'s root, and `xdb` is `X`).

```js
evt.AskValue("#JScript", "1+2")                                    // 3
evt.AskValue("doc('PLANT/S00')/#JScript", "evt.GetValue(\"id('LEVEL')/@val\")")   // 42.5
evt.QueValue("#JScript", "main.later(evt)", THR.QUEADD_MULTI, 3000, 0, "/");
```

### #PyScript

`evt.QueValue("#PyScript", code)` → `1`

Hands Python code to the engine's Python thread, which runs it in its turn (`eval`, or
`exec` for statements). It needs a `<script language="Python">` in the project: without
one, the call still returns `1` and the work is dropped with
`ALERT ... Python thread absent or closed, PYS event dropped`. Not measured further here.

### #shell

`evt.AskValue("#shell", command)` → text

The console's own commands: `help` (the engine's scope list), `help <SCOPE>`, `ver`
(build, document, log file, licence and its limits), `log <level> <count>` (the last
lines of this document's log). Anything else gives `0`.

```js
evt.AskValue("#shell", "log 4 3")   // the last three lines at WARN or above, then "-- 3 record(s), level <= 4 --"
```

### #save

`evt.SetValue("#save", 1)` → `1` or `0`
`evt.SetValue("#save", "id('SPEED')/@val")` → `1` or `0`

Saves the document's values into its file, as [`xdb.save`](#xdbsave): `1` (or any value
that is not a selector) saves every attribute written in the file, a text starting with
`/`, `[` or `id(` saves only what it names. `doc('X')/#save` saves `X`.

### #xdb_log

`evt.SetValue("#xdb_log", level)` → `1`

Sets the document's log level, `0`–`7`, as `xdb_log` on the root does, while it runs.
`doc('X')/#xdb_log` sets `X`'s.

```js
evt.SetValue("#xdb_log", 7);
evt.Log(7, "now written");   // DEBUG | XDB:now written
evt.SetValue("#xdb_log", 4);
```

### #log_cfg

`evt.SetValue("#log_cfg", cfg)` → `1`

Applies a `log_cfg` value to the running log: the stamp format (`0x000F`), file size
(`0x00F0`), files kept (`0x0F00`) and the console copy (`0x2000`), as the root's
`log_cfg` does at start. `#log_cfg_stdout` sets the console copy's level alone.

### #dur

`evt.SetValue("#dur", "drop")` → `1`, else `0`

Forgets the document's durable values: nothing more is kept for it in this run, and the
next start begins with its file. Any other value is refused with
`ERROR ... '#dur' takes "drop", not 'x'`.
[Values that survive a restart](../13_Durable_Documents.md).

### #eval

`evt.SetValue("#eval", text)` → `1`, `0` below role 9

Runs the `{=...}` expressions written in `text` — the placeholders the chain functions'
`_lnk` addresses use — and keeps no result. Role 9 only, so a replication peer (role 8)
can never run script with it. A script has `#JScript` for this.

---

## STA: the sta word

### The word

Every element has a `sta`: one 16-bit word in four parts.
[The element tree](../01_The_Element_Tree.md#sta-one-word-four-nibbles) shows it as
nibbles; the bits:

| Bits | Part | Values |
|---|---|---|
| `0x0003` | run state, written by the engine | `0` DISABLED · `1` STOPPED (resting) · `2` WAITING · `3` RUNNING |
| `0x000C` | alarm | `0x0` NORMAL · `0x4` WARNING · `0x8` ALARM · `0xC` EMERGENCY |
| `0x0030` | inhibit bits | `STA.CFG_INHDEC` `0x10` · `STA.CFG_INHINC` `0x20` · `STA.CFG_INHALL` `0x30` |
| `0x00C0` | alarm handling | `0x40` NEW (not acknowledged) · `0x80` suppressed · `0xC0` inhibited |
| `0x0F00` | command, written by you | `0x000` DISABLE · `0x100` STOP · `0x200` PAUSE · `0x300` START |
| `0xF000` | role | the cluster state and the edge / hub role ([Two engines](../10_Two_Engines.md)) |

Run state plus alarm are the "runtime" nibble (`0x000F`). Test a run state with
`(sta & 0x0003) == 3`; never compare a whole `sta`.

The `STA` scope gives names to these values:

| Constant | Value | | Constant | Value |
|---|---|---|---|---|
| `STA.DISABLED` | `0x0000` | | `STA.NORMAL`, `STA.ALM_NRM` | `0x0000` |
| `STA.STARTING` | `0x0001` | | `STA.WARNING`, `STA.ALM_WRN` | `0x0004` |
| `STA.WAITING` | `0x0002` | | `STA.ALARM`, `STA.ALM_ALM` | `0x0008` |
| `STA.RUNNING` | `0x0003` | | `STA.EMERGENCY`, `STA.ALM_EMR` | `0x000C` |
| `STA.WRN_END` … `STA.EMR_RUN` | `0x0004` … `0x000F` | | `STA.CFG_INHDEC` / `_INHINC` / `_INHALL` | `0x0010` / `0x0020` / `0x0030` |
| `STA.RUN_MSK` | `0x000F` | | `STA.CFG_NEW` / `_SUP` / `_INH` | `0x0040` / `0x0080` / `0x00C0` |
| `STA.ENG_MSK` | `0x0003` | | `STA.CFG_MSK` | `0x00F0` |
| `STA.ALM_MSK` | `0x000C` | | `STA.CMD_MSK` | `0x0F00` |
| `STA.CMD_STR` | `0x0100` (STOP) | | `STA.CMD_WAI` | `0x0200` (PAUSE) |
| `STA.CMD_RUN` | `0x0300` (START) | | | |

`STA.WRN_END`, `_STP`, `_WAI`, `_RUN`, `ALM_*`, `EMR_*` are the sixteen alarm + run
combinations (`STA.WRN_RUN` = `0x0007`, `STA.ALM_WAI` = `0x000A`).
`STA.CANCELED` 0, `STA.NEW` 1, `STA.STOPPED` 1, `STA.FINISHED` 4, `STA.FAILED` 8 and
`STA.DAMAGED` 12 are values for a row's own state in the low nibble of an `<item>`.
There is no `STA.START`: the command values are `CMD_STR` (which is STOP),
`CMD_WAI` and `CMD_RUN`.

### STA.get_run_eng

`STA.get_run_eng(sta)` → the run state, `0x0000`–`0x0003`

The functions below take a `sta` **value** — a number or hex text — and return a new
value; they change nothing in the document. An element object or no argument counts as
`0`.

```js
STA.get_run_eng(0x0347)      // 0x0003
STA.get_run_eng("0x0302")    // 0x0002
```

### STA.get_run_alm

`STA.get_run_alm(sta)` → the alarm bits: `STA.get_run_alm(0x0347)` → `0x0004`.

### STA.get_run

`STA.get_run(sta)` → run state and alarm: `STA.get_run(0x0347)` → `0x0007`.

### STA.get_cmd

`STA.get_cmd(sta)` → the command: `STA.get_cmd(0x0347)` → `0x0300`.

### STA.set_run_eng

`STA.set_run_eng(sta, eng)` → `sta` with its run state replaced:
`STA.set_run_eng(0x0347, STA.WAITING)` → `0x0346`.

### STA.set_run_alm

`STA.set_run_alm(sta, alm)` → `sta` with its alarm replaced:
`STA.set_run_alm(0x0347, STA.ALARM)` → `0x034B`.

### STA.set_run

`STA.set_run(sta, run)` → `sta` with run state and alarm replaced:
`STA.set_run(0x0347, STA.ALM_WAI)` → `0x034A`. The help calls it `STA.set_sta`; that
name does not exist.

### STA.set_cmd

`STA.set_cmd(sta, cmd)` → `sta` with its command replaced

```js
STA.set_cmd(0x0347, STA.CMD_STR)   // 0x0147: STOP
STA.set_cmd(0x0347, 0x0300)        // 0x0347
STA.set_cmd(0x0347, 3)             // 0x0047: 3 is not START, it is DISABLE
```

The command is a multiple of `0x0100`.

Use them on `evt.stan` in a chain, which the engine applies when the event ends:

```js
function over_limit(evt)       // val_fnc
{
    if (evt.valn > 90) evt.stan = STA.set_run_alm(evt.stan, STA.ALARM);
    return 0;
}
```

### STA.upd

**In:** any `<atr>_fnc` chain, also `sta_fnc`. **Reads:** `evt.stan`. **Changes:** the
element's `sta`, at once.

In a chain of any attribute but `sta`: when the alarm or run bits of `evt.stan` differ
from the element's, writes them to the element's `sta` now — its `sta_fnc` runs — and
resets `evt.stan`, so the functions after it see the `sta` as it is. Without `STA.upd` a
changed `evt.stan` is applied anyway, after the chain.

In a `sta_fnc` chain: writes `evt.valn` into `sta` directly, without running anything,
and logs `NOTICE ... STA.upd: id('X')/@sta <- 0x....`.

```xml
<var id="AGG2" val="0" val_typ="0x1142" val_fnc="[STA.onstalnk,STA.upd,main.agg]" .../>
```

`main.agg` sees `evt.stan` equal to `evt.stap`: the new `sta` is already on the element.

### STA.lnk

**In:** `sta_fnc`. **Reads:** `sta_lnk` — an address; `sta_lnk_idx` — a nibble position.
**Changes:** the value at `sta_lnk`.

When the element's run state or alarm changes, writes them (`sta & 0x000F`) as one
nibble into the value `sta_lnk` names, at nibble `sta_lnk_idx`, with `MskValue` — the
other nibbles are kept. Several elements can report into one value, one nibble each.
`sta_lnk` may hold `{=...}` placeholders. A failed write is one `NOTICE` line
(`STA.lnk: write failed, address = ...`). An older form, `sta_lnk_cfg`, writes chosen
states as bits.

```xml
<var id="AGG1" val="0" val_typ="0x1142" val_fnc="[STA.onstalnk]" .../>
<var id="D1" sta="0x0303" sta_typ="0x142" sta_fnc="[ELM.sta,STA.lnk]"
     sta_lnk="id('AGG1')/@val" sta_lnk_idx="1"/>
```

`D1` running normally puts `0x0030` into `AGG1`; `D1` in ALARM (`0x030B`) makes it
`0x00B0`.

### STA.onstalnk

**In:** `<atr>_fnc` of the value `STA.lnk` writes into. **Reads:** the value, nibble by
nibble. **Changes:** `evt.stan`.

Makes the element's own `sta` from the nibbles it collects: the highest alarm of all
nibbles, and WAITING when any nibble is WAITING (else RUNNING). Does nothing when the
element is disabled, its alarms are inhibited (`0x00C0`), or the value did not change.

```xml
<var id="AGG1" val="0" val_typ="0x1142" val_fnc="[STA.onstalnk]" sta="0x0303" sta_typ="0x142"/>
```

Measured: `AGG1` val `0x00B0` → `sta` `0x030B` (ALARM, RUNNING); a value `0x3662`
written by hand → `0x0306` (WARNING and WAITING). For alarm records from such a group,
the `ALM.*` functions take over: [Alarms, conditions and protocol chains](05_Alarms_Conditions_and_Protocol_Chains.md).
