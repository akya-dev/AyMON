# Security

If you find a way to get past an engine's access controls (`con_acl`, a login,
`xdb_acl`), to crash it from the network, or anything else that would hurt a
real plant, **do not open an issue or a discussion**.

Report it privately instead:

- **[Report a vulnerability](https://github.com/akya-dev/AyMON/security/advisories/new)**
  (GitHub's private reporting — only the maintainer sees it), or
- e-mail **aymon@akya.ca** with "AyMON security" in the subject.

Say which engine build (`AyXDB -?`) and how to reproduce it. You will get an
answer within a week.

Note that some examples are **deliberately** open — `PRJEDU_hardening` is
delivered with seven weaknesses to fix, and several examples listen without a
login on `127.0.0.1`. Their READMEs say so. Those are not vulnerabilities.
