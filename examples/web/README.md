# Web pages, access and security

What a person sees and who may do what: live pages, pages the engine writes, a login, a maintenance shell, and a plant to harden.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_web](PRJEDU_web/) | a live web page: HTTP, REST, MQTT over ws:// and wss:// | a browser |
| [PRJEDU_pages](PRJEDU_pages/) | web pages the engine writes: .ayp templates read the plant on each request - no JavaScript, no API; an operator login for the changes | nothing |
| [PRJEDU_telnet](PRJEDU_telnet/) | a maintenance shell into a running engine, and the three gates in front of it | nothing |
| [PRJEDU_hardening](PRJEDU_hardening/) | a plant delivered with seven access weaknesses: find and fix them, with a self-check and an access test on the page | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_web
run.bat
```

On Linux: `cd PRJEDU_web` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
