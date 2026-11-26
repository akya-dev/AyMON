# PRJEDU_fleet — updating a fleet of nodes, ring by ring

The centre of a fleet of AyMON nodes, written as an ordinary AyMON project. Each node runs its
engines under **AySVC**, the service agent. AySVC installs engine versions side by side, switches
an application only after a dry run, and rolls it back when the new version fails its probation.
The centre gives AySVC three things:

- **a package repository**: `/repo/` (engine packages, signed jobs and the `index.txt` that lists them)
- **a report door**: `/report` (each node POSTs its state there)
- **a rollout**: the operator's signed jobs published **ring by ring**. Ring 2's jobs appear only
  once every node of ring 1 has done its own (its new version passed probation there). A job that
  failed or was refused halts the rollout where it is.

The centre holds **no key**. The operator signs packages and jobs elsewhere, and every node checks
them against its own keyring. A centre taken over can therefore withhold an update, but it cannot
make one.

Needs the engine in `bin/` (4.4.3.806) or later. The nodes need **AySVC 4.3.0.31** or later
(reports and jobs); with 4.3.0.32 an application whose version is not installed yet starts as soon
as it arrives. AySVC and the operator's tools (`aymon-lic`, `aysvc_index.py`, `pkg_engine.ps1`)
are **not in this repository**: the centre runs and can be tried without them, as below.

```bat
run.bat
```

On Linux: `./run.sh`. Stop with CTRL-C. The page: <http://127.0.0.1:8090/>.

## What it runs

One port, 8090, bound to `127.0.0.1`:

| Path | What |
|---|---|
| `/` | the fleet page (`www/index.ayp`): the rollout and one row per node, refreshed every 5 s |
| `/repo/` | the repository the nodes pull from (`www/repo/`): packages, job files, `index.txt` |
| `/report` | `POST`: a node's report (`CN_REP`, a door on `CN_WEB`; `main.report` in `db/fleet.js`) |

| Element | What |
|---|---|
| `NODES` | the nodes the centre knows: `id` = the node's name, `token` = the Bearer token it reports with, `ring` = shown on the page; `seen`, `svc`, `apps`, `jobs`, `jst`, `raw` come from its last report |
| `ROLL` | where the rollout stands: its name, the highest ring opened, one line of state |
| `T_FLEET` | every 5 s: `main.tick` — the ring logic, then `index.txt` brought up to date |

## Try it without a node

The `sample/` directory holds four reports and a two-ring rollout `demo` with two **unsigned** jobs.
A node would refuse those jobs; the centre does not check signatures, so they show it working.
With the centre running, in this directory:

```bat
curl -H "Authorization: Bearer example-token-S01-change-me" -H "Content-Type: application/json" --data-binary @sample\report_S01.json http://127.0.0.1:8090/report
curl -H "Authorization: Bearer example-token-S02-change-me" -H "Content-Type: application/json" --data-binary @sample\report_S02.json http://127.0.0.1:8090/report
```

Both answer `ok`, and the page shows S01 and S02 with A00 on 4.4.3.901. A wrong token answers
`401` and logs `report from 'S01' REFUSED`. Now start the rollout:

```bat
xcopy /e /i sample\rollout\demo rollout\demo
echo demo> rollout\current.txt
```

Within 5 s the page says `ring1 open -- wait: S01 DEMO-S01 not reported`, and
<http://127.0.0.1:8090/repo/index.txt> lists `demo-s01.job` but not ring 2's job. Report that S01
has done its job, and ring 2 opens:

```bat
curl -H "Authorization: Bearer example-token-S01-change-me" -H "Content-Type: application/json" --data-binary @sample\report_S01_done.json http://127.0.0.1:8090/report
curl -H "Authorization: Bearer example-token-S02-change-me" -H "Content-Type: application/json" --data-binary @sample\report_S02_done.json http://127.0.0.1:8090/report
```

After the second report the page says `DONE: every ring`. On Linux, write the paths with `/` and
use `cp -r` and `echo demo > rollout/current.txt`.

## A node

A node is an AySVC whose configuration names the centre. The values (where AySVC keeps its
configuration — the registry on Windows, a file on Linux — is in AySVC's own README):

| Value | Here | What |
|---|---|---|
| `node` | `S01` | the node's name: an `<item id>` of `NODES`, and what a job's `targets` name |
| `home` | a directory | where AySVC keeps `versions/`, `staging/`, `state/` |
| `upd_url` | `http://<centre>:8090/repo/` | where it reads `index.txt` |
| `upd_poll` | minutes, 1440 | how often it reads it; `/api/upd?cmd=pull` (signed) reads it at once |
| `upd_keys` | a keyring file | the keys packages are signed with |
| `upd_job_keys` | a keyring file | the operators' keys jobs are signed with (a package key is refused here) |
| `upd_report` | `http://<centre>:8090/report` | where it reports: 3 s after a change, and every `upd_report_s` |
| `upd_report_key` | `example-token-S01-change-me` | its Bearer token: the item's `token` (never logged) |
| `upd_report_s` | seconds, 600 | the heartbeat |

And for each application that runs from versions: `ver` (the version it runs). `upd_job="0"`
keeps one application out of every job.

## A rollout

1. **The package.** Build and sign it (`pkg_engine.ps1`, or `aymon-lic pkg-build` + `pkg-sign`),
   put it into `www/repo/`, and list the packages:

   ```bat
   python aysvc_index.py www\repo --out www\repo\packages.idx
   ```

   The centre writes `www/repo/index.txt` itself, from `packages.idx` plus the open rings' jobs:
   never edit `index.txt` by hand. Nodes install a package when they read it; installing runs
   nothing.

2. **The jobs.** One file per job, the targets of one ring in its directory:

   ```text
   format=aymon-job/1
   job=R1-S01
   product=AyMON-engine
   ver=4.4.3.902
   targets=S01
   window=02:00-04:00
   expires=2026-12-10
   kid=31
   ```

   `targets` names nodes (each versioned application of the node), `node/app` pairs, or a
   comma list of both. `product=project:<name>` (AySVC 4.3.0.33) carries a project version
   instead: the files of each application whose `prj` is `<name>` take it, after a dry run
   and with a probation. If the site edited what the vendor changes, the plan waits on that
   node for the site's own command `prj`, and the ring waits with it. `window` (optional) is when the node may switch, in its local time.
   `expires` ends the job after that day. `back=1` lets a job take an application to an
   older version; without it a late job never takes a node back. Sign each file
   (`aymon-lic job-sign <file> --key <operator key> --keyring <keyring>`; it appends `sig=`),
   put them into `rollout/<name>/ring1/`, `ring2/`, .. and index each ring:

   ```bat
   python aysvc_index.py rollout\r1\ring1
   python aysvc_index.py rollout\r1\ring2
   ```

3. **Start it:** `echo r1> rollout\current.txt`. Ring 1's jobs are copied into `www/repo/` and
   listed in `index.txt`. Each node takes the jobs that name it at its next pull. It dry-runs
   the new version, switches, and reports the job `DONE` once probation has passed.

4. **Watch it.** The page shows each ring as `ringN open -- wait: <node> <job> <state>`.
   When every node of the open ring reports each of its jobs `DONE`, the next ring opens. A job
   reported `FAILED` or `REFUSED` gives `HALTED at ringN: <node> <job> <state>`, and no further
   ring opens. After the last ring: `DONE: every ring`.

A rollout runs once. To go on after a halt, fix the cause and start a rollout of another name. The
jobs already done stay done: a node fetches a job file once.

## What it does not do

- **TLS.** The port is bound to `127.0.0.1`. A real centre listens where its nodes can reach it,
  so the reports' tokens must travel over TLS: `[CON.tls,PRO.http]` with a certificate.
- **A login for the page.** It shows every node to anyone who can reach the port. See
  [PRJEDU_pages](../../web/PRJEDU_pages/) for a page behind a login.
- **History.** `ROLL` and the reports live in memory. After a restart the centre goes through the
  current rollout's rings again: each ring passes once its nodes have reported it `DONE`, which
  can take one heartbeat. Write the reports somewhere (`HIS.rec`, a SQL table) to keep them.
- **Percentages, health gates, automatic rollback across the fleet.** A ring here is a
  directory, and its gate is "every job `DONE`". A node rolls itself back when a version fails its
  probation. Taking every node back is a new rollout with `back=1` jobs.

## The files

| File | What |
|---|---|
| `db/AyXDB.xml` | the root document |
| `db/db_FLEET.xml` | the port, the door, `NODES`, `ROLL`, the timer |
| `db/fleet.js` | `report` (the door), `tick` / `rollout` / `index_sync` (the rings), `rows` (the page) |
| `www/index.ayp` | the page |
| `www/repo/` | packages, `packages.idx`; the centre writes `index.txt` and the open rings' job files |
| `rollout/` | `current.txt` and one directory per rollout |
| `sample/` | the reports and the `demo` rollout above |
