#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_mcp -- call the MCP endpoints of the running example, no AI
# needed. Start ./run.sh first, in another terminal.
#
# Linux counterpart of try.bat: runs try.py (Python 3, standard library
# only), the same calls as try.ps1.
# ---------------------------------------------------------------------
here=$(cd "$(dirname "$0")" && pwd)
command -v python3 > /dev/null || { echo "python3 is needed (sudo apt install python3)"; exit 1; }
exec python3 "$here/try.py" "$@"
