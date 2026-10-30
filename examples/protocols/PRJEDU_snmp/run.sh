#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_snmp -- run the example in a terminal.
#
# One window is enough: the plant (Modbus slave) and the monitoring side
# (Modbus master) are two documents of the same engine.
#
# The engine is AyXDB. This script looks for it in the usual places;
# if yours lives somewhere else, pass the directory:
#     ./run.sh /opt/aymon/bin
#
# Stop the engine with CTRL-C. The log is in the log/ directory beside
# this file, and the console prints the same lines.
#
# Linux counterpart of run.bat (the same steps, the same licence).
# ---------------------------------------------------------------------
set -u
here=$(cd "$(dirname "$0")" && pwd)
BIN=${1:-}
if [ -z "$BIN" ]; then
    for d in "$here/../../../bin/linux-x64" "$here/../bin/linux-x64" "$here/bin/linux-x64"; do
        if [ -x "$d/AyXDB" ]; then BIN=$(cd "$d" && pwd); break; fi
    done
fi
if [ -z "$BIN" ] || [ ! -x "$BIN/AyXDB" ]; then
    echo "AyXDB not found. Pass its directory:  ./run.sh /path/to/bin"
    exit 1
fi
# The licence is shared by every platform's engine, so it does not sit
# beside the engine: -lic: names it for this one process, ahead of AYMON_LIC
# and the project's own db/lic. Given as an absolute path because the
# engine may be one you passed in, and a relative -lic: is relative to
# the ENGINE. Only if the file is there: an explicit -lic: that names nothing
# runs FREE rather than fall back to a licence you put in db/lic.
LIC=()
for d in "$here/../../../bin/lic" "$here/../bin/lic"; do
    if [ -f "$d/AyMON.lic" ]; then LIC=("-lic:$(cd "$d" && pwd)"); break; fi
done
# Linux: the engine takes OpenSSL 3 from the system (libssl3 on Debian /
# Ubuntu, openssl-libs on Fedora); everything else ships in bin/linux-x64.
missing=$(ldd "$BIN/AyXDB" "$BIN/libAyPRO.so" 2>/dev/null | awk '/not found/ {print $1}' | sort -u | tr '\n' ' ')
if [ -n "$missing" ]; then
    echo "The engine needs these system libraries: $missing"
    echo "  Debian / Ubuntu:  sudo apt install libssl3"
    exit 1
fi
mkdir -p "$here/log"
cd "$here"
echo "Using $BIN/AyXDB"
exec "$BIN/AyXDB" -console "$here/db/AyXDB.xml" "${LIC[@]}"
