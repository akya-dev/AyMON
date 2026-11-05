# PRJEDU_remote — a document on another node

A script in one engine reads and writes a document in another, with the line it
would use for a document of its own:

```js
evt.SetValue("doc('LINE/L1')/id('RATE')/@val", 8);
```

`LINE/L1` is a small production line. It runs as a cluster on two engines, S01 and
S02. A third engine, OPS, has the page, and all it knows about that document is one
line of XML:

```xml
<doc id="LINE/L1" sta="0x0300" rpc_con="CN_S01,CN_S02"/>
```

Kill the master and OPS's script goes on writing. It never learns that anything
happened, or which node took the write.

Open three command windows in this directory:

```bat
run_S01.bat
```

```bat
run_S02.bat
```

```bat
run_OPS.bat
```

On Linux: `./run_S01.sh`, `./run_S02.sh` and `./run_OPS.sh`, in three terminals.

Any order. Then open **http://127.0.0.1:8123/**. The election takes about ten seconds;
until then the page says why nothing answers. Now close the window of the node that
says **master**.

| | S01, S02 | OPS |
|---|---|---|
| root file | `db/AyXDB_S01.xml`, `db/AyXDB_S02.xml`: one line differs, `tid` | `db/AyXDB_OPS.xml` |
| listens on | 9211, 9212 (election, replication), 9221, 9222 (calls from other nodes) | **8123**, the page |
| documents | `LINE/L1` (the job, a cluster member), `SYS/S00` (the node's own rows) | `OPS/S00` (the page and the script that asks), `LINE/L2` (a twin of the job, here) |

The election and the replication are [PRJEDU_cluster](../PRJEDU_cluster/)'s, unchanged.
This example is about the third engine.

## The page

**The same call, four times.** `main.ask` is one function. It asks `api.snap()` through
the list, through each connection by name, and in this engine:

| `doc('..')` | Goes |
|---|---|
| `LINE/L1` | down the list in `rpc_con` |
| `LINE/L1@CN_S01`, `LINE/L1@CN_S02` | over that connection and no other |
| `LINE/L2` | nowhere: it is in this engine |

**Writes through the list.** Five writes a second to `LINE/L1`'s `SEQ`, counted: acknowledged,
refused, the longest time without an acknowledged one, and the node that took the last one.

**What the far node allows.** RATE is open to an Operator, RATE_MAX to an Engineer. Write
RATE_MAX on L1: refused. Write it on L2: done. The script that writes is the same and it is SYSTEM
on this engine. On L1 it is cut to the Operator of the link at the far end.

**What it costs**, read by read, and **`doc('LINE/*')`**, which covers both lines.

**What the caller saw**: every `e.message`, as it happened.

## How it is put together

**The end that asks.** Two `PRO.rpc` rows in `db_OPS.xml`, one to each node, and the
`<doc>` line above. That line creates nothing here: no document object, no thread, no log
file, no licence slot.

```xml
<con id="CN_S01" xdb_fnc="[CON.tcp,PRO.rpc]" con_host="127.0.0.1" con_port="9221"
     con_mod="CLIENT" pro_role="MASTER" pro_tmo="2" pro_rpc_down="5" .../>
```

The engine never opens a connection because of an address. `doc('LINE/L1@10.1.2.3')` throws
`no PRO.rpc connection has this id or talks to this host`.

**The end that serves.** One row in `db_SYS.xml`, and it is the whole of the security:

```xml
<con id="CN_RPC" xdb_fnc="[CON.tcp,PRO.rpc]" con_mod="SERVER" con_acl="127.0.0.1"
     con_role="3" pro_rpc_thr="TH_RPC" pro_role="SLAVE" .../>
```

| | |
|---|---|
| `con_acl` | who may connect at all |
| `con_role` | the most a caller may be here, whoever it is over there. Keep it at 7 or below: role 8 is outside `xdb_acl`, which is for replication rows only |
| `pro_rpc_thr` | requests run on `TH_RPC`'s workers, and the link goes on reading. Without it one slow function holds every other call |

The far node applies every gate it applies to its own users: `xdb_acl`, the write mode, the
`*_fnc` chains.

**One call for many values.** A call costs a round trip, so `api.snap()` in `db_LINE_api.js`
collects what the page needs and answers with one JSON text. An address reaches only the scope
called `api`: `doc('LINE/L1')/main.step()` answers nothing.

**Which thread.** A remote call waits on the thread that makes it, up to `pro_tmo`. So `main.tick`
runs on `TH_CALL`, a thread with a worker, and a click on the page is queued onto the same
thread: `REQ` is `val_typ="0x3401"` with `val_que="multi"`, so the connection that took the click
goes on at once and two quick clicks stay two requests.

**When a call fails.** `main.ask` and `main.write` are in a `try`:

| | `GetValue` | `SetValue` | Inside `try` |
|---|---|---|---|
| no such attribute | undefined | 0 | no throw |
| the far `xdb_acl` says no | undefined | 0 | no throw, and the far node's log says who and what |
| no link, parked, no answer, no such document | undefined | 0 | **throws**, `e.message` says why |

**The list.** Every call starts at the first connection:

| On this connection | The next one |
|---|---|
| no link, `NOT TRIED`, busy | asked: nothing happened here |
| parked there, and the command writes | asked |
| no answer to a read | asked, after `pro_tmo` |
| no answer to a write | **not asked**: it may have been applied, so the message says `UNKNOWN` |
| no such document, refused, the function threw | not asked: this is the answer |

**The first connection that answers decides which copy you read.** When S01 comes back as the
spare, the first row says `S01, spare` again: a read comes from its mirror, a write or two behind,
while the writes reach S02. When a read must be current, name the master: `doc('LINE/L1@CN_S02')`, or
ask a function there.

## What it measured

On a Windows 11 laptop and on Linux (WSL, Ubuntu 22.04), engine 4.3.4.659, a script killing the master
and reading the page's values, with other work running on the same machine:

| | Windows | Linux |
|---|---|---|
| all three started, and the first master | 8 to 10 s, 35 to 45 writes refused until then | 10 s, 39 to 41 refused |
| a read of `LINE/L2`, in this engine | 1.2 to 2.8 us | 1.8 to 5.8 us |
| a read of `LINE/L1`, on another node | 60 to 220 us | 180 to 820 us |
| the master killed: next acknowledged write | **1.2 to 3.0 s** (8 kills) | **0.6 to 2.6 s** (6 kills) |
| writes refused meanwhile | 0 to 10 | 2 to 12 |
| the same with `pro_tmo="1"` | 0.6 to 1.6 s (4 kills) | 0.4 to 2.2 s (3 kills) |
| the killed node started again | spare, and the list reads from it if it is S01; writes reach the master | the same |
| CTRL-C (Ctrl-Break / SIGINT) | all three exit 0 | all three exit 0 |

**Why the gap is often two seconds.** The spare takes over in about a second. A call that was on the wire
when the process died gets no answer, and waits `pro_tmo`, which is 2 s here. A read then goes on to the
next connection; a write says `UNKNOWN` and is not repeated, because it may have been applied. So
`pro_tmo` is the price of a dead peer on the calling thread, and it also has to cover the slowest function
you call.

**In the log.** On OPS at the start, one `ERROR` line per connection and kind: `no link`, `parked`,
`has had no full sync`, then nothing for ten minutes. When a node is killed, a few lines about closing the
connection to it, on the others. When a node is promoted or rejoins, one `PRO.rep.in` line (`takes no
replication`), as in PRJEDU_cluster: a message that arrived while the document was changing roles.

## Try this

Each row was tried on a copy of the project, on the same engine.

| Do | See |
|---|---|
| `con_role="6"` on `CN_RPC` in `db_SYS.xml` | **Write RATE_MAX** on L1 is done now: an Engineer's value, an Engineer's link |
| take `con_role` away | reads go on (the document gives every role read), and every write is refused: the caller is a Guest on that node, whoever it is on OPS |
| `rpc_con="CN_S02,CN_S01"` in `AyXDB_OPS.xml` | S01 is master, but the list's row says `S02, spare`: reads come from the mirror. The last write is still taken by S01 |
| `rpc_con="CN_S01"`, then kill S01 | S02 is master, and the row `LINE/L1@CN_S02` shows it, but every call through the list fails with `no link` or `NOT TRIED`: one connection is one way in |
| kill both nodes | every `LINE/L1` row says why, the star answers `LINE/L2` alone, and the page and L2 go on |
| `pro_tmo="1"` in `cls_RPC` | a shorter gap at a kill (table above). A far function that takes longer than this now fails |
| in `main.ask`, ask `doc('LINE/L1')/main.step()` | nothing comes back: an address reaches only `api`. `doc('LINE/L1')/#eval` throws `this address does not cross` |
| ask `doc('LINE/L1')/count(data/var)` or `doc('LINE/L1')/json(id('RATE'), 'id,val')` | they run on the far node and answer with one call: `7`, and the element as JSON |
| ask `doc('LINE/L9@CN_S01')/id('RATE')/@val` | throws `the document is not on that node` |
| point `<doc id="LINE/L2">` at `db_L1.xml` | no line, and the document loads as `LINE/L1`, here, in place of the remote one: **a document's name is the `id` in its file**. Two documents need two files |
| two machines | `con_host` of `CN_EXT` and `CN_RPC` = the node's address, `pro_clt_host` / `pro_rep_host` of the rows, `con_host` of `CN_S01` / `CN_S02` in `db_OPS.xml`, `con_acl` everywhere, and a licence (below) |

## Licence

Six connections and two documents on each node, four connections and two documents on OPS: inside
the **FREE** edition, and measured without a licence. Cluster, replication and RPC are not in FREE but work
on **local** connections (127.0.0.1), which is all this example uses. `LINE/L1` takes no document
slot on OPS. Across machines these features need a licence.

More in [10_Two_Engines](../../../docs/10_Two_Engines.md).
