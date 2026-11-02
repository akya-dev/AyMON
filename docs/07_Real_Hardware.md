# Real hardware for the examples

Every example runs with nothing but the engine: where a device would be, a
document of the same engine plays it, on the same protocol a real one
speaks. That is why they run anywhere — and why the step to a real device is
small: point the connection at it and switch the simulated document off.

This page says, example by example, **what the simulation stands for, what
to get to replace it, and where its README tells how to connect it**.

!!! warning "Read this first"
    - **Most of it is not tested.** The examples have been run against
      their simulators, and only some against real devices; each README's
      *Real hardware* section says what was and was not tried. The engine
      itself runs production systems with thousands of devices — see
      [In the field](08_In_the_Field.md).
    - **Costs are rough** (2026, US dollars, new) and vary by country and
      seller. The brands are examples of a kind of device, not
      recommendations.
    - **Safety is the hardware's.** An emergency stop is wired, a robot has
      its own safety system, a heater has a thermal fuse. Nothing in AyMON
      replaces them.

## The common pattern

Every example that stands in for hardware has the same two steps:

1. **Point the connection at the device.** `con_host` / `con_port` on the
   `<con>` or `<dev>` (an address and a port), or `con_port` for a serial
   port (`COM5` on Windows, `ttyUSB0` on Linux).
2. **Switch the simulated document off.** In `db/AyXDB.xml`, the document
   that plays the device gets `sta="0x0000"`.

The address map (registers, OIDs, nodes, topics) is then the device's own,
from its manual, and that is where most of the work is.

## Example by example

| Example | The simulation stands for | What to get (rough cost) | Connects over | Read |
|---|---|---|---|---|
| [PRJEDU_modbus](../examples/protocols/PRJEDU_modbus/README.md) | a tank's controller with four registers | any Modbus device: a PLC, a remote I/O module ($150–400), an energy meter ($30–150), an RS-485 sensor (<$20) + a USB–RS-485 adapter ($10–40) | Ethernet (TCP 502) or RS-485 (RTU) | [Pointing it at a real device](../examples/protocols/PRJEDU_modbus/README.md#pointing-it-at-a-real-device) |
| [PRJEDU_snmp](../examples/protocols/PRJEDU_snmp/README.md) | a device with an SNMP agent | a Raspberry Pi with `snmpd` (free), a managed switch, a UPS network card, a printer | Ethernet (UDP 161) | [Polling a real device instead](../examples/protocols/PRJEDU_snmp/README.md#polling-a-real-device-instead) |
| [PRJEDU_opcua](../examples/protocols/PRJEDU_opcua/README.md) | an injection moulding machine with an OPC UA server — already a real server | Prosys Simulation Server (free), CODESYS soft PLC, a PLC with OPC UA ($500+), a machine | Ethernet (TCP 4840) | [A real machine instead](../examples/protocols/PRJEDU_opcua/README.md#a-real-machine-instead) |
| [PRJEDU_mqtt](../examples/protocols/PRJEDU_mqtt/README.md) | a device publishing over MQTT | any MQTT device or broker: an ESP32 with your own firmware, plugs and relays running Tasmota or Shelly firmware ($10–30) | Ethernet / Wi-Fi (TCP 1883) | the example's README (both ends are AyMON) |
| [PRJEDU_pid](../examples/labs/PRJEDU_pid/README.md) | a heater block | a heater board for control courses (TCLab or home-made on an Arduino, $20–50), or a heater with a PT100, an SSR and a Modbus controller ($100–400) | USB serial (text) or RS-485 (Modbus RTU) | [Real hardware](../examples/labs/PRJEDU_pid/README.md#real-hardware) |
| [PRJEDU_plc](../examples/labs/PRJEDU_plc/README.md) | a filling machine behind a remote I/O | a Modbus TCP remote I/O ($60–400), a 24 V supply, buttons and lamps, photoelectric sensors, a level switch ($20–60 each) | Ethernet (Modbus TCP) | [Real hardware](../examples/labs/PRJEDU_plc/README.md#real-hardware) |
| [PRJEDU_oee](../examples/labs/PRJEDU_oee/README.md) | a production line's seven registers | the machine's PLC (programming time), or a remote I/O with counter inputs ($150–400), or one part sensor (<$100) | Ethernet (Modbus TCP) | [Real hardware](../examples/labs/PRJEDU_oee/README.md#real-hardware) |
| [PRJEDU_robotarm](../examples/labs/PRJEDU_robotarm/README.md) | a Universal Robots UR5e and its controller | **URSim** (free, Docker), or a UR cobot (CB3 / e-Series) with a gripper, a door switch, a part sensor | Ethernet (dashboard 29999, Modbus TCP 502) | [Real hardware](../examples/labs/PRJEDU_robotarm/README.md#real-hardware) |
| [PRJEDU_robot_mcp](../examples/ai-vision/PRJEDU_robot_mcp/README.md) | the same robot cell | as PRJEDU_robotarm | as PRJEDU_robotarm | [PRJEDU_robotarm](../examples/labs/PRJEDU_robotarm/README.md#real-hardware) |
| [PRJEDU_pycall](../examples/ai-vision/PRJEDU_pycall/README.md) | a vibration sensor sending sample blocks | an accelerometer (ADXL345 / ADXL355) on an ESP32 or a Pico W (<$30); an IEPE accelerometer and a DAQ ($500+); a 4–20 mA transmitter gives the RMS only | Wi-Fi / Ethernet (MQTT), or a DAQ read by Python | [Real hardware](../examples/ai-vision/PRJEDU_pycall/README.md#real-hardware) |
| [PRJEDU_gauge](../examples/ai-vision/PRJEDU_gauge/README.md) | a camera looking at a dial gauge | a USB webcam ($25–80), a dial gauge ($10–30), a mount and a lamp | USB (Python + OpenCV) | [A real gauge](../examples/ai-vision/PRJEDU_gauge/README.md#a-real-gauge) |
| [PRJEDU_vision](../examples/ai-vision/PRJEDU_vision/README.md) | a camera over a bottle line (a recording) | an IP camera — Hikvision, Dahua, ONVIF ($50–150) — or a USB webcam ($25–80), constant light | Ethernet (RTSP, HTTP) or USB | [A real IP camera](../examples/ai-vision/PRJEDU_vision/README.md#a-real-ip-camera) |
| [PRJEDU_mcp](../examples/ai-vision/PRJEDU_mcp/README.md) | a small tank plant | the plant of any other example, or a real one; the MCP side does not change | — | the example's README |
| [PRJPER_adsb](../examples/hobby/PRJPER_adsb/README.md) | a dump1090 receiver | an RTL-SDR stick ($30–50), a 1090 MHz antenna, dump1090 or readsb (free) on a Raspberry Pi or the PC | TCP 30003 (SBS text) | [A real receiver](../examples/hobby/PRJPER_adsb/README.md#a-real-receiver) |
| [PRJPER_tello](../examples/hobby/PRJPER_tello/README.md) | a Tello drone and its camera | a Ryze / DJI Tello or Tello EDU ($100–200), spare batteries, a machine with Wi-Fi | Wi-Fi (UDP 8889 / 8890, video on 11111) | [Flying a real Tello](../examples/hobby/PRJPER_tello/README.md#flying-a-real-tello) |
| [PRJPER_phone](../examples/hobby/PRJPER_phone/README.md) | — | your phone: it is the real device already | Wi-Fi (a web page) | the example's README |

The other examples — `PRJEDU_101`, `PRJEDU_web`, `PRJEDU_pages`,
`PRJEDU_telnet`, `PRJEDU_hardening`, `PRJEDU_sqlite`, `PRJEDU_odbc`,
`PRJEDU_net`, `PRJEDU_rep`, `PRJEDU_cluster` — stand in for no hardware:
they are complete as they are (a database server, a mail or FTP server, a
second machine are the real counterparts, and their READMEs say how).

## The machine AyMON runs on

Any of the examples runs on a Windows PC, a Linux PC or a **Raspberry Pi**
(4 or 5, 64-bit Raspberry Pi OS; the engine in `bin/linux-arm64`). On a Pi:

- a USB–RS-485 adapter is `ttyUSB0`; an RS-485 HAT on the Pi's own serial
  port is `ttyAMA0` (enable the port in `raspi-config`, disable its login
  console). The serial path has been used in the field on Windows, not yet
  on a Pi.
- a USB webcam works through `usb:` (V4L2) — not yet run on a device; the
  Pi's own camera modules (CSI) need libcamera and are not read directly
  yet. RTSP cameras are not decoded on Linux yet: use their MJPEG or
  snapshot URL.
- Python examples need the Python library of the Pi's Python
  (`sudo apt install libpython3.11` on Bookworm, `libpython3.13` on Trixie).
