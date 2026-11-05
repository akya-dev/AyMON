# Two engines

Engines working together on one machine, so that nothing is bought or installed: replication between them, a cluster that fails over, and a third engine that uses a document without knowing which node has it.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_rep](PRJEDU_rep/) | replication: two engines, one plant | nothing |
| [PRJEDU_cluster](PRJEDU_cluster/) | a cluster: two engines, one job, and a failover - kill the master, the spare carries on from the same unit | nothing |
| [PRJEDU_remote](PRJEDU_remote/) | a document on another node: the same `evt.GetValue` and `SetValue` reach it over `PRO.rpc`, and a list in `rpc_con` walks through a failover the script never sees | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_rep
run.bat
```

On Linux: `cd PRJEDU_rep` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
