#!/usr/bin/env python3
"""AyMON's MCP endpoint over stdio.

AyMON serves MCP over HTTP (JSON-RPC 2.0 in a POST, with a Bearer key). Some MCP
clients and tools only start a server as a process and talk to it over stdin and
stdout. This bridge is that process: it reads one JSON-RPC message per line on
stdin, posts it to the engine, and writes the answer as one line on stdout.
Python standard library only.

    python3 aymon_mcp_stdio.py [--url URL] [--key KEY] [--start RUN_SCRIPT]

    --url    the engine's MCP endpoint      (env AYMON_MCP_URL, default
             http://127.0.0.1:8096/mcp: the read-write endpoint of PRJEDU_mcp)
    --key    the endpoint's Bearer key       (env AYMON_MCP_KEY, default
             demo-write-key: PRJEDU_mcp's published demo key)
    --start  a run script that starts an engine first, e.g.
             examples/ai-vision/PRJEDU_mcp/run.sh; it is stopped (SIGINT, as
             CTRL-C) when stdin closes. Without it the engine must already run.

Only JSON-RPC goes to stdout; the bridge's own lines and the engine's console go
to stderr.
"""
import argparse, json, os, signal, socket, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

ap = argparse.ArgumentParser(description="AyMON MCP endpoint over stdio")
ap.add_argument("--url", default=os.environ.get("AYMON_MCP_URL", "http://127.0.0.1:8096/mcp"))
ap.add_argument("--key", default=os.environ.get("AYMON_MCP_KEY", "demo-write-key"))
ap.add_argument("--start", default=os.environ.get("AYMON_MCP_START", ""))
ap.add_argument("--wait", type=float, default=60.0, help="seconds to wait for the endpoint (default 60)")
a = ap.parse_args()

engine = None
session = None          # Mcp-Session-Id, if the server ever hands one out (AyMON is stateless)


def say(text):
    sys.stderr.write("aymon-mcp-stdio: %s\n" % text)
    sys.stderr.flush()


def start_engine():
    global engine
    script = os.path.abspath(a.start)
    if not os.path.isfile(script):
        say("run script not found: %s" % script)
        sys.exit(1)
    say("starting %s" % script)
    # the engine's console goes to stderr: stdout carries JSON-RPC only
    engine = subprocess.Popen(["bash", script], stdin=subprocess.DEVNULL, stdout=sys.stderr,
                              stderr=sys.stderr, start_new_session=True)


def stop_engine():
    if engine is None or engine.poll() is not None:
        return
    try:
        os.killpg(engine.pid, signal.SIGINT)        # the engine's own clean stop, as CTRL-C
        engine.wait(timeout=15)
    except Exception:
        try:
            os.killpg(engine.pid, signal.SIGKILL)
        except Exception:
            pass


def wait_endpoint():
    u = urllib.parse.urlsplit(a.url)
    host, port = u.hostname, u.port or (443 if u.scheme == "https" else 80)
    end = time.time() + a.wait
    while time.time() < end:
        if engine is not None and engine.poll() is not None:
            say("the engine stopped (exit %s) before its endpoint answered" % engine.returncode)
            sys.exit(1)
        try:
            with socket.create_connection((host, port), timeout=1):
                return
        except OSError:
            time.sleep(0.25)
    say("nothing answers on %s:%s after %.0f s" % (host, port, a.wait))
    sys.exit(1)


def out(obj_or_text):
    text = obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text, separators=(",", ":"))
    sys.stdout.write(text.strip() + "\n")
    sys.stdout.flush()


def error_for(msg, code, text):
    """A JSON-RPC error answer for each request in msg (notifications get none)."""
    for m in (msg if isinstance(msg, list) else [msg]):
        if isinstance(m, dict) and "id" in m and "method" in m:
            out({"jsonrpc": "2.0", "id": m["id"], "error": {"code": code, "message": text}})


def post(line, msg):
    global session
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
               "Authorization": "Bearer " + a.key}
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(a.url, data=line.encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            session = r.headers.get("Mcp-Session-Id") or session
            body = r.read().decode("utf-8")
            ctype = (r.headers.get("Content-Type") or "").lower()
    except urllib.error.HTTPError as e:
        error_for(msg, -32000, "AyMON answered HTTP %d" % e.code)
        return
    except (urllib.error.URLError, OSError) as e:
        error_for(msg, -32000, "AyMON is not reachable: %s" % e)
        return
    if not body.strip():
        return                                      # 202: a notification, nothing to answer
    if "text/event-stream" in ctype:
        for ln in body.splitlines():
            if ln.startswith("data:") and ln[5:].strip():
                out(ln[5:])
    else:
        out(body)


def main():
    if a.start:
        start_engine()
    wait_endpoint()
    say("bridging stdio to %s" % a.url)
    try:
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                out({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                continue
            post(line, msg)
    except KeyboardInterrupt:
        pass
    finally:
        stop_engine()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: (stop_engine(), sys.exit(0)))
    main()
