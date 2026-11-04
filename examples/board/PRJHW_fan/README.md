# PRJHW_fan — a fan that follows the temperature

A thermistor and a knob on an ADC, an L293D and a DC fan on a PWM pin, a button, a two-line display. Below the set point the fan is off; 5 degrees above it, it is full. The button forces it full until pressed again.

No parts are needed to run it: the chips are in memory, and the page has a small world to play with (a room, a heat source, the knob, the button).

```bat
run.bat
```

Then open **http://127.0.0.1:8120/**. On Linux: `./run.sh`.

## What it shows

| Part | How it is reached | Written in |
|---|---|---|
| ADC0834 | `[CON.spi,PRO.raw]`, a script driver over `exc.xfer` | `db/drv/adc0834.js` |
| LCD1602 (PCF8574) | `[CON.i2c,PRO.raw]`, a script driver over `exc.wr` | `db/drv/lcd1602.js` |
| The fan's speed | `[CON.gpio,PRO.gpio]`, `<io pro_fno="pwm">`, a duty in percent | XML |
| Its direction | `<io pro_fno="out">`, written once at the first tick | XML + `db/db_FAN.js` |
| The button | `<bi pro_fni="evt">`: an interrupt, `pro_gpio_deb` on the kernel's timestamps | XML |
| The decision | a 1 s timer, `main.ctl` | `db/db_FAN.js` |

The script language keeps the **left** operand's type: `1 / 2.5` is an integer. Every sum in `db_FAN.js` starts from a float for that reason.

## With real parts

[Read the warnings first.](../README.md#before-you-wire-anything) Then change three lines in `db/db_FAN.xml`:

| Connection | In memory | Real |
|---|---|---|
| `CN_SPI` | `sim:adc0834@0` | `/dev/spidev0` |
| `CN_I2C` | `sim:pcf8574@0x27` | `/dev/i2c-1` |
| `CN_G` | `sim:pwm=18:2` | `auto` |

`dtoverlay=pwm-2chan` gives GPIO18 its PWM (and holds GPIO19). The page's world disappears by itself.

| Part | Pin | Goes to |
|---|---|---|
| ADC0834 CS, CLK | CE0 (GPIO8), SCLK (GPIO11) | SPI0 |
| ADC0834 DI, DO | MOSI (GPIO10), MISO (GPIO9) | SPI0 |
| ADC0834 VCC, VREF | 3.3 V | not 5 V: DO comes back to a Pi pin |
| Thermistor | channel 0 | NTC 10 kΩ, B 3950, to ground; 10 kΩ to 3.3 V |
| Knob | channel 1 | 10 kΩ across 3.3 V and ground |
| L293D EN1, IN1, IN2 | GPIO18, GPIO23, GPIO24 | motor supply from the power module, grounds joined |
| Button | GPIO17 | to ground; the pull-up is `pro_gpio_bias="up"` |
| LCD1602 SDA, SCL | GPIO2, GPIO3 | measure first |

**Not yet tried with real parts.** The bytes are checked against models of the chips; the pins on a Raspberry Pi 5 with nothing wired.

The fan's start at 30 % is a guess at a small DC fan; change it in `main.ctl`.

[The board examples](../README.md) · [all the examples](../../README.md)
