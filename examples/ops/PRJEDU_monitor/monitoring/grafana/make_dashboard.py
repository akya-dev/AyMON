#!/usr/bin/env python3
# PRJEDU_monitor: writes grafana/dashboards/aymon-engine.json. Run it after changing a panel:
#     python make_dashboard.py dashboards/aymon-engine.json
import json, sys

DS = {"type": "prometheus", "uid": "${datasource}"}
I = 'instance="$instance"'
R = 'instance="$instance",root=~"$root"'
panels = []
pid = [0]
y = [0]


def nid():
    pid[0] += 1
    return pid[0]


def row(title):
    panels.append({"type": "row", "title": title, "id": nid(), "collapsed": False,
                   "gridPos": {"h": 1, "w": 24, "x": 0, "y": y[0]}, "panels": []})
    y[0] += 1


def tgt(expr, legend="", ref="A", instant=False, fmt=None):
    t = {"datasource": DS, "expr": expr, "legendFormat": legend, "refId": ref}
    if instant:
        t["instant"] = True
        t["range"] = False
    if fmt:
        t["format"] = fmt
    return t


def ts(title, targets, x, w, h=8, unit="short", desc="", stack=False):
    p = {"type": "timeseries", "title": title, "id": nid(), "datasource": DS, "description": desc,
         "gridPos": {"h": h, "w": w, "x": x, "y": y[0]}, "targets": targets,
         "fieldConfig": {"defaults": {"unit": unit, "custom": {"lineWidth": 1, "fillOpacity": 10,
                                                               "stacking": {"mode": "normal" if stack else "none"}}},
                         "overrides": []},
         "options": {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True},
                     "tooltip": {"mode": "multi", "sort": "desc"}}}
    panels.append(p)


LEVELS = [{"type": "value", "options": {"0": {"text": "normal", "color": "green", "index": 0},
                                        "1": {"text": "warning", "color": "yellow", "index": 1},
                                        "2": {"text": "alarm", "color": "orange", "index": 2},
                                        "3": {"text": "emergency", "color": "red", "index": 3}}}]
LVL_THR = {"mode": "absolute", "steps": [{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                                         {"color": "orange", "value": 2}, {"color": "red", "value": 3}]}


def stat(title, targets, x, w, h=4, unit="short", mappings=None, thresholds=None, text="value", desc=""):
    d = {"unit": unit}
    if mappings:
        d["mappings"] = mappings
    d["thresholds"] = thresholds or {"mode": "absolute", "steps": [{"color": "blue", "value": None}]}
    panels.append({"type": "stat", "title": title, "id": nid(), "datasource": DS, "description": desc,
                   "gridPos": {"h": h, "w": w, "x": x, "y": y[0]}, "targets": targets,
                   "fieldConfig": {"defaults": d, "overrides": []},
                   "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                               "colorMode": "background" if mappings else "value", "graphMode": "none",
                               "textMode": text, "justifyMode": "auto", "orientation": "auto"}})


def table(title, targets, x, w, h=8, desc="", rename=None, mappings=None):
    excl = {"Time": True, "__name__": True, "job": True, "instance": True}
    d = {}
    if mappings:
        d["mappings"] = mappings
        d["thresholds"] = LVL_THR
        d["custom"] = {"cellOptions": {"type": "color-background"}}
    panels.append({"type": "table", "title": title, "id": nid(), "datasource": DS, "description": desc,
                   "gridPos": {"h": h, "w": w, "x": x, "y": y[0]}, "targets": targets,
                   "fieldConfig": {"defaults": d, "overrides": []},
                   "options": {"showHeader": True, "cellHeight": "sm"},
                   "transformations": [{"id": "organize", "options": {"excludeByName": excl, "renameByName": rename or {}}}]})


def bar(title, targets, x, w, h=8, unit="short", desc=""):
    panels.append({"type": "bargauge", "title": title, "id": nid(), "datasource": DS, "description": desc,
                   "gridPos": {"h": h, "w": w, "x": x, "y": y[0]}, "targets": targets,
                   "fieldConfig": {"defaults": {"unit": unit, "min": 0}, "overrides": []},
                   "options": {"displayMode": "basic", "orientation": "horizontal", "showUnfilled": True,
                               "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}}})


# --------------------------------------------------------------------------- the process
row("Process")
stat("Version", [tgt('aymon_build_info{%s}' % I, "{{version}} ({{os}})", instant=True)], 0, 6, text="name",
     desc="aymon_build_info: the AyPRO platform version, AyDATA's, the operating system.")
stat("Up for", [tgt('time() - process_start_time_seconds{%s}' % I, instant=True)], 6, 4, unit="dtdurations")
stat("Worst health", [tgt('max(aymon_root_health_level{%s})' % I, instant=True)], 10, 4, mappings=LEVELS, thresholds=LVL_THR,
     desc="The worst health level of every root's xdb / con / thr (C461): a queue too deep, a node too old, a cycle too long, FAIL / PANIC lines.")
stat("Scrape", [tgt('up{%s}' % I, instant=True)], 14, 3,
     mappings=[{"type": "value", "options": {"0": {"text": "down", "color": "red"}, "1": {"text": "up", "color": "green"}}}],
     desc="Prometheus's own up: 0 = the last scrape failed (engine down, wrong key: 401).")
stat("Scrape time", [tgt('aymon_scrape_seconds{%s}' % I, instant=True)], 17, 3, unit="s")
stat("Licence", [tgt('aymon_licence_info{%s}' % I, "{{edition}} ({{state}})", instant=True)], 20, 4, text="name")
y[0] += 4
ts("Processor", [tgt('rate(process_cpu_seconds_total{%s}[$__rate_interval])' % I, "process")], 0, 8, unit="percentunit",
   desc="Share of one core the whole process used.")
ts("Memory", [tgt('process_resident_memory_bytes{%s}' % I, "resident"),
              tgt('aymon_process_private_bytes{%s}' % I, "private", "B")], 8, 8, unit="bytes")
bar("Licence slots in use", [tgt('aymon_licence_slots{%s}' % I, "{{kind}}", instant=True)], 16, 8,
    desc="aymon_licence_slots by kind; the limits are aymon_licence_slots_limit (0 = unlimited).")
y[0] += 8

# --------------------------------------------------------------------------- the roots
row("Roots (the process tree is a row of its own)")
ts("Processor by root", [tgt('rate(aymon_root_cpu_seconds_total{%s}[$__rate_interval])' % R, "{{root}}")], 0, 8, unit="percentunit",
   desc="The engine threads' own processor time, by root.")
ts("Events / s", [tgt('rate(aymon_root_events_total{%s}[$__rate_interval])' % R, "{{root}}")], 8, 8, unit="ops",
   desc="Writes that ran a *_fnc chain.")
ts("Messages / s", [tgt('rate(aymon_root_messages_received_total{%s}[$__rate_interval])' % R, "{{root}} in"),
                    tgt('rate(aymon_root_messages_sent_total{%s}[$__rate_interval])' % R, "{{root}} out", "B")], 16, 8, unit="ops",
   desc="MQTT PUBLISH and HTTP requests in, PUBLISH and answers out.")
y[0] += 8
ts("Network", [tgt('rate(aymon_root_network_receive_bytes_total{%s}[$__rate_interval])' % R, "{{root}} in"),
               tgt('rate(aymon_root_network_transmit_bytes_total{%s}[$__rate_interval])' % R, "{{root}} out", "B")], 0, 8, unit="Bps")
ts("SQL statements / s", [tgt('rate(aymon_root_sql_statements_total{%s}[$__rate_interval])' % R, "{{root}}")], 8, 8, unit="ops")
ts("SQL time per statement", [tgt('rate(aymon_root_sql_seconds_total{%s}[$__rate_interval]) / rate(aymon_root_sql_statements_total{%s}[$__rate_interval])' % (R, R), "{{root}}")],
   16, 8, unit="s")
y[0] += 8
table("Roots now", [tgt('aymon_root_health_level{%s}' % R, "", "A", True, "table")], 0, 12,
      rename={"Value": "health"}, mappings=LEVELS, desc="Health level by root: 0 normal .. 3 emergency.")
ts("Log lines FAIL / PANIC (per 5 min)", [tgt('increase(aymon_root_log_lines_total{%s}[5m])' % R, "{{root}} {{level}}")], 12, 12)
y[0] += 8

# --------------------------------------------------------------------------- threads and documents
row("Threads and documents")
ts("Queue depth (top 10)", [tgt('topk(10, aymon_thread_queue_depth{%s} + aymon_thread_worker_queue_depth{%s} or aymon_thread_queue_depth{%s})' % (R, R, R),
                                "{{doc}} {{thread}}")], 0, 8,
   desc="Nodes waiting: the thread's own queue and its workers' (C329).")
ts("Oldest node run (top 10)", [tgt('topk(10, aymon_thread_queue_latency_max_seconds{%s})' % R, "{{doc}} {{thread}}")], 8, 8, unit="s",
   desc="The oldest node the thread ran in its last window: how late its work runs.")
ts("Busy (top 10)", [tgt('topk(10, aymon_thread_busy_ratio{%s})' % R, "{{doc}} {{thread}}"),
                     tgt('topk(5, aymon_thread_worker_busy_max_ratio{%s})' % R, "{{doc}} {{thread}} busiest worker", "B")], 16, 8,
   unit="percentunit")
y[0] += 8
ts("Timer firings skipped / s", [tgt('rate(aymon_thread_timer_skipped_total{%s}[$__rate_interval]) > 0' % R, "{{doc}} {{thread}}")], 0, 8, unit="ops",
   desc="A firing dropped because the previous one was still queued: the thread cannot keep up with its own timers.")
ts("Cycle overruns", [tgt('aymon_thread_cycle_overruns{%s} > 0' % R, "{{doc}} {{thread}}")], 8, 8,
   desc="Cycles a second that ran out of budget with work still queued.")
table("Documents", [tgt('aymon_document_health_level{%s}' % R, "", "A", True, "table")], 16, 8,
      rename={"Value": "health"}, mappings=LEVELS)
y[0] += 8
table("Document roles", [tgt('aymon_document_role{%s}' % R, "", "A", True, "table")], 0, 12,
      rename={"Value": "role"},
      desc="0 alone, 1 master, 2 spare, 3 in transit (a cluster's documents).")
table("Threads not normal", [tgt('aymon_thread_health_level{%s} > 0' % R, "", "A", True, "table")], 12, 12,
      rename={"Value": "health"}, mappings=LEVELS)
y[0] += 8

# --------------------------------------------------------------------------- connections and protocols
row("Connections and protocols")
ts("Sessions", [tgt('aymon_connection_sessions{%s} > 0' % R, "{{doc}} {{con}}"),
                tgt('aymon_connection_sessions_limit{%s} and aymon_connection_sessions{%s} > 0' % (R, R), "{{doc}} {{con}} limit", "B")], 0, 8)
ts("MQTT clients and subscriptions", [tgt('aymon_mqtt_sessions{%s}' % R, "{{con}} clients"),
                                      tgt('aymon_mqtt_subscriptions{%s}' % R, "{{con}} subscriptions", "B"),
                                      tgt('aymon_mqtt_sessions_away{%s}' % R, "{{con}} away", "C")], 8, 8)
ts("MQTT packets / s", [tgt('rate(aymon_mqtt_messages_received_total{%s}[$__rate_interval])' % R, "{{con}} in"),
                        tgt('rate(aymon_mqtt_messages_sent_total{%s}[$__rate_interval])' % R, "{{con}} out", "B"),
                        tgt('rate(aymon_mqtt_dropped_total{%s}[$__rate_interval])' % R, "{{con}} dropped", "C")], 16, 8, unit="ops")
y[0] += 8
ts("MQTT queued and retained bytes", [tgt('aymon_mqtt_queued_bytes{%s}' % R, "{{con}} queued"),
                                      tgt('aymon_mqtt_retained_bytes{%s}' % R, "{{con}} retained", "B")], 0, 8, unit="bytes")
ts("SQL links", [tgt('aymon_sql_links{%s}' % R, "{{con}} {{state}}"),
                 tgt('aymon_sql_links_limit{%s}' % R, "{{con}} limit", "B"),
                 tgt('increase(aymon_sql_pool_exhausted_total{%s}[5m])' % R, "{{con}} exhausted (5 min)", "C")], 8, 8)
ts("Record journal", [tgt('aymon_record_journal_records{%s}' % R, "{{root}} waiting"),
                      tgt('aymon_record_journal_limit{%s}' % R, "{{root}} limit", "B")], 16, 8,
   desc="Records (alarms, events, values) waiting in a root's journal for their sink.")
y[0] += 8

dash = {
    "__inputs": [],
    "title": "AyMON engine",
    "uid": "aymon-engine",
    "description": "An AyMON engine's /metrics (doc/76): the process, its roots, threads, documents, connections and protocols.",
    "tags": ["aymon"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "editable": True,
    "graphTooltip": 1,
    "time": {"from": "now-30m", "to": "now"},
    "refresh": "10s",
    "templating": {"list": [
        {"name": "datasource", "label": "Prometheus", "type": "datasource", "query": "prometheus",
         "current": {"text": "Prometheus", "value": "aymon-prom"}, "hide": 0, "refresh": 1, "options": []},
        {"name": "instance", "label": "Engine", "type": "query", "datasource": DS,
         "definition": "label_values(aymon_build_info, instance)",
         "query": {"query": "label_values(aymon_build_info, instance)", "refId": "instance"},
         "refresh": 2, "sort": 1, "includeAll": False, "multi": False, "hide": 0, "options": [], "current": {}},
        {"name": "root", "label": "Root", "type": "query", "datasource": DS,
         "definition": 'label_values(aymon_root_up{instance="$instance"}, root)',
         "query": {"query": 'label_values(aymon_root_up{instance="$instance"}, root)', "refId": "root"},
         "refresh": 2, "sort": 1, "includeAll": True, "allValue": ".*", "multi": True, "hide": 0, "options": [],
         "current": {"text": ["All"], "value": ["$__all"]}},
    ]},
    "annotations": {"list": []},
    "panels": panels,
}
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    json.dump(dash, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(panels), "panels")
