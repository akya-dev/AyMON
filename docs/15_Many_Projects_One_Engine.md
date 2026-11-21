# Several projects in one engine

One engine process normally runs one project: a root document and the documents below it.
From 4.4.3.729 one process can run **several projects side by side**, each a complete project of
its own — its files, its documents, its users, its logs, its time zone — under a **host** that
starts, stops, adds, removes, backs up and moves them. Each such project is a **root**.

Why bother instead of starting more processes? Memory and threads. An idle engine costs little
(since 4.4.3.728 an idle thread sleeps until something is due), but every process carries its
own runtime, its own TLS and SQL libraries and its own ports. Fifty small sites in one process
measured 13 % of one core and one listening port; fifty processes need fifty of each.

There are two modes, chosen by the host:

| | `xdb_roots="project"` | `xdb_roots="tenant"` |
|---|---|---|
| For | several projects of **one owner**: a plant's lines, an integrator's sites on one server | projects of **different customers** on one server: the hosting product |
| A root may | do what a single project may: listen on its own ports, use any protocol, run Python, read any file it is allowed to | only what the host allows it (below): no port of its own, listed protocols, listed destinations, its own directory |
| Licence | not limited by roots: every root's documents, connections, devices and users count like one project's | feature `tenant`: 2 roots without it, `max_root` with it |

---

## Turning it on

The process root (the file you give `AyXDB -console`) names the mode and lists the roots, one
`<doc>` each, with `xdb_root="1"`:

```xml
<xdb id="HOST" xdb_roots="project" log_lnk="%PRJ%/log/HOST.log" ...>
  <config>
    <doc id="HOSTDOC/S00" src="%DB%/db_HOST.xml"/>                          <!-- the host's own document -->
    <doc id="ACME" xdb_root="1" src="%PRJ%/roots/ACME/db/AyXDB.xml"/>
    <doc id="BETA" xdb_root="1" src="%PRJ%/roots/BETA/db/AyXDB.xml" root_host="beta.example.com"/>
  </config>
</xdb>
```

```
host/
  db/AyXDB.xml              the process root above
  db/db_HOST.xml            the host's own documents (doors, its dashboard)
  roots/ACME/db/AyXDB.xml   ACME: a complete project, %PRJ% = roots/ACME
  roots/ACME/log/  ...
  roots/BETA/...
```

A root's file is an ordinary project root: a project that ran on its own runs as a root without a
change. Its `%PRJ%` and `%DB%` are its own directory. A root's name (its `<doc id>`) has no `:`,
`@` or `/`; `HOST.add` takes 1 to 32 letters, digits, `_` and `-`.

**Only the process root makes roots**, and only when it names a mode: `xdb_root` anywhere else is
said in one line and ignored. Everything on a root's `<doc>` in the process root is the **host's
word** — `root_host`, `root_hold`, the limits and rules below — and a root that writes such a field
in its own file is told it is ignored.

## What a root has of its own

A root is a boundary. `doc('X')` in a root finds the root's own documents only; `doc('*')`,
XDB SQL's catalogue, MCP and every other walk over the documents stop at it — from the host's side
too. The engine checks it a second time on every read and write: an element of another root is
refused before roles are even asked, role 9 included.

| A root's own | The process's (the process root's file) |
|---|---|
| documents, elements, scripts, classes | the licence file (`<%DB%>\lic\AyMON.lic` of the process root) |
| users and logins (`<auth>`): `admin` in two roots is two people, a token of one means nothing in the other | `xdb_lib` (plug-ins and modules loaded) |
| logs, `log_lnk` | `<sqldia>` SQL dialect profiles |
| time zone: its own `xdb_tz` is its local time (timers, `Time.*`, log stamps) | `xdb_xml_max` |
| records: `tid`, `rec_nid`, `rec_dir`, its own journal, durable values, SQL mirror lists | the host's own documents and doors |
| `SCR.trace` / `SCR.prof`, licence user count, GPIO / I²C / SPI connection names | |

A root that sets a process field in its own `<xdb>` gets one line saying it is ignored.

**Python** is one interpreter per process: the first project whose Python script or page is read
takes it; another root's Python script is skipped with a line. A tenant process runs no Python.

## One port for every root: the shared entry door

A listener in one of the **host's** documents is a door: it decides which root a connection is for
before anything of the host runs on it, and hands it over. The root says, with an ordinary `#link`,
which of its connections take that door's traffic.

```xml
<!-- the host's document: one TLS port for every root -->
<con id="WEB" xdb_fnc="[CON.tls,PRO.http]" con_host="0.0.0.0" con_port="443" con_mod="SERVER"
     con_ssl_cert="%DB%/cert/host.pem" con_ssl_key="%DB%/cert/host.key" .../>

<!-- in ACME's own files -->
<con id="CN_GW"  xdb_fnc="[CON.tcp,PRO.http]" con_host="#WEB" con_port=""      con_auth="A_WEB" pro_http_root="%PRJ%/www" .../>
<con id="CN_API" xdb_fnc="[CON.tcp,PRO.http]" con_host="#WEB" con_port="/api"  pro_onreq="main.api(exc,msg);" .../>
<con id="CN_WS"  xdb_fnc="[CON.ws,PRO.mqtt]"  con_host="#WEB" con_port="/mqtt" .../>
```

| Door | How it knows the root |
|---|---|
| HTTP and WebSocket | the request's `Host`, matched against each root's `root_host` (a list, `*` and `?`, port ignored). Among the root's takers the longest `con_port` that starts the path wins; `""` takes every path |
| MQTT | the CONNECT's user name: `ali@acme` goes to ACME, where the root's `<auth>` sees `ali` |
| PostgreSQL wire | the start-up user name, `ali@acme`, after the door's own STARTTLS |
| RPC and replication | an edge engine's link user, `edge01@acme`: its calls and records reach ACME's documents only |

What the root's connection decides is the root's: its `con_acl`, `con_auth`, rate limits, pages,
handlers. The host's scripts never see a root's request.

- **A name of no root** is the host's, as before.
- **A root without a taker** for that path: `404` (MQTT CONNACK 3, PostgreSQL FATAL 08004) and
  one line in the door's log.
- **Keep-alive to another root** on the same connection: `421 Misdirected Request`, closed. A
  CONNECT or start-up user naming another root than the connection's: refused.
- **A root's own certificate:** the root's taker carries `con_ssl_cert` / `con_ssl_key`; a TLS
  door answers that root's names (SNI) with it, everything else with the door's own.
- The first request of a handed-over connection runs on the **root's** connection's thread: a slow
  root cannot hold the door for the others.

## The host

The host's own documents (never a root's) drive the roots through the script scope `HOST`
(role Engineer and above):

| Call | Does |
|---|---|
| `HOST.list()` / `HOST.stat('ACME')` | a summary per root — running, worst health level, documents, connections, threads, sessions, devices, users, FAIL / PANIC lines, refusals, script budget — never a root's content. The same is written every 10 s onto each root's `<doc>` (`root_run`, `root_hlt`, …) |
| `HOST.stop('ACME')` / `HOST.start('ACME')` | suspend a root: its documents paused, its connections and threads off, its sessions closed, the doors answer 503 for it; and resume it |
| `HOST.add('ACME', template [, {settings}])` | copy a template directory to `<host>/roots/ACME`, add its `<doc>` (to the host's file too), load and start it |
| `HOST.remove('ACME' [, 1])` | stop it and take it out; its directory stays — with `1` the directory goes too |
| `HOST.set('ACME', field, value)` | change one of the host's fields on the root's `<doc>` (in the file too): `desc`, `root_host`, `root_hold`, the limits and rules below |
| `HOST.backup('ACME' [, to])` / `HOST.restore('ACME', from)` | a root's own copy, and a root made from one (below) |

`add`, `remove`, `backup`, `restore` and `root_hold` run in the background, one at a time; the host's
log says when each ends. Every refusal says why (`e.message` in a `try`).

**The host's limits on a root**, on its `<doc>`: `root_max_doc`, `root_max_con`, `root_max_dev`,
`root_max_cli` cap the root's share of the licence's counts (0 = none of its own); the licence decides
first, then the root's own number. `root_hold="1"` keeps a root out of the process — not loaded, not
counted — over restarts too; `HOST.set('ACME', 'root_hold', 0)` brings it in.

**A support account:** a user in a root's `<auth>` with `usr_exp="2026-11-20T18:00:00+03:00"` works
until then; a session logged in with it is closed at that moment and its tokens die with it.

## Two roots that talk to each other

In a project process `doc('X@ACME')` in a script of root BETA reaches document `X` of root ACME — no
network, the same rules as a document on another engine (`10_Two_Engines.md`) — when both roots list
each other in their own files:

```xml
<!-- ACME's root file -->  <xdb id="XDB" root_peers="BETA" root_peer_role="6" ...>
<!-- BETA's root file -->  <xdb id="XDB" root_peers="ACME" ...>
```

The caller's role is cut to the target's `root_peer_role` (absent = 0, Guest). The host's documents
call as the process root's `<xdb id>` (`HOST`). A tenant process has no such bridges.

## A tenant process

`xdb_roots="tenant"` is for roots that do not trust each other or the host's network. Everything a
project process lets a root do, a tenant process lets it do only when the host says so:

| On the root's `<doc>` | Means |
|---|---|
| `root_cap="modbus,mqtt,http"` | the protocols and connection types the root may make (`*` = all). Plain network transports need nothing; `CON.ser` needs `serial`, `CON.sql` `sql`, `CON.gpio` `gpio`, a plug-in its own name. **None = network transports only.** The same list opens the module scripts: `FILE.*` needs `file`, `IMG.*` / `CAM.*` `vision` |
| `root_egress="plc.acme.com:502, 203.0.113.0/24"` | where the root's client connections may go, judged on the resolved address at every dial. **Required** (none = no client connection), and a *name* never leads into the host's internal network (loopback, private, link-local): the host writes an internal address itself to mean it |
| `root_scr_max="2000000"` | the steps (loop turns and calls) one script call may take; a `while (true)` ends with a script error instead of holding a thread. Absent = 1 000 000 |

And without asking:

- **No port of its own.** A root's server connection must take a door (`con_host="#WEB"`); one with
  an address is refused.
- **Its own directory only.** Every path the engine opens for the root — `File.*`, `xdb.save`, a child
  `src`, a script file, its log, its `rec_dir`, its web root, certificates, an SQLite database — must
  lie in the root's directory (write `%PRJ%/...`). An embedded SQLite database cannot attach another
  file; ODBC must use the root's own server credentials (no DSN, no Windows login of the engine).
- **PostgreSQL through libpq (`DRIVER=PostgreSQLi`) says everything itself.** The string must name
  the server, the database, the user and the password: libpq would otherwise take them from the
  host (its stored passwords, `pg_service.conf`, the `PG*` environment), so `passfile` and `service`
  are refused, and key files (`sslcert`, `sslkey`, `sslrootcert` ..) lie in the root's directory.
  The engine lets the root log in with a password only, never with the engine's own Windows or
  Unix identity; that needs libpq 16 or newer on the host (Ubuntu 22.04's 14 and Debian 12's 15
  refuse the root's connection instead).
- **No Python, no bridges.**

The host's own documents are not bound by these rules — the doors, the monitoring and the backups
are theirs — except one: no path of the host leads into a root's directory either.

## Backup, restore, move, remove

```js
var p = HOST.backup('ACME');          // <host>/backup/ACME-20261119-153000 : root/ + root.xml
HOST.restore('ACME2', p, { root_host: "acme2.example.com" });   // a copy beside it
HOST.remove('ACME', 1);               // gone, with its directory
```

- **A backup** copies the root's directory to `<to>/root` and the host's settings of it to
  `<to>/root.xml`. A running root is suspended for the copy (its durable values flushed) and started
  again; the line says how long it stood (measured: 8 MB in 0.4 s). Files keep their times, so the
  durable log sees a restored root's files as its own.
- **A restore** is `HOST.add` from such a backup with its settings; the call's own settings go on top.
- **Moving a root to another process:** in A `HOST.set('ACME', 'root_hold', 1)` and
  `HOST.backup('ACME', dir)`; in B `HOST.restore('ACME', dir)`; in A `HOST.remove('ACME', 1)`. Durable
  values, SQLite rows, the record journal and every file arrive as they were: B's first value carries on
  from A's last. The root is down from the hold until B has loaded it — seconds, growing with the size
  of its directory. Clients connect to B.
- **Remove with data** moves the directory aside in one rename, then deletes it. A directory with a file
  still open in it is left whole with one line — never half deleted. A link inside is removed as a link,
  never followed. A database on a server and a `rec_dir` outside the directory are not touched (the
  line names the latter). Refused before anything happens: the host's own directories, another root's,
  a directory that is itself a link.

## The licence

A **project** process is counted like one big project: FREE's 5 documents hold the process root and
four one-document roots, and every root's connections, devices and users add up against the same
numbers (`04_Licensing.md`).

A **tenant** process also counts its roots: feature `tenant`. Without it — FREE included — it loads
**2 roots**, enough to try the isolation; the third is not loaded and one line says so:

```
CAyXDB.config: root 'GAMMA' NOT LOADED -- licence feature 'tenant' is not in edition FREE: a tenant process loads 2 root(s) (LIC.list())
```

A licence that names `tenant` loads `max_root` roots (0 or none = unlimited). `HOST.add` and
`HOST.restore` refuse with the same words before they copy anything. `LIC.list()` shows `root 2/2` in
a tenant process.

## What it is not

- **Not a separate process.** A root cannot read another root or open its files (in a project process
  two roots may open a bridge to each other), but all roots share one process: a crash takes every root
  with it, and memory is not divided per root. A
  customer who needs that gets a process (or a container, or a machine) of their own — the move above
  takes their root there.
- **A root cannot be moved without a pause yet.** The move above stops the root for the copy's length.
- **One Python per process.** A project that needs Python runs in a project process, or alone.
