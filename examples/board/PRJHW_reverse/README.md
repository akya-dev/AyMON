# PRJHW_reverse — a parking sensor

An HC-SR04 measures the distance ten times a second. Under a metre a passive buzzer beeps, faster the nearer it gets, and under 10 cm it does not stop. A MAX7219 matrix fills a row for every 12 cm nearer. A DHT11 gives the air's temperature, because the speed of sound depends on it, and an MPU6050 tells the slope.

No parts are needed to run it: the page moves an obstacle and tilts the car.

```bat
run.bat
```

Then open **http://127.0.0.1:8122/**. On Linux: `./run.sh`.

## What it shows

| Part | How it is reached | Written in |
|---|---|---|
| HC-SR04 | `<bi pro_fni="son" pro_adr="TRIG,ECHO">`: the echo's width from the kernel's timestamps; slot 1 = microseconds | XML |
| DHT11 | `<bi pro_fni="dht">`: slot 0 degrees, slot 1 humidity; a poll holds its thread for 20 ms | XML |
| Buzzer | `<io pro_fno="pwm" pro_pwm_hz="2000">`, 50 % or 0 % | XML |
| MAX7219 | `[CON.spi,PRO.raw]`, a script driver on `pro_onout`; the value is 8 rows in hex | `db/drv/max7219.js` |
| MPU6050 | `[CON.i2c,PRO.reg]`, **XML only**: `pro_reg_chk` checks the chip, `pro_reg_init` wakes it, one `rd` block, `pro_swp` big-endian points | XML |
| The decision | a 0.1 s timer, `main.ctl` | `db/db_REV.js` |

The block `B_SON` starts 1.5 s late (`evt_dly`) because in memory the echoes come from the script: a sensor that does not answer five times in a row is an error line, and that line is meant for a real one.

## With real parts

[Read the warnings first.](../README.md#before-you-wire-anything) Then change three lines in `db/db_REV.xml`:

| Connection | In memory | Real |
|---|---|---|
| `CN_G` | `sim:pwm=18:2` | `auto` |
| `CN_SPI` | `sim:max7219@0` | `/dev/spidev0` |
| `CN_I2C` | `sim:mpu6050@0x68` | `/dev/i2c-1` |

`dtoverlay=pwm-2chan` gives GPIO18 its PWM (and holds GPIO19). **No `dtoverlay=w1-gpio`:** it holds GPIO4, the DHT11's pin.

| Part | Pin | Goes to |
|---|---|---|
| HC-SR04 TRIG | GPIO23 | directly |
| HC-SR04 ECHO | GPIO24 | **through a divider**: 1 kΩ to the pin, 2 kΩ from the pin to ground |
| HC-SR04 VCC | 5 V | |
| DHT11 data | GPIO4 | 3.3 V supply, 10 kΩ to 3.3 V if the module has none |
| Passive buzzer | GPIO18 | through a transistor if it draws more than a few mA |
| MAX7219 DIN, CS, CLK | MOSI (GPIO10), CE0 (GPIO8), SCLK (GPIO11) | 5 V supply; 3.3 V inputs are marginal |
| MPU6050 SDA, SCL | GPIO2, GPIO3 | 3.3 V supply; AD0 to ground = 0x68 |

**Not yet tried with real parts.** Against models of the chips, and on a Raspberry Pi 5's pads with the lines driven from its own registers: a 1500 µs echo read as 25.7 cm, a DHT frame as 23 °C and 55 %.

[The board examples](../README.md) · [all the examples](../../README.md)
