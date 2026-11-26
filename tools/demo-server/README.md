# demo-server — the AyMON examples on a public server

A kit that puts the example projects of this repository on one internet-facing Linux server
for anyone to try: `https://<example>.demo.example.com/`, one engine per example, and nothing
of the engines reachable but their pages.

```
internet ─► nftables: 22, 80, 443 in ─► nginx :443 (TLS, limits, headers) ─► 127.0.0.1:81xx
                                                                               one AyXDB per example,
                                                                               sandboxed, reset every 3 h
```

It is a demo server, not a pattern for a plant: every visitor is a stranger and every
example is reset to the repository's copy every few hours.

## What you need

| | |
|---|---|
| a server | Debian 12 (tried) or Ubuntu 24.04, x86-64 or 64-bit ARM, 2 GB RAM (19 examples use ~550 MB), 1-2 vCPU, a public IPv4 |
| a name | `DEMO_DOMAIN`, e.g. `demo.example.com`: an **A** record for it and for `*.demo.example.com` to the server (and **AAAA** if it has IPv6) |
| SSH | you log in **with a key** already; keep that session open while install.sh runs |

## Install

```sh
git clone https://github.com/akya-dev/AyMON.git
cd AyMON/tools/demo-server
sudo bash install.sh                # first run: writes /etc/aymon-demo/demo.env, stops
sudo nano /etc/aymon-demo/demo.env  # DEMO_DOMAIN, ACME_EMAIL, ACME_AGREE_TOS=yes, ADMIN_USER
sudo bash install.sh                # everything; ends with one line per address and its answer
```

Run `install.sh` again after any change to `demo.env` or `examples.conf`, or to move to a
newer `AYMON_REPO_REF` (a release tag is the better choice for a demo than `main`). It keeps
the certificate, and resets and restarts every example.

| Step | What it does |
|---|---|
| `10-packages` | nginx, certbot, nftables, fail2ban, unattended-upgrades, git — from the distribution only |
| `20-host` | SSH by key only, the firewall, fail2ban, nightly security updates (`SKIP_HOST_HARDENING=1`: none of these) |
| `30-engine` | clones the repository to `/opt/aymon-demo/repo`, the engine of this CPU (`bin/linux-x64` / `bin/linux-arm64`), the EDU licence, one sandboxed unit per example, the reset and check timers |
| `35-aysvc` | only with `AYSVC_BIN` in `demo.env`: the update agent, below |
| `40-web` | nginx, one Let's Encrypt certificate for every name, the landing page `https://$DEMO_DOMAIN/` (the examples, then a "This server" table read from the machine -- cores, memory, system, engine version, each example's limits -- plus `DEMO_HOST_NOTE`, so that nobody takes this box's speed for the engine's) |

## Choices, and why

- **nginx, not Caddy.** Caddy would make TLS shorter to write, but its per-address request
  limit is a plug-in outside the standard build; nginx's `limit_req` / `limit_conn` are in the
  Debian/Ubuntu package, fail2ban ships filters for its logs, and certbot is packaged next to it.
- **The engine as a systemd unit, not the Docker image.** One unit per example
  (`aymon-demo@PRJEDU_pid`), derived from the engine's own `aymon@.service`, closed further:
  read-only system, its own copy the only writable place, no network but this machine
  (`IPAddressDeny=any`, `IPAddressAllow=localhost`), memory / task / CPU limits. Docker would add
  its own iptables rules beside the firewall (published ports bypass ufw — the usual trap), for
  nothing this needs.
- **One name per example, not one name with paths.** The pages ask for `/mqtt`, `/state.ayp`,
  `/blob/...` from the root; the login cookie (`aymon_tkn`) is kept apart by host name, not by
  port or path; `PRJEDU_sites` picks the project by the `Host` header. A wildcard DNS record
  makes the names cost nothing.
- **Only HTTPS leaves the machine.** No Modbus, MQTT, PostgreSQL wire, telnet, MCP or
  replication port is published, whatever an example's file says.

## Layers

| Layer | What it stops |
|---|---|
| nftables (`/etc/nftables.conf`) | everything inbound but 22/80/443; the `aymon` account reaching anything but `lo` (a second fence beside the unit's) |
| nginx | unknown names (no certificate, no answer); bodies over 64 KB (413); half a header after 10 s; 10 requests/s per address (burst 40) and 6 logins/min (429); 24 connections per address, 4 live WebSockets per address per example; `ws://` refused by the browser (see below); headers: HSTS, CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `server_tokens off` |
| fail2ban | SSH guessing (journal); an address that keeps hitting the limits; scanners asking for `wp-login` and the like; repeat offenders for a week (`recidive`). Bans go into nftables |
| the unit (`aymon-demo@.service`) | writes outside the example's own copy; any network but localhost; root, capabilities, SUID, namespaces; more than 384 MB / 256 tasks / half a CPU |
| the engine | `xdb_acl` in most examples: a visitor (Guest, role 0) reads, and writes only the controls the page offers |
| the reset | whatever a visitor did: every 3 h (`RESET_HOURS`), and at once for an example whose page stops answering (checked every 5 min) |
| unattended-upgrades | security updates every night, a reboot at 04:30 when one needs it |

The engines' own per-address limits (`pro_http_rate`, `con_addr_max`) count the socket's peer,
which behind nginx is nginx for every visitor — so the limits that tell visitors apart are
nginx's (`Security_Hardening.md` §2.6 says the same).

## Which examples

`examples.conf` lists what is published; comment a line out and run `install.sh` to take an
example away. Each example keeps the port it has in the repository.

**A — published:** `vision`, `sqlite`, `mirror`, `sqlxdb`, `xdbsql`, `pages`, `fan`, `lock`,
`reverse`, `durable`, and the two sites of `PRJEDU_sites` (`acme`, `beta`). Every document a
visitor can reach keeps a Guest off its configuration, or the page has no generic write channel
(`.ayp` pages with fixed actions).

**B — published, with a known weakness:** `modbus`, `mqtt`, `snmp`, `pid`, `oee`, `robotarm`,
`records`, `adsb`. Their page's document is guarded, but the simulator beside it (another
document of the same process: `PLC/S00`, `FLD/S00`, `PLT/S00` …) has no `xdb_acl`, and a page's
`/mqtt` writes into **any** document of its process. A visitor can stop or change the
simulator (measured on the Modbus example). The sandbox, the firewall and the reset keep that
inside the example. The fix
belongs in the examples (an `xdb_acl` on the simulator documents, and a `con_role` on the
simulator's server connection so the monitor's own writes still pass); then they are A.

**Not published:**

| Example | Why |
|---|---|
| `PRJEDU_web` | no `xdb_acl` at all: a visitor can change the settings of the page's own connections, not only the values the page shows (its own comment says it is fine on 127.0.0.1 and nowhere else) |
| `PRJEDU_hardening` | weak on purpose (it is the exercise), and its README publishes the passwords |
| `PRJEDU_plc` | its HMI opens a second page connection on port 8094, whose document is open |
| `PRJEDU_telnet`, `PRJEDU_mcp`, `PRJEDU_robot_mcp` | a shell and MCP are never public (`Security_Hardening.md` §3) |
| `PRJEDU_net` | B, and its open documents are an FTP and a mail server that write files |
| `PRJEDU_gauge`, `PRJEDU_pycall` | need Python 3.11 (+ numpy): Debian 12 only, not set up here |
| `PRJEDU_opcua`, `PRJEDU_odbc` | need their OPC UA machine (Python) / an ODBC database |
| `PRJPER_tello`, `PRJPER_phone` | no video decoding on Linux / meant for phones on a LAN |
| the cluster examples, `PRJEDU_101` | several engines and replication ports / no page |

**Two things the kit changes in the running copies** (never in the repository; every reset
applies them again — `bin/aymon-demo-overlay`):

1. **Session lists.** Most pages' live connection has `con_ses="4"`: measured, the fifth
   page open at the same time gets 502 and no values (`Session list is full (4)` in the
   log). Every listener of PRO.http / PRO.mqtt / PRO.rest on this machine gets at least
   `LIVE_SESSIONS` (32); nginx holds one address to 4 live connections per example.
2. **Names.** `PRJEDU_sites`' roots answer to `acme.$DEMO_DOMAIN` / `beta.$DEMO_DOMAIN`
   besides `acme.localhost` / `beta.localhost` (`root_host` is a list).

**And one thing nginx rewrites on the way out:** 14 examples share a `kit.js` that opens the
live connection as `ws://<host>/mqtt` (so do `PRJEDU_oee` and `PRJEDU_opcua`); a browser
refuses `ws://` from an `https://` page. nginx replaces `ws://` with `wss://` in the pages and
scripts it passes on (`sub_filter`). Once the examples choose `wss://` under `https:` themselves
(as `vision`, `pid`, `robotarm`, `adsb` already do) this can go.

## The host page of PRJEDU_sites

The hosting example's own page (Stop, Start, Backup, Add, Remove …) gives **every** visitor
role 6, Engineer (`con_role="6"` on its door `WEB`, held to 127.0.0.1 by `con_acl`). Behind a
proxy on the same machine every visitor *is* 127.0.0.1, so it is not published: nginx has no
server for it, and a request with any other name gets no answer. Reach it through SSH:

```sh
ssh -L 8125:127.0.0.1:8125 you@server
```

then open `http://127.0.0.1:8125/` — and `http://acme.localhost:8125/`, `http://gamma.localhost:8125/`
after *Add GAMMA*: the local names still work through the tunnel. (To publish it instead, it
needs a login of its own: `con_auth` + `pro_http_auth="1"` on `WEB`, `Authentication_config.md`
§9b.)

## Licences on this server

Only the public EDU licence, `bin/lic/AyMON.lic` of the repository (`edition=EDU`, bound to
`PRJEDU_*` / `PRJDEV_*` directory names, *not for production use*). `PRJHW_*` and `PRJPER_*`
run on FREE, the personal edition, as their own `run.sh` does (given the EDU licence they
would log a PANIC: not their project). Never put on this server: a customer or development licence (`AyMON_dev.lic` …),
`AYMON_LIC`, anything from `_lic_keys`, a signing key. install.sh refuses to go on if it finds
another `*.lic` under `/opt/aymon-demo`, `/var/lib/aymon-demo` or `/etc/aymon-demo`, a
`_lic_keys` directory or an `*.enc.pem` anywhere on the disk, or `AYMON_LIC` in `/etc`; the
reset puts the EDU licence back and deletes any other `*.lic` from the copies.

## Running it

```sh
systemctl list-units 'aymon-demo*'                 # every example, the two timers
journalctl -u aymon-demo@PRJEDU_pid -f              # one engine's console lines
ls /var/lib/aymon-demo/run/PRJEDU_pid/log/          # its log files
sudo /opt/aymon-demo/kit/bin/aymon-demo-reset pid   # one example back now (label or PRJ name)
sudo /opt/aymon-demo/kit/bin/aymon-demo-reset       # all of them
sudo fail2ban-client status nginx-limit-req         # who is banned
sudo nft list ruleset                               # the firewall, fail2ban's table included
```

| Where | What |
|---|---|
| `/etc/aymon-demo/demo.env`, `examples.conf` | your settings |
| `/etc/aymon-demo/units/<PRJ>.env` | the licence argument of each unit (written by the reset) |
| `/opt/aymon-demo/kit` | this kit (install.sh copies itself there) |
| `/opt/aymon-demo/repo`, `/opt/aymon-demo/bin` | the repository at `AYMON_REPO_REF`; the engine (a link into it) |
| `/var/lib/aymon-demo/run/<PRJ>` | the running copy of each example — the only place it writes |
| `/var/lib/aymon-demo/lic` | the EDU licence and the engine's `AyMON.lst` |

## The update agent (AySVC)

Without it every example runs the repository's engine and an update is `install.sh` with a
newer `AYMON_REPO_REF`. With it (`AYSVC_BIN` in `demo.env`, AySVC 4.3.0.34 or later) the
engine comes from a **signed package**: AySVC, the service `aymon-demo-svc`, keeps versions
side by side in `/var/lib/aymon-demo/aysvc/versions`, dry-runs every example with a new one
(`AyXDB -check` as the `aymon` user), switches, watches a probation and rolls back when it
fails. **Each example stays its own unit with its own sandbox**: AySVC only writes what the
unit runs, `/etc/systemd/system/aymon-demo@<PRJ>.service.d/50-aysvc.conf` (the version's
`ExecStart`, its environment, the ready file's directory), and (re)starts the unit. The reset
and check timers work as before; a unit they stop and start is taken over again.

```sh
# on your machine: AySVC built for this server, the package keys' PUBLIC keyring, a package
#   (AyXDBv43/dist/pkg/pkg_engine.ps1 -Platform linux-x64 -BinDir <a Linux build>)
cat AySVC                             | ssh demo 'cat > /root/aysvc/AySVC; chmod 755 /root/aysvc/AySVC'
cat pkg_keys.txt                      | ssh demo 'cat > /root/aysvc/keys.txt'
# /etc/aymon-demo/demo.env: AYSVC_BIN=/root/aysvc/AySVC  AYSVC_KEYS=/root/aysvc/keys.txt
#                           AYSVC_ALLOW_DEV=1 (a development key)  ENGINE_VER=4.4.3.820
sudo bash install.sh                  # or just: sudo bash /opt/aymon-demo/kit/steps/35-aysvc.sh
cat aymon-4.4.3.820-linux-x64.tar.gz  | ssh demo 'cat > /var/lib/aymon-demo/aysvc/staging/new.part &&
    mv /var/lib/aymon-demo/aysvc/staging/new.part /var/lib/aymon-demo/aysvc/staging/inbox/aymon-4.4.3.820-linux-x64.tar.gz'
```

A newer version: its package into the inbox, `ENGINE_VER` changed, `35-aysvc.sh` (or
`install.sh`) again. Until a version is installed the examples run on what they ran.

| Where | What |
|---|---|
| `/etc/aymon-demo-svc/aymon-demo-svc.conf` | AySVC's configuration: the kit writes its values (one `[app/<PRJ>]` per example with `unit=aymon-demo@<PRJ>`), AySVC's own lines stay |
| `/var/log/aymon-demo-svc/` | its log: every switch, dry run, probation, adoption |
| `/var/lib/aymon-demo/aysvc/` | `versions/`, `staging/inbox/`, `state/`, `ready/<PRJ>/ready.json` |
| `http://127.0.0.1:8079/api/apps`, `/api/upd` | its state, from this machine only (no password: no commands over the web) |

To take it away: `systemctl disable --now aymon-demo-svc`, `/opt/aymon-demo/aysvc/aymon-demo-svc -remove`,
`rm /etc/systemd/system/aymon-demo@*.service.d/50-aysvc.conf`, `systemctl daemon-reload`, empty
`AYSVC_BIN`, `install.sh`: the units run the repository's engine again.

## A CDN in front

Not set up. Behind Cloudflare or another CDN every visitor would arrive from the CDN's
addresses: nginx's limits and fail2ban would count the CDN. Then nginx needs `set_real_ip_from`
for the CDN's ranges and `real_ip_header` (`CF-Connecting-IP`), and the firewall should let only
the CDN's ranges reach 443.

## ufw instead of nftables

`20-host` stops if ufw is active. Either `ufw disable` and run again, or keep ufw, allow only
`22/tcp`, `80/tcp`, `443/tcp`, set `SKIP_HOST_HARDENING=1` and do SSH and fail2ban yourself; the
units' own network fence (`IPAddressDeny`) holds either way.

## What was tried

Engine 4.4.3.769 (`bin/linux-x64` of the repository at `v4.4.3.761-5`), 2026-11-21, on WSL
(Ubuntu 22.04):

- **nginx 1.22.1 of Debian 12** in front of five running examples: 25 of 25 checks — landing
  page, headers, unknown name refused at the TLS handshake and dropped on port 80, a known name
  redirected, no server for the host page, a `Host` naming none of ours answered with nothing,
  `kit.js` rewritten to `wss://`, live values through `wss://` from the page's own origin,
  another site's origin refused by the engine (403), 12 live pages at once (the overlay's
  session list), a fifth live connection of one address 429, `acme` and `beta` reach their
  own roots (Toronto / Istanbul), 100 KB body 413, 80 requests at once 39 × 200 and 41 × 429
  (no 502), half a header cut after 10 s. Login (`pages`): 303 with the cookie marked `Secure`
  (the engine reads `X-Forwarded-Proto`), the sixth login of a minute 429.
- **install.sh end to end** in a fresh Debian 12 container with systemd (the repository as a
  local bare clone, `TLS_MODE=selfsigned`, no sshd): 29 s, 19 units running, 21 names
  answering 200, no ERROR / FAIL / PANIC line in any example's log, 540 MB for all engines
  together; a second run 18 s (every example reset and restarted, the certificate kept). From
  outside only 80 and 443 open (22 closed: no sshd there);
  `curl` as `aymon` reaches nothing outside, as root it does; inside a unit `/etc/nginx`,
  `/etc/aymon-demo`, `/root`, `/var/log` are not there, `/opt` and other examples' copies
  read-only, its own copy writable; a stopped example was found by the check and reset; a
  visitor's change to the MQTT example's broker gone after its reset.
- **The SSH step**, with openssh-server added to that container: with no key, and with only a
  cloud image's `command="echo Please login as ..."` key, it stops before changing anything;
  with a key, a password login gets `Permission denied (publickey)`, the key logs in, and
  `ssh -L` reaches the host page and `acme.localhost` through the tunnel.
- **Not tried here:** a real Let's Encrypt certificate (needs public DNS), Ubuntu 24.04, arm64.
