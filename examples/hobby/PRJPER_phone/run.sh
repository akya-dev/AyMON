#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJPER_phone -- run the example. It prints the address to open on the
# phone, and the dashboard's address for this machine.
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
# A personal example runs on FREE - the edition for personal use - so no
# licence is handed in. The education licence in ../../../bin/lic is bound to the
# PRJEDU / PRJDEV directories; given here, the engine would report it as
# "for another project" and fall back to FREE anyway.
LIC=()
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

# The address a phone on the same network reaches: the one the default
# route leaves from.
addr=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
[ -n "$addr" ] || addr="<this machine's address>"
echo
echo " On the phone (same Wi-Fi), open:"
echo "     https://$addr:8110/phone.html"
echo " and accept the certificate warning once."
echo
echo " On this machine, the dashboard:  http://127.0.0.1:8111/"
echo " No phone? A simulated one:       http://127.0.0.1:8111/phone.html?sim=1"
echo
echo "Using $BIN/AyXDB"
exec "$BIN/AyXDB" -console "$here/db/AyXDB.xml" "${LIC[@]}"
