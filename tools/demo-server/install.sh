#!/usr/bin/env bash
# AyMON public demo -- install, or bring up to date, everything on this server.
#
#   sudo bash install.sh
#
# (bash install.sh, not ./install.sh: a checkout made on Windows may not carry the
# executable bit. install.sh gives the kit's own scripts theirs when it copies the kit.)
#
# The first run only writes /etc/aymon-demo/demo.env and stops: fill it in, run again.
# Every later run does the whole job again and changes only what differs: run it after
# editing demo.env or examples.conf, or to move to a newer AYMON_REPO_REF.
#
# Steps (steps/*.sh, in this order):
#   10-packages   nginx, certbot, nftables, fail2ban, unattended-upgrades, git ...
#   20-host       SSH by key only, firewall (22/80/443 in; the engines out to nothing),
#                 fail2ban, automatic security updates       (SKIP_HOST_HARDENING=1: none)
#   30-engine     the repository, the engine, the EDU licence, one sandboxed unit per
#                 example, the reset and check timers
#   40-web        nginx, the certificate, the landing page
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
[ "$(id -u)" -eq 0 ] || { echo "install.sh: run as root (sudo bash install.sh)" >&2; exit 1; }
. "$here/lib.sh"

install -d -m 0755 "$CONF"
if [ ! -f "$CONF/demo.env" ]; then
    install -m 0640 "$here/demo.env.example" "$CONF/demo.env"
    install -m 0644 "$here/examples.conf" "$CONF/examples.conf"
    note "wrote $CONF/demo.env and $CONF/examples.conf -- fill in demo.env, then run install.sh again"
    exit 0
fi
[ -f "$CONF/examples.conf" ] || install -m 0644 "$here/examples.conf" "$CONF/examples.conf"
load_env
[ "$DEMO_DOMAIN" != demo.example.com ] || die "set DEMO_DOMAIN in $CONF/demo.env first"
[ "$(engine_platform)" != unsupported ] || die "no engine for $(uname -m) (64-bit x86 or ARM only)"
. /etc/os-release
case "$ID:$VERSION_ID" in
    debian:12|debian:13|ubuntu:24.04|ubuntu:22.04) ;;
    *) note "WARNING: tried on Debian 12; this is $PRETTY_NAME" ;;
esac

# the kit itself, where the timers find it (root-owned, read-only to everybody else)
if [ "$here" != "$KIT" ]; then
    install -d -m 0755 "$PREFIX"
    rm -rf "$KIT.new"; cp -a "$here" "$KIT.new"; rm -rf "$KIT.new/.git"
    rm -rf "$KIT"; mv "$KIT.new" "$KIT"
fi
chown -R root:root "$KIT"; chmod -R go-w "$KIT"; chmod 0755 "$KIT"/bin/* "$KIT"/steps/*.sh

for s in "$KIT"/steps/[0-9]*.sh; do
    note "==== $(basename "$s" .sh)"
    bash "$s"
done
note "done -- https://$DEMO_DOMAIN/"
