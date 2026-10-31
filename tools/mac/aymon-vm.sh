#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Run an AyMON example on a Mac.
#
# There is no macOS build of the engine. This script runs the Linux
# engine of this repository in a small Linux virtual machine made with
# Lima (https://lima-vm.io, free):
#     Apple silicon (M1 and later)  bin/linux-arm64, at native speed
#     Intel Mac                     bin/linux-x64
#
#   tools/mac/aymon-vm.sh <example dir> [script]
#       tools/mac/aymon-vm.sh examples/start/PRJEDU_101
#       tools/mac/aymon-vm.sh examples/cluster/PRJEDU_cluster run_S02.sh
#       tools/mac/aymon-vm.sh examples/web/PRJEDU_telnet shell.sh
#   tools/mac/aymon-vm.sh --shell     a shell in the VM, in this repository
#   tools/mac/aymon-vm.sh --stop      stop the VM (it starts again when needed)
#   tools/mac/aymon-vm.sh --delete    remove the VM
#
# The first run creates the VM 'aymon' (Debian 12 -- its Python is 3.11,
# the version the engine's Python module needs), mounts THIS repository
# into it writable at the same path, and installs libssl3, libpython3.11
# (the shared library the Python examples need; python3 does not bring
# it) and python3-numpy. That takes a few minutes and downloads ~300 MB.
#
# Web pages: Lima forwards every port the engine listens on, so
# http://127.0.0.1:<port>/ in the Mac's browser reaches it.
# Stop the engine with Ctrl-C, as on Linux.
#
# Needs Lima 1.0 or newer:  brew install lima
# Another VM name:          AYMON_VM=myvm tools/mac/aymon-vm.sh ...
# ---------------------------------------------------------------------
set -u
VM=${AYMON_VM:-aymon}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

usage() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; exit "${1:-0}"; }
case "${1:-}" in ""|-h|--help) usage 0 ;; esac

if ! command -v limactl >/dev/null 2>&1; then
    echo "Lima is not installed. With Homebrew:  brew install lima"
    exit 1
fi
ver=$(limactl --version 2>/dev/null | awk '{print $NF}' | sed 's/^v//')
case "$ver" in
    0.*) echo "Lima $ver is too old (1.0 or newer is needed):  brew upgrade lima"; exit 1 ;;
esac

case "$1" in
    --stop)   exec limactl stop "$VM" ;;
    --delete) exec limactl delete --force "$VM" ;;
esac

# The VM: created once, started when it is stopped.
status=$(limactl list --format '{{.Status}}' "$VM" 2>/dev/null)
if [ -z "$status" ]; then
    echo "Creating the Linux VM '$VM' (Debian 12) with $repo mounted -- once, a few minutes ..."
    limactl start --name="$VM" --tty=false --mount-only "$repo:w" template://debian-12 || exit 1
    echo "Installing libssl3, libpython3.11 and python3-numpy in the VM ..."
    limactl shell "$VM" sudo sh -c 'apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q libssl3 libpython3.11 python3-numpy' || exit 1
elif [ "$status" != "Running" ]; then
    limactl start "$VM" || exit 1
fi

# The VM sees the repository at the same path; a VM made for another
# copy of the repository would not.
if ! limactl shell "$VM" test -d "$repo/examples"; then
    echo "The VM '$VM' does not see $repo -- it was made for another copy."
    echo "Remove it (tools/mac/aymon-vm.sh --delete) or use another name (AYMON_VM=...)."
    exit 1
fi

if [ "$1" = "--shell" ]; then
    exec limactl shell --workdir "$repo" "$VM"
fi

dir=$(cd "$1" 2>/dev/null && pwd) || { echo "No such directory: $1"; exit 1; }
case "$dir/" in
    "$repo"/*) ;;
    *) echo "$dir is not inside this repository ($repo)"; exit 1 ;;
esac
script=${2:-run.sh}
if [ ! -f "$dir/$script" ]; then
    echo "No $script in $dir. There are: $(cd "$dir" && ls *.sh 2>/dev/null | tr '\n' ' ')"
    exit 1
fi
exec limactl shell --workdir "$dir" "$VM" bash "./$script"
