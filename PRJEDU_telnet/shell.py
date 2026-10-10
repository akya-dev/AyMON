#!/usr/bin/env python3
# =====================================================================
# shell.py - a terminal for the AyMON maintenance shell (PRO.telnet), Linux
#
# The Linux counterpart of shell.ps1: CHARACTER mode, so every key goes out
# as it is pressed and the arrow keys as ANSI sequences -- the shell's own
# history (Up/Down) and line editing work as under PuTTY. Plain TCP or TLS,
# Python's standard library only, telnet option negotiation (IAC) removed
# from what is shown, UTF-8 decoded across reads.
#
# USAGE
#   ./shell.sh                          127.0.0.1:2323, plain
#   ./shell.sh --tls                    127.0.0.1:2324, TLS
#   ./shell.sh --server 10.40.1.5 --port 2323
#   ./shell.sh --tls --verify           validate the server certificate
#
# Log in as admin/admin123, eng/eng123, opr/opr123 or mon/mon123.
# Leave with 'exit' (or Ctrl-D on an empty line). Ctrl-C goes TO THE SHELL
# as a line cancel and does not close this client; Ctrl-] closes it.
# =====================================================================
import argparse, codecs, os, select, socket, ssl, sys, termios, tty

ap = argparse.ArgumentParser(description="AyMON maintenance shell client")
ap.add_argument("--server", default="127.0.0.1")
ap.add_argument("--port", type=int, default=0, help="0 = 2323 plain, 2324 with --tls")
ap.add_argument("--tls", action="store_true")
ap.add_argument("--verify", action="store_true", help="without it a self-signed certificate is accepted")
a = ap.parse_args()
port = a.port or (2324 if a.tls else 2323)

try:
    sock = socket.create_connection((a.server, port), timeout=5)
except OSError as e:
    print("Nothing answers on %s:%d (%s). Start the engine first: ./run.sh" % (a.server, port, e.strerror or e))
    sys.exit(1)
if a.tls:
    ctx = ssl.create_default_context()
    if not a.verify:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    try:
        sock = ctx.wrap_socket(sock, server_hostname=a.server)
    except ssl.SSLError as e:
        print("TLS failed: %s" % e)
        sys.exit(1)
sock.settimeout(None)
print("-- connected to %s:%d%s, Ctrl-] closes this client --" % (a.server, port, " (TLS)" if a.tls else ""))

dec = codecs.getincrementaldecoder("utf-8")(errors="replace")
out = sys.stdout
fd = sys.stdin.fileno()
old = termios.tcgetattr(fd) if os.isatty(fd) else None
iac = 0          # bytes of a telnet command still to skip
try:
    if old: tty.setraw(fd)
    while True:
        r, _, _ = select.select([sock, fd], [], [], None if not (a.tls and sock.pending()) else 0)
        if sock in r or (a.tls and sock.pending()):
            data = sock.recv(16384)
            if not data:
                out.write("\r\n-- the server closed the connection --\r\n"); out.flush()
                break
            clean = bytearray()
            for b in data:                       # IAC at the BYTE level, then UTF-8
                if iac:
                    if iac == 2 and 251 <= b <= 254: iac = 1   # WILL/WONT/DO/DONT + option
                    else: iac = 0
                    continue
                if b == 255: iac = 2; continue
                clean.append(b)
            text = dec.decode(bytes(clean))
            if old: text = text.replace("\r\n", "\n").replace("\n", "\r\n")
            out.write(text); out.flush()
        if fd in r:
            k = os.read(fd, 64)
            if not k or k == b"\x1d":          # EOF or Ctrl-]
                break
            sock.sendall(k)
finally:
    if old: termios.tcsetattr(fd, termios.TCSADRAIN, old)
    try: sock.close()
    except OSError: pass
    print()
