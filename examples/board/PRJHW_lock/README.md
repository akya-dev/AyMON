# PRJHW_lock — a door lock with a keypad and a card reader

A code on a 4x4 keypad (`#` enters, `*` clears) or a known card moves a servo bolt for 5 seconds. A wrong code beeps; three of them block the lock for 30 seconds. The display says what is going on.

It is a lesson, **not a security product**: a real door's bolt fails safe in hardware, and a card's number is no secret.

No parts are needed to run it: the page has the keypad and two cards.

```bat
run.bat
```

Then open **http://127.0.0.1:8121/**. The code is `1234`. On Linux: `./run.sh`.

## What it shows

| Part | How it is reached | Written in |
|---|---|---|
| Keypad | `<bi pro_fni="key" pro_adr="rows;columns" pro_key_map=..>`: `pro` is the key held, `""` when let go | XML |
| MFRC522 | `[CON.spi,PRO.raw]`, a script driver, `exc.result([present, uid])` | `db/drv/mfrc522.js` |
| Servo | `<io pro_fno="servo">`, an angle in degrees, `pro_srv_rate` limits its speed | XML |
| Buzzer, reader's RST | `<io pro_fno="out">` | XML |
| LCD1602 | `[CON.i2c,PRO.raw]`, a script driver | `db/drv/lcd1602.js` |
| The decision | `main.on_key` on each key, a 0.2 s timer `main.ctl` | `db/db_LCK.js` |

**The code and the card are not readable from the page.** `CODE` and `CARD` carry `xdb_acl="0xFF000000"`: Engineer and Admin only. A page runs with the visitor's role, a guest here; the keypad's chain runs as the engine. The page's keypad works only with the chips in memory: `main.act` does nothing on real parts.

## With real parts

[Read the warnings first.](../README.md#before-you-wire-anything) Then change three lines in `db/db_LCK.xml`:

| Connection | In memory | Real |
|---|---|---|
| `CN_SPI` | `sim:mfrc522@0` | `/dev/spidev0` |
| `CN_I2C` | `sim:pcf8574@0x27` | `/dev/i2c-1` |
| `CN_G` | `sim:pwm=18:2` | `auto` |

`dtoverlay=pwm-2chan` gives GPIO18 its PWM; it holds GPIO19 as well, so nothing here uses that pin. Put your own card's number in `CARD`: the page shows that a card was seen, and `RC_UID` holds its number (`DEADBEEF` is 3735928559).

| Part | Pin | Goes to |
|---|---|---|
| Keypad rows | GPIO5, 6, 13, 26 | the first four pins of most keypads |
| Keypad columns | GPIO12, 22, 20, 21 | the last four |
| MFRC522 SDA, SCK | CE0 (GPIO8), SCLK (GPIO11) | SPI0 |
| MFRC522 MOSI, MISO | GPIO10, GPIO9 | SPI0 |
| MFRC522 RST, 3.3V | GPIO25, 3.3 V | **3.3 V only**; RST is driven high at start |
| Servo signal | GPIO18 | its supply from the power module, grounds joined |
| Active buzzer | GPIO17 | through a transistor if it draws more than a few mA |
| LCD1602 SDA, SCL | GPIO2, GPIO3 | measure first |

A keypad's pin order differs between makers: if keys come out wrong, swap the rows or the columns in `pro_adr`, or change `pro_key_map`.

**Not yet tried with real parts.** The bytes are checked against models of the chips; the pins on a Raspberry Pi 5 with nothing wired.

[The board examples](../README.md) · [all the examples](../../README.md)
