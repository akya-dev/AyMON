# Hobby projects

Personal projects (PRJPER_*): they run on the FREE edition, with a simulated device for each, and a real one if you have it.

| Example | What it is | Needs |
|---|---|---|
| [PRJPER_tello](PRJPER_tello/) | fly a Tello drone from a web page - or the simulated one that comes with it | nothing; a Tello to fly a real one |
| [PRJPER_adsb](PRJPER_adsb/) | the aircraft overhead on a map, from an ADS-B receiver's SBS-1 stream - or the simulated receiver that comes with it | nothing; an RTL-SDR stick for real aircraft |
| [PRJPER_phone](PRJPER_phone/) | your phone's motion sensors as a device with alarms - no app, a page over https on the same Wi-Fi (or a simulated phone) | a phone on the same Wi-Fi; nothing for the simulated one |

Every example starts with one command from its own folder:

```bat
cd PRJPER_tello
run.bat
```

On Linux: `cd PRJPER_tello` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
