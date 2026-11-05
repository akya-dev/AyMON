# Values that survive a restart

The engine keeps its values in memory. That is why it is fast, and it is why, until now,
a counter, a set point an operator changed or a list of jobs started again from the XML
file after every restart — unless a script wrote it to a database. From 4.4.1 an
attribute named in **`xdb_dur`** is kept on disk as it changes and comes back at the next
start: after a clean stop, after a crash, after a power cut. No database, no script, and
the XML file is never written. Run
[PRJEDU_durable](../examples/data/PRJEDU_durable/) first: a mixer whose counter, set point
and job list come back after a kill, and a twin counter that does not.

---

## Turning it on

Two things: a directory on the root, and the attributes to keep.

```xml
<xdb id="XDB" rec_dir="%PRJ%/log/rec" ...>                           <!-- the root -->

<var id="SP" val="50" val_typ="0x0308" xdb_dur="val"/>               <!-- one attribute -->
<cls id="cls_PUMP" lim_hi="10" lim_lo="1" xdb_dur="lim_hi,lim_lo"/>  <!-- every element of a class -->
<var id="RECIPE" a="1" b="2" xdb_dur="*"/>                           <!-- every attribute it holds -->
<list id="JOBS" xdb_dur="*"/>                                        <!-- and a list's rows -->
```

| On the root | Default | Meaning |
|---|---|---|
| `rec_dir` | none | Where the log lives. No `rec_dir`, nothing is kept (one line says so). One directory per engine |
| `rec_flush` | 10 ms | A change reaches the operating system this often. **A killed process loses at most this** |
| `rec_sync` | 1000 ms | And the disk (fsync) this often. **A machine that loses power loses at most this**, plus an fsync that was running |
| `rec_ckp` | 60 s | At most this often a document is checkpointed, so the log read back at a start stays short. `0` = never |
| `rec_seg` | 4096 KB | The size of one file of the log |
| `rec_rate` | 0 | A wear budget in KB a second, for an SD card (below). `0` = none |

**An element needs an id of its own**: it is found again by it. An element with no id, or
one that shares its id, keeps nothing and one line says which.

## What is kept

Every type comes back as it was: numbers, text, decimals, times. A list with `xdb_dur="*"`
keeps its **rows**: one added at run time (by a script, `ELM.new`, `SQL.qry`, replication)
comes back with everything it is made of, and one removed stays removed — a row that came
from the file too. A row needs an id.

`*` keeps an element's own attributes, but not what the engine owns: `*_fnc`, types, `id`,
the `xdb_` attributes, counters, a polled `<io>`'s `pro` and `val` (it is read again from its
device), a blob. Name an attribute to keep it anyway (`xdb_dur="pro"`).

**One element is one moment; two elements are not.** A record holds what one element held
at one instant. Two elements written in one script step can land in two different writes
to the disk, so after a crash one can be a step ahead of the other. A script that derives
one from the other must not assume more: remove a row by its own number, not by a counter
kept elsewhere — the example does exactly that.

## What a crash costs

| | Loses at most | Measured |
|---|---|---|
| A killed process | `rec_flush` (10 ms) | 40 kills at random moments: 10–15 ms of writes |
| A machine that loses power | `rec_sync` (1 s) + an fsync that was running | A Raspberry Pi 5, its plug pulled six times: 100–800 ms, every row consistent |

What a store costs in the engine is a mark (15–25 ns); a thread of its own writes the last
value later, so a value written a thousand times a second costs the disk the same as one
written once in a window.

## At a start

The values come back after the XML is read and before anything in the document reads a
value: no event, no `*_fnc`, nothing published. So a timer's period or a connection's host
starts with its kept value.

```text
DUR: 'MIX/S00' -- 6 element(s) durable, 0 refused; 123 value(s), 40 row(s), 30 removal(s) of the last run back in 0 ms, ...
```

**The file changed meanwhile?** The kept values still win — the engine cannot know whether
the operator's value or your edit is the newer — but the log names what they override:

```text
DUR: 'MIX/S00' id('SP')/@val: file "50", kept "61.5"
DUR: the file of 'MIX/S00' changed after these values were written -- 1 kept value(s) override it; doc('MIX/S00')/#dur = "drop" and a restart let the file win
```

To let the file win, write `"drop"` into `doc('MIX/S00')/#dur` (an Engineer, as `#save`) and
restart, or delete `rec_dir` while the engine is stopped.

## Waiting for the disk

Most values need nothing more. For an answer someone acts on — a job closed, a command
confirmed — a script can wait until it is on the disk:

```js
evt.SetValue("id('JOB')/@state", "closed");
if (xdb.sync() != 1) evt.Log(3, "job closed, not yet on the disk");
```

`xdb.sync([ms])` answers 1 when every kept value written before it is on the disk, 0 when
that did not happen in `ms` (3000) or the disk fails, -1 when nothing is kept on this
engine. It waits for one fsync — about a millisecond on a server's disk, a few on an SD
card, seconds when the disk is busy — so a connection's own thread may not call it: it is
refused there, with one line, rather than hold every device of the connection.

`xdb.dur()` (an Engineer) answers the log's state: does it write, its files, commits, fsyncs,
checkpoints, the longest fsync, the free space, and a row per document. The example shows
it on its page.

## When the disk fails

The engine does not stop. One line says what failed, the values stay in memory, the root's
`sta` goes to ALARM (`durable log: open failed 12 s ago, kept values in memory only`), and the
disk is tried again every 10 seconds. When it writes again, every document that lost a
change gets a checkpoint at once, so what was written during the outage is on the disk
again. A WARNING comes first when the free space under `rec_dir` falls under 64 MB, or under
four of its files when those are larger.

**`rec_dir` belongs to one engine.** A project started twice — a start script run twice —
would have two engines writing the same files. The second one keeps nothing, says
`DUR: ... is used by another engine (dur.lock) -- this one keeps nothing`, and its root shows
ALARM.

## On an SD card

A card wears with what is written. `rec_rate="16"` gives the log a budget of 16 KB a second:
while the load is over it the engine writes less often, up to `rec_sync`, and comes back
by itself when the load falls. What it spends is what a *kill* can lose, never what a power
cut can. Measured on a Raspberry Pi 5's card, a day:

| Load | No budget | `rec_rate="16"` |
|---|---|---|
| One element, 16 values, 100 writes a second | 2.6 GB | 1.45 GB |
| 100 elements, 4 values, 20 times a second | 21.9 GB | 1.07 GB |
| 2000 elements, 10 times a second | 75.5 GB | 7.5 GB |

Mount the card `noatime` (Raspberry Pi OS does).

## In a cluster

With two engines ([10_Two_Engines](10_Two_Engines.md)) each node keeps its own copy on its own
disk, and the question after a whole site went down is *whose copy is newer*. The election
answers it: each node keeps a **generation** with its copy, one more at every hand-over, and
the newest copy is elected before the priority. At a start a node waits for every node of its
group (`pro_clt_cold`, 60 s) before it stands, so an old copy that comes back first is not
elected alone over a newer one. A group whose documents keep nothing is elected as before.

## What it does not do

* It is not a database. Values must fit in memory, there is no query language over the
  log, and a value's *history* belongs in [records](11_Records_and_Saving.md).
* The XML file is never written. `#save` is still the way to put a value into it.
* No network share and no WSL `/mnt/c` for `rec_dir`: what an fsync promises there is not known.
* A spare that reconnects in a cluster still takes the master's whole copy.
