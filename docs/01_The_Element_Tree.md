# 1 — The element tree, and talking to a device

Run **PRJEDU_modbus** first. Everything below is in that example, twice: once
as the device being polled and once as the device answering.

---

## Three layers that are independent

Mixing these up is the most common mistake, so it is worth being explicit.
The **connection** (how bytes travel), the **protocol** (what is said) and the
**element model** (where the data is written) are three separate things:

```
<con xdb_fnc="[CON.tcp,PRO.modbus]">    connection + protocol
  <dev pro_con="CN_X" pro_adr="1">      device
    <bi pro_fni="3" pro_adr="0">        block — ONE request
      <io pro_adr="2.1">                point — ONE value
```

One `<con>` element sets up both the transport and the protocol:

```xml
<con id="CN_PLC" xdb_fnc="[CON.tcp,PRO.modbus]" con_mod="CLIENT"
     con_host="127.0.0.1" con_port="1502" .../>
```

`CON.tcp` makes the connection, `PRO.modbus` the protocol. **The order
matters** — the connection is always written first. The same `PRO.modbus`
works over a serial line by writing `CON.ser` instead; the `<dev>`, `<bi>` and
`<io>` elements underneath do not change at all.

## The four levels

| Element | What it is |
|---|---|
| `<con>` | The connection **and** the protocol on it |
| `<dev>` | One device. Bound to a connection by `pro_con` |
| `<bi>` | One **request**. A register block, an SNMP group, an OPC UA read |
| `<io>` | One **value** taken out of that request |

**One `<bi>` is one request.** That is the rule to hold on to. Protocols with
no notion of blocks keep the `<bi>` layer anyway, because it is the unit that
gets sent.

### `<con>` — the fields you will actually set

| Field | Meaning |
|---|---|
| `con_mod` | `CLIENT` (we dial) or `SERVER` (we listen). **Required** — without it configuration fails |
| `con_host` / `con_port` | Where to dial, or where to listen |
| `con_ses` | How many sessions. With `con_ses > 0` each `<dev>` gets its own conversation, so a slow device does not hold up the others |
| `con_tmo` | Connect timeout, **seconds**, decimal allowed |
| `con_rct` | Wait before reconnecting (s) |
| `con_acl` | Who may connect: `"10.40.1.*, 127.0.0.1"`. Wildcards `*` and `?`. No field, no filtering |

### `<con>` — protocol fields common to every protocol

| Field | Meaning |
|---|---|
| `pro_role` | `MASTER` (we ask) or `SLAVE` (we answer) |
| `pro_tmo` | How long to wait for a reply (s) |
| `pro_try` | Retries of a failed poll. `0` = one attempt |
| `pro_faildly` | Gap between attempts (s) |
| `pro_senddly` / `pro_readdly` | Pauses inside one exchange. This is how you pace a shared RS-485 line |

On a slow device look at `pro_tmo` first; on a noisy line, `pro_try`.

### `<dev>`, `<bi>`, `<io>`

| Element | Field | Meaning |
|---|---|---|
| `<dev>` | `pro_con` | Which `<con>` to talk through — its `id` |
| | `pro_adr` | The device address: slave id in Modbus, endpoint URL in OPC UA |
| | `pro_pol_snd` / `pro_pol_rcv` | Requests sent / replies received. Written by the engine |
| `<bi>` | `pro_fni` / `pro_fno` | Read / write function (Modbus function code) |
| | `pro_adr` / `pro_len` | Start of the block, and **how many elements it holds** |
| | `pro` | The raw block. The reply lands here and is distributed from here |
| | `pro_typ` | What the block is made of — see below |
| `<io>` | `pro_adr` | Position **inside** the block |
| | `pro` | The raw value for this point |
| | `val` | The processed value — scaled, mapped, given a unit |

## Three things about addresses that catch everyone

**`pro_len` counts elements, not bytes.** The unit is whatever `pro_typ` says
the block is made of. With `pro_typ="0xD412"` (a buffer of 16-bit words),
`pro_len="4"` is four Modbus registers — eight bytes. With `pro_typ="0xD411"`
(a byte buffer) the same `4` is four bytes.

**`pro_adr` on an `<io>` can carry a bit.** `pro_adr="2.1"` means *element 2,
bit 1* — and "element" is again the block's own unit, so in a 16-bit block
that is bit 1 of the third register. `PRJEDU_modbus` puts three flags at
`2.0`, `2.1` and `2.2` inside one register.

**`pro` is not `val`.** The raw value from the wire lands in `pro`; the value
your project uses is `val`. Nothing moves between them by itself — you say so.
This is one point out of `PRJEDU_modbus`, complete:

```xml
<io id="TANK_LEVEL" pro="0" pro_typ="0x1102" pro_adr="0" pro_fnc="[VAL.put]"
    val="0" val_typ="0x1308" val_fnc="[VAL.cnv,ATR.rou,ATR.lmt,ALM.onlvl]"
    val_cnv_dlt="0.1" val_rou="0.1" val_min="0" val_max="100" val_unt="%"
    val_alm_onlhi_alm="95" val_alm_onlhi_wrn="85"
    val_alm_onllo_wrn="15" val_alm_onllo_alm="5"
    sta="0x0302" sta_typ="0x1142"/>
```

Read the two chains left to right and the whole point is in them:

* **`pro_fnc="[VAL.put]"`** — take the raw value and hand it to `val`. This is
  the bridge. Leave it out and the raw value arrives correctly, `val` stays at
  zero, and **nothing is logged**; the point simply never moves. The same is
  true if you write `pro_typ="0x0102"` instead of `0x1102`: the `0x1000` bit is
  what makes the chain run at all — see guide 2.
* **`val_fnc="[VAL.cnv,ATR.rou,ATR.lmt,ALM.onlvl]"`** — scale it
  (`val_cnv_dlt="0.1"`, so a raw `724` becomes `72.4`), round it to `val_rou`,
  clamp it to `val_min`…`val_max`, then compare it with the four alarm limits
  and set the alarm bits in `sta`. No script anywhere.

Scaling, limits and alarms are **configuration**, not code. That is worth
noticing before you reach for a script.

## `sta` — one word, four nibbles

Every element has it, and you will read and write it more than any other
field.

```
 0x F   F   F   F
    │   │   │   └── run state    what is actually happening (the engine writes this)
    │   │   └────── configuration write permission, alarm mode
    │   └────────── command       what you or the operator asked for
    └────────────── role          cluster / edge-hub (see the replication example)
```

**Run state** (bits 0–3), written by the engine — an observation, not an order:

| | |
|---|---|
| `0x0000` | DISABLED |
| `0x0001` | RESTING — stopped |
| `0x0002` | WAITING — not communicating |
| `0x0003` | RUNNING — live |
| `+0x0004` / `+0x0008` / `+0x000C` | WARNING / ALARM / EMERGENCY |

**Command** (bits 8–11), written by you:

| | |
|---|---|
| `0x0000` | DISABLE |
| `0x0100` | STOP |
| `0x0200` | PAUSE |
| `0x0300` | START |

So `sta="0x0303"` is the normal thing to write: *start it, and it is running*.
`sta="0x0300"` means *start it, the engine will bring the run nibble up*.

Two consequences worth knowing:

* **An alarm is not a separate object.** It is bits inside the value's own
  `sta`. That is why an alarm raised at one engine arrives at a mirrored engine
  for free — see `PRJEDU_rep`.
* **To stop a running connection write `0x0000` or `0x0100`.** Writing
  `0x0300` to something already running is not a stop.

## How a value actually travels

```
timer fires
  └─ <bi>  the protocol builds the request, sends it, reads the reply
      └─ <bi>@pro          the raw block
          └─ PRO.inp       distributed to each <io>@pro
              └─ pro_fnc   VAL.put — the bridge to val
                  └─ val_fnc   scaling, limits, alarm evaluation
```

For a poll to go out at all, four things must be true: the `<dev>` exists, its
command nibble is not DISABLE, `pro_con` names a real `<con>`, and the session
is connected. If any is missing the poll is skipped **silently** — that is not
an error, it means "nothing to do".

**If no data arrived, nothing is distributed.** On a timeout the points are
*not* written with zero; the last good value stays where it is. A plant that
shows `0` because a cable came loose is worse than one that shows a stale
reading you can see is stale.

Writing works the same way in reverse, with one rule: **if a write times out,
`io.pro` is not updated.** The request went out; whether the device got it is
unknown, so the next read decides rather than the engine guessing.

## Reading the log

Every protocol logs traffic in the same shape:

```
CN_PLC:PRO.modbus(0).MAS-Q[1|12|RES_OKY]: 00 01 00 00 00 06 01 03 00 00 00 04
       └ protocol  └ session   └ device  └ bytes  └ result
                        └ Q sent · R received · I unsolicited
```

A `Q` with no `R` after it means the device is not answering. Unexpected `I`
lines usually mean an addressing problem or two masters on one line.

## Quick diagnosis

| Symptom | Look at |
|---|---|
| No request goes out at all | `dev/@sta` and `bi/@sta` — DISABLE? Is `pro_con` spelled right? Is the timer running? (guide 2) |
| `pro_pol_snd` climbs, `pro_pol_rcv` does not | Timeout. `pro_tmo`, the address, is the device on |
| Neither counter climbs | The poll is never triggered — it is the timer or `sta`, not the protocol |
| Values arrive but `val` stays 0 | `pro_fnc="[VAL.put]"` is missing |
| The block reads one element however many you asked for | `pro_len` is being read in the wrong unit — check `pro_typ` |
| Writes go out, nothing changes | `pro_out_snd` / `pro_out_rcv`. If sends climb and receives do not, the device is not answering |
| Values drop to `0` when the line dies | Not expected — the last value should stay. Keep the log |

## Where next

This guide is the tree and one polled device. The connection itself — who
dials, who asks, several services on one port, protocols that push instead of
answering, and what to do when AyMON does not speak the protocol at all — is
`05_Connections_and_Protocols`. Who may reach any of it is
`06_Access_and_Safety`.
