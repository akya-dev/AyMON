#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_telnet -- open a shell into the running example.
#
# Linux counterpart of shell.bat: runs shell.py (Python 3, standard
# library only) -- character mode, TLS, telnet negotiation handled.
# Without python3 a plain connection falls back to the system's telnet.
#
#   ./shell.sh                          127.0.0.1:2323, plain
#   ./shell.sh --tls                    127.0.0.1:2324, TLS
#   ./shell.sh --server 10.40.1.5 --port 2323
#
# Log in as admin/admin123, eng/eng123, opr/opr123 or mon/mon123.
# ---------------------------------------------------------------------
here=$(cd "$(dirname "$0")" && pwd)
if command -v python3 > /dev/null; then
    exec python3 "$here/shell.py" "$@"
fi
case " $* " in
    *" --tls "*) echo "python3 is needed for the TLS shell (or: openssl s_client -quiet -connect 127.0.0.1:2324)"; exit 1 ;;
esac
if command -v telnet > /dev/null; then exec telnet 127.0.0.1 2323; fi
echo "Neither python3 nor telnet found. Install one of them (sudo apt install python3 / telnet)."
exit 1
