# PRJPER_phone — your phone's sensors in the engine

Every phone has an accelerometer, a gyroscope and a compass, and every phone
has a browser that can read them. This example turns a phone into a small
**device** of the engine: nothing to install on the phone. It opens a page,
and within a second it has its own element in AyMON, with values, alarms and
a link state. Put it on a washing machine, and you have vibration monitoring.

```bat
run.bat
```

`run.bat` prints the address to open **on the phone**, for example

```
 On the phone (same Wi-Fi), open:
     https://192.168.1.23:8110/phone.html
```

The phone warns about the certificate once (see [Certificate](#the-certificate)).
Continue, press **Start**, and open the dashboard on the PC:
**http://127.0.0.1:8111/**.

No phone at hand? **http://127.0.0.1:8111/phone.html?sim=1** is a simulated
phone with *shake*, *tilt* and *drop* buttons. Each tab is another phone.

On Linux the same example starts with `./run.sh` (the engine in
`../bin/linux-x64`; see "On Linux" in the top README).

| Door | Who | What a session may do |
|---|---|---|
| `https://<PC>:8110/` | the phones, over Wi-Fi | role 0: read everything, write **only** its own measurements (`IN`) |
| `http://127.0.0.1:8111/` | the dashboard, on this PC | role 3: also move the alarm limits, buzz a phone, reset a drop |

One document, `PHN/S00`, and four connections: a listener and its MQTT link
for each door. FREE allows six.

## What you see

**On the phone**, a banner that is green, amber or red, and the readings
(vibration, tilt, heading, drops) and a spirit level. **The colour comes from
the engine.** The page knows no limit. It listens to the `sta` of its own
elements, the engine's verdict, and paints it. When one goes into alarm, the
phone also vibrates (Android; iPhone browsers cannot).

**On the dashboard**, one card per phone: the vibration of the last minute
with the two limits drawn in, tilt, heading, battery, drops, link, and the
position if its owner shared it. There are two buttons, **buzz** and
**reset drops**. On the right are the **alarm limits** of every phone at once.
At the bottom is every decision the engine made (`MSG`).

## Try this

* **Shake** the phone. Vibration goes past 1.5 m/s² (warning), then past 4 (alarm).
* **Tilt** it past 30°, then past 60°.
* **Drop it onto a bed or a cushion** from half a metre. The engine sees a
  moment of free fall followed by an impact, counts a drop and raises an
  alarm, which stays until you press *reset drops*. Tossing it up and catching
  it softly should *not* count. If it does, see `DROP_HIT`.
* Put it face down on a **washing machine** during the spin cycle and watch the
  curve.
* On the dashboard, set the vibration warning to 0.05 and press **Apply**.
  Every phone lying still goes amber at once. The limit lives in one place,
  the class, and every phone reads it from there.
* Press **buzz**. The phone vibrates and its banner flashes.
* Open the dashboard **on the phone**, at `https://<PC>:8110/`. It is the
  same page, but read-only. That door gives role 0, and the engine would
  refuse the writes (the page greys the buttons so nobody tries).
* Close the page on the phone, or turn its screen off. Within 3 s the link
  goes to alarm. After 60 s the phone is forgotten.

## What the log looks like

```
PHN/S00:PHN: new phone P_sr603i
PHN/S00:PHN: P_sr603i is Simulated sr6 (sim)
PHN/S00:ALM.onlhi: id('P_sr603i_VIB')/@val ! 'alm_onlhi_alm' -> sta = 0x034B
PHN/S00:ALM.onlvl: id('P_sr603i_VIB')/@val ! 'alm_onlvl_nrm' -> sta = 0x0343
PHN/S00:ALM.onlhi: id('P_sr603i_TILT')/@val ! 'alm_onlhi_wrn' -> sta = 0x0347
PHN/S00:ALM.onlhi: id('P_sr603i_DROP')/@val ! 'alm_onlhi_alm' -> sta = 0x034B
PHN/S00:PHN: Simulated sr6 (P_sr603i) was DROPPED - free fall, then 36 m/s2 about 200 ms later (drop 1)
PHN/S00:PHN: buzz Simulated sr6 (P_sr603i)
PHN/S00:ALM.onlvl: id('P_sr603i_DROP')/@val ! 'alm_onlvl_nrm' -> sta = 0x0343
PHN/S00:PHN: Simulated sr6 (P_sr603i) drop count reset
PHN/S00:ALM.onin: id('P_sr603i')/@val ! 'alm_onin_alm' -> sta = 0x034B
PHN/S00:PHN: Simulated sr6 (P_sr603i) closed its page
```

A phone that vanishes without closing its page (it left the Wi-Fi, the
browser was killed) leaves one line when the engine notices:
`CON.wss(1).do_close: An error has occurred while sending closing frame!`.
The engine tried to say goodbye on a socket that was already gone. It does
no harm, and the link alarm has already said the same thing.

## What it teaches

**Features at the edge, not samples.** The phone reads its motion sensor 60 to
100 times a second. It does not send those samples. Every fifth of a second it
sends one line of text describing that fifth of a second:

```
S,sr603i,31,0.07,9.75,9.87,45.0,45.0,1.0,39
  id     seq vib  gmin gmax tilt pitch roll heading
```

`vib` is the RMS of the acceleration with gravity removed. `gmin` and `gmax`
are the smallest and largest total acceleration: about 9.8 when the phone
lies still, near 0 while it falls. A hundred numbers become ten. This is the
first thing to decide for any fast sensor: what the engine needs to know,
and where the summarising happens.

**A device that makes itself.** No phone is declared in the XML. The first
line from an unknown phone creates a `<phone>` element under `PHONES`, plus one
`<var>` per quantity: `P_sr603i_VIB`, `P_sr603i_TILT` and so on. The topic
therefore says which phone and which quantity:
`PHN/S00/P_sr603i_VIB/sta`. Each is created with its own `evt.AddElement`
call. Nesting the `<var>`s in the `<phone>` text does not work: a child added
inside its parent does not get its class looked up (engine 4.3.4.500).

**Classes carry the rules.** Each `<var>` names a class:

```xml
<tvar id="cls_VIB" sta_typ="0x1142"
      val_typ="0x1308" val_fnc="[ATR.rou,ALM.onlvl]" val_rou="0.01" val_unt="m/s2"
      val_alm_onlhi_wrn="1.5" val_alm_onlhi_alm="4"/>
```

A phone's `<var>` is one line, `xdb_cls="cls_VIB" val="0"`. The type,
rounding, unit, alarm function and limits come from the class. Eight phones
share one set of limits. The dashboard moves a limit by writing
`id('LIMITS')`, and `main.on_limits` writes the class after checking the
values: numbers, in range, warning on the right side of the alarm. A wrong
pair is refused, and the reason is written to the log.

**Doors and rights.** Two listeners serve the same files. On 8110 (the
phones) a session is role 0. On 8111 (127.0.0.1, `con_role="3"`) it is role 3.
What each role may write is `xdb_acl`, one hex digit per role (lowest digit =
role 0; 1 read, 3 read + write):

| Element | `xdb_acl` | Written by |
|---|---|---|
| the document | `0xFF111111` | nobody (roles 0-5 read) |
| `IN` | `0xFF333333` | every phone |
| `LIMITS`, `BUZZ`, `RESET` | `0xFF113111` | role 3 only: the dashboard on this PC |

A phone cannot write its own `VIB`. What it says goes through `main`, which
checks the id, the line and the numbers. A refused write is an `ALERT` in
the log, for example
`BUZZ.val: xdb_acl yazma reddetti (rol 0)`.

**Requests, not writes.** Every button publishes to a *request* element whose
`val_fnc` decides what happens. `BUZZ` does not reach the phone. It counts up
the phone's `buzz` attribute, and the phone, subscribed to that attribute,
vibrates. Nothing in the engine sends anything *to* a phone: the phone
subscribes to its own elements.

**An inbox and one thread.** `IN` is written by two MQTT connections (one per
door), each on its own thread. `main.tick` removes phones on a third. Doing the
work where it arrives would mean three threads creating, writing and deleting
the same elements. Instead, `main.on_in` only *files* the line in `INBOX`,
under one lock, and returns. `T_IN` hands the inbox to `main.drain` ten times a
second on `TH_PHN`, where every line of every phone is processed in order.
`INBOX_MAX` bounds the inbox, and lines beyond it are counted in `LOST`.

Engines before 4.3.4.513 had a second reason. There, an alarm computed
inside a write that arrived from a network client (MQTT, MCP), or inside a
write a script made in that write's `val_fnc`, was logged but its `sta` was
not stored; work done on a timer was not affected. Writing 0 into `P_x_DROP`
over MQTT would store the 0 and leave the alarm standing, which is why the
dashboard's *reset drops* goes through the inbox too. 4.3.4.513 stores those
alarms, but the inbox design stays: it is the one-thread argument above that
carries it.

**What is published, and what is not.** A type with `0x4000` is LOCAL and
MQTT does not publish it. `IN` and `INBOX` are local (the raw lines are not
sent back to every page), and so are the phone's bookkeeping attributes
`seen`, `msgs` and `ff`, which change with every line. What a page needs is
published: the values, their `sta`, `name`, `buzz`, `LIST`. `pro_retain`
gives a page that opens late every current value and alarm at once.

**Why https.** A browser shows motion and position sensors only to a *secure*
page: https, or `http://127.0.0.1`. That is why the phones get their own TLS
door, and why the simulated phone works on the PC over plain http.

**A drop is two events in order.** Free fall alone is common: a phone tossed
up is weightless on the way up and down. An impact alone is common too: slap
it on the table. A drop is free fall *followed* by an impact within
`DROP_MS`. The engine only sees the minimum and maximum of each fifth of a
second, and that is enough. It notes the time of the fall in the phone's `ff`
attribute and looks for the impact in the lines that follow. `DROP_FREE`
(3 m/s²) and `DROP_HIT` (20 m/s², about 2 g) are thresholds. Move them until
they tell *your* phone's drop from *your* catch.

**A count with a half-way limit is a float.** `cls_DROP` has
`val_alm_onlhi_alm="0.5"`: in alarm from the first drop. Its type is a float
(`0x1308`), although it only ever holds whole numbers. In an integer type the
0.5 is cut to 0, 0 then counts as "above the limit", and the alarm never
clears.

## Privacy

The position is sent only if its owner ticks **share my position** on the
phone, and never by the simulated phone. The engine keeps the last position in
memory with the phone and forgets it with the phone: nothing is written to
disk, and the log does not contain it. The phone's name is whatever its owner
types. The id is random, generated by the page and kept in the phone's
browser.

## The certificate

`db\cert\` holds the same self-signed certificate as `PRJEDU_web`. Its private
key is in this repository, so it protects nothing from anyone who has cloned
it. It exists so that https works with nothing installed. The phone warns once
and is right to: on Android Chrome, *Advanced → Proceed*; on iPhone Safari,
*Show Details → visit this website*. For anything beyond this example, put
your own certificate and key in its place.

## When the phone cannot connect

* **Same network.** The phone must be on the same Wi-Fi as the PC, not on
  mobile data. Guest networks often isolate their clients from each other
  (*AP/client isolation*): use the main network.
* **Firewall.** The first time, Windows asks whether `AyXDB.exe` may accept
  connections. Allow it. If you declined, add the rule yourself (as
  administrator):
  ```bat
  netsh advfirewall firewall add rule name="AyMON phone example" dir=in action=allow protocol=TCP localport=8110
  ```
  Windows also blocks more on a network it calls *Public*. On a network you
  trust, set it to *Private* (Settings → Network & internet → Wi-Fi → the
  network's properties → Network profile type).
* **The right address.** `run.bat` prints the addresses of the network cards
  that have a gateway. A VPN adds one that the phone cannot reach.
* **`con_acl`.** 8110 admits `127.0.0.1, 10.*, 172.*, 192.168.*`. A network
  outside these ranges (some corporate ones) needs its own pattern there.
* **"no sensor".** The page came over plain http from another machine (use
  the https address), or the iPhone's motion permission was refused. Reload
  and press Start again. If Safari no longer asks, clear the site's data
  (Settings → Safari → Advanced → Website Data). A PC has no motion sensor:
  use `?sim=1`.
* **The link keeps dropping.** Turning the screen off or switching apps
  stops the sensors, and the page says goodbye. *keep the screen on* asks
  the phone not to sleep (Wake Lock, where the browser supports it).

## Honest notes

* **Tested so far** with the simulated phone in a browser, and with a scripted
  MQTT client over `wss://` on port 8110 (role 0 writes refused, alarms,
  drops, battery, position, limits, buzz, reset). Real phones: fill in what
  you measured.
* **iPhone:** Safari reports no battery, and cannot vibrate. Safari may also
  refuse the `wss://` connection to a self-signed certificate even after the
  page itself was accepted. If the page loads but stays *offline*, that is
  the likely reason, and installing the certificate on the phone as a trusted
  profile is the way round it. Not yet tried on an iPhone.
* The heading is a compass heading where the browser offers one (iPhone,
  Chrome on Android). Elsewhere it is relative to where the phone pointed
  when the page opened.

## Files

```
db\AyXDB.xml     the root document: one child document
db\db_PHN.xml    PHN/S00: classes, the phones' list, requests, rules, four connections
db\db_PHN.js     main: the inbox, the phones, drops, limits, buzz, the watchdog
db\cert\         the public self-signed certificate (see above)
www\phone.html   the phone's page      www\phone.js   sensors, the line, the banner
www\index.html   the dashboard         www\app.js     cards, limits, messages
www\mqtt-lite.js MQTT 3.1.1 over a WebSocket in ~150 lines (the same file as PRJEDU_web)
www\style.css
```
