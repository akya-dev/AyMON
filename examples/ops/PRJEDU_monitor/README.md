# PRJEDU_monitor — watching a running engine

An engine that says how it is doing to the tools operations already use: **Prometheus** reads
`/metrics`, **Grafana** shows the ready-made dashboard, **Kubernetes** (or any load balancer) asks
`/health/...`, and an MQTT client reads the broker's **`$SYS`** topics the way it reads Mosquitto's.

Needs engine **4.4.3.805 or later** (`/metrics` 788, `/health` 789, objects 790, MQTT `$SYS` 791, the
protocol `PRO.metrics` 805).

```bat
run.bat
```

On Linux: `./run.sh`. Stop with CTRL-C.

## What it runs

| Port | What |
|---|---|
| 9464 | `CN_MON`, the management connection (`[CON.tcp,PRO.metrics]`): `/metrics` (Bearer key `change-me-metrics-key`) and `/health/...` (no key) |
| 1886 | `CN_MQ`, an MQTT broker with `$SYS` every 10 s |

And a little work so the dashboard has something to show: a value written ten times a second, a job
that takes 1.5 s every 15 s on a thread with two workers (its latency jumps when it runs), a retained
MQTT message once a second, and a pool of two SQLite links (`log\monitor.db`) — one held by the
script, the other borrowed for a query every second.

## Look at it

```bat
curl -H "Authorization: Bearer change-me-metrics-key" http://localhost:9464/metrics
curl -i http://localhost:9464/health/live
curl -i http://localhost:9464/health/ready
curl -i http://localhost:9464/health/primary
mosquitto_sub -p 1886 -t "$SYS/broker/#" -v
```

`/metrics` without the key answers 401 — from this machine too, once a key is set (with no key, only
this machine is answered). The health endpoints answer one line: `ok`, `starting`, `stopping`,
`stalled: ...`, `spare: CMR/T03`.

## The dashboard

```bat
cd monitoring
docker compose up -d
```

Then open <http://localhost:3000>: the home dashboard is **AyMON engine**. Prometheus is at
<http://localhost:9090> (Status › Targets should say the engine is `UP`; `401` means the key in
`prometheus.yml` and `db\AyXDB.xml` differ).

| File | What |
|---|---|
| `monitoring/prometheus.yml` | the scrape: `/metrics` every 10 s with the key |
| `monitoring/docker-compose.yml` | Prometheus + Grafana, provisioned |
| `monitoring/grafana/dashboards/aymon-engine.json` | the dashboard; import it into any Grafana too (it asks for a Prometheus data source) |
| `monitoring/grafana/make_dashboard.py` | writes that file: change a panel there, run it again |
| `monitoring/kubernetes/aymon-probes.yaml` | liveness / readiness / startup probes and a `ServiceMonitor` |

The engine must be reachable from the containers as `host.docker.internal:9464`. Docker Desktop
provides that name; Docker Engine on Linux gets it from `extra_hosts`. With Docker running inside
WSL, run the engine inside WSL too (`./run.sh`).

## The dashboard's rows

| Row | Shows |
|---|---|
| Process | version, up for, worst health, scrape, processor, memory, licence slots |
| Roots | processor, events, messages, network, SQL statements and time per statement — by root; health and FAIL / PANIC lines |
| Threads and documents | queue depth, oldest node run, busy share, skipped timer firings, cycle overruns; documents' health and cluster roles |
| Connections and protocols | sessions, MQTT clients / subscriptions / packets / drops / queued bytes, SQL links, the record journal |

A project with several roots (`xdb_roots`) gets one line per root; the **Root** selector narrows it.

## The four health endpoints

| Path | 200 | 503 |
|---|---|---|
| `/health/live` | the process root's thread counted a second within `pro_health_wdt` (30 s) | the process is stuck |
| `/health/ready` | started (every document tried) and not stopping | `starting`, `stopping`, `paused` |
| `/health/primary[/DOC]` | DOC (else every clustered document) is the master or alone here | `spare: DOC` |
| `/health/standby[/DOC]` | DOC (else every clustered document) is a spare here | `master: DOC` |

Liveness is narrow on purpose: a PLC that went away, a database that does not answer, a root that is
stopped never take it down — restarting the engine would not bring them back.

## Read next

[docs/16_Metrics_and_Health.md](../../../docs/16_Metrics_and_Health.md): every series, the keys, the
cost, `$SYS`, a tenant process.
