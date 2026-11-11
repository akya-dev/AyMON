# Access and safety

Every example in this repository listens on `127.0.0.1`, and most of them have
no login at all. That is a deliberate choice for a teaching set — and the first
thing to undo before any of it faces a network.

AyMON has three gates. They are independent, they are checked in this order,
and each answers a different question:

| | Gate | Question | Where it is written |
|---|---|---|---|
| 1 | `con_acl` | **who may open a socket** | the `<con>` |
| 2 | `con_auth` | **who may log in, and as what** | the `<con>`, pointing at an `<auth>` |
| 3 | `xdb_acl` | **what that role may read and write** | any element |

`PRJEDU_telnet` is the example that shows all three at once, on a shell you can
log in to while the plant runs. `PRJEDU_pages` shows the same three on web
pages: a login form, and set points only an operator may change.

---

## 1. `con_acl` — the address filter

```xml
<con id="CN_TEL" xdb_fnc="[CON.tcp,PRO.telnet]"
     con_host="127.0.0.1" con_port="2323" con_acl="127.0.0.1" ... />
```

Checked **at accept time**, before a session object exists and before anything
has been read from the socket. An address that is not on the list never reaches
the protocol, so it cannot try a password, cannot send a malformed frame and
cannot occupy a session slot.

* patterns, comma separated: `con_acl="10.40.1.*, 10.40.2.*"`
* `*` matches any run of characters, `?` a single one; case does not matter
* **leaving it out means no filtering at all**
* it is checked again when a session is handed to a linked connection
  (`con_host="#CN_WEB"`), so mounting a service behind a listener does not slip
  past it

This is the cheapest gate and the only one that costs an attacker something
before they can spend your CPU.

---

## 2. `con_auth` — who is at the other end

```xml
<auth id="A_SHELL" xdb_acl="0xF0000000"
      auth_prv="local"
      auth_map="engineer:6, operator:3, monitor:2" auth_map_def="0"
      auth_try="5" auth_lock="30" auth_iter="20000" auth_rehash="1">
    <usr usr_id="admin" usr_role="7" usr_pwd="$pbkdf2-sha256$20000$3Xp5...$S3eF..."/>
    <usr usr_id="eng"   usr_grp="engineer" usr_pwd="eng123"/>
    <usr usr_id="opr"   usr_grp="operator" usr_pwd="opr123"/>
</auth>

<con id="CN_TEL" ... con_auth="A_SHELL" .../>
```

A role comes either straight from the user (`usr_role="7"`) or from a group
name that `auth_map` translates (`usr_grp="engineer"` → 6). A group the map
does not know gets `auth_map_def`, which is 0 — Guest — so a typo in a group
name locks someone out rather than letting them in.

One `<auth>` element serves every channel that can log in — the telnet shell,
MQTT and the web pages all name it the same way. What it decides is not "yes
or no" but **which role** the session runs as. `PRJEDU_pages` shows the web
side: a login form the engine answers, a cookie per login, set points that
only an operator may change, and a CSRF token on the form.

Worth knowing before you use it on a plant:

* the user element is `<usr usr_id="...">`, **not** `id` — `id` is the
  document-wide index and a user is not an element anyone should address
* passwords are stored hashed (PBKDF2, `auth_iter` rounds); with
  `auth_rehash="1"` a plain-text password in the file is accepted and turned into
  a hash **in memory** at the first successful login. **The file keeps the plain
  text until the document is saved** (`11_Records_and_Saving`), and a restart then
  starts again. `AUTH.hash` makes one to put in the file: that is why `admin` in
  the example above is already a hash and the others are not — the example keeps
  them readable on purpose, which is also why it listens on loopback only
* `auth_try` / `auth_lock` lock a user and address pair for `auth_lock`
  seconds after `auth_try` failed attempts; `auth_host_try` locks an address after
  that many failures of **any** user (a password spray)
* a session that has not logged in runs at the connection's `con_role`
  (Guest, 0, unless the `<con>` says otherwise)
* the `<auth>` element holds password material, so it carries an `xdb_acl` of
  its own — gate 3 protecting gate 2

| `<auth>` beyond the file | |
|---|---|
| `auth_prv` | providers tried in order: `local`, `sql`, `ldap`, `script` |
| `auth_sql`, `auth_sql_qry` | users in a database, through a `PRO.sql` connection |
| `auth_ldap`, `auth_ldap_tmo`, `auth_ldap_down` | users in a directory. `auth_ldap_tmo` (5 s) is the budget for **all** its addresses, and a directory found down is not tried again for `auth_ldap_down` (10 s) |
| `auth_addr`, `auth_addr_prv` | another provider for a connection that arrived on these local addresses |
| `auth_2fa`, `auth_on2fa` | when a second factor is needed, and the hook that delivers the code |
| `auth_tkn_ttl`, `auth_tkn_max` | how long a token lives (1800 s), how many are held (200) |

A channel with no gate behaves by its own kind: **a telnet `<con>` with no `con_auth`
and no `pro_onlogin` refuses every login**, while **an MCP endpoint with an empty
`pro_mcp_key` is open to loopback clients only**.

---

## 3. `xdb_acl` — what a role may do to an element

One 32-bit word, **one nibble per role**, role N in bits 4N..4N+3:

```
xdb_acl="0xFF333111"
           │││││││└─ role 0 (Guest)    1 = read
           ││││││└── role 1            1 = read
           │││││└─── role 2 (Monitor)  1 = read
           ││││└──── role 3 (Operator) 3 = read + write
           │││└───── role 4            3 = read + write
           ││└────── role 5            3 = read + write
           │└─────── role 6 (Engineer) F = read + write + create + delete
           └──────── role 7 (Admin)    F = everything
```

Bits inside a nibble: `1` read, `2` write, `4` create, `8` delete.

| Value | Reads as |
|---|---|
| `0xFF333111` | everyone may read, operators and up may write, engineers may create and delete |
| `0xFF111111` | everyone reads, only engineer and admin write |
| `0xF0000000` | **admin only**, nobody else sees it at all |

The roles are 0 Guest, 1 Customer, 2 Monitor, 3 Operator, 4 Supervisor,
5 Manager, 6 Engineer, 7 Admin. Two more exist above them — Document (8, a
replication peer) and System (9, the engine itself) — and they are outside the
mask: the engine's own writes are never blocked by an `xdb_acl`.

**An element takes its own `xdb_acl`, else its class's, else its nearest
ancestor's**, so the one on the root element is the document's default. **With none
anywhere there is no restriction:** every role that got through gates 1 and 2 reads
and writes it. That is why the gates are cumulative rather than alternative: an
engine with `xdb_acl` everywhere and no login has nothing to apply it to, and an
engine with a login and no `xdb_acl` gives every user the whole plant.

An attribute follows the element it is **written on**: one defined on a class takes
that class's `xdb_acl`, so a class can open a field wider than the instance. The
default write mode (`xdb_wri="3"`) keeps it there: writing a field whose value only
a class holds, with another `xdb_acl` than the instance's, is refused rather than
quietly copied to the instance. `xdb_wri="1"` on the document's root turns that off.

`PRJEDU_telnet` puts the three values above on three elements and lets you log
in as four different users to see the same plant through four different
windows.

**A server page (`.ayp`) is not a back door.** It runs with the role of the
request that asked for it — Guest (0) until the visitor logs in — so
everything it reads or writes meets the same `xdb_acl`. A public page shows
only what Guest may read. In `PRJEDU_pages` the set points carry
`0x33333111` (everyone reads, Operator and up write) and the maintenance code
`0xFF000000` (Engineer and Admin only): `access.ayp` shows the same three
values as Guest, as `opr` and as `eng`. Give Guest read rights to exactly what an
anonymous page should show, and check every value a form sends on the server
(`tank.ayp` there shows how) — a page that hides its form from a Guest is a
courtesy, the `xdb_acl` is the guard.

**Logging in on the web** takes the same `<auth>` as the shell: `con_auth` on
the HTTP listener, and the engine answers `POST /auth/login` and
`/auth/logoff` itself. A plain HTML form is enough — with a `next` field the
answer is a redirect back to a page, not JSON (engine 4.3.4.594). The login
travels in an `HttpOnly` cookie and is checked on **every request**, never
kept on the connection. A form that changes something must carry the login's
CSRF token (`<input type="hidden" name="_csrf" value="<%= req.csrf %>">`);
without it the engine answers 403 before the page runs, so a form on another
site cannot use a visitor's login. `pro_http_auth="1"` on the listener turns
every page except those in `pro_http_pub` into 401 for a visitor who has not
logged in. `PRJEDU_pages`' README walks through all of it.

---

## TLS

TLS lives on the **listener**:

```xml
<con id="CN_WEBS" xdb_fnc="[CON.tls,PRO.http]" con_host="127.0.0.1" con_port="8443"
     con_ssl_cert="%DB%/cert/demo_cert.pem" con_ssl_key="%DB%/cert/demo_key.pem"
     con_ssl_pwd="" ... />
```

* the transport name is what turns it on: `CON.tls`, `CON.wss`
* a connection mounted on it (`con_host="#CN_WEBS"`) inherits the encrypted
  session and carries no `con_ssl_*` of its own
* on a **server**, not asking the client for a certificate is the default, and
  `con_ssl_verify="0"` says so; it does not weaken the encryption
* on a **client** the server's certificate **is** checked by default, against
  `con_ssl_cacert`. There, `con_ssl_verify="0"` turns the check off: the link is
  still encrypted, but to anyone. Make it a deliberate decision

**The certificates in `PRJEDU_web` and `PRJEDU_telnet` are public.** Their
private keys are in this repository for anyone to read, so that https works
with nothing installed. They are self-signed for `localhost` / `127.0.0.1`, the
browser warns the first time, and that warning is correct. Replace both files
before TLS protects anything that matters.

**OPC UA carries its own security**, not TLS: a policy (`pro_sec`, e.g.
Basic256Sha256) and a mode (`pro_mod`, Sign or SignAndEncrypt) on the
client's `<con>` or `<dev>`, and certificates trusted **in both directions** —
ours on the server (a server refuses an unknown one and files it in its
"rejected" folder until someone moves it), the server's by us (`pro_trust`, a PEM
file). An empty `pro_trust` still connects, and says at every connect that the
server's certificate was not verified: fill it in. The user and password go on the
`<dev>` (or are inherited from the `<con>`), and the server decides what that user
may do. `PRJEDU_opcua` walks through all of it
against a machine that refuses an anonymous write. Its engine certificate is
made at the first run and never leaves the computer: it is not in this
repository.

---

## What the examples deliberately do not do

| Example | What is missing, and why it is fine here |
|---|---|
| `PRJEDU_web` | no login; every page may read and write every value. Loopback only |
| `PRJEDU_mqtt` | the broker checks no community and no user; `con_acl` is the only gate |
| `PRJEDU_snmp` | the script agent answers anyone who can reach the port, and SNMP v2c has no real authentication anyway (the community is a password in clear) |
| `PRJEDU_net` | the mail and file sinks take every message and every upload from anyone who can reach their ports, with no real login and no TLS, and the connections to them say `pro_smtp_tls="none"` / `pro_ftp_tls="none"` out loud. All on loopback only |
| `PRJEDU_rep` | the peer connects with `con_role="8"`, no TLS; both engines are on one machine |
| `PRJEDU_remote` | no TLS and no login on the calls; `con_acl` and the link's `con_role="3"` are the gates. All three engines are on one machine |
| `PRJEDU_telnet` | passwords in clear in the XML, so you can read them |
| `PRJEDU_pages` | the same: two passwords in clear in the XML; the login crosses plain `http://`, so its cookie has no `Secure` flag. Loopback only - on a network use `CON.tls` (the cookie then gets `Secure` by itself) |
| `PRJEDU_opcua` | the setter's password is in clear on the `<dev>`, and two of the three connections run in the clear — to show the difference. The machine listens on loopback only |
| `PRJEDU_hardening` | as delivered: almost everything on the list below is missing, on purpose - that is the lab. `run_solution` is the fixed plant |

None of this is a bug in the examples. It is what "runs with nothing installed"
costs, and it is exactly the list to walk before the same configuration is
pointed at a network.

---

## What the engine does not do for you

AyMON was built to run inside a plant's own network. **Do not publish its ports
directly.** Its parsers have not been fuzz-tested, secrets are plain XML attributes
(`pro_pwd`, `con_ssl_pwd`, ODBC `PWD=`, `pro_mcp_key`), and one process holds every
document. So:

```
internet ──► reverse proxy (TLS, login, size and rate limits)
               │  only /, /*.ayp, /mqtt to the engine's web listener
               ▼
             engine (a non-privileged account, one per customer)
               │  con_host="127.0.0.1" or a firewall, xdb_acl default-deny on the root
               ▼
             plant network (Modbus, OPC UA, SNMP ...)

VPN only:  telnet shell, PRO.mcp, replication and cluster links
```

## The fields that close the rest

| Door | Field | Default | Meaning |
|---|---|---|---|
| Files from script | `xdb_file_role` | 3 | the lowest role that may call `File.open`, `remove`, `rename`. Engine scripts pass; a page runs with its visitor's role |
| | `xdb_file_dirs` | anywhere | `;` list of directories, holding **every** script, the engine's too. `..` is refused |
| A request handler | `pro_onreq_ses` | as below | `pro_onreq` on `PRO.http`, `rest`, `soap`: reads and writes through `exc.evt` always carry the **visitor's** role (`con_role`, 0 by default, or the login). Since 4.4.2.703 the handler's own context — `xdb`, `File.open`, `AUTH.list`, a free `evt` in the module — is the **visitor** too; `"0"` makes it the **engine**, for a handler that checks its callers itself. Before 4.4.2.703 it was the engine with no `con_auth`. Do the work through `exc.evt` ([pro_onreq](reference/06_Sessions_and_Protocol_Scripts.md#pro_onreq)) |
| HTTP size | `pro_http_max` | 16 MiB | larger is 413 before a body byte is read |
| HTTP listing | `pro_http_list` | off | `"1"` lists a directory with no index |
| HTTP headers | `pro_http_hdr` | none | extra lines, `\|` between them: `Strict-Transport-Security: max-age=31536000\|X-Frame-Options: SAMEORIGIN` |
| HTTP rate | `pro_http_rate` | off | `"20,60"`: requests a second per address, with a burst; 429 over it |
| Sessions per address | `con_addr_max` | off | on any listener |
| WebSocket size | `con_ws_max` | 16 MiB | largest message |
| WebSocket origin | `con_ws_origin` | own host, localhost | browser origins allowed besides those; 403 otherwise. **Behind a proxy that rewrites `Host`, list the public origin** |
| CSRF | `pro_http_csrf` | on | `"0"` is off. An unsafe request whose login came from the cookie needs the token |
| Login cookie | `pro_http_cookie`, `pro_http_auth_pfx` | `aymon_tkn`, `/auth` | |
| MCP key | `pro_mcp_key` | empty | empty means **loopback clients only**; compared in constant time |
| MCP origin | `pro_mcp_cors` | none | a request with an `Origin` not listed is 403 before anything runs |
| MCP rights | `pro_mcp_acc`, `pro_mcp_role`, `mcp_pub` | `ro`, none | read or read+write, the endpoint's role, and the documents it may see. **With no role, it reads everything published**: `PRJEDU_mcp` |

`con_addr_max`, `pro_http_rate` and `auth_host_try` count the **socket's peer**,
never `X-Forwarded-For`, which the client writes. Behind a proxy every visitor is the
proxy: set them on the proxy, not on the engine port behind it.

## Before you open a plant to a network

1. `con_host` stops being `127.0.0.1` **last**, not first.
2. `con_acl` on every listener, as narrow as the site allows.
3. `con_auth` on every channel a human can reach; real users, no shared
   accounts, `auth_try` / `auth_lock` set. On a web listener also decide
   which pages are public (`pro_http_auth="1"` + `pro_http_pub`), and leave CSRF on.
4. `xdb_acl` on the elements that matter — starting with the root as a default deny,
   the `<auth>` element itself and anything that commands equipment. Read access is
   as much a decision as write access.
5. TLS with your own certificate on anything that crosses a network you do not
   own. On a client, `con_ssl_verify` is not `0` and `pro_trust` is filled in.
6. `pro_mcp_key` on every MCP endpoint, and MCP behind the VPN.
7. `xdb_file_dirs` set; `xdb_file_role` not lowered without a reason.
8. On a port that faces clients directly: `con_addr_max`, `pro_http_rate`,
   `pro_http_hdr`. Behind a proxy: `con_ws_origin`, and limits on the proxy.
9. A service account without administrator rights; one engine per customer; backups
   encrypted, since the XML holds the passwords.
10. Watch the refusals once in the log: a refused write is an `ALERT` line at the
    default level, so seeing them is how you learn a rule is in force. A refused
    read in a bulk answer is silent: that element simply is not there.

`PRJEDU_hardening` is this list as a lab: a plant delivered without most of
it, a self-check that reads the configuration, and an access test that logs in
as four people and tries.

The complete rules — per-attribute control, every provider's fields, tokens and
two-factor codes — are in the licensed product's access-control and authentication
field notes.
