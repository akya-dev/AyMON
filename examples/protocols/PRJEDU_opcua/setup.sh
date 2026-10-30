#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_opcua -- set up the simulated machine, once.
#
# The machine is a Python program with an OPC UA server (asyncua). This
# makes a Python environment of its own in sim/.venv-linux and installs
# asyncua there - nothing is installed into the system's Python.
#
# Needs Python 3.10 or later WITH its venv module, and the internet,
# once. It takes the first of python3, python3.13 ... python3.10 that
# has both; name another with  PYTHON=/path/to/python3 ./setup.sh
# (Debian / Ubuntu without one: sudo apt install python3-venv)
# Delete sim/.venv-linux to undo it.
# ---------------------------------------------------------------------
set -eu
here=$(cd "$(dirname "$0")" && pwd)
venv="$here/sim/.venv-linux"
ok() { "$1" -c 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; }
PY=${PYTHON:-}
if [ -z "$PY" ]; then
    for p in python3 python3.13 python3.12 python3.11 python3.10; do
        if command -v "$p" >/dev/null && ok "$p"; then PY=$p; break; fi
    done
fi
if [ -z "$PY" ] || ! ok "$PY"; then
    echo "No Python 3.10 or later with the venv module was found."
    echo "  Debian / Ubuntu:  sudo apt install python3-venv"
    exit 1
fi
if [ ! -x "$venv/bin/python" ]; then
    echo "Making sim/.venv-linux with $($PY --version) ..."
    "$PY" -m venv "$venv"
fi
echo "Installing asyncua into sim/.venv-linux ..."
"$venv/bin/python" -m pip install --disable-pip-version-check -q "asyncua==2.0.1"
"$venv/bin/python" -c "import asyncua; print('asyncua ready - now ./run_machine.sh')"
