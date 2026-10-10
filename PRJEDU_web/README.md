# PRJEDU_web — a live web page over HTTP, WebSocket and MQTT

One engine, one command, and a browser:

```bat
run.bat
```

On Linux the same example starts with `./run.sh` (the engine in `../bin/linux-x64`; see
"On Linux" in the top README).

Then open **http://127.0.0.1:8080/** — or the same page encrypted at
**https://127.0.0.1:8443/**.

The page shows a simulated tank: its level, a temperature, the pump, and a set
point you can move. Drag the set point past 80 and the level goes into
WARNING, past 90 into ALARM. The colours come from the engine. The page knows
no limits.

Nothing to install. The page is three plain files with no framework, and its
MQTT client is the ~150 lines in `www\mqtt-lite.js`.

## What goes over which wire

```
browser                                   engine (one document, PLT/S00)

GET  /             ── HTTP ──────────►    CN_WEB   PRO.http   files from www\
GET  /api/values   ── HTTP ──────────►    CN_API   PRO.rest   main.api() answers JSON
GET  /mqtt  →  WebSocket upgrade  ───►    CN_LIVE  PRO.mqtt   the broker
      SUBSCRIBE PLT/S00/+/val    ─────►
      ◄──── PUBLISH PLT/S00/LEVEL/val  "47.3"      (every change)
      PUBLISH PLT/S00/SETPOINT/val/set "70" ──►    (a write)
```

| Port | Scheme | Listener | Behind it, by path |
|---|---|---|---|
| 8080 | `http://` / `ws://` | `CN_WEB` `[CON.tcp,PRO.http]` | `/api` → `CN_API`, `/mqtt` → `CN_LIVE` |
| 8443 | `https://` / `wss://` | `CN_WEBS` `[CON.tls,PRO.http]` | `/api` → `CN_APIS`, `/mqtt` → `CN_LIVES` |

The page is the same on both ports. `app.js` builds its WebSocket address from
the address bar: `ws://` under http, `wss://` under https. A browser refuses a
plain `ws://` from an https page.

## What it teaches

* **one open port, several services.** Only `CN_WEB` listens.
  `con_host="#CN_WEB"` with `con_port="/mqtt"` means *"hand me the requests
  that arrive on CN_WEB for this path"*. A real site already has this
  listener for its web interface. Live data costs one more path on it, not
  one more hole in the firewall.
* **the three questions a page asks**, and the protocol for each:
  * "give me the page": HTTP, once
  * "what is the value now": REST, once, on load
  * "tell me when it changes": MQTT over a WebSocket, for as long as the page
    is open, because a browser cannot open a raw TCP socket
* **a topic is an address**: `<document>/<element id>/<attribute>`. With
  `pro_pfx="+/+"` the first two levels are the document name, so
  `id('LEVEL')/@val` in `PLT/S00` is `PLT/S00/LEVEL/val`. The payload is the
  value as text (`47.3`, `0x0347`), not JSON.
* **what gets published**: every change of an attribute of the MQTT
  connection's **own document**, to every client whose subscription matches.
  That is why the web connections sit in the same document as the tank. The
  script never mentions MQTT. It writes values, and the connection publishes
  them.
* **a write from the browser is an ordinary write**. `.../val/set` goes
  through `SETPOINT`'s own `val_fnc` like any script write. It is rounded,
  clamped to `val_min`..`val_max` (send `250`, get `100`) and logged, and the
  stored value is published back to every page.
* **alarms are state, not messages**. `ALM.onlvl` moves bits inside `LEVEL`'s
  `sta` (`0x0004` warning, `0x0008` alarm). A change of `sta` is published like
  a change of `val`, so the page subscribes to `+/sta` and reads two bits.
* **REST is a script**. `PRO.rest` hands every request under `/api` to
  `pro_onreq="main.api(exc,msg);"`, and the function writes the whole HTTP
  answer itself. Read `main.api` in `db\db_PLT.js` for the one trap:
  `Content-Length` counts **bytes**, so the body is converted to UTF-8 before
  it is measured.
* **TLS lives on the listener**. `CN_WEBS` holds the certificate and does the
  handshake. The connections behind it take over an encrypted session and
  carry no `con_ssl_*` of their own, but their transport names say so
  (`CON.tls`, `CON.wss`).

## The files

```
PRJEDU_web\
  run.bat
  db\AyXDB.xml        root document: loads PLT/S00
  db\db_PLT.xml       the tank, and the six connections -- read this one
  db\db_PLT.js        the simulator and the REST answer
  db\cert\            the example's PUBLIC certificate (see below)
  www\index.html      the page
  www\app.js          REST snapshot, MQTT subscribe, the set-point write
  www\mqtt-lite.js    MQTT 3.1.1 over a WebSocket: CONNECT, SUBSCRIBE, PUBLISH, PING
  www\style.css
```

`www\` sits next to `db\`, not inside it. What a browser may download is
kept apart from the engine's configuration, and a URL containing `..` is
refused (400), so it cannot climb out of `www\`.

## What the log looks like

```
PLT/S00:PRJEDU_web: open http://127.0.0.1:8080/ in a browser.
PLT/S00:SETPOINT 50 -> 95 %
PLT/S00:SETPOINT 95 -> 100 %          <- the browser sent 250
```

Two lines you may see and can ignore:

* `CN_WEBS:SES.tls(n).on_ses_start: ... alert certificate unknown` is a
  browser that refused the self-signed certificate and hung up. You get one
  per attempt until you accept the warning.
* `CN_LIVE:PRO.mqtt(n) ... WANTCLOSE` means a page was closed or reloaded
  without saying goodbye. The engine drops the session.

## Watching it without the page

Any MQTT client that speaks WebSocket can subscribe. For example, with
mosquitto 2.x:

```bat
mosquitto_sub -L ws://127.0.0.1:8080/mqtt -t "PLT/S00/#" -v
mosquitto_pub -L ws://127.0.0.1:8080/mqtt -t "PLT/S00/SETPOINT/val/set" -m 70
```

And the snapshot with nothing but curl:

```bat
curl http://127.0.0.1:8080/api/values
```

## About the certificate

`db\cert\demo_cert.pem` and `demo_key.pem` are a self-signed certificate for
`localhost` / `127.0.0.1`, valid for ten years. **The private key is in this
repository for anyone to read.** It encrypts nothing that is secret from
anyone who has cloned it. It exists so https works with nothing installed.

* The browser warns the first time. The warning is correct. Accept it for
  `127.0.0.1:8443` and the page loads.
* To let a program trust it without switching verification off, give it the
  certificate as a CA and connect by name. For example:
  `curl --cacert db\cert\demo_cert.pem https://localhost:8443/api/values`.
* **For anything but this example, use your own.** Replace the two files, or
  point `con_ssl_cert` / `con_ssl_key` on `CN_WEBS` at yours, and set
  `con_ssl_pwd` if the key is encrypted. One way to make a fresh self-signed
  pair:

  ```bat
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 -subj "/CN=myhost" ^
      -addext "subjectAltName=DNS:myhost,IP:192.168.1.10" ^
      -keyout db\cert\demo_key.pem -out db\cert\demo_cert.pem
  ```

  Add no second `basicConstraints`. If your `openssl.cnf` already adds one,
  the certificate carries the extension twice and the engine refuses to load
  it (`SSL_CTX_use_certificate_chain_file error`).

## Opening it to other machines

Everything listens on `127.0.0.1`, and this example has **no login and no
access control**: every client may read and write every value. Before you
change `con_host` to `0.0.0.0`, at least:

* limit who may connect: `con_acl="192.168.1.*"` on the listener is checked
  at accept, before a session exists
* serve only https (drop `CN_WEB`) with a certificate of your own
* give the document an `xdb_acl` and the MQTT connection a login, so that
  reading and writing depend on who is asking. That is beyond this example.
  The licensed product's access-control and authentication notes cover it.

## Licence

Six connections, which is exactly the FREE edition's limit, so the example
runs unlicensed. The education licence in `..\bin\lic`, which `run.bat` passes
to the engine, allows eight, so there is room for one of your own.
