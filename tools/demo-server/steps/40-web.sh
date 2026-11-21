#!/usr/bin/env bash
# nginx, the certificate, the landing page.
set -euo pipefail
. /opt/aymon-demo/kit/lib.sh
load_env

names=("$DEMO_DOMAIN")
while read -r label path port prj roots; do
    for h in $(hostnames_of "$label" "$roots"); do names+=("$h"); done
done < <(examples)

# port 80 first: Let's Encrypt asks there before any certificate exists. (Once one exists
# the full configuration stays up while the certificate is renewed or expanded.)
systemctl enable --now nginx >/dev/null 2>&1 || true
if [ "$TLS_MODE" = selfsigned ]; then cert=$CONF/tls/fullchain.pem; else cert=/etc/letsencrypt/live/aymon-demo/fullchain.pem; fi
if [ -s "$cert" ]; then "$KIT/bin/aymon-demo-nginx" full; else "$KIT/bin/aymon-demo-nginx" http; fi

case $TLS_MODE in
letsencrypt)
    [ "${ACME_AGREE_TOS:-no}" = yes ] || die "Let's Encrypt: read its Subscriber Agreement (https://letsencrypt.org/repository/) and set ACME_AGREE_TOS=yes in $CONF/demo.env"
    [ -n "${ACME_EMAIL:-}" ] && [ "$ACME_EMAIL" != you@example.com ] || die "set ACME_EMAIL in $CONF/demo.env"
    args=(); for n in "${names[@]}"; do args+=(-d "$n"); done
    # one certificate for every name; --keep-until-expiring: nothing is asked for while
    # the names are the same, so running install.sh again costs no rate limit
    certbot certonly --webroot -w /var/www/letsencrypt --cert-name aymon-demo \
        --non-interactive --agree-tos -m "$ACME_EMAIL" --no-eff-email \
        --keep-until-expiring --expand "${args[@]}"
    install -d /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\n# AyMON public demo: load a renewed certificate\nsystemctl reload nginx\n' \
        >/etc/letsencrypt/renewal-hooks/deploy/aymon-demo-nginx
    chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/aymon-demo-nginx
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
    ;;
selfsigned)
    install -d -m 0750 "$CONF/tls"
    san=$(printf 'DNS:%s,' "$DEMO_DOMAIN" "*.$DEMO_DOMAIN"); san=${san%,}
    if [ ! -s "$CONF/tls/fullchain.pem" ]; then
        openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=$DEMO_DOMAIN" \
            -addext "subjectAltName=$san" \
            -keyout "$CONF/tls/privkey.pem" -out "$CONF/tls/fullchain.pem" 2>/dev/null
        chmod 0600 "$CONF/tls/privkey.pem"
        note "self-signed certificate for $DEMO_DOMAIN and *.$DEMO_DOMAIN (browsers warn)"
    fi
    ;;
*) die "TLS_MODE must be letsencrypt or selfsigned" ;;
esac

"$KIT/bin/aymon-demo-nginx" full

# every name, from this machine, the way a browser would reach it (after the reload settled)
sleep 2
pf=""; [ "$HTTPS_PORT" = 443 ] || pf=":$HTTPS_PORT"
k=""; [ "$TLS_MODE" = selfsigned ] && k=-k
for n in "${names[@]}"; do
    code=$(curl -s $k -o /dev/null -m 10 -w '%{http_code}' --resolve "$n:$HTTPS_PORT:127.0.0.1" "https://$n$pf/" || true)
    printf '  %-40s %s\n' "https://$n$pf/" "$code"
done
