#!/usr/bin/env python3
# PRJEDU_xdbsql -- ask the engine's PostgreSQL port one statement, print the rows.
#
#   python pg_try.py "SELECT id, desc, val FROM \"LINE/*\".io"
#   python pg_try.py --port 15433 "SELECT * FROM sqlq('HIS_LAST', 'L1_PT1', 5) h"
#   python pg_try.py --db LINE/L1 "SELECT id, val FROM io"
#
# Nothing to install: the PostgreSQL wire protocol (version 3, simple query) in
# the standard library. Any PostgreSQL client does the same -- psql, psycopg,
# JDBC, psqlODBC (Excel, Power BI), Grafana:
#   psql "host=127.0.0.1 port=15432 user=eng dbname=SQL/S00"
#
# 15432 gives the session the role Engineer, 15433 the role Monitor and no
# writes. The database name is a document: a table named without one is read
# from it.
import argparse, socket, struct, sys


def msg(t, body):
    return t + struct.pack("!I", len(body) + 4) + body


def recv_exact(s, n):
    b = b""
    while len(b) < n:
        c = s.recv(n - len(b))
        if not c:
            raise ConnectionError("the server closed the connection")
        b += c
    return b


def recv_msg(s):
    h = recv_exact(s, 5)
    n = struct.unpack("!I", h[1:5])[0]
    return h[0:1], recv_exact(s, n - 4)


def fields(body):
    # ErrorResponse / NoticeResponse: (code byte, text) pairs
    out, i = {}, 0
    while i < len(body) and body[i] != 0:
        k = chr(body[i]); j = body.index(b"\0", i + 1)
        out[k] = body[i + 1:j].decode("utf-8", "replace"); i = j + 1
    return out


def main():
    ap = argparse.ArgumentParser(description="one statement to the engine's PostgreSQL port")
    ap.add_argument("sql")
    ap.add_argument("--port", type=int, default=15432)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--db", default="SQL/S00", help="the document a table without one is read from")
    ap.add_argument("--user", default="try")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    s = socket.create_connection((a.host, a.port), timeout=30)
    start = struct.pack("!I", 3 << 16)
    for k, v in (("user", a.user), ("database", a.db), ("client_encoding", "UTF8"), ("application_name", "pg_try")):
        start += k.encode() + b"\0" + v.encode() + b"\0"
    start += b"\0"
    s.sendall(struct.pack("!I", len(start) + 4) + start)
    while True:                                   # authentication, parameters, ready
        t, b = recv_msg(s)
        if t == b"E":
            print("refused:", fields(b).get("M")); return 1
        if t == b"R" and struct.unpack("!I", b[:4])[0] != 0:
            print("this port asks for a password; pg_try does not send one -- use psql"); return 1
        if t == b"Z":
            break

    s.sendall(msg(b"Q", a.sql.encode("utf-8") + b"\0"))
    cols, rows, rc = [], [], 0
    while True:
        t, b = recv_msg(s)
        if t == b"T":                             # RowDescription
            n = struct.unpack("!H", b[:2])[0]; i = 2; cols = []
            for _ in range(n):
                j = b.index(b"\0", i); cols.append(b[i:j].decode("utf-8")); i = j + 1 + 18
        elif t == b"D":                           # DataRow
            n = struct.unpack("!H", b[:2])[0]; i = 2; r = []
            for _ in range(n):
                ln = struct.unpack("!i", b[i:i + 4])[0]; i += 4
                if ln < 0:
                    r.append("null")
                else:
                    r.append(b[i:i + ln].decode("utf-8", "replace")); i += ln
            rows.append(r)
        elif t == b"C":                           # CommandComplete
            tag = b.rstrip(b"\0").decode()
            if cols:
                w = [max(len(c), *(len(r[k]) for r in rows)) if rows else len(c) for k, c in enumerate(cols)]
                print("  ".join(c.ljust(w[k]) for k, c in enumerate(cols)))
                print("  ".join("-" * w[k] for k in range(len(cols))))
                for r in rows:
                    print("  ".join(v.ljust(w[k]) for k, v in enumerate(r)))
            print("(%s)" % tag)
            cols, rows = [], []
        elif t == b"N":
            print("notice:", fields(b).get("M"))
        elif t == b"E":
            f = fields(b); rc = 1
            print("error %s: %s" % (f.get("C", ""), f.get("M", "")))
        elif t == b"Z":
            break
    s.sendall(msg(b"X", b""))
    s.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
