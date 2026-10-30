#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_rep -- the PLANT engine (the source of the data).
#
# Open a second window and run ./run_centre.sh. Order does not matter.
# Stop either one with CTRL-C and start it again; they reconnect and the
# mirror catches up by itself.
#
# WHY 127.0.0.1 IS NOT AN ACCIDENT
#
# Replication is not in the FREE edition. It works here anyway, because
# the rule is about WHERE the connection goes, not what it costs: an
# unlicensed feature is a LOCAL feature. Cluster, replication, RPC and
# MCP all run between engines on one machine so that anybody can learn
# them, and are refused on a remote address without a licence. What you
# buy is the second machine.
#
# If yours lives somewhere else, pass the directory:
#     ./run_plant.sh /opt/aymon/bin
#
# Linux counterpart of run_plant.bat (the same steps, the same licence).
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
    echo "AyXDB not found. Pass its directory:  ./run_plant.sh /path/to/bin"
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
printf '\033]0;AyMON PRJEDU_rep -- PLANT\007'
echo "Using $BIN/AyXDB"
exec "$BIN/AyXDB" -console "$here/db/AyXDB_plant.xml" "${LIC[@]}"
