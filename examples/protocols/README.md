# Field protocols

Each protocol with both of its ends, so that no device is needed: the plant side and the monitoring side are two documents of one engine.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_modbus](PRJEDU_modbus/) | Modbus TCP, both ends: blocks, registers and bits, scaling and alarms as configuration | nothing |
| [PRJEDU_mqtt](PRJEDU_mqtt/) | MQTT, both ends: AyMON as the broker and as a client | nothing; mosquitto for the optional steps |
| [PRJEDU_snmp](PRJEDU_snmp/) | SNMP, both ends: a manager, and an agent written in script | nothing |
| [PRJEDU_opcua](PRJEDU_opcua/) | an OPC UA client against a moulding machine's own server: poll, subscription, writes, methods, certificates both ways | Python 3.10+ for the machine |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_modbus
run.bat
```

On Linux: `cd PRJEDU_modbus` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
