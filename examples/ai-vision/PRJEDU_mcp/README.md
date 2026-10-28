# PRJEDU_mcp — an AI assistant talks to the plant

A small tank plant that runs on its own, and two **MCP** endpoints that let an
AI assistant — Claude Code, Claude Desktop, or any MCP client — read it and,
within limits, change it. Two windows:

```bat
run.bat
```

```bat
try.bat               every call an assistant would make, without an assistant
```

On Linux: `./run.sh`, then `./try.sh` in a second terminal (`try.py`, Python 3).

Stop the engine with CTRL-C.

While it runs, open **http://127.0.0.1:8109/** — the plant as the person
beside the assistant sees it: the level, the set point, the pump, the
maintenance mode, a trend, and a list of every change the page saw. Run
`try.bat` (or ask the assistant to change the set point) and watch the
changes arrive.

**MCP** (Model Context Protocol) is how an assistant calls tools on another
system: JSON-RPC 2.0 over HTTP POST. `PRO.mcp` makes the engine an MCP server.
It already knows what an element, a value, an alarm state and a log are, so the
built-in tools need no code — the example adds configuration, two small project
tools, and nothing else.

## The page

`PLT/S00` serves it with two more connections: `CN_WEB` (HTTP, `www\`) and
`CN_LIVE` (MQTT inside a WebSocket on the same port, `/mqtt`). It only
reads, and it reads as a Guest (role 0): the document's
`xdb_acl="0xFF111111"` gives that role read — the same rule that answers the
read-only endpoint. So `VENDOR_NOTE` (`0xF0000000`, the administrator's)
never reaches the page, and the page says so. Measured with `try.bat`: the
page listed the set point going 60 → 70 → 90 → 60 and the pump starting,
and `VENDOR_NOTE` never arrived.

## The two endpoints

| | URL | Key | Access | Runs as |
|---|---|---|---|---|
| `CN_MCP` | `http://127.0.0.1:8095/mcp` | `demo-read-key` | read only | role 2, Monitor |
| `CN_MCPW` | `http://127.0.0.1:8096/mcp` | `demo-write-key` | read and write | role 3, Operator |

Both keys are in this public repository. They are examples, not secrets.

## Connecting an assistant

**Claude Code** — this directory carries a `.mcp.json` that names both
endpoints. Start Claude Code **in this directory** while `run.bat` is running,
approve the two servers when asked, and ask away. Or add one by hand:

```bash
claude mcp add --transport http aymon-demo http://127.0.0.1:8095/mcp --header "Authorization: Bearer demo-read-key"
```

**Claude Desktop** speaks to local processes, not to URLs, so it needs the
`mcp-remote` bridge (Node.js 18 or later). In
`%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aymon-demo": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote",
               "http://127.0.0.1:8095/mcp",
               "--header", "Authorization:${AUTH_HEADER}",
               "--transport", "http-only"],
      "env": { "AUTH_HEADER": "Bearer demo-read-key" }
    }
  }
}
```

The header goes through `AUTH_HEADER` because Windows splits an argument at
the space in `Bearer demo-read-key`. Quit Claude Desktop from the tray and
start it again after editing the file.

Then ask, for example:

* *"What AyMON documents can you see, and what is in them?"*
* *"How is the tank doing?"*
* *"Raise the setpoint to 90 and tell me when the level alarm shows."*
* *"Set the tank level to 10."* — and watch it be refused
* *"Is there anything in the log I should know about?"*

An assistant caches the tool list when it connects. If you change the tools
(`db\db_AI_mcp.js`) or an endpoint, restart the client as well, or it keeps
calling with the old list.

## What you should see

`try.bat`, shortened:

```
== tools/list on the READ endpoint (8095) - no write tools at all
system_info, browse, find_points, read_points, get_alarms, get_events, query_history,
tree, get_summary, get_metrics, get_connections, aggregate, read_logs, plant_status

== tools/list on the WRITE endpoint (8096) - set_value ... and the project's set_setpoint
... read_logs, set_value, add_value, xor_value, msk_value, ask_value, api_call, ack_alarm,
plant_status, set_setpoint

== a wrong key
HTTP 401

== system_info - only PLT/S00 is listed; AI/S00 has no mcp_pub
{"server":"AyMON", ... "docs":[{"id":"PLT/S00","desc":"Tank plant: one tank ...","sta":"0x0303","sta_txt":"RUN"}], ...

== read_points - VENDOR_NOTE is 'not found' for role 2, and acl_hidden says one was filtered
{"doc":"PLT/S00","acl_hidden":1,"points":[{"id":"LEVEL", ... "val":"62.9","sta":"0x0343","sta_txt":"RUN new"}, ...
 {"id":"VENDOR_NOTE","error":"not found"}]}

== plant_status - a tool the PROJECT declared, in db\db_AI_mcp.js
{"level_pct":62.9,"level_state":"normal","setpoint_pct":60,"pump":"stopped","mode":"automatic","step":155}

== set_value on the read endpoint - the tool does not exist there
error -32601: Method not found

== set_value SETPOINT = 150 - OKY, and the plant's own limit makes it 90
{"op":"set_value","adr":"doc('PLT/S00')/id('SETPOINT')/@val","matched":1,"res":"OKY"}
{"doc":"PLT/S00","points":[{"id":"SETPOINT", ... "val":"90", ...}]}

== set_value LEVEL = 10 - a measurement; role 3 may not write it
isError  {"op":"set_value", ... "res":"refused","reason":"xdb_acl refused the write ..."}

== one address, two elements: SETPOINT written, LEVEL refused = PARTIAL
{"op":"set_value","adr":"doc('PLT/S00')//var[@val_unt='%']/@val","matched":2,"res":"PARTIAL", ...}

== set_setpoint 150 - the project tool refuses instead of clamping
{"ok":0,"error":"setpoint 150 is outside 20..90 %; nothing was written"}
```

## The files

| File | What is in it |
|---|---|
| `db\AyXDB.xml` | the **root document**: names the engine, loads the two children |
| `db\db_PLT.xml` | `PLT/S00`, the plant — **published** to MCP, with its `xdb_acl` |
| `db\db_PLT.js` | the simulator and the level controller; nothing in it knows about MCP |
| `db\db_AI.xml` | `AI/S00`, the two MCP endpoints — **not** published |
| `db\db_AI_mcp.js` | the project's own tools, `plant_status` and `set_setpoint` |
| `db\db_AI_api.js` | the `api` scope: `api.help()`, the text `system_info` hands the assistant |
| `try.ps1` / `try.bat` | the raw JSON-RPC calls, no assistant needed |
| `.mcp.json` | both endpoints, for Claude Code |

## What it teaches

* **Publishing is per document.** `mcp_pub="1"` on a document's root puts it on
  the whitelist; `mcp_desc` is the sentence the assistant reads to decide
  whether it wants that document. `AI/S00` has neither, so the assistant cannot
  see even the configuration of the door it came in through.
* **An endpoint has a role, and the role is the whole answer.** `pro_mcp_role`
  says who the endpoint *is*; `xdb_acl` on each element says what that role may
  do. MCP does not decide anything of its own — the same element answers a web
  user, a telnet session or a replication link the same way. The write
  endpoint's tool list says `set_value`, and it still cannot write `LEVEL`.
* **`ro` removes the tools, not just the permission.** On the read endpoint the
  write tools are not in the list; calling one anyway is `Method not found`.
  An assistant cannot try what it has not been shown.
* **Hidden looks like absent — but never silently.** A point the role may not
  read answers `not found`, not `denied`: that it exists is half of what the ACL
  keeps. Every answer that left something out carries `acl_hidden: N`, so a
  filtered list is never mistaken for a complete one.
* **Four answers to a write, and they mean different things.** `OKY` — done.
  `refused` — the role may not; nothing was written. `PARTIAL` — some of the
  matched elements were written and some were refused; *do not repeat the call*,
  or `add_value` would add twice. `dry_run: true` — nothing written, here is
  what would be.
* **The plant's own limits hold for an AI too.** `SETPOINT` has
  `val_min="20" val_max="90"` and `ATR.lmt`, so 150 lands as 90. That is
  configuration on the element, not a check in the MCP layer, and it applies to
  every writer.
* **A project adds its own tools in script.** `pro_mcp_tools="mcp.tools"` names
  a function that returns tool declarations; the engine merges them into the
  list. `plant_status` answers "how is the plant" in one call; `set_setpoint`
  refuses an out-of-range value *with a reason*, where `set_value` clamps it.
  Whatever a handler returns is the answer. A handler runs with the endpoint's
  role, not as the engine, so it is no way around `xdb_acl`. `write: true`
  lists a tool on `rw` endpoints only.
* **Tell the assistant what it is looking at.** If the `api` scope has a
  `help()` function, `system_info` hands its text to the assistant as
  `api_help` — the place to say in plain words what this installation is.
  It is optional; an engine older than 4.3.4.449 logs, on every
  `system_info`, that it looked for `api.help` and did not find it. The `api`
  scope is also what `api_call` may
  reach on a `rw` endpoint, so keep it to what every caller may run.
* **The log is opt-in.** `pro_mcp_log="4"` turns on `read_logs` up to WARN. The
  log is free text and is not covered by `mcp_pub`, so it is a separate
  decision; without the attribute the tool does not exist.

## Who may do what

| | Read endpoint, role 2 | Write endpoint, role 3 |
|---|---|---|
| see `PLT/S00` | yes | yes |
| see `AI/S00` | no — not published | no — not published |
| read `LEVEL`, `PUMP`, `MAINT` | yes | yes |
| read `VENDOR_NOTE` | not found | not found |
| write `SETPOINT` | no write tools | yes, clamped to 20..90 |
| write `LEVEL`, `PUMP`, `MAINT` | no write tools | refused |

The ACLs are in `db\db_PLT.xml`: the root carries `0xFF111111` (read only below
Engineer) and every element without its own ACL inherits it; `SETPOINT` carries
`0xFF333111` (Operator and up may write); `VENDOR_NOTE` carries `0xF0000000`
(Admin only). One nibble per role, role N in bits 4N..4N+3, written high role
first — `1` read, `2` write, `4` create, `8` delete.

A refused write is in the engine log, at ALERT, in the document of the element
it tried to change, and a wrong key at FAIL in `AI/S00`'s log — some in
Turkish, as the engine's own messages are:

```
AI/S00:CN_MCP:PRO.mcp(1).auth: yetkisiz istek reddedildi       "unauthorised request refused"
PLT/S00:LEVEL.val: xdb_acl yazma reddetti (rol 3)              "write refused, role 3"
PLT/S00:PLT/S00: '//var[@val_unt='%']/@val' -- xdb_acl refused 1 of 2 matched nodes (role 3), the others were written
```

After `try.bat` these three kinds are the only error-level lines in the logs.

## Addresses

The write tools take an address in either of two forms:

| Form | Example | |
|---|---|---|
| topic | `PLT/S00/SETPOINT/val` | document / element id / attribute |
| topic, many | `PLT/S00/var[**]/val` | every `<var>` in the document |
| XPath | `doc('PLT/S00')//var[@val_unt='%']/@val` | anything containing `doc(`, `@` or `//` |

Try a bulk address with `dry_run: true` first; `pro_mcp_wmax="10"` on the write
endpoint refuses any write that would touch more than ten elements. Addresses
starting with `#` are refused outright — MCP cannot run free-form script.

## Known limits

* **`find_points` finds nothing here.** It searches `<io>` elements — the tools
  were shaped by field plants, where every point sits under a polled device.
  A simulated plant cannot use `<io>`: a `<dev>` with no connection behind it
  is never raised to running, and its points do not run their `val_fnc` chain
  (no rounding, no alarm). So the plant is `<var>`, `find_points` answers
  `total: 0`, and `plant_status` is how the assistant gets the picture instead.
  On a Modbus or MQTT plant (`PRJEDU_modbus`, `PRJEDU_mqtt`) the points are
  `<io>` and `find_points` works.
* **`get_alarms`, `get_events` and `query_history`** need an alarm list, an
  event list and a history database; this example has none of them, so they
  answer `address not configured` / `sqlcon not configured`
  (`pro_mcp_alm`, `pro_mcp_evt`, `pro_mcp_sqlcon` on the endpoint name them).
* **One identity per key.** Everybody behind the same key is the same role.
  The engine can resolve a person per request (`pro_mcp_onuser` and an
  `X-AyMON-User-Token` header) — that is for a real installation with a login.
* **No push.** The server answers when asked; it does not tell the assistant
  that an alarm has just appeared.

## Opening it to another machine

Both endpoints are on `127.0.0.1` and `con_acl="127.0.0.1"` refuses everyone
else at accept time. Before you change that:

* [ ] replace both keys. `pro_mcp_key` **left empty turns authentication off
      altogether** — the engine says so in the log, and then anyone who can
      reach the port is in
* [ ] put TLS in front: `[CON.tls,PRO.mcp]` with `con_ssl_*`, as
      `PRJEDU_telnet` does for its shell
* [ ] widen `con_acl` only as far as needed — `10.40.1.*`, not blank
* [ ] give the endpoint the **lowest** `pro_mcp_role` that does the job, and
      keep `pro_mcp_acc="ro"` unless writing is the point
* [ ] put `xdb_acl` on what matters; a role means nothing against elements
      that carry none
* [ ] publish only the documents the assistant needs — never one that holds
      users or passwords
* [ ] a licence that carries `mcp` — see below

## Licence

MCP is **not in FREE**, and not in the education licence in `bin\lic` either —
the start-up log says so: `features off: cluster,rep,rpc,mcp`. It runs here
anyway because an unlicensed feature is a **local** feature: on a loopback
address it works with no licence at all. Move `con_host` to a LAN address and
the connection is refused until a licence carries `mcp`. Four connections (two
for the page) and three documents are well inside FREE's numbers.
