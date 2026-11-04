#!/usr/bin/env bash
# ---------------------------------------------------------------------
# PRJEDU_records -- kill this example's engine, as a crash would: no
# CTRL-C, no clean stop. Only this example's: other engines keep running.
# Then ./run.sh again and look for "REC: journal on disk" in the terminal.
# ---------------------------------------------------------------------
if pkill -9 -f "PRJEDU_records/db/AyXDB.xml"; then
    echo "killed"
else
    echo "this example is not running"
fi
