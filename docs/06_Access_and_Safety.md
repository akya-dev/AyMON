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
log in to while the plant runs.

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
  `auth_rehash="1"` a plain-text password in the file is accepted once and
  **rewritten as a hash** at the first successful login. That is why `admin`
  in the example above is already a hash and the others are not yet — the
  example keeps three of them readable on purpose, which is also why it
  listens on loopback only
* `auth_try` / `auth_lock` lock a user and address pair for `auth_lock`
  seconds after `auth_try` failed attempts
* a session that has not logged in runs at the connection's `con_role`
  (Guest, 0, unless the `<con>` says otherwise)
* the `<auth>` element holds password material, so it carries an `xdb_acl` of
  its own — gate 3 protecting gate 2

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

**No `xdb_acl` means no restriction.** An element without one is readable and
writable by every role that got through gates 1 and 2. That is why the gates
are cumulative rather than alternative: an engine with `xdb_acl` everywhere and
no login has nothing to apply it to, and an engine with a login and no
`xdb_acl` gives every user the whole plant.

`PRJEDU_telnet` puts the three values above on three elements and lets you log
in as four different users to see the same plant through four different
windows.

**A server page (`.ayp`) is not a back door.** It runs with the role of the
session that asked for it — Guest (0) until that session logs in — so
everything it reads or writes meets the same `xdb_acl`. A public page shows
only what Guest may read; `PRJEDU_pages`' `access.ayp` reads an element
closed to role 0 and gets nothing. Give Guest read rights to exactly what an
anonymous page should show, and check every value a form sends on the server
(`tank.ayp` there shows how).

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
* `con_ssl_verify="0"` on a server means "do not ask the client for a
  certificate"; it does not weaken the encryption

**The certificates in `PRJEDU_web` and `PRJEDU_telnet` are public.** Their
private keys are in this repository for anyone to read, so that https works
with nothing installed. They are self-signed for `localhost` / `127.0.0.1`, the
browser warns the first time, and that warning is correct. Replace both files
before TLS protects anything that matters.

**OPC UA carries its own security**, not TLS: a policy (`pro_sec`, e.g.
Basic256Sha256) and a mode (`pro_mod`, Sign or SignAndEncrypt) on the
client's `<con>`, and certificates that must be trusted **in both
directions** — ours on the server (a server refuses an unknown one and files
it in its "rejected" folder until someone moves it), the server's by us
(`pro_trust`, a PEM file). The user and password go on the `<dev>`, and the
server decides what that user may do. `PRJEDU_opcua` walks through all of it
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
| `PRJEDU_telnet` | passwords in clear in the XML, so you can read them |
| `PRJEDU_pages` | the same: two passwords in clear in the XML; the login crosses plain `http://`, so its cookie has no `Secure` flag. Loopback only - on a network use `CON.tls` (the cookie then gets `Secure` by itself) |
| `PRJEDU_opcua` | the setter's password is in clear on the `<dev>`, and two of the three connections run in the clear — to show the difference. The machine listens on loopback only |
| `PRJEDU_hardening` | as delivered: almost everything on the list below is missing, on purpose - that is the lab. `run_solution` is the fixed plant |

None of this is a bug in the examples. It is what "runs with nothing installed"
costs, and it is exactly the list to walk before the same configuration is
pointed at a network.

---

## Before you open a plant to a network

1. `con_host` stops being `127.0.0.1` **last**, not first.
2. `con_acl` on every listener, as narrow as the site allows.
3. `con_auth` on every channel a human can reach; real users, no shared
   accounts, `auth_try` / `auth_lock` set.
4. `xdb_acl` on the elements that matter — starting with the `<auth>` element
   itself and anything that commands equipment. Read access is as much a
   decision as write access.
5. TLS with your own certificate on anything that crosses a network you do not
   own.
6. Read the log once with `xdb_log="7"`: refusals are logged, and seeing them
   is how you learn a rule is actually in force.

`PRJEDU_hardening` is this list as a lab: a plant delivered without most of
it, a self-check that reads the configuration, and an access test that logs in
as four people and tries.

The complete rules — the ACL resolution order, per-attribute control,
authentication providers (SQL, LDAP), tokens and two-factor codes — are in the
licensed product's access-control and authentication field notes.
