# Records, history and saving

Two jobs that keep something after the engine stops: **history** in a database and
**configuration** in the document's own file. Both are done by the engine. Run
[PRJEDU_records](../examples/data/PRJEDU_records/) first: a tank whose alarms, events and
value history go through these sinks into SQLite, and a kill that shows the journal read
back.

---

## Records

Every alarm, every event or audit line and every recorded value is a **record**: a
small JSON text with an id of its own. The engine carries it from the node that makes
it to the node that keeps it, holds it while that node or its database is away, and
writes the history row itself. **A row is in the table once, and a record is let go
only after its row is committed.** Scripts no longer build `INSERT`s for history.

| Field | Meaning |
|---|---|
| `uid` | 53 bits, time-ordered, never repeated by a node; the table's key |
| `src` | the node that made it (`tid`) |
| `knd` | `alm`, `evt`, `aud`, `val`, `row` |
| `rol` | the role that made an `evt`, `aud` or `row`. The engine writes it; a script cannot give it |
| `tim` | milliseconds; for a value, the value's own time |
| the rest | the kind's fields: an alarm's `doc rid atr valp valn stap stan fnc pri desc why`, a value's `doc rid atr txt typ pro val sta` |

### Where records go

```xml
<xdb id="XDB" tid="S01" rec_nid="1" rec_dir="%PRJ%/log/rec"
     alm_adr="doc('HIS/S00')/id('ALM_H')"
     evt_adr="doc('HIS/S00')/id('EVT_H')"
     his_adr="doc('HIS/S00')/id('VAL_H')" ...>
```

Write the three addresses once on the root. A document without one uses its parent's,
and `""` switches it off for that document.

| Attribute | Records | Made by |
|---|---|---|
| `alm_adr` | alarms, device alarms, the engine's health | `ALM.*`, `ALM.devsta`, the health bits |
| `evt_adr` | events and audit lines | `HIS.rec`, `[HIS.evt]` |
| `his_adr` | value history | `[HIS.val]` |

### The sink

The document that keeps the history declares it. A table must already exist:

```xml
<con id="CN_SQL" xdb_fnc="[CON.sqlite,PRO.sql]" con_host="%PRJ%/log/h.db" con_mod="CLIENT" con_ses="0"
     con_tmo="5" con_rct="2" con_keeptmo="0" con_idletmo="0" pro_role="MASTER" pro_tmo="10" pro_try="1"
     pro="1" pro_typ="0xC412" pro_fnc="[]" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>

<his id="ALM_H" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142"
     his_rec="alm" his_tbl="ALM" qry_con="CN_SQL"
     his_col="id=uid,tim:loc,doc,rid,atr,fnc,stap,stan,why"
     new="" new_typ="0x1401" new_fnc="[HIS.new,ATR.nup]"/>

<his id="VAL_H" xdb_fnc="[HIS.cfg]" sta="0x0303" sta_typ="0x142"
     his_rec="val" his_tbl="VAL" qry_con="CN_SQL"
     his_col="id=uid,tim:loc,doc,rid,val,sta"
     new="" new_typ="0x1401" new_fnc="[HIS.new,ATR.nup]"/>
```

`CON.sqlite` needs `xdb_lib="AyPRO_sqlite"` on the root (`05_Connections_and_Protocols`).

| Attribute | Meaning |
|---|---|
| `his_rec` | the kinds it takes: `alm`, `evt,aud`, `val`. Absent = any |
| `his_tbl` | the table. Absent = a sink with no SQL |
| `his_col` | the columns, a **white list**: `column[=field][:kind]`. `id=uid` is the key. Nothing a record carries reaches SQL unless named here |
| `qry_con` | the `CON.sql` of the same document that writes the rows |
| `his_bat` | rows per statement (default 200) |
| `his_spl` | rows that may wait for the database (default 20000) |
| `his_ident` | `1`: the key is an `IDENTITY` column (SQL Server) |
| `new_typ` | `0x1401` runs at once on the writer's thread; `0xE401` on the sink document's own thread, one record after another (for a hook that does SQL or mail) |
| `new_elm_new_*` | keep the open items as elements too, as `ELM.new` does (`03_Scripting`); the hook gives or changes the row with `HIS.row(evt, {..})` |

A column kind: none = as the field is; `:dtm` = a millisecond field as a time value;
`:loc` = this machine's local time text with its offset; `:txt` = as text.

Once a second the connection writes the ready rows in multi-row statements, skipping a
key already there. **Repeats need a unique key that holds the key column**: on
PostgreSQL and SQLite it is the table's own unique key (`PRIMARY KEY (id)`, or
`(id, tim)` on a TimescaleDB hypertable), and a table with none takes every repeat.

| When | What happens |
|---|---|
| The database refuses the statement | the rows **wait** (1, 2, 4 … 30 s), one ERROR line a minute with the driver's text |
| One row refused alone while others go in | that row is dropped, with one ERROR line |
| The waiting room is full | a record stays at its source and comes again |
| The sink's document is demoted or stops | its waiting rows go back to their sources |

### A value's history

```xml
<var id="LEVEL" sta="0x0303" sta_typ="0x1142" val="0" val_typ="0x1308" val_rou="0.1"
     val_fnc="[ATR.rou,ALM.onlvl,IF.chg,HIS.val]" val_alm_onlhi_alm="95"
     his_per="600" his_dbd="0.5"/>
```

`his_per` is a period in seconds (600 by default), ending at multiples of itself. The
first change of a period is a record at once, and the last change is one pending record
per point, written when the period ends. A point therefore writes at most two rows a
period; a quiet one, one. With `his_dbd` a change closer than that to the value last
written makes none. Only a running point records.

**The pending record is in memory**: a crash, or a document stopping, loses it (it is
counted). `HIS.valstat()` answers `{points, pending, now, end, dbd, lost, refused}`.

### From script

| Call | Does |
|---|---|
| `HIS.rec(evt, "evt" \| "aud", text \| {fields})` | an event or audit record into `evt_adr`; answers its uid |
| `[..,HIS.evt]` | in a chain: an event `"<desc>: 'old' -> 'new'"` when the value changed |
| `HIS.row(evt, {fields} \| null)` | inside a sink's hook: the row takes these fields / no row |
| `HIS.uid(evt)` | inside a hook: the record's uid, which is the row's key |
| `HIS.put(evt, "doc('X')/id('Y')", {fields})` | a history row outside a hook |
| `HIS.pending(uid)` | 1 while that row waits: an `UPDATE` of your own row waits for it |

```js
HIS.rec(evt, "aud", { txt: "set point changed" });
```

A record made by a low role is safe to send: where the sink's `xdb_acl` would refuse it,
an `evt` or `aud` is written as information only (it says what happened, and cannot start
a job), and a `row` is refused with one line.

### Over several nodes

| Sink's document | The record |
|---|---|
| loaded here, not parked, running | is written here now |
| loaded here, not parked, still loading | waits in the journal until the document runs (engine 4.3.4.649) |
| loaded here, parked (spare, transit) | goes into this node's **journal** |
| not loaded here (a field node) | goes into the journal |
| no link carries it yet | waits in the journal; after 30 s with no link it is written directly, once |

A journalled record travels over every `PRO.rep` link whose `pro_rep_doc` names the
sink's document, and is sent again after `rec_tmo` seconds without an answer. No
connection has to be added. The sink remembers the last 4096 uids of each source, so a
record may arrive twice and be written once.

| Root attribute | Default | Meaning |
|---|---|---|
| `rec_nid` | from `tid` | 0..255, written into every uid. **Write it on every node, different on each:** two nodes with one number can make the same id |
| `rec_max` | 20000 | records the journal holds. Full: the oldest `val`, then `evt`, `aud`, `alm` goes |
| `rec_tmo` | 5 | seconds before a journalled record is sent again |
| `rec_dir` | | a directory: the journal is on disk too |
| `rec_seg` | 4096 | KB per journal file |
| `rec_sync` | 1000 | ms between disk commits |

With `rec_dir` a killed process loses nothing journalled, and a power cut at most
`rec_sync` ms. Without it, a node that dies loses what its journal held. On an engine
before 4.3.4.649 a record read back before the sink's document had made its `<his>` could
still be lost, with no line (`PRJEDU_records` says how often).

### What it is not

No row updates or deletes, no query path: `SQL.qry` still reads a table back into
elements. At a start the engine does not reload the open items from SQL: a document's
script does. The pipeline is part of the engine on Linux too, but its test rigs have run
on Windows, against SQLite, SQL Server and PostgreSQL.

### Reading the log

| Line | Meaning |
|---|---|
| `HIS(ALM_H): sink of 'alm' records into table ALM over CN_SQL, 9 column(s), key id, ..` | the sink was made |
| `HIS(<id>): no sink -- <why>` | the configuration is wrong; nothing is kept |
| `HIS(<id>): N row(s) wait -- table T refused them: <driver text>` | the database is away, or `his_col` names a column the table lacks |
| `HIS(<id>): rows taken N written N in N statement(s) \| waiting N \| dropped N \| spool full N` | every 10 s when it moved |
| `HIS.val: id('..') -- document D has no his_adr` | the point's document names no value sink |
| `REC: record ids carry node 1 (rec_nid), tid 'S01'` | at start; "derived from tid" means write `rec_nid` |
| `REC: journal N (oldest S s) \| journalled .. sent .. answered ..` | every 10 s when it moved |
| per `PRO.rep` link: `records out put= answered= \| in written= repeats= not ours= refused=` | that link's share |

---

## Saving a document

A save **edits the file the document was loaded from** (engine 4.3.4.640 and later).
The file is read, its start tags are walked beside the live elements, and only the
values that differ are replaced. Comments, blank lines, line ends, the DOCTYPE, the
attribute order and the spacing keep their bytes. The text goes to a temporary file and
then replaces the original, so if anything is wrong nothing is written.

| Call | Meaning |
|---|---|
| `doc('X')/#save` = `1`, `xdb.save()` | **Whole:** every attribute written in the file is brought up to date. Nothing is added |
| `doc('X')/#save` = `"//dev/bi/@evt_per"`, `xdb.save("//dev/bi/@evt_per")` | **Selector:** only what it names |
| `xdb.save(["id('A')/@a", "id('B')/@c"])` | several selectors, one write |
| `xdb.save(sel, path)`, `xdb.save("%DB%/copy.xml")` | the edited text goes to another file |

A text is a selector when it starts with `/`, `[` or `id(`. Both forms need role Engineer
or above; `SetValue` answers 0 when the save failed, and the log says why.

| Selector | Effect |
|---|---|
| `path/@atr` | that attribute, added behind the tag's last attribute if the tag lacks it |
| `path` | an element, added at its parent's end if the file lacks it |
| `id('X')` with no live X | X is taken out of the file with its lines |

So a device added at run time is saved by naming it after it is added, and a deleted one
by naming it after it is deleted:

```js
evt.SetValue("doc('PLT/S00')/#save", "id('" + id + "')");
```

An element it selects that is not in the file (a list row made at run time) refuses the
whole save: all or nothing.

### What a whole save writes

| Attribute | Whole save | Named |
|---|---|---|
| An ordinary attribute | written | written |
| `sta` of `thr`, `con`, `dev`, `bi`, `io`, `var`, `list` | live high byte + the file's low byte | the same |
| `sta` of `<xdb>`, `<doc>` | no | the same as above |
| `pro`, `val` of an `<io>` | no | no: it is the field's value |
| `pro` of another element | no | written |
| `val` of another element | written when it has no `pro` | written |
| A volatile type (`0x8000`) | no | no |
| An attribute with its own chain (`evt`, `qry`, `opr`, `new`, `ref`, `his`) | no | written |
| `con_host` empty in the file | no | written |
| `*_fnc`, `xdb_cls`, `xdb_acl`, `id`, `*_typ`, counters | no | written |

Of `sta`, the high byte is the command and the role, so an operator's stop is kept. The
low byte stays as the file has it because the engine raises it at every start. While a
document is not running or is parked no `sta` is written.

### Limits

* The source must be UTF-8.
* A document not read from a file (a mirror, `new XML(text)`) is written whole.
* A whole save writes a value a script changed at start, a `con_host` for example. Use a
  selector when that matters.
* A hand edit made while the engine runs is overwritten by a whole save with the old live
  value. A selector touches only what it names.
* Only this node's file is written: the other nodes of a cluster keep theirs.
* An element with no `id` goes by its place among its siblings, so if one is deleted the
  save is refused. Give it an `id`.
* An engine before 4.3.4.640 ignores the value of `#save` and rewrites the whole file.

| Line | Cause |
|---|---|
| `EvtSaveDoc OK: ..\db_T.xml (1 value(s) edited)` | done |
| `.. is not in the file, nothing was written` | the selector chose a run-time element |
| `an element without id is no longer in the document` | give it an id |
| `the source file ... cannot be read` | the file was moved or removed |
| `line N: ...` | the file was edited by hand and is no longer well formed |
