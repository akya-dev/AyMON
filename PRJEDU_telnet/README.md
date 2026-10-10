# PRJEDU_telnet — a shell into a running engine

A plant that runs on its own, and a maintenance shell you can log in to while
it does. Two windows:

```bat
run.bat
```

```bat
shell.bat             plain telnet, 127.0.0.1:2323
shell.bat -Tls        the same shell over TLS,   127.0.0.1:2324
```

On Linux: `./run.sh`, then `./shell.sh` (plain) or `./shell.sh --tls` in a second terminal
(`shell.py`, Python 3; without python3 a plain `telnet 127.0.0.1 2323` does too).

Log in as **admin** / `admin123`. Stop the engine with CTRL-C; leave the shell
with `exit`.

AyXDB.exe has a maintenance prompt behind CTRL-X, but that prompt reads
stdin — once the engine runs as a Windows service there is no console to type
into. `PRO.telnet` is the same capability on a socket, and because it is an
ordinary protocol it inherits the transport, TLS, the address filter and the
per-session role from the connection layer every other protocol already uses.

## What you should see

```
AyMON example plant - maintenance shell
login: admin
password:

user 'admin', role 7, document 'SHL/S00' - type 'help'
SHL/S00> plant
level 30 %, pump off, mode auto, step 16  (you are admin, role 7)
SHL/S00> evt.GetValue("id('LEVEL')/@sta")
0x0343
SHL/S00> ver
platform : 4.3.4 build 446
document : SHL/S00
log file : C:\AyMON\AyMON\PRJEDU_telnet\log\SHL-20260922_235809.log
licence  : AyMON EDU, 'AyMON education and personal use', lic_id AKYA-2026-000002 -- OKY
limits   : doc 2/4 con 2/8 ses 0/32 cli 1/4 (refused: doc 0 con 0 ses 0 cli 0)
SHL/S00> log on 4
log follow ON: SHL/S00, level <= 4 ('log off' to stop)
SHL/S00>
|2026-09-22 22:23:41.118|6310|WARN  | SHL/S00:LEVEL sta 0x0343 -> 0x0347  value 19.7 %
```

## The files

| File | What is in it |
|---|---|
| `db\AyXDB.xml` | the **root document**: names the engine, loads the child |
| `db\db_SHL.xml` | the plant, the `<auth>` element, and the two shells |
| `db\db_SHL.js` | the simulator, and the `pro_oncmd` command hook |
| `shell.ps1` | a terminal for the shell — plain or TLS, nothing to install |
| `shell.bat` | runs it with PowerShell's execution policy relaxed for that one process |
| `db\cert\` | a **public** self-signed certificate for the TLS half |

## What it teaches

* **the shell is not privileged.** A command runs with the **session's own
  role**, so `xdb_acl` applies exactly as it does to any other remote caller.
  This makes it *more* restricted than the CTRL-X console, which runs as
  SYSTEM and sees everything. Granting somebody a shell grants them their
  role — no more, and no less.
* **three gates, and they are different gates.** `con_acl` decides who may
  open a socket, `con_auth` who may log in and as what, `xdb_acl` what that
  role may then touch. Each is worth having; none replaces another.
* **fail-closed.** With neither `con_auth` nor `pro_onlogin` the shell refuses
  **everyone** and says so at startup. `PRO.mcp` treats a missing key as
  "authentication disabled"; that default is deliberately *not* repeated here,
  because this shell evaluates arbitrary script under the service account.
* **one `<auth>` element serves every channel.** Users, hashes, groups,
  lockout and the audit line live in one place; telnet, MQTT and a web login
  all point at it with `con_auth`.
* **TLS is one attribute.** `[CON.tls,PRO.telnet]` instead of
  `[CON.tcp,PRO.telnet]` plus `con_ssl_*`. The protocol code is identical.
* **`pro_oncmd` adds project verbs.** Return a value to answer the command,
  return nothing and the line falls through to the script engine — which is
  how `plant`, `pump on` and `ping` live beside `1+1`.
* **the log is a stream, not just a file.** `log on 4` follows the current
  document's log live, per session, with its own level, without changing what
  anybody else sees.

## Who may do what

Four users, and the roles are the whole point:

| Login | Password | Role | |
|---|---|---|---|
| `admin` | `admin123` | 7 Admin | everything, including `SECRET` |
| `eng` | `eng123` | 6 Engineer | everything except reading `SECRET`; may set `MAINT` |
| `opr` | `opr123` | 3 Operator | may drive the pump while `MAINT` is 1 |
| `mon` | `mon123` | 2 Monitor | may look |

The same three lines, logged in as different people:

```
SHL/S00> evt.GetValue("id('SECRET')/@val")
the boiler-room key is under the mat          <- admin
                                              <- opr: nothing at all
SHL/S00> evt.SetValue("id('MAINT')/@val", 1)
1                                             <- eng: written
0                                             <- opr: refused, and it stays 0
SHL/S00> pump on
pump on                                       <- opr, once MAINT is 1
pump: role 2 may not touch the pump           <- mon
```

Nothing in `PRO.telnet` decided any of that. `SECRET` carries
`xdb_acl="0xF0000000"` and `MAINT` carries `0xFF111111`; the same answers come
back over MQTT, REST or a replication link. One nibble per role, role N in
bits 4N..4N+3, written high role first — `1` read, `2` write, `4` create,
`8` delete.

**`LEVEL` has no `xdb_acl`, so every logged-in role may write it**, `mon`
included. That is not an oversight in the example — it is what "no ACL" means.
A role is worth nothing against elements that carry no ACL.

The filter is not per command, either. `evt.GetValue("json(//var)")` as
`admin` returns six elements; as `opr` it returns five, and `SECRET` is not
one of them — it is dropped from the array, not blanked out.

### What the log keeps

Every attempt, accepted or not, leaves an audit line — the `<auth>` element
writes one and the shell writes the other:

```
AUTH(SHL/S00/A_SHELL): telnet 'admin'@127.0.0.1 ACCEPTED, role 7 via local
CN_TEL:PRO.telnet(1).login: 'admin' accepted, role = 7
AUTH(SHL/S00/A_SHELL): telnet 'opr'@127.0.0.1 REFUSED: wrong password
CN_TEL:PRO.telnet(1).login: 'opr' REFUSED (rc = 1)
```

A write the ACL turned down is in there as well, at ALERT — that one is an
engine message and is in Turkish ("xdb_acl refused the write, role 3"):

```
SHL/S00:MAINT.val: xdb_acl yazma reddetti (rol 3)
```

### Failed logins

Three wrong passwords close the socket (`pro_tel_try="3"`). Five failures for
the same user from the same address lock that user for 30 seconds
(`auth_try="5" auth_lock="30"`), across connections — the fourth session gets
`too many failed attempts - try again later` **even with the right password**.
An Admin elsewhere can clear it with `AUTH.unlock("*")`.

## Commands

Built in: `help`, `help <SCOPE>`, `who`, `ver`, `history`, `pwd` / `cd NAME`,
`log [lvl] [lines]`, `log on [lvl]` / `log off`, `exit`.

From `pro_oncmd` in `db_SHL.js`: `plant`, `pump on`, `pump off`, `ping`.

Anything else is evaluated as script in the current document:

```
SHL/S00> 1+1
2
SHL/S00> evt.GetValue("json(//var)")            a subtree as JSON
SHL/S00> evt.GetValue("stat(id('CN_TEL'))")     runtime counters of a <con>
SHL/S00> evt.SetValue("#xdb_log", 7)            engine log level, 0..7
SHL/S00> Object.XDB_EVT.help                    the full evt API
```

`cd` moves between documents, and `log`, `log on` and `ver` follow it: every
document keeps its own log file, so `cd XDB` then `log 4 3` reads the root
document's log, not this one's.

## Making your own passwords

`admin` carries a real PBKDF2-SHA256 hash; the other three are plain text,
which the engine accepts and quietly upgrades to a hash at the first
successful login — in memory only, since it cannot rewrite the file. Make
your own in the shell:

```
SHL/S00> AUTH.hash("the password")
$pbkdf2-sha256$100000$jXsn3BVlyDqfZP202ccXQw$R_z6y6IeImQVexOdxplKT4SXvNX3ye1TBZLKKnsaMjU
SHL/S00> AUTH.hash("the password", 20000)      fewer iterations, for a slow box
```

and paste the answer into `usr_pwd`. One caveat: at `xdb_log="7"` the engine
dumps every received buffer, so the line you typed is in the log. The login
itself is never dumped — the password line is redacted — but a command you
type is not a password prompt.

## Clients

**`shell.ps1`** (`shell.bat` runs it with the execution policy relaxed for
that one process) is here because Windows 11 ships without a telnet client and
the obvious substitutes are poor. It runs in **character mode**, so the
shell's own line history (Up/Down), in-line editing and Ctrl-C line-cancel all
work, and it decodes UTF-8 statefully so engine messages come out right.

| | |
|---|---|
| `shell.bat` | plain, `127.0.0.1:2323` |
| `shell.bat -Tls` | TLS, `127.0.0.1:2324` |
| `shell.bat -Server 10.40.1.5 -Port 2323` | somewhere else |
| `shell.bat -Tls -Verify` | validate the certificate (fails on the demo one, which is self-signed) |

**PuTTY** works too — connection type **Telnet**, not Raw and not SSH. In
Telnet mode it answers the ECHO and SGA options the shell announces, which is
what hides the password and puts the terminal in character mode. In SSH mode
PuTTY sends `SSH-2.0-PuTTY...`, the shell reads it as a user name, and the
session closes after three attempts — this shell speaks telnet, not SSH.

**Windows' own `telnet`** is an optional feature: `dism /online
/Enable-Feature /FeatureName:TelnetClient` from an elevated prompt.

**`openssl s_client -connect 127.0.0.1:2324 -quiet`** is enough for a quick
look at the TLS port. Keep `-quiet`: without it `s_client` eats the first
letter of every line as one of its own commands (`C` reconnects, `Q` quits),
so `CON.list` never reaches the shell.

## Opening it to another machine

Both listeners are on `127.0.0.1` and `con_acl="127.0.0.1"` refuses everyone
else at accept time. Before you change that:

* [ ] use the **TLS** connection. Plain telnet carries the password, and
      everything after it, in clear text
* [ ] replace `db\cert\` with a certificate that is actually yours. The one
      here is self-signed and its private key is in this repository
* [ ] widen `con_acl` only as far as needed — `10.40.1.*`, not blank
* [ ] hash the passwords, and give each user the **lowest** role that works
* [ ] put `xdb_acl` on what matters; a role means nothing against elements
      that carry none
* [ ] keep `con_idletmo`, and `con_ses` small — this is not a user interface

If SSH is what you want, take it from something that already implements it:
run the plain listener on loopback and reach it through the Windows OpenSSH
server, or through `ssh -L 2323:127.0.0.1:2323 user@host`.

## Known limit

**The shell lives inside the engine.** If the document is stopped or the
`<con>` is disabled, the shell goes down with it. It is a maintenance channel
for a *running* engine, not a rescue channel for a wedged one.

## Licence

Two connections, two documents, one logged-in user: well inside FREE. Telnet
is a FREE feature — a maintenance shell is not something you should have to
buy to diagnose an installation.
