#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_robot_mcp -- the calls an AI assistant makes, without one
# (Linux; Python 3 standard library only). Start ./run.sh first.
#   ./try.sh          what the assistant may and may not do
#   ./try.sh --run    play the program and watch it (brakes released first,
#                     by a person, on the page)
# ---------------------------------------------------------------------
here=$(cd "$(dirname "$0")" && pwd)
command -v python3 > /dev/null || { echo "python3 is needed (sudo apt install python3)"; exit 1; }
exec python3 "$here/try.py" "$@"
