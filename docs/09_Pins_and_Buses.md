# Pins and buses

Run **[PRJHW_fan](../examples/board/PRJHW_fan/README.md)** first. It needs no
parts and no board: every bus below can be a chip in memory, on any machine.

A board's pins reach AyMON the way any device does: a chip or a set of lines
is a `<dev>`, a value is an `<io>`, and the same `pro_fnc`, `val_fnc`, alarms and
history apply. Nothing is installed. The engine module `AyLIB_hw` (in `bin`,
attached on first use, no licence feature) talks to the Linux kernel's own
interfaces: `/dev/gpiochipN`, `/dev/i2c-N`, `/dev/spidevB.C`.

!!! warning "How far this has been tried"
    - **No real chip or sensor has been connected yet.** The GPIO, PWM, I²C and
      SPI lines have been measured on a Raspberry Pi 5 **with nothing wired**,
      driving the lines from the chip's own registers and reading the pads. The
      HC-SR04, DHT, key matrix and every I²C or SPI chip have run against models
      in memory, or against pulses made to look like them.
    - A driver that passes in memory has sent the right bytes in the right
      order. That proves nothing about timing or voltage.
    - On Windows only `con_host="sim:.."` works: real lines need Linux.
    - Linux is no real-time system. This is not for hard real time, and not for
      a safety function.

## Three connection types

| `xdb_fnc` | What it reaches | Example |
|---|---|---|
| `[CON.gpio,PRO.gpio]` | the board's lines: inputs, interrupts, counters, encoders, outputs, PWM, servos, HC-SR04, DHT, key matrix | all three |
| `[CON.i2c,PRO.reg]`, `[CON.spi,PRO.reg]` | a chip that is a list of registers, in XML alone | `PRJHW_reverse` (MPU6050) |
| `[CON.i2c,PRO.raw]`, `[CON.spi,PRO.raw]` | any other chip, with a driver in script | `PRJHW_fan` (ADC0834, LCD1602), `PRJHW_lock` (MFRC522), `PRJHW_reverse` (MAX7219) |

## Lines

```xml
<con id="CN_GPIO" xdb_fnc="[CON.gpio,PRO.gpio]" con_host="auto" con_ses="0"
     con_mod="CLIENT" pro_role="MASTER" con_rct="5"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="D1" pro_con="CN_GPIO" sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"> ... </dev>
```

| `con_host` | |
|---|---|
| `auto` | the chip with the most lines named `GPIOn`: the board's header. Use this one: the header's chip number has moved between kernels |
| `gpiochip0`, `label:pinctrl-rp1` | that chip, by number or by label |
| `sim:jumper=17-27+18-23,pwm=18:2` | lines in memory. `jumper` joins two lines, `busy=4` holds a line for "the kernel", `pwm` gives a line a channel (`line:channel`) |

A line in `pro_adr` is its number (on a Pi the BCM number, `17`) or its name
(`GPIO17`), never the physical header pin.

`GPIO.chips()` lists this machine's chips, `GPIO.info('CN_GPIO')` says who holds
each line, `GPIO.pwm('CN_GPIO')` shows what the PWM points are doing.

### Inputs

```xml
<bi id="B_IN" xdb_fnc="[XDB.evt]" pro_fni="in" evt="0" evt_per="1" evt_typ="0x5204"
    evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta="0x0302" sta_typ="0x1142"
    sta_fnc="[EVT.sta,PRO.sta]" pro="" pro_typ="0x0401">
  <io id="DOOR" pro_adr="17" pro_gpio_bias="up" pro_gpio_inv="1" pro="0" pro_typ="0x1104"
      sta="0x0302" sta_typ="0x1142"/>
</bi>
<bi id="B_EV" xdb_fnc="[XDB.evt]" pro_fni="evt" evt="0" evt_per="1" evt_typ="0x5204"
    evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta="0x0302" sta_typ="0x1142"
    sta_fnc="[EVT.sta,PRO.sta]" pro="" pro_typ="0x0401">
  <io id="BTN" pro_adr="27" pro_gpio_bias="up" pro_gpio_deb="5" pro="0" pro_typ="0x1104"
      pro_fnc="[main.on_btn]" sta="0x0302" sta_typ="0x1142"/>
</bi>
```

`pro_fni="in"` reads every line of the block at one instant. `pro_fni="evt"` is
an interrupt: the value comes with the edge, and the block's poll only watches.

| Field | Meaning |
|---|---|
| `pro_gpio_bias` | `up`, `down`, `off`; absent leaves the line as it is |
| `pro_gpio_inv` | `1` = active low, in both directions |
| `pro_gpio_edge` | `both` (default): `pro` is the level. `rise` or `fall`: an event: `pro` goes 1 then 0, so the chain runs twice; test the value |
| `pro_gpio_deb` | ms the level must hold. A press read together with its release still counts when it lasted long enough |
| `pro_gpio_ms` | at most one value per that many ms |
| `pro_gpio_maxhz` | edges a second before the block's interrupts go off for 1 s (100000 by default), so a floating input cannot eat the machine |
| `pro_gpio_lost` | declare it on the `<bi>` to read how many events fell out of the kernel's queue |

A point's chain runs on the connection's thread. The kernel keeps 1024 events a
block and drops the oldest, so a long script in a chain can lose events: give it
a thread of its own.

### Counters, pulse widths, encoders, sensors

These blocks name their lines on the `<bi>` and answer in **slots**: `PRO.inp`
hands slot `n` to `<io pro_adr="n">`, and the block's `pro` is a buffer of 64-bit
slots.

```xml
<bi id="B_FLOW" xdb_fnc="[XDB.evt]" pro_fni="cnt" pro_adr="23" evt="0" evt_per="1"
    evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" sta="0x0302" sta_typ="0x1142"
    sta_fnc="[EVT.sta,PRO.sta]" pro="" pro_typ="0xD418" pro_fnc="[PRO.inp]">
  <io id="FLOW_HZ" pro_adr="3" pro="0" pro_typ="0x1308" pro_fnc="[VAL.put]"
      val="0" val_typ="0x1308" val_fnc="[VAL.cnv]" sta="0x0302" sta_typ="0x1142"/>
</bi>
```

| `pro_fni` | `pro_adr` | Slots | Fields |
|---|---|---|---|
| `cnt` | a line | 0 total, 1 pulses in this window, 2 Hz by count, 3 **Hz by time** (use this one), 4 period µs, 5 duty %, 6 lost | `pro_gpio_edge`, `pro_cnt_base`, `pro_cnt_tmo` |
| `pw` | a line | 0 width µs, 1 period µs, 2 duty %, 3 pulses | `pro_pw_lvl`, `pro_pw_tmo` |
| `enc` | `A,B` | 0 position, 1 change, 2 per second, 3 illegal steps. A write to a slot sets the position | `pro_enc_det`, `_step`, `_min`, `_max`, `_wrap`, `_acc`, `_pos` |
| `son` | `TRIG,ECHO` | 0 cm (-1 nothing in range), 1 echo µs, 2 echoes | `pro_son_vs`; `evt_per` 0.06 or more |
| `dht` | a line | 0 degrees, 1 humidity %, 2 bad answers | `pro_dht` `11` (default) or `22`; `evt_per` 1 s, DHT22 2 s |
| `key` | `row,row,..;col,col,..` | not slots: `pro` is the key from `pro_key_map`, `""` when let go; `pro_typ="0x1401"` | `pro_key_map`; `evt_per="0.02"` |

A DHT poll holds its thread for 20 ms (the sensor's start signal): give the block
its own `evt_thr` if that thread does anything urgent. An HC-SR04's width comes
from the kernel's timestamps, so a busy thread does not change the distance.

### Outputs, PWM, servos

```xml
<io id="RELAY" pro_fno="out" pro_adr="22" pro_safe="0" pro="0" pro_typ="0x1104"
    sta="0x0302" sta_typ="0x1142" pro_fnc="[PRO.out]"/>
<io id="FAN" pro_fno="pwm" pro_adr="18" pro_pwm_hz="25000" pro_safe="30" pro="0" pro_typ="0x1308"
    sta="0x0302" sta_typ="0x1142" pro_fnc="[PRO.out]"/>
<io id="PAN" pro_fno="servo" pro_adr="12" pro_srv_rng="0,180" pro_srv_rate="120" pro_safe="90"
    pro="90" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142" pro_fnc="[PRO.out]"/>
```

These sit directly under the `<dev>`. The value written is not stored: the line
is read back and that comes in as protocol input, so **`pro` is the pin**, or for
PWM and servos what was really applied (a value clamped to its range, a ramp's
target).

`out` takes a number, `on`/`off`, `true`/`false`, `high`/`low`, with `pro_gpio_drv`
`push`, `drain` or `source`. `pwm` takes duty % (`pro_pwm_us="1"` makes it µs),
`pro_pwm_hz` and `pro_pwm_en` being read at each write. `servo` takes a position
in `pro_srv_rng`, turned into a pulse of `pro_srv_min` to `pro_srv_max` µs
(1000, 2000; many servos want 500, 2500) at `pro_srv_hz`, with `pro_srv_rate`
units a second and `pro_srv_off="1"` ending the signal once it has arrived.

**A servo with `pro="0"` goes to 0 when the engine starts.** Write its rest
position in `pro`.

There is no software PWM. A line needs a channel: `con_gpio_pwm` if you write it,
else a `pwm-pio` overlay on that line, else a Raspberry Pi 5's PWM0 on lines 12,
13, 14, 15, 18, 19. A line with none is refused, and the log says which overlay
gives it one.

### What a stop does, and a crash

| | `out` | `pwm`, `servo` |
|---|---|---|
| Controlled stop with `pro_safe` | goes to it, then the line is given back | goes to it and **the signal goes on**: a servo holds, a fan runs |
| Controlled stop without it | stays as it is | the signal ends |
| **The process is killed or crashes** | **keeps driving its last level** | **the signal goes on** |

Measured on a Pi 5. No software can answer the last row. What must go safe when
the engine dies needs it in the hardware: a watchdog, a relay that falls out by
itself, an off switch of its own.

## I²C and SPI

### A chip that is a list of registers: XML only

```xml
<con id="CN_I2C" xdb_fnc="[CON.i2c,PRO.reg]" con_host="/dev/i2c-1" con_ses="0"
     con_mod="CLIENT" pro_role="MASTER" con_rct="5" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="IMU" pro_con="CN_I2C" pro_adr="0x68" pro_reg_chk="75=68" pro_reg_init="6B=00;~2;1C=08"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]">
  <bi id="B_IMU" xdb_fnc="[XDB.evt]" pro_fni="rd" pro_adr="0x3B" pro_len="14" pro="" pro_typ="0xD411"
      pro_fnc="[PRO.inp]" evt="0" evt_per="0.2" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="AX" pro_adr="0" pro="0" pro_typ="0x1202" pro_swp="1" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

| Field | On | Meaning |
|---|---|---|
| `con_host` | `<con>` | `/dev/i2c-1` or `1`; `/dev/spidev0` or `0`; or `sim:..` |
| `pro_adr` | `<dev>` | the I²C address, or the SPI chip select |
| `pro_reg_chk` | `<dev>` | `75=68`: this register must read this value, else the chip is refused |
| `pro_reg_init` | `<dev>` | `6B=00;~2;1C=08`: writes, `~ms` a wait. Runs at connect and after every outage |
| `pro_reg_ab` | `<dev>` | register address bytes: 0, 1 (default) or 2 |
| `pro_reg_rdf`, `pro_reg_wrf` | `<dev>` | OR on the first byte of a read or write (SPI chips: `0x80`) |
| `pro_fni="rd"` | `<bi>` | the whole block in one transaction |
| `pro_fno="wr"` | `<io>` | a write: a buffer's bytes, a hex text, or a number of `pro_len` bytes |
| `pro_swp` | `<io>` | `1` = high byte first. Most sensors want it |

A chip that stops answering takes its block to WAITING with one line, once. When
it answers again `pro_reg_init` runs again, because it may have lost power. The
other chips on the bus are not touched. A register nothing reads back is written
with `pro_fnc="[PRO.outc]"`.

### Any other chip: a driver in script

`PRO.raw` takes `pro_onpol` and `pro_onout`, on the `<bi>` or `<io>`, its `<dev>`
or the `<con>`; the nearest wins.

```xml
<con id="CN_SPI" xdb_fnc="[CON.spi,PRO.raw]" con_host="/dev/spidev0" con_spi_hz="1000000"
     con_ses="0" con_mod="CLIENT" pro_role="MASTER" con_rct="5" pro_tmo="0.2" pro_try="1"
     sta="0x0303" sta_typ="0x1142" sta_fnc="[PRO.sta]"/>
<dev id="AD" pro_con="CN_SPI" pro_adr="0" con_spi_hz="200000" sta="0x0303" sta_typ="0x1142"
     sta_fnc="[PRO.sta]">
  <bi id="B_AD" xdb_fnc="[XDB.evt]" pro_onpol="adc.pol(evt, exc);" pro="" pro_typ="0xD418"
      pro_fnc="[PRO.inp]" evt="0" evt_per="0.5" evt_typ="0x5204" evt_fnc="[PRO.pol]" evt_cfg="0x0002"
      sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]">
    <io id="AD0" pro_adr="0" pro="0" pro_typ="0x1308" sta="0x0302" sta_typ="0x1142"/>
  </bi>
</dev>
```

```js
function pol(evt, exc)
{
    var r = exc.xfer(exc.unit, [0xC0, 0]);          // SPI: as many bytes back as went out
    exc.result([((r[0] << 8 | r[1]) >> 2) & 0xFF]); // slot 0
}
```

| Call | Meaning |
|---|---|
| `exc.unit` | the `<dev>`'s `pro_adr` |
| `exc.wr(a, bytes)`, `exc.rd(a, n)` | a write; a read, answering an array of numbers |
| `exc.wrrd(a, bytes, n)` | a write then a read as one transaction (I²C: a repeated start; SPI: CS held) |
| `exc.xfer(a, bytes[, n])` | SPI full duplex |
| `exc.result([v0, ..])` | in `pro_onpol`: the block's value |
| `exc.err` | the first failure of this hook; `""` takes it back |
| `evt.valn` | in `pro_onout`: the value to write |

`bytes` is an array of numbers, a hex text (`"18 3C"`) or a buffer. The scope
`BYTES` reads and makes them: `BYTES.i16be(a, o)`, `u16be`, `u16le`, `i16le`,
`u24be`, `u32be`, `u32le`, `i32be`, `BYTES.text(s)`, `BYTES.hex(s)`,
`BYTES.make(v0, ..)`, `BYTES.crc8(a[, poly, init])`.

**A bus call that fails answers `null` and throws nothing.** Later calls of the
same hook do nothing and the poll fails with the first reason, so a driver need
not test every call and a block never publishes a half-read value. To ask whether
a chip is there: call, test for `null`, then `exc.err = ""`.

**On a bus a hook runs alone**, so a driver of several transactions is not cut in
two. A hook runs on its caller's thread: put slow chips on an `evt_thr` of their
own.

`con_spi_hz`, `con_spi_mode` (0..3), `con_spi_lsb`, `con_spi_bits` go on the
`<con>` or a `<dev>` over it. `I2C.scan('CN_I2C')` lists the addresses that answer
a one-byte read (Engineer role and above: a read can disturb a chip).

## Chips in memory

```
con_host="sim:mpu6050@0x68+pcf8574@0x27+reg@0x50"
con_host="sim:loop@0+max7219@1+mfrc522@2+adc0834@3+shift@4"
```

`GPIO.sim(con, line, seq)` delivers edges (`"1"`, or `"0:1,300:0"` =
`microseconds:level`), `I2C.sim(con, adr[, stim])` and `SPI.sim(con, cs[, stim])`
show a chip's state or feed it a value from outside (`ax=100,az=16384` for the
MPU6050, `0=128,1=12` for the ADC, `uid=DEADBEEF` for the card reader). With parts
wired, only the `con_host` lines change: that is what the board examples do.

## On a Raspberry Pi

| | |
|---|---|
| Rights | the engine's user in groups `gpio`, `i2c`, `spi`. Root is not needed. A connection that cannot open says which one is missing |
| I²C, SPI | `dtparam=i2c_arm=on` and `dtparam=spi=on` in `/boot/firmware/config.txt` |
| PWM | `dtoverlay=pwm-2chan`: hardware PWM on 18 and 19, and it holds both. `dtoverlay=pwm-pio,gpio=17`: any line 0–27, up to four together |
| Voltage | the pins are 3.3 V and **do not tolerate 5 V**. An HC-SR04's ECHO goes through a divider (1 kΩ + 2 kΩ); an I²C module powered from 5 V may pull SDA and SCL up to 5 V: measure before connecting. [The board examples list the rest](../examples/board/README.md#before-you-wire-anything) |
| A floating input | give it a bias or a resistor. `pro_gpio_maxhz` stops it eating the machine; it does not make the reading right |

## Reading the log

One line names the reason, and only that block or point stops; the rest runs.

| Line | Why |
|---|---|
| `block NOT started -- line 4 (GPIO4) is used by 'onewire@0'` | another holder: an overlay's driver, another engine |
| `NOT written -- line 99: gpiochip0 has 54` | no such line |
| `gpiochip0: not permitted (the user needs its group, usually 'gpio')` | rights |
| `real lines need Linux; this build has con_host="sim:" only` | Windows |
| `PRO.reg: chip 0x68: no answer from 0x68` | nothing at that address, or a wiring fault |
| `PRO.reg: chip 0x51: pro_reg_chk: register 00 reads 00, wanted AA` | another chip than the XML names |
| `PRO.raw: no answer from 0x3F` | a hook's bus call failed; `the device answers again` ends the outage |

A poll refused for its configuration writes its line once, then every ten minutes
with a count, not once per firing.

## What to expect

On a Raspberry Pi 5 with 4 GB, with no wire or device on the line:

| | |
|---|---|
| Edge → event → script → `SetValue` → `PRO.out` → pin, machine idle | median 31 µs, 99.9 % under 80 µs |
| The same with three busy threads beside it | median 0.4 ms, 99.9 % under 6.4 ms |
| Edges a second without loss | idle: 100 000 lose about 0.001 %; busy: 20 000 lose 0.02 % |
| PWM and servo pulse on the pin | within 0.3 µs of what was asked |

## Checklist

* `con_host` is `sim:..` until the parts are measured and wired, then `auto` and
  the `/dev` names
* the engine's user is in `gpio`, `i2c`, `spi`
* nothing above 3.3 V reaches a pin
* every output that matters has `pro_safe`, and a hardware answer to the engine
  dying
* a long chain on an interrupt point has a thread of its own
* a servo's `pro` holds its rest position
