# Running it in production

| Example | What it shows |
|---|---|
| [PRJEDU_monitor](PRJEDU_monitor/) | `/metrics` for Prometheus, a ready-made Grafana dashboard, `/health/live|ready|primary|standby` for Kubernetes and load balancers, MQTT `$SYS` |
| [PRJEDU_fleet](PRJEDU_fleet/) | the centre of a fleet of nodes: a package repository AySVC pulls from, node reports, and signed update jobs published ring by ring |

The guide: [docs/16_Metrics_and_Health.md](../../docs/16_Metrics_and_Health.md).

[All examples](../README.md)
