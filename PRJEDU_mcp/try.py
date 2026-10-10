#!/usr/bin/env python3
# ---------------------------------------------------------------------
# PRJEDU_mcp -- talk to the MCP endpoints WITHOUT an AI (Linux; the
# counterpart of try.ps1, Python standard library only).
#
# MCP is JSON-RPC 2.0 over HTTP POST. An assistant does exactly what this
# script does: initialize, tools/list, then tools/call with a tool name and
# an arguments object. Seeing the raw calls once makes the assistant's
# behaviour much easier to read later.
#
# Start the engine first (./run.sh), then:   ./try.sh
# ---------------------------------------------------------------------
import argparse, json, sys, urllib.error, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--server", default="127.0.0.1")
ap.add_argument("--read-port", type=int, default=8095)
ap.add_argument("--write-port", type=int, default=8096)
a = ap.parse_args()
_id = 0

def rpc(port, key, method, params=None):
    global _id
    _id += 1
    body = {"jsonrpc": "2.0", "id": _id, "method": method}
    if params is not None: body["params"] = params
    req = urllib.request.Request("http://%s:%d/mcp" % (a.server, port), data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return "HTTP %d" % e.code
    if "error" in res: return "error %s: %s" % (res["error"].get("code"), res["error"].get("message"))
    return res.get("result")

# tools/call answers { content: [ { type: "text", text: "<json>" } ], isError? }
# The tool's own answer is the JSON inside 'text'.
def call(port, key, tool, arguments=None):
    r = rpc(port, key, "tools/call", {"name": tool, "arguments": arguments or {}})
    if isinstance(r, str): return r
    t = r["content"][0]["text"]
    return ("isError  " + t) if r.get("isError") else t

def step(title):
    print("\n\033[36m== %s\033[0m" % title)

R, RK = a.read_port, "demo-read-key"
W, WK = a.write_port, "demo-write-key"

try:
    init = rpc(R, RK, "initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "try.py", "version": "1"}})
except (urllib.error.URLError, OSError):
    print("\033[31mNothing answers on %s:%d. Start the engine first: ./run.sh\033[0m" % (a.server, R))
    sys.exit(1)

step("initialize - who is there")
print("%s %s, protocol %s" % (init["serverInfo"]["name"], init["serverInfo"]["version"], init["protocolVersion"]))

step("tools/list on the READ endpoint (%d) - no write tools at all" % R)
print(", ".join(t["name"] for t in rpc(R, RK, "tools/list")["tools"]))

step("tools/list on the WRITE endpoint (%d) - set_value ... and the project's set_setpoint" % W)
print(", ".join(t["name"] for t in rpc(W, WK, "tools/list")["tools"]))

step("a wrong key")
print(rpc(R, "not-the-key", "tools/list"))

step("system_info - only PLT/S00 is listed; AI/S00 has no mcp_pub")
print(call(R, RK, "system_info"))

step("read_points - VENDOR_NOTE is 'not found' for role 2, and acl_hidden says one was filtered")
print(call(R, RK, "read_points", {"doc": "PLT/S00", "ids": ["LEVEL", "SETPOINT", "PUMP", "VENDOR_NOTE"]}))

step("plant_status - a tool the PROJECT declared, in db/db_AI_mcp.js")
print(call(R, RK, "plant_status"))

step("set_value on the read endpoint - the tool does not exist there")
print(call(R, RK, "set_value", {"adr": "PLT/S00/SETPOINT/val", "val": 70}))

step("set_value SETPOINT = 70, dry_run - what WOULD be written")
print(call(W, WK, "set_value", {"adr": "PLT/S00/SETPOINT/val", "val": 70, "dry_run": True}))

step("set_value SETPOINT = 70 - role 3 may write it")
print(call(W, WK, "set_value", {"adr": "PLT/S00/SETPOINT/val", "val": 70}))

step("set_value SETPOINT = 150 - OKY, and the plant's own limit makes it 90")
print(call(W, WK, "set_value", {"adr": "PLT/S00/SETPOINT/val", "val": 150}))
print(call(W, WK, "read_points", {"doc": "PLT/S00", "ids": ["SETPOINT"]}))

step("set_value LEVEL = 10 - a measurement; role 3 may not write it")
print(call(W, WK, "set_value", {"adr": "PLT/S00/LEVEL/val", "val": 10}))

step("one address, two elements: SETPOINT written, LEVEL refused = PARTIAL")
print(call(W, WK, "set_value", {"adr": "doc('PLT/S00')//var[@val_unt='%']/@val", "val": 60}))

step("set_setpoint 150 - the project tool refuses instead of clamping")
print(call(W, WK, "set_setpoint", {"value": 150}))

step("set_setpoint 60")
print(call(W, WK, "set_setpoint", {"value": 60}))

step("read_logs - what the engine wrote about all this (PLT/S00, WARN and worse)")
logs = call(W, WK, "read_logs", {"doc": "PLT/S00", "level": "WARN", "lines": 6})
try: print(json.loads(logs)["text"])
except (ValueError, KeyError, TypeError): print(logs)
print()
