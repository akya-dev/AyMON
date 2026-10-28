# PRJEDU_robot_mcp — an AI assistant runs a robot cell, inside rules it cannot change

The robot cell of [PRJEDU_robotarm](../../labs/PRJEDU_robotarm/README.md) — a six-axis
arm that picks parts and puts them down, and the cell controller around it —
with one more door: an **MCP** endpoint an AI assistant (Claude Code, Claude
Desktop, any MCP client) comes in through.

The assistant can see the cell, start and stop the program and set the speed.
It cannot switch the robot on, release its brakes, unlock a protective stop,
go above its speed ceiling, see the robot's own document, or write into the
person's channel — and a person at the page can switch it off altogether. None
of that is in the assistant or in the page: it is in the engine, where neither
can change it.

```bat
run.bat
```

Then open **http://127.0.0.1:8098/** and connect an assistant (below), or
see every call an assistant makes, without one:

```bat
try.bat               what the assistant may and may not do
try.bat --run         play the program and watch it (release the brakes on the page first)
```

On Linux: `./run.sh`, then `./try.sh` (`try.py`, Python 3 standard library).

| Document | What it is |
|---|---|
| `ROB/S00` | the **robot**, simulated — as in PRJEDU_robotarm (dashboard server TCP 29999, Modbus TCP 1504) |
| `CEL/S00` | the **cell controller** — the rules, the part handshake, the feeder, the page — and the **assistant's channel**. On the MCP whitelist (`mcp_pub="1"`) |
| `AI/S00` | the **MCP endpoint** `http://127.0.0.1:8099/mcp` (key `demo-robot-key`, role 3 Operator) and the project's three tools. Not on the whitelist |

## Two operators, two channels

| | the person, at the page | the assistant, over MCP |
|---|---|---|
| writes | `CMD`, `FEED`, `SPEED`, `AI_ENABLE` | `AI_CMD`, `AI_SPEED` |
| as | role 0 (the page) | role 3, Operator (`pro_mcp_role`) |
| kept apart by | `xdb_acl="0xFF111113"` — role 0 writes, every other role reads | `xdb_acl="0xFF113111"` — role 3 writes, every other role reads |

So the page cannot write `AI_CMD`, and the assistant cannot write `CMD` —
the engine's built-in `set_value` on it is refused like any other write
`xdb_acl` does not allow. Both channels go through the same rules
(`main.refusal`): `play` only when the robot is `RUNNING` and its safety
`NORMAL`, `power off` not while a program plays. The assistant's channel adds
three of its own (`main.on_ai_cmd`, `main.on_ai_speed`):

- **only what a program needs**: `load pick_place.urp`, `load home.urp`,
  `play`, `pause`, `stop`. Powering on, releasing the brakes and unlocking a
  protective stop stay with a person at the cell — someone has to look at why
  the robot stopped.
- **a speed ceiling**: `AI_SPEED_MAX` (50 %).
- **the person's switch**: `AI_ENABLE = 0` refuses everything the assistant
  asks. It does not stop the robot; the person decides what happens to what
  is running.

Every request and the cell's verdict go into `AI_LOG`; the page shows it.

**What the assistant can see** is decided by the whitelist: `CEL/S00` has
`mcp_pub="1"`, `ROB/S00` and `AI/S00` do not. The robot's own document — where
the guard door and the "walk into the arm" button live — does not exist for
it, and neither does the endpoint's own configuration (its key, its role).

## The project's tools

The engine's own MCP tools know documents, elements, values, alarms and logs.
They do not know that this is a robot cell. Three tools in `db/db_AI_mcp.js`
say that — their descriptions are the instructions the assistant reads:

| tool | does |
|---|---|
| `cell_status` | the whole cell in one call: robot mode, safety, program and step, parts waiting and put down, time per part, speed, joints, tool position, the feeder (running/stopped, a part every N s), whether the assistant is allowed |
| `robot_command` | `load` / `play` / `pause` / `stop` — writes `AI_CMD` and returns the cell's verdict |
| `set_speed` | writes `AI_SPEED` and returns the verdict |

A tool runs with the endpoint's role: it is not a way around `xdb_acl`. The
verdict comes back in the same call — the cell's `val_fnc` runs inside the
write, so `AI_OK` and `AI_LAST` are already there when the write returns.
"Accepted" means *sent to the robot*, not *done*: the tool's description tells
the assistant to look at `cell_status` a second later.

## Connecting an assistant

**Claude Code** — this directory has a `.mcp.json` that names the endpoint.
Start Claude Code **in this directory** while `run.bat` is running and approve
the server. Or add it by hand:

```bash
claude mcp add --transport http aymon-robot http://127.0.0.1:8099/mcp --header "Authorization: Bearer demo-robot-key"
```

**Claude Desktop** needs the `mcp-remote` bridge (Node.js 18+), as in
[PRJEDU_mcp](../PRJEDU_mcp/README.md): URL `http://127.0.0.1:8099/mcp`, header
`Authorization:${AUTH_HEADER}`, `AUTH_HEADER` = `Bearer demo-robot-key`.

Then ask, for example:

* *"How is the robot cell doing?"*
* *"Start the pick-and-place job."* — before the brakes are released it will
  be told why not, and should ask you to do it on the page
* *"Run it at 80 % speed."* — and hear about the ceiling
* *"The robot stopped. Unlock it and carry on."* — try it after **Walk into
  the arm** on the page
* switch **assistant allowed** off on the page, and ask it to pause

The key is in this public repository: it is an example, not a secret.

## What it measured

On a Windows 11 laptop and on Linux (WSL, Ubuntu 22.04), engine 4.3.4.467,
with `try.py` making the calls an assistant makes (not with an assistant):

| | |
|---|---|
| `system_info` | lists `CEL/S00` only |
| `robot_command play`, robot `POWER_OFF` | refused: "play needs the robot RUNNING (it is POWER_OFF) - power on, brake release" |
| `robot_command 'brake release'` (not in the tool's list; sent anyway) | refused: "is for a person at the cell, not for the assistant" |
| `set_value` on `CEL/S00/CMD` | `refused` — `xdb_acl` for role 3; an ALERT line in the cell's log |
| `set_value` on `ROB/S00/DOOR` | "document not found or not published" |
| `set_speed 80` / `40` | refused (ceiling 50) / written to register 132 |
| the person releases the brakes, the assistant loads and plays | the program runs; parts are put down; `pause` pauses it |
| the person switches the assistant off | `pause` and `set_speed` refused: "the operator has switched the assistant off"; on again, accepted |
| protective stop (the person walks into the arm) | the assistant's `unlock` refused (a person's job), its `play` refused (safety `PROTECTIVE_STOP`); the person unlocks after 5 s, the assistant's `play` resumes the program |
| a wrong key | HTTP 401; a FAIL line in `AI/S00`'s log, which raises that document's alarm (`sta` 0x034B) |
| a tool call, round trip | `cell_status` 30 ms median, `read_points` 31 ms; `set_speed` 141 ms — it waits for the Modbus write to the robot |

## Try this

| Do | See |
|---|---|
| ask the assistant to run the job while the guard door is open | it is refused with the reason; does it tell you what to do? |
| change a tool's `description` in `db/db_AI_mcp.js`, reload | the assistant behaves differently — the description is its instruction. (Restart the client: it caches the list.) |
| raise `AI_SPEED_MAX` to 80, or add `power on` to `ai_allowed` | what would you want to be true before you let an assistant do that? |
| give the endpoint `pro_mcp_role="2"` (Monitor) | every write is refused: the role decides, not the tools |
| add `mcp_pub="1"` to `ROB/S00` | the assistant can now read the robot's document — and would it be able to open the door? (`xdb_acl` on `DOOR`) |
| write a tool `cell_report` | parts an hour, time per part, stops in the last hour — what an assistant would need to answer "how was the shift?" |

## Licence

**Seven connections**: the robot's two, the cell's four, the MCP endpoint,
in four documents. The FREE edition allows eight connections and five
documents (since engine 4.3.4.561; before it six and four, and one connection
was refused without the EDU licence), so this example runs with no licence at
all. MCP itself is not in FREE, but works on local connections (127.0.0.1),
which is all this example uses.
