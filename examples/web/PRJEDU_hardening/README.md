# PRJEDU_hardening — harden a plant that was delivered weak

A small plant — a tank, a pump, a high-level trip, a secret recipe — with a
page and live values. It works. It was also set up in a hurry, and its
access configuration has **seven weaknesses**. Your task: find them and fix
them in `db/db_PLT.xml`, until the plant's own checks say so.

```bat
run.bat
```

On Linux: `./run.sh`. Then open **http://127.0.0.1:8101/**.

Three people have an account:

| user | password | group | role | should be able to |
|---|---|---|---|---|
| `mon` | `mon123` | monitor | 2 | watch |
| `opr` | `opr123` | operator | 3 | + set the setpoint, start and stop the pump |
| `eng` | `eng123` | engineer | 6 | + set the high-level trip, read and keep the recipe |

Nobody else should see or change anything. (The passwords are in this
README because this is a lab; the page's access test uses them too.)

## The task

The seven questions — each has a wrong answer in the configuration as
delivered:

1. **Who may open a connection at all?** Every listener can name the
   addresses it accepts.
2. **Does anybody have to log in?** And what role does a connection have
   before it has?
3. **What happens to an element nobody thought about?** A plant has hundreds;
   the safe answer for the ones you forgot is "nobody".
4. **Who may move the high-level trip?** It is the last thing between the
   tank and the floor.
5. **Who may read the recipe?**
6. **How are the passwords stored, and who may read the account list?**
7. **How many guesses does a password get?**

Two tools on the page tell you where you are:

- **Self-check** — the plant reads its own configuration every five seconds
  and says what it can see there: questions 1, 2, 3, 6 and 7.
- **Access test** — the page logs in as four identities (no user name, `mon`,
  `opr`, `eng`) and tries what each may and may not do: questions 2, 3, 4
  and 5. It also checks the other way: that your fix did not lock out the
  people who need the access (the rows marked 0). Every value it changes, it
  puts back.

Edit `db/db_PLT.xml`, stop the engine (CTRL-C), `run.bat` again, reload the
page, log in, look. A weakness is fixed when both tools agree.

Log in as different people and try the controls by hand, too: the page says
whether the plant **took** a write. MQTT has no "refused" answer — the page
looks whether the value changed — and the engine writes every refusal into
`log\PLT-*.log`.

## What you have to work with

All of it is in `db/db_PLT.xml`, and all of it is ordinary engine
configuration:

| Attribute | On | Says |
|---|---|---|
| `con_acl` | a listener (`<con>`) | the addresses that may connect: `127.0.0.1`, `10.40.1.*`, a list separated by commas. Checked when the connection is accepted, before anything else |
| `con_auth` | a listener | which `<auth>` logs its sessions in. Without it nobody logs in |
| `con_role` | a listener | the role a session has before (or without) logging in |
| `xdb_acl` | the document, any element | who may do what: four bits per role, role 0 in the lowest hex digit — `0x76543210`. Bit 1 read, 2 write, 4 create, 8 delete. `0xFF113110`: roles 7 and 6 everything, 3 read and write, 5, 4, 2 and 1 read, 0 nothing. An element without its own takes its parent's; **no `xdb_acl` anywhere means no access control at all** |
| `usr_pwd` | a `<usr>` in `<auth>` | the password — in clear text, or as a hash `$pbkdf2-sha256$<rounds>$<salt>$<key>` |
| `auth_rehash` | `<auth>` | 1 = a password found in clear text is replaced by its hash at the first login (in memory — the file keeps what you wrote) |
| `auth_try`, `auth_lock` | `<auth>` | this many wrong passwords for one user from one address lock that user, from that address, for this many seconds |

Roles: 0 Guest, 1 Customer, 2 Monitor, 3 Operator, 4 Supervisor, 5 Manager,
6 Engineer, 7 Admin.

A hash for `usr_pwd`, with nothing but Python:

```python
import hashlib, os, base64
b = lambda x: base64.urlsafe_b64encode(x).decode().rstrip("=")
salt = os.urandom(16)
print("$pbkdf2-sha256$100000$" + b(salt) + "$" + b(hashlib.pbkdf2_hmac("sha256", b"opr123", salt, 100000, 32)))
```

(or `AUTH.hash("opr123")` in the engine's maintenance shell — see
[PRJEDU_telnet](../PRJEDU_telnet/README.md)).

## What it measured

Engine 4.3.4.467, on a Windows 11 laptop and on Linux (WSL, Ubuntu 22.04):

| | as delivered (`run.bat`) | hardened (`run_solution.bat`) |
|---|---|---|
| self-check | 5 of 5 weak | 5 of 5 OK |
| access test | 3 of 8 — only the "0" rows pass | 8 of 8 |
| no user name | accepted, as an Operator | refused, CONNACK 4 |
| `opr` with a wrong password | accepted | refused, CONNACK 4 |
| `mon` writes the setpoint | taken | not taken; `SETPOINT.val: xdb_acl yazma reddetti (rol 2)` in the log |
| `opr` writes the trip level | taken | not taken; the same line with `TRIP_LEVEL`, role 3 |
| `mon` subscribes | receives the recipe | never receives it |

**Why it matters, measured on the plant as delivered:** a page connected
*without a password* set the trip level to 120 and the pump to STOP. The
tank filled, nothing closed the inlet, and it overflowed — the plant's own
message "the tank overflows".

**On the hardened plant:**
- five wrong passwords for `mon` → the right one refused too (CONNACK 5,
  `REFUSED: locked - 60 s left`); `eng` from the same address unaffected;
  `mon` in again about a minute later. A good login in between resets the
  count — the access test can be run again and again (measured six times in
  a row) without locking anyone out.
- every login leaves a line in the log: `mqtt 'opr'@127.0.0.1 ACCEPTED,
  role 3 via local`, `REFUSED: wrong password`, `REFUSED: unknown user`.
- a refused login is a FAIL line, and the document's own health rises with
  it: `sta alarm NORMAL -> ALARM` (sta `0x034B`) — the plant's status shows
  that someone tried.
- a refused login also leaves an ERROR line from the MQTT layer
  (`MQTT_CONNECT_IN : ... res = INF_OKY exception error`) and, as the socket
  closes, a line or two about the WebSocket closing frame. They are noise,
  not a second fault; the `AUTH(...)` line is the one that says what
  happened.

## The solution

`db/db_PLT_solution.xml` is one way to fix all seven; every change is marked
`FIX n`. `run_solution.bat` (`./run_solution.sh`) runs it. Try it yourself
first — and then compare: there is more than one right answer to 1 and 3.

## Not in this lab

- **The wire.** The login crosses `ws://` in clear text. On 127.0.0.1 nobody
  else sees it; on a network it would be `wss://` — [PRJEDU_web](../PRJEDU_web/README.md)
  shows how.
- **The other ways in**: the maintenance shell ([PRJEDU_telnet](../PRJEDU_telnet/README.md))
  and an AI assistant over MCP ([PRJEDU_mcp](../../ai-vision/PRJEDU_mcp/README.md)) go
  through the same `con_acl`, `con_auth` and `xdb_acl`.

## Licence

**Two connections** (the page and its live values) and one document: inside
the **FREE** edition.
