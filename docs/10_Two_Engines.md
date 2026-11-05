# Two engines

Run **[PRJEDU_rep](../examples/cluster/PRJEDU_rep/README.md)** and
**[PRJEDU_cluster](../examples/cluster/PRJEDU_cluster/README.md)** first, and
**[PRJEDU_remote](../examples/cluster/PRJEDU_remote/README.md)** for
[a document on another node](#a-document-on-another-node). All run on one machine
with no licence (see `04_Licensing`: the second machine is what is sold).

Several engines work together along two axes, and they are independent:

| Axis | Purpose | Protocol | The question it answers |
|---|---|---|---|
| **Horizontal** (cluster) | redundancy: of N nodes able to do one job, one is active | `PRO.clt` + `PRO.rep` | "which of us is master?" |
| **Vertical** (field and centre) | division of labour: the field makes the data, the centre collects it | `PRO.rep` | "whose data is this?" |

`PRO.clt` only runs the **election** and carries no data. `PRO.rep` only carries
**data** and takes no part in the election. What connects them is the document's
`sta`: `PRO.clt` writes it, and `PRO.rep` reads it to decide which way to carry.

`PRO.rpc` is neither: it lets a script **ask** the node that has a document, instead
of keeping a copy. See [a document on another node](#a-document-on-another-node).

## A node is told apart by `tid`

```xml
<xdb id="XDB" tid="S01" rec_nid="1" log_lnk="%PRJ%/log/%TID%_XDB.log" sta="0x0300">
```

Each node has a root file that differs in `tid`. The documents below it are shared:
one set of files serves every node, and `%TID%` keeps the logs apart when several
nodes run on one machine.

Whether a `<con>` row is "my end" or "the peer's end" is decided by comparing its
`pro_nid` with `tid`. That is why every node carries the same rows.

## The role is in the document's `sta`

The top nibble of `sta` is the document's role:

```
bit 12-13  cluster state : 0 alone · 1 master · 2 spare · 3 transit
bit 14-15  role class    : 0 plain · 1 edge (field) · 2 hub (centre)
```

| Value | Meaning | Use |
|---|---|---|
| `0x0300` | plain, running | the node itself: its listener, its page. Never replicated |
| `0x3200` | transit, parked | **the start value of a cluster document.** It waits for the election |
| `0x1303` | master, running | what the winner's copy becomes |
| `0x2202` | spare, paused | what the other copies become |
| `0xB200` | hub + transit, parked | a mirror at the centre that is also a cluster member |
| `0x4300` | edge, running | the source document in the field |

!!! warning "A trap"
    Bit 12 is the master bit. `<doc sta="0x1200">` opens as **master**. To open as
    a spare write `0x2200`. Normally write `0x3200` and let the election decide.

A document joins an election by carrying the cluster bits. There is no list to
maintain unless you want groups (below).

## One listener, by path

Every node opens one port and everything shares it, told apart by path, so a
node's firewall has one hole and one certificate:

```xml
<con id="CN_EXT" xdb_fnc="[CON.tcp,PRO.http]" con_host="10.0.0.11" con_port="8443"
     con_mod="SERVER" con_ses="20" .../>
```

## The election

```xml
<con id="CN_S01" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" pro_nid="S01" sta="0x0303" sta_fnc="[PRO.sta]"
     con_host="" con_port="" pro="" pro_clt_link="#CN_EXT" pro_clt_path="/clt"
     pro_clt_host="10.0.0.11" pro_clt_port="8443" pro_clt_pri="1"
     pro_clt_cmd="" pro_clt_cmd_typ="0x1401" pro_clt_cmd_fnc="[CLT.cmd]" .../>
<con id="CN_S02" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" pro_nid="S02" ... pro_clt_host="10.0.0.12" pro_clt_pri="2" .../>
```

One row per node, the same rows on every node. `CLT.cfg` **must come before**
`CON.*` in the list: it is what writes `con_mod`, `pro_role`, `con_ses`,
`con_host` and `con_port`, so do not set those by hand. The row naming this node
listens on `pro_clt_link` + `pro_clt_path`; the others dial `pro_clt_host` +
`pro_clt_port`.

| Field | Default | Meaning |
|---|---|---|
| `pro_clt_id` | `APP` | names the cluster. Two clusters on one network need different ones |
| `pro_clt_pri` | digits of `tid` | smaller is preferred. Write it on the node's row, not in a class |
| `pro_clt_hb` | 5 | heartbeat, seconds |
| `pro_clt_expiry` | 2 | `hb × expiry` silent = the master is gone |
| `pro_clt_elec` | 3 | election window, seconds |
| `pro_clt_init` | 10 | how long a starting node listens first |
| `pro_clt_preempt` | 0 | `0`: a working master is not pushed aside by a better node coming back |
| `pro_clt_quorum` | 0 | a majority, below |

A lost master is noticed by the connection closing (at once) or by the heartbeat
stopping. `PRJEDU_cluster`, with `pro_clt_hb="2"`, measures the master back 1–3 s
after a kill, nothing skipped, at most the last step made again.

Each node writes what it knows on its own row: `@pro_clt_role` (`MASTER`, `SPARE`,
`ELECTION`), `@pro_clt_master`, `@pro_clt_term`; a `pro_clt_role_fnc` or
`pro_clt_master_fnc` runs a script when they change. `CLT.info(evt)` gives the
whole cluster in one call. **Check `mas_conf` before you write "master":** it is 1
only when the node was heard as master, 0 while it is a candidate.

### Handing over by hand

```js
evt.SetValue("id('CN_S01')/@pro_clt_cmd", "standdown");   // on the master
evt.SetValue("id('CN_S02')/@pro_clt_cmd", "takeover");    // on the node to take over
```

It takes effect on the node where it is written, in 2–3 s. It is an attribute
write, so that element's `xdb_acl` decides who may do it.

Do not do either of these instead:

| | Result |
|---|---|
| closing the master's cluster connections (`@sta=0`) | **two masters**: the peers elect one and this node's role stays master |
| parking the document's `sta` from another document | **no master**: `PRO.clt` does not see it and the peers wait as spares |

### A majority

Without a rule, nobody is counted: in a split network both sides can be master.
`pro_clt_quorum="2"` on the rows of a three-node cluster (five nodes: 3) makes a
node master only while it hears itself and N−1 peers by **messages**, and makes a
master that no longer does give up at once.

The cost is a longer failover (measured with `hb 2`, `expiry 2`: the cut-off node
gave up at 0.6 s, the other side elected at 5.6 s, never two masters), and a
minority elects nobody until someone gives `takeover`.

**A majority is worth it with three nodes or five.** With two, `pro_clt_quorum="2"`
means both must be up, so one crash stops everything: leave it off and accept that
a split can have two masters. Set it on every node in the same restart.

### Groups: a master per document group

`pro_clt_doc="CME/S00,CMA/S00"` on the rows of a `pro_clt_id` makes them a group
with its own election, its own priorities and its own path (`/clt1`, `/clt2`); it
drives only the documents on its list. One node can then be master of one document
and spare of another, so three servers can share the work. Write `pro_nid` on such
rows: the row id's last part (`CN_S01K3` → `S01K3`) would match no `tid`.

## Replication

```xml
<con id="CN_R01" xdb_fnc="[REP.cfg,CON.ws,PRO.rep]" pro_nid="S01" sta="0x0303" sta_fnc="[PRO.sta]"
     con_host="" con_port="" con_role="8" con_rct="2" con_idletmo="0"
     pro_rep_link="#CN_EXT" pro_rep_path="/rep" pro_rep_host="10.0.0.11" pro_rep_port="8443"
     pro_rep_doc="APP/S00" pro_rep_atr="*" pro_rep_dir="both" .../>
```

The same pattern, with `REP.cfg` before `CON.*`. There is no `<pub>` to write.

| Field | Default | Meaning |
|---|---|---|
| `pro_rep_doc` | | the documents it carries, comma separated. Required to receive |
| `pro_rep_id` | `*` | element id filter (`*`, `?`) |
| `pro_rep_atr` | `*` | attribute white list (`val,sta`) |
| `pro_rep_dir` | `out` | what the connection may carry: `out`, `in`, `both`. A vertical link needs `both` |
| `pro_rep_max` | 65536 | bytes of one bulk reply. Larger is not sent, and logged |
| `pro_rep_sta_msk` | `0xFFFF` | which bits of an incoming `sta` apply; the rest stay on the target |

**The direction is the document's, not the connection's.** The master sends because
its copy is master and the spare receives because its copy is spare; when the roles
change, the direction changes with them.

| Gate | Condition | |
|---|---|---|
| Horizontal receive | cluster member and spare | the master's changes are applied |
| Vertical receive | hub, not transit, and if a member not spare | the field's changes are applied, on the master only |
| Command forwarding | spare | a user's write goes to the master |

A mirror pulls the whole document once when it subscribes, then takes changes. An
element without an `id` of its own cannot be addressed and is not replicated.

**A blob is not replicated**, and an element added with `evt.AddElement` lives in
this engine only: use `ELM.new` for a list that must reach the spare
(`03_Scripting`).

### Writes into a spare

A user's write (role 0–7) into a spare document is forwarded to the master. A write
by the **engine** (a timer, a chain, role 8 or 9) from **another document** into a
document that is spare on this node is **refused**, with one line: it would stay in
the spare copy only, and the copies would differ for good. Send such a value as a
record (`HIS.rec`, `11_Records_and_Saving`) or write it from a script that runs
where that document is master.

## What a promotion changes, and what it leaves

A promoted document carries on from its copy. Nothing happened in the field because
a node died, so nothing is written as if it had:

| | At the promotion | Then |
|---|---|---|
| A healthy device | no alarm record | its blocks keep their values until the first answer |
| A device already in alarm | stays in alarm, no new record | back to normal at its first answer |
| A point in a level alarm | stays, no new record | as ever |
| **A device this node cannot reach** | its block and points go WAITING once its dial has failed | **one** alarm record, at the end of its settle window |
| A moving point's history | its first change in that period is held as the period's last record | from the next period, as ever |
| A row made at run time (from SQL, a script, replication) | its `sta` is its own: not touched, no job starts | |
| A list filled by `SQL.qry` at start | the rows stay until the query has succeeded | |

That pending history record is in memory: if the new master dies too before the
period ends, it is lost. A document elected at a cold start has no copy to carry on
from: its first records are written as at any start.

A document that starts parked registers its document-thread timers the first time
it runs as master. Its `xdb_init` and `xdb_wait` run on a spare too; `xdb_start`
runs when it becomes master.

## A field node

A field node is not a member of the central cluster. The document it produces is
`0x4300` (edge) there and `0xB200` or `0x8300` (hub) at the centre. Data goes up and
commands come down over one link with `pro_rep_dir="both"`, with no other setting.

If it shares a file with the centre, switch the rows it does not use off by emptying
`xdb_fnc` in `xdb_init`. Writing `@sta=0` is not enough: the engine reopens them.

## A document on another node

Replication keeps a copy here, to read with no network. Sometimes you want to ask
the node that has the thing instead: a value read now and then, a set point to
write, a function to run there. The script does not change, the `<doc>` line does:

```xml
<config>
    <doc id="LINE/L2" sta="0x0300" src="%DB%/db_L2.xml"/>                 <!-- here -->
    <doc id="LINE/L1" sta="0x0300" rpc_con="CN_S01,CN_S02"/>              <!-- on another node -->
</config>
```

```js
evt.SetValue("doc('LINE/L1')/id('RATE')/@val", 8);        // the same line as for LINE/L2
var s = evt.GetValue("doc('LINE/L1')/api.snap()");        // a function there, one call for many values
evt.GetValue("doc('LINE/L1@CN_S02')/id('COUNT')/@val");   // this connection, even when it is loaded here
```

A `<doc rpc_con>` creates nothing here: no document object, no thread, no log file,
no licence slot (the node that has it counts it). A document loaded here is always
local and costs nothing extra. Every `*Value` command crosses, on `xdb.` and on
`evt.`. `ForEach`, `GetElement` and subscriptions do not, and neither does any `#`
address, a blob or a buffer.

**The two ends** are `PRO.rpc` rows of their own, with a port of their own:

```xml
<!-- where the document is -->
<con id="CN_RPC" xdb_fnc="[CON.tcp,PRO.rpc]" con_host="10.0.0.11" con_port="9221" con_mod="SERVER"
     con_ses="8" con_acl="10.0.0.20" con_role="3" pro_rpc_thr="TH_RPC" pro_role="SLAVE" .../>
<!-- on the node that asks -->
<con id="CN_S01" xdb_fnc="[CON.tcp,PRO.rpc]" con_host="10.0.0.11" con_port="9221" con_mod="CLIENT"
     con_rct="1" pro_role="MASTER" pro_tmo="2" pro_rpc_down="5" .../>
```

| Field | Where | Meaning |
|---|---|---|
| `con_role` | serves | the most a caller may be here, whoever it is on its own. A timer, SYSTEM over there, is cut to it too. Without it the link is Guest. **7 or below**: role 8 is outside `xdb_acl` and could write anything |
| `con_acl` | serves | who may connect at all |
| `pro_rpc_thr` | serves | requests run on the workers of that `<thr>` and the link goes on reading. Without it one slow function holds every other call. A full queue answers `busy` at once |
| `pro_tmo` | asks | how long a call waits for an answer, seconds |
| `pro_rpc_down` | asks | after a call timed out with nothing received since it left, calls fail at once for this many seconds (default 10), then one tries. Do not set it to 0 on a listed connection |

The far node applies every gate: `xdb_acl`, the write mode, the `*_fnc` chains.
An address reaches only the `api.` scope. The engine never opens a connection because
of an address: a host no `PRO.rpc` `<con>` talks to is refused with a line.

**When it fails:**

| | `GetValue` | `SetValue` | Log |
|---|---|---|---|
| no such attribute | undefined | 0 | none |
| `xdb_acl` refused | undefined | 0 | on the far node: who and what |
| no link, no answer, parked, the document is not there | undefined, **a throw inside `try`** with `e.message` | 0, a throw inside `try` | one line per peer and kind, then every 10 minutes |

**A write with no answer is not repeated.** It may have been applied, and the line
says the result is `UNKNOWN`.

### A list: a failover the caller does not see

Every call starts at the first connection in `rpc_con`:

| On this connection | The next one |
|---|---|
| no link, `NOT TRIED`, busy | asked: nothing happened here |
| parked there, and the command writes | asked |
| no answer to a read | asked, after `pro_tmo` |
| no answer to anything else | **not asked**: it may have been applied |
| the document is not there, refused, the function threw | not asked: this is the answer |

So a cluster's document can be listed by its nodes and the caller changes nothing
when the master dies. `PRJEDU_remote` measures it: the master killed, 0 to 12 writes
refused, 0.4 to 3 s to the next acknowledged write with `pro_tmo="2"`.

A parked copy answers **reads** once it has had its first full sync, and until then
says so and the list goes on. That is a mirror: **the first connection that answers
decides which copy you read**, and after a master comes back as a spare your reads
come from it again, one or two writes behind. When a read must be current, name the
master with `doc('X@PEER')` or ask a function there. Update a source and its mirrors
together: a source older than 4.3.4.657 does not say a sync has ended.

### What it costs

Over loopback `PRJEDU_remote` measures a remote read at 60 µs to about 1 ms and a local
one at 1 to 11 µs, script included, on a busy machine. So:

* **A remote call waits on the thread that makes it**, up to `pro_tmo`. Make it on a
  thread that may wait: a timer with `evt_thr` and a worker, or a chain queued onto
  one. Not on a connection's thread and not on the document's own.
* A value read all the time belongs in a mirror (`PRO.rep`).
* One call for many values: `doc('X')/api.f()`, `doc('X')/json(..)`, `count(..)`
  run on the far node.
* A request may carry up to 8 MiB, nothing to configure.

`doc('LINE/*')` covers the documents here and, after them, the ones in `<doc rpc_con>`,
one call each. One that does not answer is left out of the array and the log says why.

## Security

The peers do not log in; trust comes from the connection. So on these rows:

| Field | Why |
|---|---|
| `con_acl` | the address list is the only protection. Without it, there is no filtering |
| `con_role="8"` | gives a replication peer the Document role, which is outside `xdb_acl`. **On replication rows only**: an election row carries `pro=""` instead, and a `PRO.rpc` row 7 or below |
| `con_idletmo="0"` | a replication link can stay silent for a long time |
| TLS | `CON.wss` with your own certificates across any network you do not own |

## Checklist

1. `tid` differs on every node, and `rec_nid` too (`11_Records_and_Saving`).
2. Cluster documents open `0x3200` (`0xB200` at a hub), never `0x1200`.
3. `CLT.cfg` and `REP.cfg` come before `CON.*`.
4. `con_acl` on every election and replication row.
5. `con_role="8"` on replication rows only; `pro=""` on election rows.
6. `pro_clt_pri` on the rows, not in a class.
7. `pro_rep_doc` filled in on every end that receives.
8. A vertical link is `pro_rep_dir="both"`.
9. `pro_clt_cmd_fnc="[CLT.cmd]"` if you want a planned hand-over.
10. A value crossing between documents is not an engine write into a spare.
11. A `PRO.rpc` row that serves has `con_acl`, and `con_role` of 7 or below.
12. A call to another node is made on a thread that may wait.

## Reading the log

```
PRO.clt: role=MASTER term=2                      on ONE node only
PRO.clt.drive: MASTER APP/S00 sta=0x1303         the documents you expected
PRO.clt.tick: 20 role=MASTER pri=1 master=S01    every 10 s; with a quorum, heard= and quorum=
write refused -- document 'X' is SPARE on this node and the write came from document 'Y'
CAyXDB.config: document 'LINE/L1' is on another node, over 'CN_S01,CN_S02'
RMT: doc('LINE/L1') over 'CN_S02': no link -- id('SEQ')/@val
RMT: doc('LINE/L1') over 'CN_S02': the document is parked (SPARE) there, the write was refused -- id('SEQ')/@val
RMT: doc('LINE/L1') over 'CN_S01': no answer in 2000 ms, the result of the write is UNKNOWN -- id('SEQ')/@val
```

Engines before 4.3.4.647 write `rol=` for `role=`.

| Symptom | Cause |
|---|---|
| `con_mod` missing, the row never comes up | `CLT.cfg` / `REP.cfg` written after `CON.*` |
| A node that comes back takes the role | `pro_clt_preempt="1"` |
| The mirror refuses everything | the target document's `sta` closes the gate |
| Some elements never arrive | they have no `id` of their own |
| Two clusters hear each other | the same `pro_clt_id` |
| A non-preferred node wins at a cold start | the nodes start further apart than `pro_clt_init` + `pro_clt_elec` |
| A remote write answers 0 with no throw | the far node's `xdb_acl` refused the role left after `con_role`; its log says who and what |
| Every read of a remote document stops the page | the call is made on the thread that serves the page: move it to a worker |
| A remote document loads under another name | the name is the `id` in the file's `<xdb>`, not in the `<doc>` line. Two documents need two files |
