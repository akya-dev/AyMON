# Licence texts

Full texts of the licences referenced by `/NOTICE`, one file per licence or
component. Paths below name the Windows file; the Linux `lib*.so` of the same
name carries the same components.

| File | Covers | Source |
|---|---|---|
| `Apache-2.0.txt` | OpenSSL 3.5.1 (`bin/win-x64/libssl-3-x64.dll`, `libcrypto-3-x64.dll`) | the standard Apache-2.0 text |
| `OpenSSL-3.5.1.txt` | OpenSSL's own licence file | OpenSSL's own `LICENSE.txt`, as shipped upstream |
| `mimalloc-MIT.txt` | mimalloc 2.2.5, linked into `AyDATA.dll` / `libAyDATA.so` | mimalloc's own `LICENSE`, as shipped upstream |
| `EDL-1.0.txt` | the MQTT packet layer in `AyPRO.dll` (Eclipse Paho derivative) | `edl-v10` from the Paho Embedded C repository, unchanged |
| `base64-BSD-3-Clause.txt` | Jouni Malinen's base64 in `AyPRO.dll` | the licence section of the wpa_supplicant / hostapd `README`, unchanged, with the base64 file's copyright line |
| `RFC3174-SHA1.txt` | the SHA-1 used for the WebSocket handshake in `AyPRO.dll` | quoted from RFC 3174 |
| `SQLite-public-domain.txt` | SQLite 3.45.3 in `AyPRO_sqlite.dll` | quoted from the upstream source header |
| `HIDAPI-BSD-3-Clause.txt` | HIDAPI in `AyPRO_hid.dll` | HIDAPI's own `LICENSE-bsd.txt`, unchanged |
| `stb-MIT-or-public-domain.txt` | stb_image / stb_image_write in `AyLIB_vision.dll` (JPEG / PNG) | quoted from the upstream source header |
| `libssh2-BSD-3-Clause.txt` | libssh2 1.11.1 in `AyLIB_net.dll` (the SSH transport) | libssh2's own `COPYING`, as shipped upstream |
| `miniz-MIT.txt` | miniz 3.0.2 in `AyLIB_net.dll` (deflate, behind `FILE.zip`) | miniz's own `LICENSE`, as shipped upstream |
| `pybind11-BSD-3-Clause.txt` | pybind11 2.10.2 in `AyLIB_Python.dll` | pybind11's own `LICENSE`, as shipped upstream |

The terms for AyMON itself are not here — they are in `/LICENSE` at the top
of this repository.
