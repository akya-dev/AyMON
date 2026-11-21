#!/usr/bin/env bash
# The repository, the engine, the licence, one unit per example, the timers.
set -euo pipefail
. /opt/aymon-demo/kit/lib.sh
load_env

getent group "$ENGINE_USER" >/dev/null || groupadd --system "$ENGINE_USER"
getent passwd "$ENGINE_USER" >/dev/null || \
    useradd --system --gid "$ENGINE_USER" --home-dir "$STATE" --no-create-home \
            --shell /usr/sbin/nologin --comment "AyMON demo engines" "$ENGINE_USER"
install -d -o root -g root -m 0755 "$PREFIX"
install -d -o "$ENGINE_USER" -g "$ENGINE_USER" -m 0750 "$STATE" "$RUN" "$LICDIR"

# ---- the repository: root's, read-only to the engines -------------------------------------
if [ ! -d "$REPO/.git" ]; then
    git clone -q "$AYMON_REPO_URL" "$REPO"
fi
git -C "$REPO" remote set-url origin "$AYMON_REPO_URL"
git -C "$REPO" fetch -q --tags --prune origin
if git -C "$REPO" rev-parse -q --verify "origin/$AYMON_REPO_REF" >/dev/null; then
    target=origin/$AYMON_REPO_REF            # a branch: its newest commit
else
    target=$AYMON_REPO_REF                   # a tag or a commit
fi
git -C "$REPO" checkout -q --detach "$target"
git -C "$REPO" reset -q --hard
git -C "$REPO" clean -q -fdx
note "repository at $(git -C "$REPO" describe --tags --always) ($AYMON_REPO_REF)"

# ---- the engine of this machine -----------------------------------------------------------
plat=$(engine_platform)
[ -x "$REPO/bin/$plat/AyXDB" ] || die "the repository has no bin/$plat/AyXDB"
ln -sfn "$REPO/bin/$plat" "$PREFIX/bin"
missing=$(ldd "$PREFIX/bin/AyXDB" "$PREFIX/bin/libAyPRO.so" 2>/dev/null | awk '/not found/ {print $1}' | sort -u | tr '\n' ' ')
[ -z "$missing" ] || die "the engine needs: $missing (Debian / Ubuntu: apt install libssl3)"

# ---- licences: the public EDU licence and nothing else ------------------------------------
grep -qx 'edition=EDU' "$REPO/bin/lic/AyMON.lic" || die "$REPO/bin/lic/AyMON.lic is not the EDU licence"
foreign=$(find "$PREFIX" "$STATE" "$CONF" -name '*.lic' \
               ! -path "$REPO/bin/lic/AyMON.lic" ! -path "$LICDIR/AyMON.lic" 2>/dev/null || true)
foreign+=$(find / -xdev \( -name '_lic_keys' -o -name '*.enc.pem' \) -print 2>/dev/null | head -5 || true)
[ -z "$foreign" ] || die "this server must hold no licence but the public EDU one, and no signing key -- found:
$foreign"
! grep -rqs 'AYMON_LIC' /etc/environment /etc/aymon-demo /etc/systemd/system/aymon-demo* || \
    die "AYMON_LIC is set somewhere under /etc: the demo runs on the EDU licence only (-lic: in the unit)"

# ---- units --------------------------------------------------------------------------------
S=$KIT/systemd
install -m 0644 "$S/aymon-demo@.service" "$S/aymon-demo-reset.service" \
                "$S/aymon-demo-check.service" "$S/aymon-demo-check.timer" /etc/systemd/system/
sed "s/@RESET_HOURS@/$RESET_HOURS/g" "$S/aymon-demo-reset.timer.in" >/etc/systemd/system/aymon-demo-reset.timer
systemctl daemon-reload

# examples that left examples.conf: stopped, disabled, their copy removed
active=" $(examples | awk '{print $4}' | tr '\n' ' ') "
for u in $(systemctl list-units --all --plain --no-legend 'aymon-demo@*.service' | awk '{print $1}') \
         $(cd /etc/systemd/system/multi-user.target.wants 2>/dev/null && ls aymon-demo@*.service 2>/dev/null); do
    inst=${u#aymon-demo@}; inst=${inst%.service}
    if [[ "$active" != *" $inst "* ]]; then
        systemctl disable --now "$u" >/dev/null 2>&1 || true
        rm -rf "${RUN:?}/$inst"
        note "$inst: no longer in examples.conf -- stopped and removed"
    fi
done

# two examples on one port would fight for it
dup=$(examples | awk '{print $3}' | sort | uniq -d | tr '\n' ' ')
[ -z "$dup" ] || die "examples.conf: port(s) $dup used twice"

# every example: a fresh copy, started, and started again after a reboot
"$KIT/bin/aymon-demo-reset"
for prj in $(examples | awk '{print $4}'); do systemctl enable "$UNIT@$prj" >/dev/null 2>&1; done
systemctl enable --now aymon-demo-reset.timer aymon-demo-check.timer >/dev/null

sleep 5
for prj in $(examples | awk '{print $4}'); do
    systemctl is-active --quiet "$UNIT@$prj" || note "WARNING: $UNIT@$prj is not running -- journalctl -u $UNIT@$prj"
done
