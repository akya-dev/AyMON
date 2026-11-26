# Updates and the fleet

Run **[PRJEDU_fleet](../examples/ops/PRJEDU_fleet/README.md)** first: the centre of a fleet, with sample
reports and a two-ring rollout you can walk through with `curl`, no node needed.

The other guides are about one engine running. This one is about changing it: a new engine version on a
machine, a new version of a project's files, and both across many machines, one group at a time. The engine
never updates itself. **AySVC**, the service that starts and stops the engines, does it; it is not in this
repository. The engine's side of it came in 4.4.3.808–815 and is all in 4.4.4: a ready file, a dry run, a
merge and a migration.

---

## Versions side by side

AySVC keeps every engine version in a directory of its own and never changes one:

```
<home>/versions/4.4.4.821/bin/     AyXDB, AyDATA, AyPRO, the modules
<home>/versions/4.4.3.820/bin/     the one before (a file both have is stored once)
<home>/staging/inbox/              a package dropped here is installed
<home>/lic/                        the licence, read by every version
```

An application names the version it runs (`ver = 4.4.4.821`) and writes `%AYMON_BIN%` where it named the engine's
directory. Going back means naming the old version: it is still there.

## Packages

A version arrives as a signed **package**: the files, plus a manifest that lists each file with its size and
SHA-256 and is signed with an Ed25519 key. AySVC installs a package only when every file matches and the signature
verifies under a key it trusts. A package that does not pass is set aside with its reason (`staging/refused/
<name>.why.txt`) and nothing running is touched. It also refuses a version below the newest one that passed, and a
package whose platform is not the machine's. It also checks what the package says the machine needs: a C
library or VC++ runtime of a version, OpenSSL.

There are three kinds of package:

| Kind | Holds | Applied |
|---|---|---|
| engine | the engine of one platform | an application switches to it (below) |
| project | a project's own files, each marked *merge* (XDB documents) or *replace* (scripts, pages) | merged into the site's files (below) |
| template | a signed template library (several projects in one engine) | placed beside the projects that name it |

A package reaches a machine in one of three ways. You can copy it into the inbox. You can upload it to AySVC
over HTTP, signed with AySVC's password and resumed after a broken connection. Or AySVC can **pull** it: you give
it the address of a web server, share or directory holding an `index.txt` that lists the packages. A pulled
package is only installed. Nothing switches until you say so, or until an application set to follow new versions
(`upd=1`) takes it, inside its maintenance window if it has one.

## A switch, a dry run, a probation

When an application is to move to another version:

1. **Dry run.** The new version loads the project with the application's own command line and starts nothing:
   `AyXDB -check <xml>`. It compiles every script, resolves every element's creator and reads the licence, then
   answers one line of JSON. If that line shows problems, AySVC compares it with the running version's own dry
   run: only what the new version adds refuses the switch. A fault the project already had does not block an
   upgrade. A version that would add one is refused, and the application never stopped.
2. **Switch.** The application stops and starts on the new version.
3. **Probation.** The engine writes a **ready file** once the project is up (`AYMON_READY`: the version, the pid,
   and how many elements were skipped for a missing plug-in or refused by the licence). Within a time limit
   the file must come, and for a while after it nothing may get worse.
4. **Committed**, or **rolled back**: the old version starts again and the new one is marked bad, so it is not
   taken again by itself.

## A project's own files

A project changes too: new documents, scripts, pages. A site has its own edits as well: set points, a device
address, a page it changed. A project package is applied over the site's files, not on top of them:

- XDB documents are merged three ways. The base is the version the site last took, the site's file is as it is
  now, and the new version is the package's. The site's values stay and the vendor's changes come in. A value
  both changed is a **conflict**.
- Scripts and pages are replaced. One the site had changed is a conflict: the vendor's copy comes in and the
  site's copy is kept aside.
- Every decision is a line of a report. A first apply, a conflict, or a package marked *irreversible* waits for
  the site to say yes. Otherwise the new files are dry run, swapped in, and the same probation follows. A failed
  probation puts the site's files back.
- A package can carry **migrations**: scripts that bring the site's documents to the new version. They run after
  the swap, and a failure puts everything back.

## The fleet

Many machines, each with AySVC, are a fleet. Each machine has a name (`node`). An operator sends a fleet **job**:
a small file signed with an operator's key, which is not a package key. The file says which version, for which
machines or applications, in which time window, until when, and whether it may go back to an older version. A
machine takes a job for itself once, carries it out with the same dry run and probation, and reports each
application's part: waiting, running, done, failed, or refused. A site can refuse jobs for an application. A job
never decides over a site's own edits: a project version that would wait for the site waits under a job too.

Each machine reports its state to a **centre**: one JSON document, a few seconds after something changed and
every few minutes, with a token of its own. [PRJEDU_fleet](../examples/ops/PRJEDU_fleet/README.md) is such a centre,
written as an ordinary AyMON project. It serves the packages and jobs the machines pull, takes their reports and
shows them on a page, and publishes a rollout **ring by ring**: ring 2's jobs appear only once every machine of
ring 1 has done its own, and a failure stops the rollout there. The centre holds no key; every machine checks every
signature itself.

## Two engines during an update

A cluster is updated one node at a time, the spares first and the master last. From 4.4.3.818 a master that is
stopped hands its role over: it picks the best spare, sends the rest of its changes, and the spare takes over as
soon as it has them. There is no election window. Measured with three engines and a write every 200 ms: at most
one write refused and 0.4 s without a master, against up to 30 writes and 6 s when a node is killed. The
engines say their version to each other: two one level apart work together, while engines further apart do not
copy from each other.

## Sandboxed engines on Linux

On a server where each engine is a hardened systemd unit of its own, with its own user, memory and CPU limits and
no outside network, AySVC does not run the engine itself. It writes what the unit runs into a small override file,
the version's engine and where the ready file goes, then restarts the unit. The unit keeps its sandbox and its own
restarts. The public [demo server](https://demo.aymon.ca) runs this way.

## See also

[10_Two_Engines.md](10_Two_Engines.md) for clusters, elections and failover.
[12_Keeping_It_Running.md](12_Keeping_It_Running.md) for health and the log.
[04_Licensing.md](04_Licensing.md) for where the licence file is read from.
