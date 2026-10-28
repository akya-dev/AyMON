# Two engines

Two engines on one machine, so that nothing is bought or installed: replication between them, and a cluster that fails over.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_rep](PRJEDU_rep/) | replication: two engines, one plant | nothing |
| [PRJEDU_cluster](PRJEDU_cluster/) | a cluster: two engines, one job, and a failover - kill the master, the spare carries on from the same unit | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_rep
run.bat
```

On Linux: `cd PRJEDU_rep` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
