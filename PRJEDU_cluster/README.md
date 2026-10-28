# PRJEDU_cluster — two engines, one job, and a failover

A job — a counter that makes units, five a second, and closes a **batch**
every 100 — runs on one of two engines. The other one keeps a copy and
waits. Stop the one that is working, and within a second or two the other
one carries on **from the unit its copy had** — the same one, or one step back
if the last step had not reached it yet. Start the stopped one again and it
comes back as the spare.

Open two command windows in this directory:

```bat
run_S01.bat
```

```bat
run_S02.bat
```

On Linux: `./run_S01.sh` and `./run_S02.sh`, in two terminals.

Either order. Then open **http://127.0.0.1:9201/** (or `:9202` — either
node's page shows both). Now close the window of the node that says
**MASTER**.

| | S01 | S02 |
|---|---|---|
| root file | `db/AyXDB_S01.xml` | `db/AyXDB_S02.xml` — the same file, one line differs: `tid` |
| listens on | 127.0.0.1:**9201** | 127.0.0.1:**9202** |
| election priority | 1 (preferred) | 2 |

Both run the same two documents from the same files:

| Document | What it is |
|---|---|
| `APP/S00` | **the job**: `RUN`, `RATE`, `COUNT`, `BATCH`, the list of finished batches. A *cluster member* (`sta="0x3200"`): on the master it runs, on the spare it is a mirror the master keeps up to date |
| `SYS/S00` | **the node itself**: its listener, the page, the election and replication links. Plain (`0x0300`): each node has its own and it is never replicated |

## The page

Two columns, one per node — each column is what *that* node says: its role,
the master it knows, the election round, and the job as it has it. A node
that is stopped goes grey ("not answering") and comes back by itself when it
is started again.

| Button | Does |
|---|---|
| **running** / the rate slider | writes `APP/S00/RUN` / `RATE` on that node. On the **spare** the write is not applied there: it is *forwarded* to the master, and the new value comes back by replication |
| **Hand over (standdown)** on the master, **Take over** on the spare | a planned switch, no engine stopped |

## How it is put together

**The election** — `PRO.clt`. Each node's `SYS/S00` has the same two rows,
one per node:

```xml
<con id="CN_S01" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" pro_nid="S01" pro_clt_port="9201" pro_clt_pri="1" .../>
<con id="CN_S02" xdb_fnc="[CLT.cfg,CON.ws,PRO.clt]" pro_nid="S02" pro_clt_port="9202" pro_clt_pri="2" .../>
```

`CLT.cfg` compares a row's `pro_nid` with the node's `tid`: the row that
names *this* node becomes its listening end, the other row dials the peer.
That is why one set of files serves both nodes. The nodes send a heartbeat
every 2 s (`pro_clt_hb`); two missed, or a closed connection, means the
master is gone and the spare campaigns. `pro_clt_preempt="0"`: a node that
comes back does not push aside a master that is working, even with the
better priority.

**The role goes into the document's `sta`.** `APP/S00` starts parked in
TRANSIT (`0x3200`) and waits for the election. The winner's copy becomes
`0x1303` (cluster master, running); the other's `0x2202` (cluster spare,
paused). On the spare the document's scripts do not run — `main.step` makes
units only where the job runs.

**Replication** — `PRO.rep`, the same pattern: two rows, `pro_rep_doc="APP/S00"`.
The rows do not say which way the data goes: the *document* does. The master
sends because its `APP/S00` is master, the spare receives because its copy
is spare, and when the roles change the direction changes with them.

**One port per node.** Everything a node offers — the page, its live values,
the election, replication — shares one listener (`CN_EXT`) and is told apart
by path: `/`, `/mqtt`, `/clt`, `/rep`. `main.init` sets the port from `tid`
before any connection starts.

**The page reads `SYS/S00`, not the job.** Twice a second `main.tick` asks
`CLT.info(evt)` — the whole cluster as this node sees it, in one call: role,
master (and whether it is *proven* — heard — or only a candidate), term, the
peers and whether they are alive — and copies the job's values from its own
`APP/S00` next to it.

## What it measured

On a Windows 11 laptop and on Linux (WSL, Ubuntu 22.04), engine 4.3.4.622, a
script killing the master and driving both nodes over the page's MQTT link,
two runs on each:

| | Windows | Linux |
|---|---|---|
| first election after both start | S01 master 9–11 s after start (`pro_clt_init` 5 s of listening first) | 8–10 s |
| the master is killed (`Stop-Process -Force` / `kill -9`) … and the spare is master | **1.0 s** after the kill — the connection closes; no waiting for heartbeats | **0.9–3.0 s** |
| where it carries on | the unit the spare's copy had: 125 in one run, 120 in the other | 125 |
| units made again | **0** in one run, **5** (one step) in the other — see below | **0** |
| the killed node is started again | SPARE, with the job copied, 1 s after start | 2–3 s |
| `RATE` = 8 written on the **spare** | applied by the master 0.1 s later, back on the spare by replication | 0.4 s |
| **Take over** on the spare | master 2.5–3 s later; no units made for 3.5–4 s | 3.5 s; 4.5 s |
| CTRL-C (Ctrl-Break / SIGINT) | both exit 0 | both exit 0 |
| the batch list on the two nodes at the end | the same ten-or-fewer items, same ids, **same order** | the same |

**Units made again.** Replication is asynchronous: the master makes a step,
then sends it. If it is killed between the two, the spare's copy is one step
behind, and the new master carries on from there — those units are made
again, nothing is skipped. It happened in one run of four.

**The batch list.** The master adds each new batch at the top; the spare's
copy is in the **same order** (the engine sends an insert as an insert at the
same place, and the copy a node gets in one piece at start is put in the
source's order too — engine 4.3.4.469 and later; before that the spare's copy
came out in another order). `ELM.new` keeps the list itself:
`new_elm_new_max="B10"` = ten items, and it makes room *before* it adds, so
the new item always gets an id from the pool `B01`…`B10` (4.3.4.468 and
later; before that it kept eleven and the eleventh got no id, and an element
without an id is not replicated). `main.keep_nine` — deleting the lowest batch
number before writing `@new` — dates from those older engines; it does no
harm now and shows that `evt.DelElement` is replicated.

And: an element a script adds with `evt.AddElement` is *not* replicated at
all — the spare never sees it. `ELM.new` (writing the list's `@new`) and
`evt.DelElement` are: see `db_APP.xml`.

**In the log:** when a node is promoted, or rejoins, one `ERROR` line from
`PRO.rep.in` ("replikasyon almıyor") — a message that arrived while the
document was still changing roles, refused. Nothing is lost; the next
message is taken. When a node is killed, the other logs a few `ERROR` lines
about closing the connection to it.

## Try this

| Do | See |
|---|---|
| `pro_clt_preempt="1"` on both rows, then kill S01 and start it again | does S01, the preferred node, take the job back? Is a second switch what you want? |
| `pro_clt_hb="1" pro_clt_expiry="1"` | a crash closes the connection and is noticed at once anyway; what do shorter heartbeats buy, and what can they cost on a busy machine? |
| stop both, start only S02 | it waits `pro_clt_init` for a master before it campaigns. Which unit does the job start from? |
| `pro_clt_quorum="2"` on both election rows, then kill the master | the spare does **not** take over: a majority rule wants the node itself and one more, and alone it hears only itself — it stays in ELECTION (`heard=1 quorum=2` in its log; a master that loses its peer logs "MASTER GIVEN UP -- no majority"). **Take over** on the page still works: "MASTER by 'takeover' without a majority". A majority keeps a split network from having two masters, and is worth it with **three** nodes; with two, one crash stops the job |
| add a `<var>` to `SYS/S00` and write it from the page on each node | it is different on the two nodes: `SYS/S00` is never replicated — the place for what belongs to *one* machine |
| take away `pro=""` from the election rows | one `ALERT` a second (`CN_S01.pro: xdb_acl yaratma reddetti (rol 0)`): the peer's messages arrive as Guest (0), each one would create `pro`, and `SYS/S00` gives that role no such right (`xdb_acl`). `con_role="8"` silences it too — but gives the peer the DOCUMENT role |
| two machines | `pro_clt_host` / `pro_rep_host` of the other node's rows = its address, `con_host` of `CN_EXT` = this machine's address, `con_acl` in `cls_CLU` = the other machine's, and the two addresses in `www/app.js` — and a licence (below) |

## Licence

**Six connections per node** (the listener, the page's live values, two
election rows, two replication rows) and two documents: inside the **FREE**
edition. Measured without a licence: both nodes start, elect and replicate —
the engine writes "promoting to MASTER without the 'cluster' feature … local
ones work". Cluster and replication are not in FREE, but work on **local**
connections (127.0.0.1), which is all this example uses. Across two machines
they need a licence.
