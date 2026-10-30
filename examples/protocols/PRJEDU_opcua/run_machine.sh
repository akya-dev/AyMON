#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_opcua -- start the simulated moulding machine (an OPC UA server
# on opc.tcp://127.0.0.1:4840/moulding/) in this terminal.
#
# Run ./setup.sh once first. Start the engine (./run.sh) in another
# terminal. Stop the machine with Ctrl-C.
# ---------------------------------------------------------------------
here=$(cd "$(dirname "$0")" && pwd)
if [ ! -x "$here/sim/.venv-linux/bin/python" ]; then
    echo "The machine needs asyncua: run ./setup.sh once first."; exit 1
fi
exec "$here/sim/.venv-linux/bin/python" "$here/sim/ua_machine.py"
