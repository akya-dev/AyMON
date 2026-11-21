#!/usr/bin/env bash
# Packages from the distribution, nothing else.
set -euo pipefail
. /opt/aymon-demo/kit/lib.sh
load_env

pkgs=(nginx nftables fail2ban python3-systemd unattended-upgrades apt-listchanges
      git rsync curl ca-certificates openssl python3 netbase)
[ "$TLS_MODE" = letsencrypt ] && pkgs+=(certbot)
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q --no-install-recommends "${pkgs[@]}"
