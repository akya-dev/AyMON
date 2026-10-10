# PRJEDU_cluster — two engines, one job, and a failover

A job — a counter that makes units, five a second, and closes a **batch**
every 100 — runs on one of two engines. The other one keeps a copy and
waits. Stop the one that is working, and within about two seconds the other
one carries on **from the same unit**. Start the stopped one again and it
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

On a Windows 11 laptop and on Linux (WSL, Ubuntu 22.04), engine 4.3.4.467, a
script killing the master and driving both nodes over MQTT:

| | Windows | Linux |
|---|---|---|
| first election after both start | S01 master after ~8 s (`pro_clt_init` 5 s of listening first) | same |
| the master is killed (`Stop-Process -Force` / `kill -9`): the spare notices | 0.4 s | 0.2 s — the connection closes; no waiting for heartbeats |
| … and is master | **2.0 s** after the kill | **2.2 s** |
| where it carries on | unit **85** — the last unit the dead master made | unit **60**, the same |
| units lost | **0** | **0** |
| gap between the last unit on the old master and the first on the new | 2 s (1 s normally) | 3 s |
| the killed node is started again | SPARE, with the job copied, 4 s after start | SPARE 2.4 s after start, the job copied 1 s later |
| `RATE` = 8 written on the **spare** | applied by the master at its next step (< 1 s), back on the spare by replication | same |
| **Take over** on the spare | master 3 s later; no units made for about 4 s | 2 s; 3.5 s |
| CTRL-C (SIGINT on Linux) | — | both exit 0 |

**Three things about the batch list, all seen in the runs:**

- **The two copies are not in the same order.** The master adds each new
  batch at the top of the list; the spare's copy comes out in a different
  order (the batches it got in one piece at start, then the new ones at the
  end). After a failover the new master carries that order on. The page
  sorts by batch number, so it does not show — but a script that takes "the
  first item" or "the last item" as the newest or the oldest gets a
  different answer on the two nodes.
- **So the list is cut by batch number, not by position.** `main.keep_nine`
  deletes the lowest batch number before a new batch is added. The first
  version deleted `item[last()]`: on a node that had just taken over, that
  was the newest batch, and two batches were gone.
- **…and before the new item, not after.** `ELM.new` can cut the list
  itself (`new_elm_new_max="B10"`), but it cuts *before* it adds, so it keeps
  eleven; and it picks the new item's id from the pool `B01`…`B10` while all
  ten are still taken. Measured: the eleventh batch was added **without an
  id** (one `ERROR` line, "id havuzu dolu"), and an element without an id is
  not replicated — the master had eleven batches, the spare ten. With
  `keep_nine` the pool always has a free id.

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
| add a `<var>` to `SYS/S00` and write it from the page on each node | it is different on the two nodes: `SYS/S00` is never replicated — the place for what belongs to *one* machine |
| take away `con_role="8"` from the election rows | one `ALERT` a second: the peer's messages arrive as Guest (0), and `SYS/S00` is read-only for that role (`xdb_acl`) |
| two machines | `pro_clt_host` / `pro_rep_host` of the other node's rows = its address, `con_host` of `CN_EXT` = this machine's address, `con_acl` in `cls_CLU` = the other machine's, and the two addresses in `www/app.js` — and a licence (below) |

## Licence

**Six connections per node** (the listener, the page's live values, two
election rows, two replication rows) and two documents: inside the **FREE**
edition. Measured without a licence: both nodes start, elect and replicate —
the engine writes "promoting to MASTER without the 'cluster' feature … local
ones work". Cluster and replication are not in FREE, but work on **local**
connections (127.0.0.1), which is all this example uses. Across two machines
they need a licence.
