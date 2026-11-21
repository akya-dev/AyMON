# Several projects in one engine

One engine process that runs several complete projects side by side, each a **root** with its own files, documents, page, log and time zone, under a host that starts, stops, adds, backs up and removes them — behind one port.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_sites](PRJEDU_sites/) | a host and two sites in one process: one door for every page (`root_host`), each site's own clock, a bridge between two sites, what a site and the host can see of each other, and the host's page that stops, starts, backs up, adds a site from a template, restores a backup as a new site and removes it | nothing; engine 4.4.3.761 or later |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_sites
run.bat
```

On Linux: `cd PRJEDU_sites` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
