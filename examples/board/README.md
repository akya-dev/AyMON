# On the board

Projects on a Raspberry Pi's own pins: GPIO, I²C, SPI, PWM. They run with **no parts and on any machine**, because every bus can be a chip in memory (`con_host="sim:.."`). With the parts wired on a Raspberry Pi, only the `con_host` lines marked `REAL` in each XML change. They run on the FREE edition.

| Example | What it is | The parts |
|---|---|---|
| [PRJHW_fan](PRJHW_fan/) | a fan that follows the temperature, a knob for the set point, a button that forces it, a display | ADC0834, thermistor, potentiometer, L293D + DC fan, LCD1602, a button |
| [PRJHW_lock](PRJHW_lock/) | a door lock: a code on a keypad or a known card moves a servo bolt; three wrong codes block it | 4x4 keypad, MFRC522, SG90 servo, active buzzer, LCD1602 |
| [PRJHW_reverse](PRJHW_reverse/) | a parking sensor: the nearer, the faster the beep and the fuller the bar; the air's temperature corrects the distance | HC-SR04, DHT11, passive buzzer, MAX7219 matrix, MPU6050 |

Every example starts with one command from its own folder:

```bat
cd PRJHW_fan
run.bat
```

On Linux: `cd PRJHW_fan` and `./run.sh`. The engine is found in `../../../bin`, at the top of the repository. The examples need an engine of build 4.3.4.646 or later.

## Before you wire anything

The Pi's pins are 3.3 V and **do not tolerate 5 V**. Measure first; a wrong wire ends the pin, sometimes the board.

- **HC-SR04's ECHO is 5 V.** Through a divider (1 kΩ from ECHO to the pin, 2 kΩ from the pin to ground), never directly.
- **An LCD1602 backpack is powered from 5 V.** If its SDA and SCL pull-ups go to 5 V, the lines bring 5 V to the Pi. With the module powered and not connected to the Pi, measure SDA and SCL against ground. Above 3.3 V: remove the pull-ups or use a level shifter.
- **A MAX7219 is powered from 5 V** and wants about 3.5 V for a high input. 3.3 V from the Pi is marginal: if the matrix does nothing or shows noise, suspect this first.
- **Motors and servos do not run from the Pi's 5 V pin.** Use the breadboard power module and join the grounds. Put a diode across a motor that has no driver.
- **A killed engine leaves a pin driving and a PWM running.** `pro_safe` works at a controlled stop only. A motor needs an off switch of its own.
- `dtoverlay=pwm-2chan` in `/boot/firmware/config.txt`, then a reboot, gives GPIO18 its hardware PWM, and holds GPIO19 too. Examples that use `CON.spi` and `CON.i2c` also need `dtparam=spi=on` and `dtparam=i2c_arm=on`, and your user in the `gpio`, `spi` and `i2c` groups.

These examples have been run with the chips in memory on Windows and on a Raspberry Pi 5, and the buses and lines checked on the Pi's own pads. **They have not yet been tried with real parts.** If a real chip disagrees, the log line says which device and why: tell us.

More: [real hardware for the examples](../../docs/07_Real_Hardware.md).

[All the examples](../README.md) · [the top README](../../README.md)
