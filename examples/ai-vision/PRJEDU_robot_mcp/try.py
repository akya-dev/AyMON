#!/usr/bin/env python3
# ---------------------------------------------------------------------
# PRJEDU_robot_mcp -- the calls an AI assistant makes, WITHOUT an
# assistant (Python standard library only; Windows: try.bat, Linux:
# ./try.sh).
#
# MCP is JSON-RPC 2.0 over HTTP POST: initialize, tools/list, then
# tools/call with a tool name and an arguments object. This script makes
# the calls an assistant would make, including the ones the cell refuses.
#
#   try.py          what the assistant may and may not do (the robot
#                   stays where it is)
#   try.py --run    load and play the pick-and-place program, watch it for
#                   20 s, pause it. The robot must be RUNNING first: that
#                   is a person's job, on the page (Brake release).
#
# Start the engine first (run.bat / ./run.sh).
# ---------------------------------------------------------------------
import argparse, json, sys, time, urllib.error, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--server", default="127.0.0.1")
ap.add_argument("--port", type=int, default=8099)
ap.add_argument("--key", default="demo-robot-key")
ap.add_argument("--run", action="store_true", help="play the program and watch it")
ap.add_argument("--secs", type=int, default=20)
a = ap.parse_args()
_id = 0

def rpc(method, params=None, key=None):
    global _id
    _id += 1
    body = {"jsonrpc": "2.0", "id": _id, "method": method}
    if params is not None: body["params"] = params
    req = urllib.request.Request("http://%s:%d/mcp" % (a.server, a.port), data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + (key or a.key)})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return "HTTP %d" % e.code
    if "error" in res: return "error %s: %s" % (res["error"].get("code"), res["error"].get("message"))
    return res.get("result")

# tools/call answers { content: [ { type: "text", text: "<json>" } ], isError? }
def call(tool, arguments=None):
    r = rpc("tools/call", {"name": tool, "arguments": arguments or {}})
    if isinstance(r, str): return r
    t = r["content"][0]["text"]
    return ("isError  " + t) if r.get("isError") else t

def js(t):
    try: return json.loads(t)
    except Exception: return t

def step(title):
    print("\n\033[36m== %s\033[0m" % title)

def status_line():
    s = js(call("cell_status"))
    if not isinstance(s, dict): return str(s)
    return "mode %-9s safety %-15s %-8s %-15s step %-2s parts %s put down, %s waiting, %s s/part, speed %s %%" % (
        s.get("robot_mode"), s.get("safety"), s.get("program_state"), s.get("program"), s.get("program_step"),
        s.get("parts_put_down"), s.get("parts_waiting"), s.get("seconds_per_part"), s.get("speed_pct"))

try:
    init = rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "try.py", "version": "1"}})
except (urllib.error.URLError, OSError):
    print("\033[31mNothing answers on %s:%d. Start the engine first (run.bat / ./run.sh).\033[0m" % (a.server, a.port))
    sys.exit(1)
if isinstance(init, str):
    print("\033[31minitialize: %s\033[0m" % init); sys.exit(1)

if a.run:
    step("load pick_place.urp and play")
    print(call("robot_command", {"command": "load pick_place.urp"}))
    time.sleep(1)
    print(call("robot_command", {"command": "play"}))
    step("watching for %d s" % a.secs)
    t0 = time.time()
    while time.time() - t0 < a.secs:
        print("%5.1f  %s" % (time.time() - t0, status_line()))
        time.sleep(2)
    step("pause")
    print(call("robot_command", {"command": "pause"}))
    time.sleep(1.5)
    print(status_line())
    sys.exit(0)

step("initialize - who is there")
print("%s %s, protocol %s" % (init["serverInfo"]["name"], init["serverInfo"]["version"], init["protocolVersion"]))

step("tools/list - the engine's own tools, then the project's three")
tl = rpc("tools/list")
print(", ".join(t["name"] for t in tl["tools"]))

step("a wrong key")
print(rpc("tools/list", key="not-the-key"))

step("system_info - only CEL/S00 is visible: ROB/S00 and AI/S00 are not on the MCP whitelist")
si = js(call("system_info"))
print(json.dumps(si.get("docs", si) if isinstance(si, dict) else si)[:300])

step("cell_status - one call, the whole cell")
print(call("cell_status"))

step("robot_command play - the robot is not RUNNING: that is a person's job")
print(call("robot_command", {"command": "play"}))

step("robot_command 'brake release' - not in the tool's list; sent anyway, the cell refuses it")
print(call("robot_command", {"command": "brake release"}))

step("set_value on CMD, the PERSON's channel - xdb_acl refuses it for the assistant (role 3)")
print(call("set_value", {"adr": "CEL/S00/CMD/val", "val": "brake release"}))

step("set_value on the robot's document - not visible, not writable")
print(call("set_value", {"adr": "ROB/S00/DOOR/val", "val": 1}))

step("set_speed 80 - above the assistant's ceiling")
print(call("set_speed", {"percent": 80}))

step("set_speed 40")
print(call("set_speed", {"percent": 40}))

step("robot_command load pick_place.urp")
print(call("robot_command", {"command": "load pick_place.urp"}))

step("read_logs - what the cell wrote about all this")
logs = js(call("read_logs", {"doc": "CEL/S00", "level": "WARN", "lines": 8}))
text = logs.get("text", "") if isinstance(logs, dict) else str(logs)
for l in text.splitlines():
    print("  " + l.split("| ", 1)[-1][:170])

print("\nNow be the person at the cell: open http://127.0.0.1:8098/, press \033[1mBrake release\033[0m,")
print("switch the \033[1mfeeder\033[0m on - then let the assistant run it:  try --run")
