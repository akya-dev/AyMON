# Metrics and health

Run **[PRJEDU_monitor](../examples/ops/PRJEDU_monitor/README.md)** first: an engine with `/metrics`,
the health endpoints and an MQTT broker with `$SYS`, and a `docker compose` that brings up
Prometheus and Grafana with the ready-made dashboard.

[Keeping it running](12_Keeping_It_Running.md) is how the engine shows its health *inside*: alarm bits
in `sta`, the `stats` line, the log. This page is how it shows it *outside*, to the tools operations
already run: Prometheus and Grafana, Kubernetes probes, a load balancer, an MQTT monitor. Engine
4.4.3.788 and later (`/metrics`), 789 (`/health`), 790 (objects), 791 (protocols, `$SYS`); from 4.4.3.805 the
endpoints are a protocol of their own, `PRO.metrics`.

---

## One management connection

Both come from one connection of the protocol `PRO.metrics` — its own port (in the cluster network or on
loopback) and its own `con_acl`, so monitoring shares nothing with the application's sessions and logins.
Nothing else is served on it: any other path answers 404.

```xml
<con id="CN_MON" xdb_fnc="[CON.tcp,PRO.metrics]" con_host="0.0.0.0" con_port="9464" con_mod="SERVER"
     con_ses="8" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"
     pro_metrics_key="..." pro_metrics_detail="object" pro_health_wdt="30"/>
```

Up to 4.4.3.804 `pro_metrics` and `pro_health` were written on a `PRO.http` connection; from 4.4.3.805 a
`PRO.http` connection does not read them (one line in the log says so), so the connection's `xdb_fnc` becomes
`[CON.tcp,PRO.metrics]`. Behind a shared door (`con_host="#CN_EXT" con_port="/ops"`) the door's path comes
first: `/ops/metrics`, `/ops/health/live`.

| Attribute | Default | Meaning |
|---|---|---|
| `pro_metrics` | `/metrics` | the path of the Prometheus text; written empty = no metrics |
| `pro_metrics_key` | none | a Bearer key, compared in constant time, may be sealed. **None = only this machine** (loopback) is answered, anyone else 401. A key that is there but does not open = 401 to everyone |
| `pro_metrics_detail` | `object` (a project), `root` (a tenant process) | `process`, `root` or `object` (below) |
| `pro_metrics_roots` | every root | which roots' rows: `R*, ACME` (`*` `?`, case ignored) |
| `pro_metrics_dev` | `0` | `1` = one series pair per `<dev>` too (DCIM has 519 devices) |
| `pro_health` | `/health` | the root of the health endpoints; written empty = none |
| `pro_health_wdt` | `30` | seconds; `/health/live` fails when the process stands still this long (2..3600) |

A request counts toward `pro_http_rate`, never toward a root's message quota, and no login is asked (they
have their own rules). GET and HEAD only.

## `/metrics`

Prometheus text format 0.0.4. **The names are a contract**: dashboards are built on them, so a name is
added, never renamed. The text is built at most once a second per connection; 50 roots at the object
level are 161 KB built in about a millisecond.

**Process** (every level):

| Series | |
|---|---|
| `aymon_build_info{version,aydata,os}` | 1; the platform version |
| `process_start_time_seconds`, `process_cpu_seconds_total` | the process |
| `process_resident_memory_bytes`, `aymon_process_private_bytes` | resident / private memory |
| `aymon_licence_info{edition,state}` | 1 |
| `aymon_licence_slots{kind}`, `_slots_limit{kind}`, `_refused_total{kind}` | `doc con dev cli cam sbdev` (+ `root` in a tenant process); limit 0 = unlimited |
| `aymon_scrape_seconds` | how long this text took |

**Roots** (`root` and `object`; label `root`): one row per root and one for the process tree itself
(`root` = the root document's `<xdb id>`) — `HOST.stat()`'s numbers:
`aymon_root_up`, `_held`, `_health_level` (0..3), `_documents`, `_connections`, `_threads`,
`_sessions`, `_devices`, `_users`, `_log_lines_total{level}`, `_cpu_seconds_total`, `_events_total`,
`_sql_statements_total`, `_sql_seconds_total`, `_network_receive_bytes_total`,
`_network_transmit_bytes_total`, `_messages_received_total`, `_messages_sent_total`,
`_messages_refused_total`, `_elements`, `_blob_bytes`, `_disk_bytes`, `_elements_refused_total`,
`_blobs_refused_total`, `_cpu_share_ratio`, `_brake_ratio`, `_script_steps_max`, `_script_over_total`,
`_quota{kind}` (only the limits set), `_start_time_seconds`. A root's counters start again when it loads;
Prometheus's `rate()` knows a counter that restarts.

**Objects** (`object`): every document, its own thread, its `<thr>` and `<con>`:

| Series | Labels |
|---|---|
| `aymon_document_health_level`, `aymon_document_role` (0 alone, 1 master, 2 spare, 3 in transit), `aymon_document_log_lines_total{level}` | `root, doc` |
| `aymon_thread_health_level`, `_queue_depth`, `_queue_latency_seconds`, `_queue_latency_max_seconds`, `_busy_ratio`, `_cycle_overruns`, `_timer_skipped_total`, `_workers` | `root, doc, thread, kind` (`doc`, `thr`, `con`) |
| `aymon_thread_worker_queue_depth` (summed), `_worker_queue_latency_seconds` (the worst worker), `_worker_busy_max_ratio` (the busiest) | the same, a thread with workers only |
| `aymon_connection_sessions`, `_sessions_limit` | `root, doc, con` |
| `aymon_device_state` (0 disabled .. 3 running), `aymon_device_health_level` — with `pro_metrics_dev="1"` | `root, doc, con, dev` |

**Protocols** (`object`, per `<con>`):

| Series | |
|---|---|
| `aymon_mqtt_sessions`, `_sessions_away`, `_subscriptions`, `_retained_messages`, `_retained_bytes`, `_queued_bytes`, `_dropped_total`, `_messages_received_total`, `_messages_sent_total`, `_bytes_received_total`, `_bytes_sent_total` | a `PRO.mqtt` connection; a "message" is a packet of any type (as Mosquitto counts) |
| `aymon_sql_links{state="busy|idle"}`, `aymon_sql_links_limit`, `aymon_sql_pool_exhausted_total` | a `PRO.sql` connection's pool |
| `aymon_record_journal_records`, `_limit` | per root: records waiting for their sink |

The durable log's condition has no series of its own: it is a condition of the root's `<xdb>`, so it is
in `aymon_document_health_level`.

### Many roots, and who sees what

- A connection of the **process tree** writes the process and every root's row; at `object` the
  objects of the process tree and, in a project process, of every root. In a **tenant** process the
  host never gets a tenant root's objects, whatever the detail — a row is a content-free summary,
  objects are not.
- A **root's own connection** (or one the shared port handed to it) writes its own row and its own
  objects only — no process family: the memory and the licence are the host's.

## The health endpoints

No key and no content — a kubelet's probe carries no key; the body is one line.

| Path | 200 | 503 |
|---|---|---|
| `/health/live` | the process root's thread counted a second within `pro_health_wdt` | `stalled: the process root has not counted a second for N s` |
| `/health/ready` | every document was tried at the start, the engine runs, no stop has begun | `starting`, `stopping`, `paused`; on a root's own connection `root not running` |
| `/health/primary[/DOC]` | DOC — else every clustered document of the connection's tree — is the master or alone here | `spare: DOC`, `transit: DOC`; a DOC not here is 404 |
| `/health/standby[/DOC]` | DOC — else every clustered document, at least one — is a spare here | `master: DOC`, `alone: DOC`, `no clustered document` |

- **Liveness is narrow on purpose.** A PLC that went away, a database that does not answer, a stopped
  root never take it down: Kubernetes restarts a pod whose liveness fails, and a restart brings none of
  them back. A long `xdb.save` on the root's thread can — raise `pro_health_wdt` rather than lose the
  check.
- **Readiness turns 503 at the first moment of a stop** (CTRL-C, SIGTERM), while the connections still
  answer: the service stops sending before connections drop (0.6–0.9 s measured on a small project). A
  spare is ready: a rolling update would otherwise stop at it.
- **Which node is the master** is either the client's choice (PostgreSQL's `target_session_attrs`, a
  `con_host` list) or a load balancer's `/health/primary` check: the spare's turned 200 within 0.9–1.5 s
  of its master being killed.
- A change of `live` or `ready` is said once in the log.

Kubernetes, in short (the whole sketch is `monitoring/kubernetes/aymon-probes.yaml` in the example):

```yaml
livenessProbe:  { httpGet: { path: /health/live,  port: 9464 }, periodSeconds: 10, failureThreshold: 3 }
readinessProbe: { httpGet: { path: /health/ready, port: 9464 }, periodSeconds: 5 }
startupProbe:   { httpGet: { path: /health/ready, port: 9464 }, periodSeconds: 5, failureThreshold: 60 }
```

## MQTT `$SYS`

A broker publishes Mosquitto's `$SYS/broker/...` topics, so an MQTT monitor that reads Mosquitto reads
AyMON:

```xml
<con id="CN_MQ" xdb_fnc="[CON.tcp,PRO.mqtt]" ... pro_role="SLAVE" pro_mqtt_sys="10" pro_mqtt_sys_role="2"/>
```

| Topic (`$SYS/broker/` +) | Value |
|---|---|
| `version` | `AyMON 4.4.3.<build>` |
| `uptime` | `N seconds` |
| `clients/connected`, `clients/total` | connected; with the persistent sessions away |
| `messages/received`, `messages/sent` | packets of any type |
| `publish/messages/dropped` | QoS 0 messages dropped for a full out queue |
| `subscriptions/count`, `retained messages/count` | |
| `bytes/received`, `bytes/sent` | |
| `load/messages/received/1min`, `5min`, `15min` | packets received a minute, moving averages |

- Every `pro_mqtt_sys` seconds (off when absent or 0), QoS 0, to the subscribers whose role is
  `pro_mqtt_sys_role` (default 2, Monitor) or above. A client that does not log in has the connection's
  `con_role`.
- A new `$SYS` subscription gets the last values at once, with the retain bit; the topics are never put
  in the broker's retain store (the store does not ask the role).
- `#` and `+/...` never match a `$` topic (the MQTT rule): only a filter starting with `$SYS` gets them.

## The cost

Nothing until a `PRO.metrics` connection is configured. Counting costs nothing on the hot path: each MQTT session counts its
own traffic, the root meters were counted already. Per scrape: the root list walked once (≈4 µs a row),
the process's processor and memory read once.

## See also

[12_Keeping_It_Running.md](12_Keeping_It_Running.md) — the health bits these numbers come from, the
`stats` line. [15_Many_Projects_One_Engine.md](15_Many_Projects_One_Engine.md) — roots, `HOST.stat()`.
