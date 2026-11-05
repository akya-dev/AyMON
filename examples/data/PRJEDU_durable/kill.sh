#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_durable -- kill this example's engine, as a crash would: no
# CTRL-C, no clean stop. Only this example's: other engines keep running.
# Then ./run.sh again and look for "MIX: came back with" in the terminal.
# ---------------------------------------------------------------------
if pkill -9 -f "PRJEDU_durable/db/AyXDB.xml"; then
    echo "killed"
else
    echo "this example is not running"
fi
