# Time, text and codecs

The clock and time arithmetic (`Time`, and `TIME.str` for a chain), turning bytes
into text and back (`CODEC`, `BYTES`), large binary values (`Blob`), the process
(`SYS`), the log levels and `LOG.wrt`, and the result codes a hook returns (`RES`).
Why a number cannot hold an offset and a string should not hold a picture is in
[Scripting](../03_Scripting.md) (*Decimals and times*, *Pictures and other large
values*); read that first. Every result below was measured on engine 4.4.2.702.

* [Time](#time)
* [TIME](#time-a-chain-function)
* [CODEC](#codec)
* [BYTES](#bytes)
* [Blob](#blob)
* [SOAP](#soap)
* [SYS](#sys)
* [LOG](#log)
* [RES](#res)

---

## Time

The engine's clock, time as text, and calendar arithmetic. Everything here is a
script function. A time comes in two forms: **epoch milliseconds** (a signed 64-bit
integer, UTC, what `Time.GetTimeMs()` answers) and a **time value** (`0x0248`, an
instant with its offset, what `Time.now()` answers). Most functions take and give
milliseconds; `AddDurationMs` gives back the form it was given.

**Local time is the project's zone.** The root document names it:
`<xdb id=".." xdb_tz="Europe/Istanbul">`, an IANA zone name. Without it the engine
uses the machine's zone, mapped to its IANA name. It is read before anything loads,
the whole process uses it, and it cannot change while the engine runs. The log says
which it is at the start: `Time zone : Europe/Istanbul (tzdata 2026e, built in)`.
The zone database is built into the engine, so two machines set to different zones
run the same project the same way. Every "local" below is this zone.

**The examples on this page run with `xdb_tz="Europe/Istanbul"`** (+03:00, no daylight
saving), and use one instant:

```js
var ms = 1767225600123;     // 2026-01-01T00:00:00.123Z = 2026-01-01 03:00:00.123 in Istanbul
```

**Ready formats.** `Time.GetTimeStr` and `Time.FmtTimeStr` take a number for a ready
format or a text for your own (below). The ready formats, measured with `ms`:

| Format | Result | |
|---|---|---|
| `0` | `2026-01-01 03:00:00` | local |
| `1` `2` `3` | `2026-01-01 03:00:00.1` `.12` `.123` | local, 1–3 fraction digits; **3 is the default** |
| `10` | `2026-01-01 03:00:00+0300` | local with offset |
| `11` `12` `13` | `2026-01-01 03:00:00.123+0300` (13) | |
| `20` | `2026-01-01 03:00:00+03:00` | offset with a colon |
| `21` `22` `23` | `2026-01-01 03:00:00.123+03:00` (23) | |
| `40` `46` | `20260101030000` | digits only, to the second |
| `41` `42` `43` `44` `45` | `2026` `202601` `20260101` `2026010103` `202601010300` | year, month, day, hour, minute |
| `47` | `20260101030000123` | with milliseconds |
| `140`..`147` | `20260101030000000` (140), `20260000000000000` (141), `20260101030000123` (147) | always 17 digits: the parts below the precision are zeros |
| `100`..`123` | `2026-01-01T03:00:00.123+03:00` (123) | the same as `0`..`23`, with `T` |
| `200`..`247` | `2026-01-01 00:00:00` (200), `2026-01-01 00:00:00.123+00:00` (223), `20260101000000123` (247) | **UTC**: `2xx` is `xx` in UTC |
| `300`..`347` | `2026-01-01T00:00:00.123+00:00` (323), `20260101000000000` (340) | `3xx` is `1xx` in UTC |
| any other number | `""` | `4`, `5`, `30`, `99`, `150` |

`200`..`203` print UTC **without** an offset; only `21x` and `22x` add `+0000` / `+00:00`.

**Format texts.** A text format is C's `strftime`, plus `%f` for milliseconds:

| | | | |
|---|---|---|---|
| `%Y` `%m` `%d` | `2026` `01` `01` | `%H` `%M` `%S` | `03` `00` `00` |
| `%f` | `123` (milliseconds) | `%z` | `+0300`, or `+03:00` when it ends the text |
| `%j` | `001` day of the year | `%U` `%V` `%G` | `00` `01` `2026` (week numbers, ISO year) |
| `%a` `%A` | `Thu` `Thursday` | `%b` `%B` | `Jan` `January` |
| `%F` `%T` `%R` `%D` | `2026-01-01` `03:00:00` `03:00` `01/01/26` | `%e` `%C` | ` 1` `20` |
| `%p` `%I` | `AM` `03` | `%c` `%x` `%X` | `Thu Jan  1 03:00:00 2026` `01/01/26` `03:00:00` |
| `%Z` | the **machine's** zone name, not the project's | `%%` | `%` |

Three traps, measured:

* **A specifier not in this table ends the engine process** (`%s`, `%k` measured:
  the process exits with 0xC0000409, no log line). Check every format text before
  it reaches a running plant.
* **Whatever follows `%f` is dropped**: `"%H:%M:%S.%f h"` gives `03:00:00.123`.
  Put `%f` last, or last before `%z`.
* `%Z` names the machine's zone, spelt as the system spells it: an Istanbul project on a
  machine set to another zone printed that machine's zone. Use `Time.tz()` for the
  project's.

### Time.GetTimeStr

`Time.GetTimeStr([format])` → text

The current time as text, local unless the format says UTC.

| Argument | Meaning |
|---|---|
| `format` | a ready format (a number) or a format text, both in the tables [above](#time). Missing: `3` |

```js
Time.GetTimeStr()           // "2026-11-11 12:32:39.481"
Time.GetTimeStr(0)          // "2026-11-11 12:32:39": the stamp the examples log
Time.GetTimeStr(223)        // "2026-11-11 09:32:39.481+00:00"
Time.GetTimeStr("%Y")       // "2026"
```

### Time.FmtTimeStr

`Time.FmtTimeStr(ms[, format])` → text

An instant as text.

| Argument | Meaning |
|---|---|
| `ms` | epoch milliseconds; a time value or a numeric text is read as its milliseconds too |
| `format` | as for `GetTimeStr`. Missing: `3` |

Returns `undefined` with no argument; `""` for a format number that does not exist.

```js
Time.FmtTimeStr(ms)                         // "2026-01-01 03:00:00.123"
Time.FmtTimeStr(ms, 23)                     // "2026-01-01 03:00:00.123+03:00"
Time.FmtTimeStr(ms, "%d.%m.%Y %H:%M")       // "01.01.2026 03:00"
Time.FmtTimeStr(ms, "%Y-%m-%dT%H:%M:%S.%f%z")   // "2026-01-01T03:00:00.123+03:00"
Time.FmtTimeStr(ms, "%H:%M %z!")            // "03:00 +0300!": %z not last, no colon
Time.FmtTimeStr("2026-01-01T12:00:00.5Z".toDTM(), 3)   // "2026-01-01 15:00:00.500"
Time.FmtTimeStr(0, 0)                       // "1970-01-01 02:00:00": Istanbul was +02:00 then
```

The offset is the one the zone had **at that instant**, daylight saving and
history included.

### Time.GetTimeMs

`Time.GetTimeMs()` → integer

Now, as epoch milliseconds (UTC), a signed 64-bit integer, so `later - now` can
go negative instead of wrapping. With any argument it returns `undefined`.

```js
var t0 = Time.GetTimeMs();     // 1794389559481
// ... work ...
var took = Time.GetTimeMs() - t0;   // milliseconds
```

### Time.now

`Time.now()` → time value

Now as a time value (`0x0248`): the instant with all the precision the clock has
(100 ns on Windows, 1 ns on Linux), written with the local offset. `typeof` says
`"number"`.

```js
var n = Time.now();      // 2026-11-11T12:32:39.482284+03:00
n + 1000                 // 2026-11-11T12:32:40.482284+03:00: ± a number keeps a time
n.toINT()                // 1794389559482: its epoch milliseconds
JSON.stringify({t: n})   // {"t":"2026-11-11T12:32:39.482284+03:00"}
```

Subtract two time values to get milliseconds. **A time minus a number is a time**:
`Time.now() - Time.GetTimeMs()` is an instant in 1970, not a difference. The type
itself is in [Language](01_Language.md#value-methods) (`toDTM`) and in
[Scripting](../03_Scripting.md#decimals-and-times).

### Time.ParseTimeMs

`Time.ParseTimeMs(text[, format])` → integer

Text to epoch milliseconds. **No offset in the text means local time**; `Z` and an
offset are taken as written.

| Argument | Meaning |
|---|---|
| `text` | `YYYY-MM-DD hh:mm:ss.fff+hh:mm`; read below what may be left out |
| `format` | optional: a `strftime` format for anything else (`%d.%m.%Y %H:%M:%S`). Such text has no offset: local |

What the text may look like, measured:

```js
Time.ParseTimeMs("2026-01-01 03:00:00")            // 1767225600000: local
Time.ParseTimeMs("2026-01-01T03:00:00")            // 1767225600000: T or blank
Time.ParseTimeMs("2026-01-01 00:00:00Z")           // 1767225600000
Time.ParseTimeMs("2026-01-01T03:00:00.5+03:00")    // 1767225600500
Time.ParseTimeMs("2026-01-01T03:00:00.12+0300")    // 1767225600120
Time.ParseTimeMs("2026-01-01 03:00:00 +03:00")     // 1767225600000: a blank before the offset
Time.ParseTimeMs("2026-01-01 00:00:00+03")         // 1767214800000: hours only
Time.ParseTimeMs("2026-01-01 00:00:00.1234567 +00:00")  // 1767225600123: digits after 3 dropped
Time.ParseTimeMs("2026/01/01 03:00")               // 1767225600000: / and no seconds
Time.ParseTimeMs("2026-01-01")                     // 1767214800000: local midnight
Time.ParseTimeMs("2026-01")                        // 1767214800000: the 1st
Time.ParseTimeMs("01.01.2026 03:00:00", "%d.%m.%Y %H:%M:%S")   // 1767225600000
Time.ParseTimeMs("2026-Jan-01 03:00:00", "%Y-%b-%d %H:%M:%S")  // 1767225600000
```

Returns `0` for what it cannot read, `undefined` with no argument:

```js
Time.ParseTimeMs("abc")                    // 0
Time.ParseTimeMs("12:30")                  // 0: a time of day alone is not read
Time.ParseTimeMs("1767225600123")          // 0: digits alone are not epoch ms here
Time.ParseTimeMs("2026-01-01T03:00:00+3")  // 0: the offset needs two digits
Time.ParseTimeMs("2026-01-01 03:00:00 x")  // 0
```

Traps:

* `0` is also a real instant (1970). Test what you parse before you trust a `0`.
* **A year alone is wrong**: `"2026"` gives 1764536400000, which is 1 **December 2025**.
  Write `"2026-01-01"`.
* Ranges are not checked: `"2026-13-45 99:99:99"` gives a date in February 2027.

### Time.GetTimeZoneMs

`Time.GetTimeZoneMs()` → integer

The project zone's offset from UTC **now**, daylight saving included, in milliseconds.
West of Greenwich it is negative.

```js
Time.GetTimeZoneMs()     // 10800000 in Europe/Istanbul; 39600000 in Australia/Sydney in November
```

### Time.GetTimeDstMs

`Time.GetTimeDstMs()` → integer

The daylight saving part of that offset now: `0`, or usually 3600000.

```js
Time.GetTimeDstMs()      // 0 in Europe/Istanbul; 3600000 in Australia/Sydney in November
```

### Time.tz

`Time.tz()` → text

The project's zone: the root's `xdb_tz`, else the machine's zone as an IANA name.

```js
Time.tz()                // "Europe/Istanbul"; with no xdb_tz, the machine's zone as an IANA name
```

### Time.AddDurationMs

`Time.AddDurationMs(time, duration)` → the same form as `time`

Calendar arithmetic in the project's zone. Milliseconds in, milliseconds out; a time
value in, a time value out.

| Argument | Meaning |
|---|---|
| `time` | epoch milliseconds, or a time value |
| `duration` | an ISO 8601 duration that starts with `P` (forward) or `N` (back): `P1D`, `PT90M`, `P1Y1M1DT1H1M1S`, `P1W`, `PT0.5S`. Or an **anchor**: the next or previous wall-clock point |

The anchors:

| Text | Means |
|---|---|
| `PT10:00` | the next 10:00, **strictly after** `time` (today if still ahead) |
| `NT10:00` | the previous 10:00, strictly before |
| `P01T06:00` | the next 1st of a month at 06:00 (`N01T..` the previous) |
| `P10-01T12:00` | the next 1 October at 12:00 |

A month that does not have the day is clipped to its last day: 31 January plus
`P1M` is 28 February, and `P31T00:00` in February is the 28th. "Strictly" means it:
at exactly 12:00, `PT12:00` gives 12:00 the next day.

```js
var base = Time.ParseTimeMs("2026-01-31 10:30:00");   // local
Time.AddDurationMs(base, "P1D")          // 2026-02-01 10:30
Time.AddDurationMs(base, "PT90M")        // 2026-01-31 12:00
Time.AddDurationMs(base, "P1M")          // 2026-02-28 10:30: clipped
Time.AddDurationMs(base, "N1D")          // 2026-01-30 10:30
Time.AddDurationMs(base, "PT12:00")      // 2026-01-31 12:00: still ahead today
Time.AddDurationMs(base, "PT10:00")      // 2026-02-01 10:00: already past today
Time.AddDurationMs(base, "NT10:00")      // 2026-01-31 10:00
Time.AddDurationMs(base, "P01T06:00")    // 2026-02-01 06:00
Time.AddDurationMs(base, "P10-01T12:00") // 2026-10-01 12:00
Time.AddDurationMs("2026-01-31T10:30:00+03:00".toDTM(), "P1M")   // 2026-02-28T10:30:00.000+03:00
```

(The results are milliseconds; they are shown here through `Time.FmtTimeStr(r, 0)`.)

Returns `0` when the duration is not one: it must start with `P` or `N`, so `"1D"`,
`"-P1D"`, `""` and `"PX"` all give `0`. `undefined` with one argument. A text in
place of `time` is read as 0 ms: `Time.AddDurationMs("x", "P1D")` is `86400000`.

`t + "P1D".toDUR()` does the same on a time value ([Language](01_Language.md#value-methods)).

### Time.SleepMs

`Time.SleepMs(ms)` → undefined

Stops the calling thread for `ms` milliseconds. `Time.SleepMs(120)` took 121 ms.

Do not call it from anything the engine runs: a timer, a `*_fnc` chain, a protocol
hook, a page. That thread is the one that serves its timers, its queue and its
connection's sessions; while it sleeps none of them runs. Measured: a timer called
`Time.SleepMs(12000)` on a thread that also carried a one-second timer; that timer did
not fire for 12 seconds (the missed beats were skipped, not caught up), and after 10
seconds the thread's `sta` went to ALARM with `TH.hlt: sta alarm NORMAL -> ALARM+new [one
cycle running for 10 s]`. To do something later, let the engine wait: a timer
(`evt_per`, `evt_dly`), or `evt.QueValue(adr, v, pri, delay_ms)`
([Timers and events](../02_Timers_and_Events.md)).

---

## TIME: a chain function

One chain function. It turns the time being written into readable text beside it.

### TIME.str

**In:** any `<atr>_fnc` chain. **Reads:** the value being written, as epoch
milliseconds or a time value. **Changes:** writes `<atr>_str`.

Writes `<atr>_str` = the value as local `YYYY-MM-DDThh:mm:ss` (no milliseconds, no
offset) and lets the chain go on. It does nothing while the element's `sta` is
switched off.

```xml
<var id="T1" val="0" val_typ="0x1208" sta="0x0303" sta_typ="0x142" val_fnc="[TIME.str]"/>
```

Writing `1767225600123` stores `val_str="2026-01-01T03:00:00"`. A time value works
the same: `"2026-01-01T00:00:00.500Z".toDTM()` also gives `2026-01-01T03:00:00`.

The attribute must hold an integer (`0x..08`) or a time (`0x0248`). On a float
(`0x0308`) the text is nonsense: `151792971-11-17T21:26:10`.

---

## CODEC

Bytes to text and back: Base64, hex, a compact compression, and JSON Web Tokens.
Script functions.

**Buffers.** A decoder gives a **buffer** by default (bytes; `typeof` is `"object"`,
`.length` is the byte count, `CODEC.HEX_enc(b)` shows it). Give the decoder an output
type as its last argument to get text instead:

| Type | Result |
|---|---|
| `0x0411` | a buffer (the default) |
| `0x0401` | UTF-8 text: what `JSON.parse` wants |

Any other type is refused.

**A refusal is quiet.** A `CODEC` function that refuses its arguments returns
`undefined`. The only trace is a `NOTICE` line (`function 'Global.HEX_dec' returned an
error [ERR_COMMON_PARAMETER]`), which the default log level (4, WARN) does not write,
and a `try` does not catch it. Test the result.

### CODEC.B64_enc

`CODEC.B64_enc(data)` → text

Standard Base64 (`+`, `/`, padded with `=`) of a text's UTF-8 bytes or of a buffer's
bytes.

```js
CODEC.B64_enc("hello")                          // "aGVsbG8="
CODEC.B64_enc("Ağ")                             // "QcSf": UTF-8 bytes
CODEC.B64_enc(CODEC.HEX_dec("00ff10"))          // "AP8Q"
CODEC.B64_enc(JSON.stringify({a: 1, b: "x"}))   // "eyJhIjoxLCJiIjoieCJ9"
```

`undefined` with no argument.

### CODEC.B64_dec

`CODEC.B64_dec(text[, type])` → buffer or text

Base64 back to bytes. Reads the standard and the URL-safe alphabet (`-`, `_`), with or
without padding.

| Argument | Meaning |
|---|---|
| `text` | Base64 text. Must be a text: a number is refused |
| `type` | `0x0411` buffer (default) or `0x0401` text |

```js
CODEC.B64_dec("aGVsbG8=", 0x0401)       // "hello"
CODEC.B64_dec("aGVsbG8", 0x0401)        // "hello": no padding needed
CODEC.HEX_enc(CODEC.B64_dec("-_8"))     // "fbff": URL-safe
var o = JSON.parse(CODEC.B64_dec(CODEC.B64_enc(JSON.stringify({a: 1, t: "ç"})), 0x0401));
// {"a":1,"t":"ç"}
```

Traps:

* **Decoding stops at the first character outside the alphabet**: a line break in
  the text cuts it. `CODEC.B64_dec("aGVs\nbG8=", 0x0401)` is `"hel"`. Remove line
  breaks first.
* **An empty text ends the engine process** (`CODEC.B64_dec("")`, measured: access
  violation). Test `!s` before decoding.
* Without `0x0401` the result is a buffer, and `JSON.parse` of a buffer is `undefined`.

### CODEC.HEX_enc

`CODEC.HEX_enc(data)` → text

Lower-case hex of a text's UTF-8 bytes or of a buffer's bytes. How a script looks at
binary data.

```js
CODEC.HEX_enc("AB")                       // "4142"
CODEC.HEX_enc("ç")                        // "c3a7"
CODEC.HEX_enc(exc.buf_recv.copy(0, 4))    // in a pro_onparse hook: the first four bytes of a frame
```

A number gives its eight bytes, low first (`CODEC.HEX_enc(258)` is
`"0201000000000000"`); an array gives `""`. For bytes from numbers use
[BYTES.make](#bytesmake).

### CODEC.HEX_dec

`CODEC.HEX_dec(text[, type])` → buffer or text

Hex text to bytes: how a script builds binary data
([Scripting](../03_Scripting.md#script-can-also-speak-a-protocol)).

| Argument | Meaning |
|---|---|
| `text` | hex digits, either case. Blanks, tabs, line breaks, `:` and `-` between them are skipped |
| `type` | `0x0411` buffer (default) or `0x0401` text |

```js
var b = CODEC.HEX_dec("30 0b:02-01\t00\n");
CODEC.HEX_enc(b)                          // "300b020100"
CODEC.HEX_dec("4142", 0x0401)             // "AB"
exc.buf_send.append(CODEC.HEX_dec("300b0201 00"));   // in a pro_onparse hook: an answer
```

Refused (returns `undefined`): any other character, a half byte left over, a `0x`
prefix, a number. `CODEC.HEX_dec("414")`, `("41zz")`, `("0x41")` are all `undefined`.
`CODEC.HEX_dec("")` is an empty buffer. [BYTES.hex](#byteshex) is the lenient one.

### CODEC.Z64_enc

`CODEC.Z64_enc(data)` → text

Compresses bytes into text made of Base64 characters. Only AyMON reads it: it is the
engine's own small LZ format, **not zlib or gzip**, and no other tool decodes it. Use it
to shrink repetitive text that goes from engine to engine.

```js
var z = CODEC.Z64_enc("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabcabcabcabc");
z            // "A9YP9YJmYADYDNYGTY": 18 characters; B64_enc gives 72
```

Text that does not repeat grows: three characters per byte (1300 bytes became 3900
characters). Mind the limits of `Z64_dec` below before you send one.

### CODEC.Z64_dec

`CODEC.Z64_dec(text[, type])` → buffer or text

Back from `Z64_enc`.

```js
CODEC.Z64_dec(z, 0x0401)     // "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabcabcabcabc"
```

**Outside its limits it ends the engine process** (access violation, measured each time):

* the text must be whole, as `Z64_enc` made it: `"A"`, or a text missing its last
  character, crash;
* the text may be at most 4094 characters: `Z64_enc` of 1400 bytes that do not repeat
  (4200 characters) crashes it, 1300 bytes (3900) come back;
* the result may be at most 16 KB: 5000 `a` come back, 20000 `a` crash.

Use `B64_enc` / `B64_dec` for anything larger or anything that came from outside.

### CODEC.JWT_sign

`CODEC.JWT_sign(payload, key[, alg])` → text

A signed JSON Web Token: `header.payload.signature`, Base64url without padding.

| Argument | Meaning |
|---|---|
| `payload` | the claims as **JSON text**: `JSON.stringify(obj)` |
| `key` | the shared secret; **only its first 63 characters are used** |
| `alg` | `"HS256"` (default), `"HS384"`, `"HS512"`. Anything else is refused: `undefined` |

```js
var tok = CODEC.JWT_sign('{"sub":"1234567890","name":"John Doe","iat":1516239022}',
                         "your-256-bit-secret");
// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
```

That is the token every JWT library makes from that payload and secret. The header is
always `{"alg":"HS256","typ":"JWT"}` (with its algorithm).

Traps, measured:

* **An object is not stringified for you**: `CODEC.JWT_sign({a: 1}, "k")` signs the
  text `<OHASH>`.
* **The whole token must fit in 1023 characters.** A payload up to 705 bytes is signed
  with HS256, 690 with HS384, 672 with HS512. Longer, the engine returns a token
  **without a signature** (and from 739 bytes without a payload), with no error.
  `JWT_verify` refuses those, so you find out late. Keep claims short.
* A key longer than 63 characters signs with its first 63.

### CODEC.JWT_verify

`CODEC.JWT_verify(token, key)` → `1` or `0`

`1` when the header says `"typ":"JWT"` with an `HS` algorithm and the signature is
right for `key`.

```js
CODEC.JWT_verify(tok, "your-256-bit-secret")    // 1
CODEC.JWT_verify(tok, "other")                  // 0
CODEC.JWT_verify("abc", "k")                    // 0
```

**It checks the signature only.** An `exp` in the past still answers `1`
(`{"exp":1000}` measured). Read the claims with `JWT_dec` and compare `exp` with
`Time.GetTimeMs() / 1000` yourself. A header with `"alg":"none"` answers `0`.

### CODEC.JWT_dec

`CODEC.JWT_dec(token[, part])` → text

A part of the token as JSON text, **without checking the signature**.

| `part` | Result |
|---|---|
| `1` (default) | the payload |
| `0` | the header |
| `2` | `""` |

```js
CODEC.JWT_dec(tok)                     // '{"sub":"1234567890","name":"John Doe","iat":1516239022}'
CODEC.JWT_dec(tok, 0)                  // '{"alg":"HS256","typ":"JWT"}'
JSON.parse(CODEC.JWT_dec(tok)).sub     // "1234567890"
```

A text with no `.` in it gives `""`. Verify first, then decode.

---

## BYTES

Numbers out of a script array of bytes, and arrays of bytes out of text and numbers.
Made for the bus drivers (`exc.rd` answers an array of numbers,
[Pins and buses](../09_Pins_and_Buses.md)), and useful wherever bytes arrive as an
array. Script functions. A "byte array" here is an ordinary script array of numbers
0–255; only the low 8 bits of each are used.

The readers refuse with one `ERROR` line and return `undefined`; inside a `try` they
throw, and `e.message` says why:

```
'u16be' refused [ERR_EXECUTE_PARAMETER] -- BYTES: 2 bytes at 0, the array has 1
```

### BYTES.u16be

`BYTES.u16be(bytes[, offset])` → integer

Two bytes at `offset` (default 0), big endian (high byte first), unsigned.

| Argument | Meaning |
|---|---|
| `bytes` | a script array of numbers. A text or a buffer is refused |
| `offset` | where the number starts. The array must have the bytes: else refused |

```js
BYTES.u16be([0x12, 0x34])             // 4660
BYTES.u16be([0, 0, 0x12, 0x34], 2)    // 4660
BYTES.u16be([300, 1])                 // 11265: 300 counts as 0x2C
```

The others work the same way:

| Function | Bytes | Order | Signed | Example |
|---|---|---|---|---|
| `BYTES.u16be` | 2 | big | no | `[0x12,0x34]` → 4660 |
| `BYTES.u16le` | 2 | little | no | `[0x12,0x34]` → 13330 |
| `BYTES.i16be` | 2 | big | yes | `[0xFF,0xFE]` → -2 |
| `BYTES.i16le` | 2 | little | yes | `[0xFE,0xFF]` → -2 |
| `BYTES.u24be` | 3 | big | no | `[1,2,3]` → 66051 |
| `BYTES.u32be` | 4 | big | no | `[0xDE,0xAD,0xBE,0xEF]` → 3735928559 |
| `BYTES.u32le` | 4 | little | no | `[0xDE,0xAD,0xBE,0xEF]` → 4022250974 |
| `BYTES.i32be` | 4 | big | yes | `[0xFF,0xFF,0xFF,0xFE]` → -2 |

### BYTES.u16le

Two bytes, little endian (low byte first), unsigned. `BYTES.u16le([0x12, 0x34])` → `13330`.

### BYTES.i16be

Two bytes, big endian, signed. `BYTES.i16be([0xFF, 0xFE])` → `-2`.

### BYTES.i16le

Two bytes, little endian, signed. `BYTES.i16le([0xFE, 0xFF])` → `-2`.

### BYTES.u24be

Three bytes, big endian, unsigned. `BYTES.u24be([1, 2, 3])` → `66051`.

### BYTES.u32be

Four bytes, big endian, unsigned. `BYTES.u32be([0xDE, 0xAD, 0xBE, 0xEF])` → `3735928559`.

### BYTES.u32le

Four bytes, little endian, unsigned. `BYTES.u32le([0xDE, 0xAD, 0xBE, 0xEF])` → `4022250974`.

### BYTES.i32be

Four bytes, big endian, signed. `BYTES.i32be([0xFF, 0xFF, 0xFF, 0xFE])` → `-2`.

### BYTES.text

`BYTES.text(text)` → array

The text's UTF-8 bytes. A number is written as text first.

```js
BYTES.text("Aç")      // [65,195,167]
BYTES.text(12)        // [49,50]
```

### BYTES.hex

`BYTES.hex(source)` → array

Bytes from hex text, or the bytes of a buffer, an array or one number.

```js
BYTES.hex("de ad-BE:ef")                  // [222,173,190,239]
BYTES.hex(CODEC.HEX_dec("0102"))          // [1,2]
```

**It skips every character that is not a hex digit, and a half byte left over is
dropped**: `"de ad xyz 1"` gives `[222,173]`, and `"0x12"` gives `[1]` (the `x` is
skipped, `0` and `1` make a byte, the `2` is left over). Use
[CODEC.HEX_dec](#codechex_dec) where a wrong text must be refused.

### BYTES.make

`BYTES.make(v0, v1, ...)` → array

An array of bytes from numbers; each keeps its low 8 bits.

```js
BYTES.make(1, 256, -1, 0x1FF, "7")    // [1,0,255,255,7]
BYTES.make()                          // []
```

### BYTES.crc8

`BYTES.crc8(bytes[, poly, init])` → integer

CRC-8, MSB first, no reflection, no final XOR.

| Argument | Meaning |
|---|---|
| `bytes` | a script array of numbers; anything else is refused |
| `poly` | the polynomial, default `0x31` |
| `init` | the start value, default `0xFF` |

The defaults are the Sensirion sensors' CRC (SHT3x, SCD30 ...):

```js
BYTES.crc8([0xBE, 0xEF])                    // 146 = 0x92, the datasheet's example
BYTES.crc8([0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39], 0x07, 0x00)   // 244 = 0xF4, CRC-8/SMBUS
BYTES.crc8([])                              // 255: init
```

Maxim's 1-Wire CRC is reflected; this function does not compute it.

---

## Blob

A blob is large binary data held by reference: a camera frame, a file read whole, an
image a function made. Writing it, reading it, handing it to a chain or to Python never
copies the bytes. A blob never changes after it is made. Why, and how pages and MQTT
see one, is in
[Scripting](../03_Scripting.md#pictures-and-other-large-values-blobs).

**An attribute that holds a blob** is declared as one:

```xml
<var id="FRAME" val="" val_typ="0x150E" val_fnc="[main.on_frame]" sta="0x0303" sta_typ="0x142"/>
```

`0x050E` is a blob; `0x150E` runs `val_fnc`. Then:

```js
evt.SetValue("id('FRAME')/@val", b);         // a reference: no copy
var g = evt.GetValue("id('FRAME')/@val");
g.ptr == b.ptr                                // true: the same bytes
evt.GetValue("json(id('FRAME'))")             // ...,"val":{"blob":1,"len":6,"fmt":"raw",...}
evt.GetValue("xml(id('FRAME'))")              // <var id="FRAME" ... val_typ="0x150E" val="" .../>
```

JSON shows the descriptor, XML leaves the value empty (a blob is not saved). **Writing
anything that is not a blob empties it**: `evt.SetValue("id('FRAME')/@val", "abc")`
answers `1`, runs `val_fnc`, and the attribute holds an empty blob. `xdb_blb_max` on
the root limits one blob (64 MiB by default).

### new Blob

`new Blob([n])` → blob

`n` bytes, all zero, no shape. `new Blob()` is an empty one. A script cannot write into
a blob, so in script this is mainly a zero buffer: `new Blob(70).toBuffer()`.

```js
new Blob(16)      // {"blob":1,"len":16,"fmt":"raw","seq":0,"tim":0}
```

### Blob.from

`Blob.from(source[, fmt | options])` → blob

A blob made from a copy of the bytes. The only copy on this path.

| Argument | Meaning |
|---|---|
| `source` | a buffer (`CODEC.HEX_dec`, `File.read`, `b.toBuffer()`) or a text (its UTF-8 bytes). A blob gives the same blob back. An array of numbers is refused |
| `fmt` | what the bytes are: `"jpeg"`, `"png"`, any one to four characters, or `"raw"` (the default). Stored, not checked |
| `options` | `{fmt, seq}`: the same, numbered (`seq` is what an HTTP ETag and an MJPEG part carry). Or `{dtype, shape, seq}`: raw samples |

Raw samples: `dtype` is `"u8"` `"u16"` `"u32"` `"u64"` `"i8"` .. `"i64"` `"f32"` `"f64"`,
`shape` an array of up to four sizes, `[h, w]` for a grey image and `[h, w, ch]` for a
colour one. The byte count must be exactly dtype × shape.

```js
Blob.from("hello")                     // {"blob":1,"len":5,"fmt":"raw","seq":0,"tim":0}

var f = File.open("%PRJ%/pics/g.png", "rb");
var buf = File.read(f, File.size(f));
File.close(f);
Blob.from(buf, "png")                  // {"blob":1,"len":75,"fmt":"png","seq":0,"tim":0}: ready for IMG.decode
Blob.from(buf, {fmt: "png", seq: 41})  // {"blob":1,"len":75,"fmt":"png","seq":41,"tim":0}

var img = Blob.from(CODEC.HEX_dec("000102030405"), {dtype: "u8", shape: [2, 3], seq: 7});
// {"blob":1,"len":6,"fmt":"raw","dtype":"u8","w":3,"h":2,"ch":1,"seq":7,"tim":0}
Blob.from(CODEC.HEX_dec("000102030405"), {dtype: "u16", shape: [1, 3]})   // 3 samples of 2 bytes
```

Refused (returns `undefined`, no line at the default log level, not thrown in a `try`):
a `fmt` longer than four characters, a byte count that does not match dtype × shape, a
`dtype` with no `shape` or with a `fmt` other than raw, an unknown `dtype`, an array, a
number, no argument.

### Blob.live

`Blob.live()` → integer

How many blobs are alive in the whole process. A leak check: run the same work twice
and the number should come back to where it was. At a clean stop the log says
`Clear: Done (blobs alive: N)`, and N should be 0.

```js
Blob.live()       // 0 at the start of an empty project
```

### b.toBuffer

`b.toBuffer()` → buffer

A copy of the blob's bytes as a buffer. For small blobs and for looking inside:

```js
CODEC.HEX_enc(Blob.from("hello").toBuffer())    // "68656c6c6f"
```

**The fields of a blob.** All read-only. `b[i]` is `undefined`: there is no byte access.

| Field | |
|---|---|
| `b.len` | size in bytes |
| `b.fmt` | `"raw"`, `"jpeg"`, `"png"` ... (lower case) |
| `b.dtype` | the sample type of raw samples, else `""` |
| `b.ndim` `b.shape` | the number of sizes and the sizes: `2` and `[2,3]`; `0` and `[]` for plain bytes |
| `b.w` `b.h` `b.ch` | width, height, channels of a 2- or 3-dimensional blob, else 0 |
| `b.seq` | the producer's frame number |
| `b.tim` | capture time in microseconds, 0 when nobody set it |
| `b.ptr` `b.rfc` | where the bytes are and how many references hold them: `b2.ptr == b.ptr` proves no copy |

`"" + b` and `JSON.stringify(b)` give the descriptor, never the bytes:
`{"blob":1,"len":6,"fmt":"raw","dtype":"u8","w":3,"h":2,"ch":1,"seq":7,"tim":0}`.

**Assigning a field is a runtime error** (`'const variable can not be assigned'`), and
outside a `try` it stops the rest of the function.

---

## SOAP

Two names meant to turn a SOAP envelope into an object and back. Neither does anything yet.

### SOAP.parse

`SOAP.parse(text)` → undefined

**Not implemented.** It returns `undefined` for every input. Read a SOAP envelope with
[`new XML(text)`](03_Events_Documents_and_Addresses.md#new-xml),
or let [PRO.soap](09_Connection_and_Protocol_Types.md#prosoap) do it.

### SOAP.stringify

`SOAP.stringify(obj)` → undefined

**Not implemented.** It returns `undefined`. Build the envelope as text.

---

## SYS

The process the engine runs in.

### SYS.GetProcessId

`SYS.GetProcessId()` → integer

The engine's process id: what to stop it by, when several engines run on one machine.

```js
SYS.GetProcessId()      // 16340
```

With any argument it returns `undefined`.

### SYS.GetComputerName

`SYS.GetComputerName()` → text

The machine's name, as Windows gives it (upper case, up to 15 characters).

```js
evt.Log(4, "running on " + SYS.GetComputerName());
```

---

## LOG

The log levels as names, and one chain function. A document's log keeps a line when
its level is at or below the document's `xdb_log` ([Keeping it running](../12_Keeping_It_Running.md#the-log)).

| Name | Value | Kept when | Also |
|---|---|---|---|
| `LOG.PANIC` | 0 | always | **raises the document's health to EMERGENCY** |
| `LOG.ALERT` | 1 | `xdb_log` ≥ 1 | |
| `LOG.FAIL` | 2 | `xdb_log` ≥ 2 | **raises the document's health to ALARM** |
| `LOG.ERROR` | 3 | `xdb_log` ≥ 3 | |
| `LOG.WARN` | 4 | `xdb_log` ≥ 4 (the usual setting) | |
| `LOG.NOTICE` | 5 | `xdb_log` ≥ 5 | |
| `LOG.INFO` | 6 | `xdb_log` ≥ 6 | |
| `LOG.DEBUG` | 7 | `xdb_log` = 7 | |
| `LOG.TEXT1` .. `LOG.TEXT7` | -1 .. -7 | **always** | a plain text line, labelled `TEXT1`..`TEXT7` |

`LOG.TEXT8` is listed by the help but does not exist (`undefined`).

How `evt.Log` uses them ([evt.Log](03_Events_Documents_and_Addresses.md#evtlog)):

```js
evt.Log(LOG.WARN, "pump", 3, "started");   // WARN  | pump 3 started: arguments joined by blanks
evt.Log(LOG.NOTICE, "detail");             // not written at xdb_log 4
evt.Log(LOG.TEXT1, "shift report");        // TEXT1 | shift report: written at any xdb_log
evt.Log("count is", n);                    // TEXT4 | count is 42: no level = TEXT4, always written
evt.Log(n);                                // nothing: a number first is the LEVEL (42)
evt.Log(LOG.WARN, {a: 1});                 // WARN  | {"a":1}
```

* A level below -7 is written as `TEXT7`; one above 7 is never written.
* **`FAIL` and `PANIC` lines are alarms.** The document's `sta` takes them into its
  health bits once a second (`XDB.hlt: sta alarm NORMAL -> ALARM+new [log FAIL +1]`), and
  they stay until acknowledged ([Keeping it running](../12_Keeping_It_Running.md#health-is-in-sta)).
  Use `ERROR` or `WARN` for a message.
* A line is cut at about 2000 characters.
* An element prints as `<XDB_ELM>`; log `evt.GetValue("json(id('X'))")` instead.

### LOG.wrt

**In:** any `<atr>_fnc` chain. **Reads:** `<atr>_log_wrt` — a text. **Changes:** nothing;
writes a log line.

Every time the chain runs, writes one `WARN` line with the element, the attribute, the
value being written and the text. Nothing when `<atr>_log_wrt` is missing or empty, or
when the element's `sta` is switched off. The chain goes on.

```xml
<var id="LEVEL" val="0" val_typ="0x1308" sta="0x0303" sta_typ="0x142"
     val_fnc="[LOG.wrt]" val_log_wrt="tank level changed"/>
```

Writing `5` logs `log.wrt: id('LEVEL')/@val : 5 tank level changed`. Writing `5` again
logs it again: it runs on every write that runs the chain.

---

## RES

Result codes: the 32-bit value a hook returns to the engine, and what an error carries.
Bit 31 is the error bit, bits 16–30 the group (what was being done), bits 0–15 the sub
code (what happened). Constants and four functions to take a code apart.

| Constant | Value | Use |
|---|---|---|
| `RES.OKY` | `0x00000000` | done. What a hook returns when the frame or the step is complete |
| `RES.INF_SUB_CONTINUE` | `0x00000015` | `pro_onparse`: the frame is not complete, read more (set `exc.buf_recv.nxt` first) |
| `RES.ERR` | `0x80000000` | the error bit; `(r & RES.ERR) != 0` tests any code for failure |
| `RES.GRP` | `0xFFFF0000` | mask of the group (with the error bit) |
| `RES.SUB` | `0x8000FFFF` | mask of the sub code (with the error bit) |
| `RES.INF_USER` | `0x000F0000` | the group left for user codes |
| `RES.INF_SUB_FALSE` `RES.INF_SUB_TRUE` | `0x70000000` `0x70000001` | a yes/no answer as a code |
| `RES.INF_LES` `INF_EQU` `INF_GRT` | `0x10000000` `0x20000000` `0x40000000` | less, equal, greater: the engine's comparison results |
| `RES.INF_LSE` `INF_NEQ` `INF_GRE` | `0x30000000` `0x50000000` `0x60000000` | less or equal, not equal, greater or equal |

The values print in hex (`RES.OKY` is `0x00000000`). What each hook expects back is
with the hook in [Sessions and protocol scripts](06_Sessions_and_Protocol_Scripts.md):
for `pro_onparse` it is `RES.OKY` or `RES.INF_SUB_CONTINUE`, for `pro_onaccept`
`RES.OKY` keeps the connection and an error closes it.

The comparison codes are what the engine's own comparisons answer; a script meets them
only when it takes a code apart.

### RES.GRP_GET

`RES.GRP_GET(code)` → integer

The group, with the error bit: `code & RES.GRP`.

```js
RES.GRP_GET(0x80090008)    // 0x80090000
```

### RES.SUB_GET

`RES.SUB_GET(code)` → integer

The sub code, with the error bit: `code & RES.SUB`.

```js
RES.SUB_GET(0x80090008)    // 0x80000008
```

### RES.grp_str

`RES.grp_str(code)` → text

The group's name.

```js
RES.grp_str(0x80090008)    // "ERR_EXECUTE"
RES.grp_str(0x00040006)    // "INF_READ"
RES.grp_str(0)             // "INF_COMMON"
RES.grp_str(RES.INF_EQU)   // "INF_EQU"
```

### RES.sub_str

`RES.sub_str(code)` → text

The sub code's name; `""` for 0.

```js
RES.sub_str(0x80090008)    // "PARAMETER"
RES.sub_str(21)            // "CONTINUE"
```

The four functions return `undefined` without exactly one argument.

Their main use is the error a `try` catches from a built-in function: `e.res` is the
code, `e.message` the reason, `e.fnc` the function.

```js
try { BYTES.u16be([1]); }
catch (e) {
    // e = {"res":2148073480,"message":"BYTES: 2 bytes at 0, the array has 1","fnc":"u16be"}
    evt.Log(LOG.WARN, RES.grp_str(e.res) + " " + RES.sub_str(e.res) + ": " + e.message);
    // ERR_EXECUTE PARAMETER: BYTES: 2 bytes at 0, the array has 1
}
```
