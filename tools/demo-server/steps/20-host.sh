#!/usr/bin/env bash
# The machine: SSH by key only, a firewall, fail2ban, automatic security updates.
set -euo pipefail
. /opt/aymon-demo/kit/lib.sh
load_env
F=$KIT/files

if [ "${SKIP_HOST_HARDENING:-0}" = 1 ]; then
    note "SKIP_HOST_HARDENING=1: SSH, firewall and fail2ban left as they are"
    exit 0
fi

# the engine's account first: the firewall names it
getent group "$ENGINE_USER" >/dev/null || groupadd --system "$ENGINE_USER"
getent passwd "$ENGINE_USER" >/dev/null || \
    useradd --system --gid "$ENGINE_USER" --home-dir "$STATE" --no-create-home \
            --shell /usr/sbin/nologin --comment "AyMON demo engines" "$ENGINE_USER"

# ---- SSH: keys only -----------------------------------------------------------------------
if command -v sshd >/dev/null; then
    keys=0
    for u in "${ADMIN_USER:-}" root; do
        [ -n "$u" ] || continue
        h=$(getent passwd "$u" | cut -d: -f6) || continue
        # a key that logs in: not a comment, not a cloud image's command="echo use user X" key
        [ -s "$h/.ssh/authorized_keys" ] && grep -v '^[[:space:]]*#' "$h/.ssh/authorized_keys" | grep -v 'command=' |
            grep -Eq '(^|[ ,])(ssh-(ed25519|rsa)|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+) ' && keys=1
    done
    [ $keys = 1 ] || die "no SSH key in ~${ADMIN_USER:-?}/.ssh/authorized_keys or /root/.ssh/authorized_keys: turning passwords off would lock you out. Add your key (ssh-copy-id) and run again"
    install -m 0644 "$F/sshd-aymon-demo.conf" /etc/ssh/sshd_config.d/10-aymon-demo.conf
    sshd -t || { rm -f /etc/ssh/sshd_config.d/10-aymon-demo.conf; die "sshd refused the new settings; nothing changed"; }
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    ssh_ports=$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -un | paste -sd, -)
else
    note "no sshd on this machine: SSH left alone"
    ssh_ports=22
fi
ssh_ports=${ssh_ports:-22}

# ---- firewall -----------------------------------------------------------------------------
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
    die "ufw is active. Either 'ufw disable' and run again (this kit writes nftables rules), or keep ufw: allow ${ssh_ports}/tcp, 80/tcp, 443/tcp only, set SKIP_HOST_HARDENING=1 and see README"
fi
[ -f /etc/nftables.conf.orig-aymon-demo ] || { [ -f /etc/nftables.conf ] && cp -p /etc/nftables.conf /etc/nftables.conf.orig-aymon-demo || true; }
sed -e "s/@SSH_PORTS@/$ssh_ports/" -e "s/@ENGINE_USER@/$ENGINE_USER/" \
    -e "s/@HTTP_PORT@/$HTTP_PORT/" -e "s/@HTTPS_PORT@/$HTTPS_PORT/" \
    "$F/nftables.conf.in" >/etc/nftables.conf.new
nft -c -f /etc/nftables.conf.new || die "nft refused the new rules; nothing changed"
mv /etc/nftables.conf.new /etc/nftables.conf
systemctl enable nftables >/dev/null 2>&1 || true
nft -f /etc/nftables.conf
note "firewall: in ${ssh_ports}/tcp, $HTTP_PORT/tcp, $HTTPS_PORT/tcp; user $ENGINE_USER reaches this machine only"

# ---- fail2ban -----------------------------------------------------------------------------
install -m 0644 "$F/fail2ban-aymon-demo.local" /etc/fail2ban/jail.d/aymon-demo.local
mkdir -p /var/log/nginx && touch /var/log/nginx/error.log /var/log/nginx/access.log
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2
systemctl is-active --quiet fail2ban || note "WARNING: fail2ban did not start -- journalctl -u fail2ban"

# ---- automatic security updates ----------------------------------------------------------
install -m 0644 "$F/apt-20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades
install -m 0644 "$F/apt-52aymon-demo" /etc/apt/apt.conf.d/52aymon-demo
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
