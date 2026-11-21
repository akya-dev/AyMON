#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_sites -- run the example in a terminal: ONE engine, the host
# and its roots ACME and BETA. Then open http://127.0.0.1:8125/
#
# The host's page adds GAMMA to db/AyXDB.xml and makes roots/GAMMA;
# its Remove button takes both away again.
#
# The engine is AyXDB. This script looks for it in the usual places;
# if yours lives somewhere else, pass the directory:
#     ./run.sh /opt/aymon/bin
#
# Stop the engine with CTRL-C. The host's log is in the log/ directory
# beside this file, each root's in its own roots/<name>/log/, and the
# console prints the lines of all of them.
#
# Linux counterpart of run.bat (the same steps, the same licence).
# ---------------------------------------------------------------------
set -u
here=$(cd "$(dirname "$0")" && pwd)
BIN=${1:-}
# The engine of this machine: bin/linux-x64 on a PC, bin/linux-arm64 on a
# Raspberry Pi 4/5 (64-bit Raspberry Pi OS) or another 64-bit ARM board.
# A 32-bit system on a 64-bit kernel says aarch64 too; it has no engine here.
case "$(uname -m)" in
    x86_64)        PLAT=linux-x64 ;;
    aarch64|arm64) PLAT=linux-arm64
                   [ "$(getconf LONG_BIT)" = 32 ] && PLAT=linux-arm32 ;;
    *)             PLAT=linux-$(uname -m) ;;
esac
if [ -z "$BIN" ]; then
    for d in "$here/../../../bin/$PLAT" "$here/../bin/$PLAT" "$here/bin/$PLAT"; do
        if [ -x "$d/AyXDB" ]; then BIN=$(cd "$d" && pwd); break; fi
    done
fi
if [ -z "$BIN" ] || [ ! -x "$BIN/AyXDB" ]; then
    echo "AyXDB for $PLAT not found (64-bit x86 and ARM are in bin/). Pass its directory:  ./run.sh /path/to/bin"
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
# Ubuntu / Raspberry Pi OS, openssl-libs on Fedora); everything else ships
# in bin/$PLAT.
missing=$(ldd "$BIN/AyXDB" "$BIN/libAyPRO.so" 2>/dev/null | awk '/not found/ {print $1}' | sort -u | tr '\n' ' ')
if [ -n "$missing" ]; then
    echo "The engine needs these system libraries: $missing"
    echo "  Debian / Ubuntu:  sudo apt install libssl3"
    exit 1
fi
# the engine writes a log into a directory that is there: one for the
# host, one in each root and in the template HOST.add copies
mkdir -p "$here/log" "$here/roots/ACME/log" "$here/roots/BETA/log" "$here/templates/site/log"
cd "$here"
echo "Using $BIN/AyXDB"
exec "$BIN/AyXDB" -console "$here/db/AyXDB.xml" "${LIC[@]}"
