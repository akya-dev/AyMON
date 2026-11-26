# AyMON public demo -- shared by install.sh, the steps and bin/*. Sourced, not run.

PREFIX=/opt/aymon-demo            # root-owned: the kit, the repository, the engine
STATE=/var/lib/aymon-demo         # the engine account's: running copies, the licence's state
CONF=/etc/aymon-demo              # demo.env, examples.conf
KIT=$PREFIX/kit
REPO=$PREFIX/repo
RUN=$STATE/run
LICDIR=$STATE/lic
ENGINE_USER=aymon
UNIT=aymon-demo
# the update agent (AYSVC_BIN in demo.env): its service, binary, home and configuration
AYSVC_NAME=aymon-demo-svc
AYSVC_DIR=$PREFIX/aysvc
AYSVC_HOME=$STATE/aysvc
AYSVC_CONF=/etc/$AYSVC_NAME/$AYSVC_NAME.conf
AYSVC_PORT=8079

die()  { echo "aymon-demo: $*" >&2; exit 1; }
note() { echo "aymon-demo: $*"; }

load_env() {
    [ -f "$CONF/demo.env" ] || die "$CONF/demo.env not found -- run install.sh first"
    # shellcheck disable=SC1091
    . "$CONF/demo.env"
    : "${DEMO_DOMAIN:?DEMO_DOMAIN is not set in $CONF/demo.env}"
    RESET_HOURS=${RESET_HOURS:-3}
    TLS_MODE=${TLS_MODE:-letsencrypt}
    HTTPS_PORT=${HTTPS_PORT:-443}     # 443 on a server; another only on a test rig
    HTTP_PORT=${HTTP_PORT:-80}
    DEMO_HOST_NOTE=${DEMO_HOST_NOTE:-}
    AYSVC_BIN=${AYSVC_BIN:-}          # empty = the examples run the repository's engine (bin/<platform>)
    AYSVC_KEYS=${AYSVC_KEYS:-}
    AYSVC_ALLOW_DEV=${AYSVC_ALLOW_DEV:-0}
    ENGINE_VER=${ENGINE_VER:-}
}

# an example's licence argument: the EDU licence for PRJEDU_* / PRJDEV_* (the names it is bound
# to), none (FREE) for the rest -- the unit's AYMON_ARGS and AySVC's command line alike
lic_args_of() {   # prj
    case $1 in
        PRJEDU_*|PRJDEV_*) echo "-lic:$LICDIR" ;;
        *)                 echo "" ;;
    esac
}

# examples: prints "label path port prj roots" for every active line of examples.conf
# (prj = the project directory's name = the systemd instance; roots = "-" or ID:label,..)
examples() {
    local f=${1:-$CONF/examples.conf}
    [ -f "$f" ] || die "$f not found"
    awk '
        /^[ \t]*#/ || NF < 3 { next }
        {
            n = split($2, p, "/"); roots = "-"
            for (i = 4; i <= NF; i++) if ($i ~ /^roots=/) roots = substr($i, 7)
            print $1, $2, $3, p[n], roots
        }' "$f"
}

# public host names of one example line: the label, or one per root
hostnames_of() {   # label roots
    local label=$1 roots=$2 r
    if [ "$roots" = "-" ]; then
        echo "$label.$DEMO_DOMAIN"
    else
        for r in ${roots//,/ }; do echo "${r#*:}.$DEMO_DOMAIN"; done
    fi
}

engine_platform() {
    case "$(uname -m)" in
        x86_64)        echo linux-x64 ;;
        aarch64|arm64) [ "$(getconf LONG_BIT)" = 64 ] && echo linux-arm64 || echo unsupported ;;
        *)             echo unsupported ;;
    esac
}
