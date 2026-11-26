#!/usr/bin/env bash
# The update agent (AYSVC_BIN in demo.env; empty = this step does nothing): AySVC runs as the
# service aymon-demo-svc and gives every example its engine from a signed package. Each example
# stays its own unit aymon-demo@<PRJ> with its own sandbox: AySVC writes what the unit runs
# (/etc/systemd/system/aymon-demo@<PRJ>.service.d/50-aysvc.conf) and (re)starts it.
set -euo pipefail
. /opt/aymon-demo/kit/lib.sh
load_env

if [ -z "$AYSVC_BIN" ]; then
    [ -f "/etc/systemd/system/$AYSVC_NAME.service" ] && \
        note "AYSVC_BIN is empty, but $AYSVC_NAME is installed -- left as it is (to take it away: systemctl disable --now $AYSVC_NAME, $AYSVC_DIR/$AYSVC_NAME -remove, rm /etc/systemd/system/$UNIT@*.service.d/50-aysvc.conf, systemctl daemon-reload, aymon-demo-reset)"
    exit 0
fi
[ -x "$AYSVC_BIN" ] || die "AYSVC_BIN=$AYSVC_BIN is not an executable file"
[ -n "$AYSVC_KEYS" ] && [ -f "$AYSVC_KEYS" ] || die "AYSVC_KEYS must name the keyring of the package keys (public keys only)"
! grep -qi 'PRIVATE KEY' "$AYSVC_KEYS" || die "$AYSVC_KEYS holds a private key -- this server holds public keys only"
[ -n "$ENGINE_VER" ] || die "ENGINE_VER is empty: the engine version every example runs"
"$AYSVC_BIN" -selftest >/dev/null || die "$AYSVC_BIN -selftest failed"

# the binary under the service's name (an AySVC is named after its executable)
install -d -o root -g root -m 0755 "$AYSVC_DIR"
exe=$AYSVC_DIR/$AYSVC_NAME
changed=0
if ! cmp -s "$AYSVC_BIN" "$exe"; then
    install -o root -g root -m 0755 "$AYSVC_BIN" "$exe.new"
    mv -f "$exe.new" "$exe"
    changed=1
fi
install -d -o root -g root -m 0700 "/etc/$AYSVC_NAME"
install -o root -g root -m 0644 "$AYSVC_KEYS" "/etc/$AYSVC_NAME/keys.txt"
install -d -o root -g root -m 0755 "$AYSVC_HOME"

# its configuration: the kit's values written, AySVC's own lines (upd_floor, upd_last, a ver it
# rolled back) and any comment kept; an example that left examples.conf loses its [app/..]
apps=()
{
    echo "|logpath|/var/log/$AYSVC_NAME"
    echo "|scan|5"
    echo "|home|$AYSVC_HOME"
    echo "|upd_keys|/etc/$AYSVC_NAME/keys.txt"
    echo "|upd_allow_dev|$AYSVC_ALLOW_DEV"
    echo "|upd_keep|3"
    echo "srv|ports|$AYSVC_PORT"
    echo "srv|bind|127.0.0.1"
    for prj in $(examples | awk '{print $4}'); do
        s="app/$prj"
        echo "$s|application|%AYMON_BIN%/AyXDB -console $RUN/$prj/db/AyXDB.xml $(lic_args_of "$prj")"
        echo "$s|ver|$ENGINE_VER"
        echo "$s|mode|1"
        echo "$s|upd|0"
        echo "$s|unit|$UNIT@$prj"
        echo "$s|upd_probation|60"
        echo "$s|upd_ready_tmo|60"
        echo "$s|stoptmo|60"
    done
} | python3 "$KIT/bin/aymon-demo-aysvc-conf" "$AYSVC_CONF" $(examples | awk '{print "app/" $4}')

# the service: written by AySVC itself (-install: KillMode=process, Restart=on-failure)
if [ "$changed" = 1 ] || [ ! -f "/etc/systemd/system/$AYSVC_NAME.service" ]; then
    "$exe" -install >/dev/null
fi
systemctl enable "$AYSVC_NAME" >/dev/null 2>&1
if [ "$changed" = 1 ]; then systemctl restart "$AYSVC_NAME"; else systemctl start "$AYSVC_NAME"; fi
note "$AYSVC_NAME $(systemctl is-active "$AYSVC_NAME"); every example to run $ENGINE_VER (its log: /var/log/$AYSVC_NAME)"

plat=$(engine_platform)
if [ ! -f "$AYSVC_HOME/versions/$ENGINE_VER/pkg.manifest" ]; then
    note "engine $ENGINE_VER is not installed yet: copy aymon-$ENGINE_VER-$plat.tar.gz into $AYSVC_HOME/staging/inbox"
    note "(the examples run on what they ran until it is there)"
fi
