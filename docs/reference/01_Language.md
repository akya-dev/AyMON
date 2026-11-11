# Language

The built-in values and the functions that work on them: the global functions,
`Math`, `Number`, `String`, `Array`, `Object`, `JSON`, `Buffer`, and the methods every
value answers (`toINT`, `toSTR`, `toDEC`, `toDTM` ...). The ideas behind them, and the
places where the language is not JavaScript, are in [Scripting](../03_Scripting.md);
read that first. Every result below was measured on engine 4.4.2.702.

* [Types and literals](#types-and-literals)
* [Global functions](#global-functions)
* [Math](#math)
* [Number](#number)
* [String](#string)
* [Array](#array)
* [Object](#object)
* [JSON](#json)
* [Buffer](#buffer)
* [Value methods](#value-methods)

---

## Types and literals

Every value carries a type word. It is the same code you write in an attribute's
`val_typ`, without the top nibble that says how the attribute behaves
([Timers and events](../02_Timers_and_Events.md#the-bits-that-decide-whether-val_fnc-runs)).

| Code | Type | A script meets it as |
|---|---|---|
| `0x0000` | undefined | a missing variable, member or argument; `undefined` |
| `0x0101` `0x0102` `0x0104` `0x0108` | unsigned 8 / 16 / 32 / 64 bit | an unsigned attribute; **a hex literal** (`0x10` is `0x0108`) |
| `0x0111` | boolean (one bit) | `true`, `false`, most `is...` answers |
| `0x0141` .. `0x0148` | unsigned, shown in hex | `sta` (`0x0142`); prints as `0x0303` |
| `0x0201` `0x0202` `0x0204` `0x0208` | signed 8 / 16 / 32 / 64 bit | **an integer literal** (`5` is `0x0208`) |
| `0x0304` `0x0308` | float 32 / 64 bit | **a literal with a point or an exponent** (`2.5`, `1e3`) |
| `0x030C` | decimal | `"12.50".toDEC()` |
| `0x0244` `0x0248` `0x0254` `0x0258` | date, time, time of day, duration | `toDATE()`, `toDTM()`, `toTIME()`, `toDUR()`, `Time.now()` |
| `0x0401` `0x0402` | text, UTF-8 / UTF-16 | `"abc"`, `'abc'`; an attribute with no `val_typ` |
| `0x0411` `0x0412` `0x0414` `0x0418` | buffer of 8 / 16 / 32 / 64-bit units | `CODEC.HEX_dec(..)`, `Buffer.create(..)` |
| `0x0500` | null | `null` |
| `0x050A` | array | `[1, 2]` |
| `0x050B` | object (hash) | `{a: 1}` |
| `0x050E` | blob | `Blob.from(..)` |

How a literal gets its type:

```js
5            // 0x0208 signed 64-bit
-5           // 0x0208: unary minus on a signed integer
2.5          // 0x0308
1e3          // 0x0308, 1000
007          // 0x0208, 7 (no octal)
0x10         // 0x0108 UNSIGNED 64-bit
-0x10        // 18446744073709551600: minus on an unsigned value wraps
0 - 0x10     // -16: the left operand is signed
true         // 0x0111
"x"  'x'     // 0x0401, either quote; escapes \t \n \" \\ \uXXXX
null         // 0x0500
```

`.5` is a syntax error; write `0.5`.

`typeof` answers as in JavaScript:

| Value | `typeof` |
|---|---|
| undefined | `"undefined"` |
| `true`, `false` | `"boolean"` |
| text | `"string"` |
| integer, float, hex, decimal, time | `"number"` |
| array, object, `null`, buffer, element | `"object"` |
| a script function, a built-in function (`Math.round`) | `"function"` |

`Object.type(v)` gives the type word itself, but with run-time bits the engine
keeps in it: `Object.type("ab")` is `0x2421`, `Object.type({})` `0x0D8B`. For a
number the low byte is the plain code (`0x0208`, `0x0308`). To test the class, mask
it: `Object.type(v) & 0x0700` is `0x0100` unsigned, `0x0200` signed, `0x0300` float or
decimal, `0x0400` text or buffer, `0x0500` array, object or null.

### Arithmetic follows the left operand

The left operand's type decides the result: [Scripting, difference 1](../03_Scripting.md#eight-places-this-is-not-javascript).
What that means in detail, measured:

```js
7 / 2          // 3
7.0 / 2        // 3.5
1 + 0.5        // 2: an integer left rounds the right operand for + - %
3 * 0.5        // 1: ... and computes * / in float, then cuts the fraction
10 % 4.5       // 0: 4.5 became 5
2 * Math.PI    // 6
Math.PI * 2    // 6.28318530717959
1 + "5"        // "15": text on either side of + joins
"5" * 2        // "5": text on the left keeps the text
2 * "5"        // 10: text on the right is read as a number
true + 1       // 0: a boolean stays one bit
5 / 0          // 0, 5.0 / 0 is 0 too
9223372036854775807 + 1   // -9223372036854775808: no overflow error
-16 >>> 28     // 68719476735: shifts are 64-bit
```

An unsigned value never goes negative; a hex value stays hex; an `undefined` compares
oddly: differences 3, 4 and 7 in [Scripting](../03_Scripting.md#eight-places-this-is-not-javascript).
Two more of the same kind:

* **A `.length` is unsigned.** `"abc".length - 5` is `18446744073709551614`, so
  `for (var i = s.length - 1; i >= 0; i--)` never ends. Count up, or write
  `s.length.toINT() - 1`.
* **A comparison answers 1 or 0 in the left operand's type.** `'a' == 'a'` is a
  boolean, `1 == 1.0` the integer `1`. It does not matter in an `if`; it shows in
  JSON: `JSON.stringify({t: 1 == 1})` is `{"t":1}`.

Floats print with 15 significant digits and no exponent until the number is very
large or very small: `0.1 + 0.2` prints `0.3`, `123456789.123456789` prints
`123456789.123457`. Text joined to anything else: `"n=" + 5 + 2.5` is `"n=52.5"`,
`"" + null` is `"null"`, `"" + undefined` is `""`, `"" + [1]` is `"<OARRAY>"`,
`"" + {a: 1}` is `"<OHASH>"`; use `JSON.stringify` for those.

---

## Global functions

Called bare, with no scope in front: `parseInt(x)`. `Global.help` lists them.

### parseInt

`parseInt(v [, radix])` → integer, or NaN

Reads the integer at the start of a text, the way JavaScript does: leading blanks
are skipped, one sign is taken, a `0x` prefix means hex, reading stops at the first
character that is not a digit.

| Argument | Meaning |
|---|---|
| `v` | text to read, or a number |
| `radix` | 2 .. 36. Absent or 0: 10, or 16 with a `0x` prefix. Out of range: 10 |

Returns a signed 64-bit integer; NaN when not one digit was read, or for `null` and
`undefined`; undefined with no argument. A float is cut toward zero (`parseInt(7.9)` is
`7`), but **an integer comes back unchanged, type and all**: `parseInt(u)` of an unsigned
`u` is still unsigned, and a boolean stays a boolean. Too many digits wrap silently.

```js
parseInt("42")          // 42
parseInt("12px")        // 12
parseInt("  -0x1A")     // -26
parseInt("1F", 16)      // 31
parseInt("101", 2)      // 5
parseInt("0x1F", 10)    // 0: the radix says decimal, "0x" is not a number
parseInt("-7.9")        // -7
parseInt("abc")         // NaN
parseInt(-7.9)          // -7: a float is cut toward zero
parseInt(true)          // true: an integer comes back as it was
parseInt("" + u) - 5    // -2 for an unsigned u = 3; parseInt(u) - 5 wraps
```

### parseFloat

`parseFloat(v)` → float, or NaN

Reads the decimal number at the start of a text: blanks, a sign, digits, one point,
an exponent with at least one digit after it.

Returns a 64-bit float; NaN when there is no number, for `null`, `undefined` and
anything that is not text or a number. A number is turned into a float; NaN and the
infinities pass through.

```js
parseFloat("3.14abc")    // 3.14
parseFloat("  -2.5e3x")  // -2500
parseFloat(".5")         // 0.5
parseFloat("1e")         // 1: an exponent needs a digit
parseFloat("1,5")        // 1: no comma decimals
parseFloat("Infinity")   // NaN, not Infinity
parseFloat(true)         // 1
```

An attribute with no `val_typ` holds text (`"5"`), and `Math` does not read text:
`Math.round(v)` of it is NaN, `Math.round(parseFloat(v))` is `5`.

### isNaN

`isNaN(v)` → boolean

True when `v` is NaN, or does not start with a number when read as `parseFloat`
would. Unlike JavaScript, the empty text, `null` and `undefined` are NaN here.

```js
isNaN("abc")            // 1
isNaN("12px")           // 0: it starts with a number
isNaN("")               // 1 (JavaScript says false)
isNaN(null)             // 1 (JavaScript says false)
isNaN(Math.sqrt(-1))    // 1
isNaN()                 // 1
```

### isFinite

`isFinite(v)` → boolean

True when `v` reads as a number and is not NaN or an infinity.

```js
isFinite("12")          // 1
isFinite(Math.log(0))   // 0: -Infinity
isFinite("abc")         // 0
isFinite(5 / 0)         // 1: 5 / 0 is 0 here
isFinite()              // 0
```

### debug

`debug(v)` → undefined

Does nothing. It is a fixed point to stop at when the engine itself runs under a
native debugger; a script has no use for it.

### addressOf

`addressOf(v)` → unsigned 64-bit, hex

The raw 64 bits the value holds: for an array or object the address of its body, for
a small number the number itself (`addressOf(5)` is `0x0000000000000005`). The one use:
to see whether two variables hold the same array or object.

```js
var a = [1];  var b = a;  var c = [1];
addressOf(a) == addressOf(b)    // 1: one array, two names
addressOf(a) == addressOf(c)    // 0
```

---

## Math

Numbers in, numbers out. **Text is not read as a number**: `Math.round("2.6")` is NaN,
`Math.abs("-3")` is `0`. Convert first (`parseFloat`, `toFLT`).

What stays an integer, measured:

| Function | Integer in | Float in | Decimal in | Text in |
|---|---|---|---|---|
| `abs` | the same type | float | decimal | `0` (unsigned 32-bit) |
| `floor` `ceil` `round` `trunc` | **unchanged**, type kept (`sta` stays hex) | signed 64-bit integer | integer | NaN |
| `sign` | signed 32-bit | signed 32-bit | signed 32-bit | NaN |
| `min` `max` | the winning argument as it was | as it was | as it was | NaN |
| `pow` `sqrt` `log` `log10` `exp`, trigonometry, `random` | float | float | float | NaN |

A missing argument gives undefined. The irrational results are 64-bit floats; NaN
and the infinities come back as such, and `isNaN` / `isFinite` see them.

### Math.abs

`Math.abs(v)` → same type as `v`

Absolute value. Exactly one argument; with none or two the result is undefined.

```js
Math.abs(-5)                  // 5
Math.abs(-2.5)                // 2.5
Math.abs("-1.50".toDEC())     // 1.50: a decimal stays exact
Math.abs("-3")                // 0: text is not a number to Math
Math.abs(-0x10)               // 18446744073709551600: -0x10 was never negative
```

### Math.floor

`Math.floor(v)` → integer

The largest integer not above `v`. A float becomes a signed 64-bit integer; an
integer comes back unchanged; beyond 64 bits the result stays a float.

```js
Math.floor(2.7)     // 2
Math.floor(-2.1)    // -3
```

### Math.ceil

`Math.ceil(v)` → integer

The smallest integer not below `v`.

```js
Math.ceil(2.1)      // 3
Math.ceil(-2.7)     // -2
```

### Math.round

`Math.round(v)` → integer

Rounds to the nearest integer; a half goes up, toward plus infinity, as in JavaScript.
The result is an integer, so dividing it divides as integers.

```js
Math.round(2.5)                       // 3
Math.round(-2.5)                      // -2
Math.round(-2.6)                      // -3
Math.round("2.345".toDEC())           // 2: exact, no float in between
Math.round(21.47 * 10) / 10           // 21: integer division
(0.0 + Math.round(21.47 * 10)) / 10   // 21.5
```

To round a stored value to a step, the attribute function `ATR.rou` is simpler
([ATR.rou](04_Attribute_and_Element_Functions.md#atrrou)).

### Math.trunc

`Math.trunc(v)` → integer

Drops the fraction: toward zero.

```js
Math.trunc(2.7)     // 2
Math.trunc(-2.7)    // -2
```

### Math.sign

`Math.sign(v)` → signed 32-bit integer

`-1`, `0` or `1`; NaN for NaN or text.

```js
Math.sign(-3.2)     // -1
Math.sign(0)        // 0
```

### Math.min

`Math.min(a, b, ..)` → the smallest argument

Any number of arguments. The winning argument is returned as it was, type included.
Any text argument, even `"5"`, or a NaN makes the result NaN; no argument gives
undefined. A decimal is compared exactly.

```js
Math.min(3, 1, 2)       // 1 (integer)
Math.min(3, 1.5, 2)     // 1.5 (float)
Math.min(u, 2)          // 2, for an unsigned u = 3
```

### Math.max

`Math.max(a, b, ..)` → the largest argument

As `Math.min`.

```js
Math.max(1, 2.5)        // 2.5
Math.max(1, "5")        // NaN: text is not a number here
Math.max(2)             // 2
Math.max()              // undefined
```

### Math.pow

`Math.pow(a, b)` → float

`a` to the power `b`. Always a float, even for integers. There is no `**` operator:
`2 ** 3` is a syntax error.

```js
Math.pow(2, 10)         // 1024 (float)
Math.pow(2, 0.5)        // 1.4142135623731
Math.pow(2)             // undefined
```

### Math.sqrt

`Math.sqrt(v)` → float

Square root; NaN for a negative number.

```js
Math.sqrt(16)                 // 4
Math.sqrt(-1)                 // NaN
Math.sqrt(-1) == Math.sqrt(-1)   // 0: NaN equals nothing
```

### Math.log

`Math.log(v)` → float

Natural logarithm. `Math.log(0)` is -Infinity, a negative number gives NaN.

```js
Math.log(Math.E)    // 1
Math.log(0)         // -Infinity
```

### Math.log10

`Math.log10(v)` → float

Base-10 logarithm, with `log`'s rules. There is no `log2`: `Math.log(x) / Math.LN2`.

```js
Math.log10(1000)    // 3
```

### Math.exp

`Math.exp(v)` → float

e to the power `v`.

```js
Math.exp(1)         // 2.71828182845905
```

### Math.sin

`Math.sin(v)` → float. Sine of `v` radians. `Math.sin(Math.PI / 2)` is `1`.

### Math.cos

`Math.cos(v)` → float. Cosine of `v` radians. `Math.cos(0)` is `1`.

### Math.tan

`Math.tan(v)` → float. Tangent of `v` radians. `Math.tan(Math.PI / 4)` is `1`.

### Math.asin

`Math.asin(v)` → float, radians. `Math.asin(1)` is `1.5707963267949`; outside -1 .. 1, NaN.

### Math.acos

`Math.acos(v)` → float, radians. `Math.acos(1)` is `0`.

### Math.atan

`Math.atan(v)` → float, radians. `Math.atan(1)` is `0.785398163397448`.

### Math.atan2

`Math.atan2(y, x)` → float, radians

The angle of the point `(x, y)`, -π .. π. Note the order: `y` first. With one argument,
undefined.

```js
Math.atan2(1, 1)    // 0.785398163397448
```

### Math.random

`Math.random()` → float, 0 ≤ r < 1

A fast generator, one per engine thread, seeded on first use; it is not for keys
or tokens.

```js
var r = Math.random();                 // 0.317360532277319
var die = 1 + Math.floor(Math.random() * 6);
```

### Math constants

| Name | Value |
|---|---|
| `Math.PI` | 3.14159265358979 |
| `Math.E` | 2.71828182845905 |
| `Math.LN2` | 0.693147180559945 |
| `Math.LN10` | 2.30258509299405 |
| `Math.SQRT2` | 1.4142135623731 |

All floats. `SQRT1_2`, `LOG2E`, `LOG10E`, `cbrt`, `hypot`, `log2` do not exist (they
read as undefined).

---

## Number

Formatting and testing numbers. Each function also works as a method on a number
value, `(3.14159).toFixed(2)`, `x.isInteger()`: a number has no such member of its
own, so the call reaches `Number` with the number as the first argument. On a
**text** value the method form fails ("function not found"), while the call form reads
the text: `Number.toFixed(v, 1)` works for an untyped attribute, `v.toFixed(1)` does not.

### Number.toFixed

`Number.toFixed(v, digits)` → text

`v` written with exactly `digits` digits after the point.

| Argument | Meaning |
|---|---|
| `v` | a number, or text that starts with one |
| `digits` | 0 .. 20; absent or negative: 0, above 20: 20 |

Returns `"NaN"` when `v` is no number, `"Infinity"` / `"-Infinity"` for those. The
rounding is the float's own: the stored value decides, and **an exact half goes to
the even digit**, unlike `Math.round`.

```js
Number.toFixed(3.14159, 2)    // "3.14"
(2.5).toFixed(3)              // "2.500"
Number.toFixed(5, 2)          // "5.00"
Number.toFixed("7.1", 3)      // "7.100"
Number.toFixed(2.5, 0)        // "2": a half to even
Number.toFixed(0.125, 2)      // "0.12": the same
Number.toFixed(2.345, 2)      // "2.35": 2.345 is stored a little above
Number.toFixed(sta, 1)        // "771.0" for sta = 0x0303
```

Used in [PRJPER_adsb](../../examples/hobby/PRJPER_adsb/) to write positions to five places.

### Number.toString

`Number.toString(v [, radix])` → text

`v` in base `radix`, 2 .. 36, lower case, a minus sign for a negative number. Outside
base 10 only the integer part is written, and only up to 64 bits. Radix absent, 10 or
out of range: the ordinary text.

```js
Number.toString(255, 16)      // "ff"
Number.toString(255, 2)       // "11111111"
Number.toString(-255, 16)     // "-ff"
Number.toString(2.7, 16)      // "2": the fraction is dropped
Number.toString(sta, 16)      // "303" for sta = 0x0303
```

**The method form is not this function.** A number has a `toString` of its own (the
same as [`toSTR`](#valuetostr)): it writes letters in **upper** case, and base 16 of a
negative number is its 64-bit two's complement.

```js
(255).toString(16)            // "FF"
(255).toString(2)             // "11111111"
(-255).toString(36)           // "-73"
(0).toString(16)              // "0"
```

Before 4.4.2.703 the method form knew base 16 only (`(255).toString(2)` was `"255"`)
and zero wrote nothing (`(0).toString(16)` was `""`).

### Number.isInteger

`Number.isInteger(v)` → boolean

True for an integer value, and for a float or decimal with no fraction. Text is never
an integer (no conversion); a boolean counts as one.

```js
Number.isInteger(5)               // 1
Number.isInteger(5.0)             // 1
Number.isInteger(5.5)             // 0
Number.isInteger("5")             // 0
Number.isInteger("12.00".toDEC()) // 1
```

### Number.isNaN

`Number.isNaN(v)` → boolean. The same function as the global [`isNaN`](#isnan): it
reads text first, so `Number.isNaN("abc")` is `1` (JavaScript says false).

### Number.isFinite

`Number.isFinite(v)` → boolean. The same function as the global [`isFinite`](#isfinite):
`Number.isFinite("12")` is `1`.

### Number.parse

`Number.parse(v)` → float. The same function as [`parseFloat`](#parsefloat):
`Number.parse("2.5x")` is `2.5`.

### Number constants

| Name | Value | Note |
|---|---|---|
| `Number.MAX_SAFE_INTEGER` | 9007199254740991 | a float; prints `9007199254740990` (15 digits) |
| `Number.MIN_SAFE_INTEGER` | -9007199254740991 | a float |
| `Number.EPSILON` | 2.220446049250313e-16 | prints `0.000000000000000222044604925031` |
| `Number.MAX_VALUE` | 1.7976931348623157e308 | prints `1.79769313486232e+308` |
| `Number.MIN_VALUE` | 5e-324 | prints `4.94065645841247e-324` |

There is no `Number.NaN` or `Number.POSITIVE_INFINITY`; `Math.sqrt(-1)` and
`Math.log(0)` make them if you need one.

---

## String

Text functions. Each one works in two forms that give the same result:

```js
var s = "Hello, World";
s.substr(7, 3)             // "Wor": method form
String.substr(s, 7, 3)     // "Wor": call form
```

**Positions and lengths count characters**, also outside ASCII; only `size` counts
bytes. `replace` changes every match. Text is a value: `t = s` copies, and no
function changes `s` itself.

The call form reads a number as its text for `length`, `size`, `substr`, `indexOf`,
`replace`, `padStart`, `toUpperCase` and `toLowerCase` (`String.substr(12345, 1, 2)` is
`"23"`); the other functions give an empty result for a number. The method form needs
text: `(5).padStart(3, "0")` fails ("function not found"), `("" + 5).padStart(3, "0")`
is `"005"`.

**`s[i]` is not a character.** It is the byte at byte position `i`, as a number:
`"Hello"[0]` is `72`, and in `"Çay"` `[1]` is `135`, the second byte of `Ç`. Use
`s.charAt(i)`, `s.at(i)` or `s.substr(i, 1)` for a character, `s.charCodeAt(i)` for its
code.

Text compares by bytes: `"a" < "b"` is true, and so is `"10" < "9"`.

### String.length

`String.length(s)` / `s.length` → unsigned 64-bit

The number of characters.

```js
"Hello, World".length    // 12
"Çay şekeri".length      // 10
String.length(12345)     // 5
```

The result is unsigned: `s.length - 1` on an empty text is a huge number, and a loop
counting down from it never ends. See [Arithmetic](#arithmetic-follows-the-left-operand).

### String.size

`String.size(s)` / `s.size` → unsigned 32-bit

The number of bytes in UTF-8 (UTF-16 units for UTF-16 text).

```js
"Çay şekeri".size        // 12: Ç and ş take two bytes each
```

### String.substr

`String.substr(s, pos [, len])` / `s.substr(pos [, len])` → text

`len` characters from character `pos`; without `len`, to the end.

```js
"Hello, World".substr(7)       // "World"
"Hello, World".substr(7, 3)    // "Wor"
"Çay şekeri".substr(4, 2)      // "şe"
"Hello, World".substr(-5)      // "": a negative position is not from the end
"Hello, World".substr(50)      // ""
```

For "from the end", use `slice`.

### String.slice

`String.slice(s, beg [, end])` / `s.slice(beg [, end])` → text

Characters from `beg` up to, not including, `end`. A negative index counts from the
end.

```js
"Hello, World".slice(-5)       // "World"
"Hello, World".slice(0, -7)    // "Hello"
String.slice("abcdef", 2, -1)  // "cde"
```

### String.substring

`String.substring(s, a [, b])` / `s.substring(a [, b])` → text

As `slice`, but a negative index counts as 0, and two ends the wrong way round are
swapped.

```js
"Hello, World".substring(5, 0)    // "Hello"
"Hello, World".substring(-3, 2)   // "He"
```

### String.at

`String.at(s, i)` / `s.at(i)` → text

The character at `i`; a negative `i` counts from the end. Out of range: `""`.

```js
"Hello, World".at(-1)    // "d"
"Çay".at(1)              // "a"
```

### String.charAt

`String.charAt(s, i)` / `s.charAt(i)` → text

The character at `i` (no negative index). Out of range: `""`.

```js
"Hello".charAt(1)        // "e"
"Hello".charAt(99)       // ""
```

### String.charCodeAt

`String.charCodeAt(s, i)` / `s.charCodeAt(i)` → unsigned 32-bit, or NaN

The Unicode code point of the character at `i`, a whole code point even above
0xFFFF. Out of range: NaN.

```js
String.charCodeAt("A", 0)    // 65
"Çay".charCodeAt(0)          // 199
```

### String.codePointAt

`String.codePointAt(s, i)` / `s.codePointAt(i)`. The same as `charCodeAt`, which
already answers code points.

### String.fromCharCode

`String.fromCharCode(c1, c2, ..)` → text

Text made of the code points given; one above 0xFFFF is one character. No argument:
`""`.

```js
String.fromCharCode(72, 105, 351)     // "Hiş"
String.fromCharCode(128512)           // "😀", length 1
```

### String.indexOf

`String.indexOf(s, find [, from])` / `s.indexOf(find [, from])` → signed integer

The character position of the first `find`, at or after `from`; -1 when absent. A
negative `from` is 0. A number to find is read as its text. Searching for `""` gives -1.

```js
"Hello, World".indexOf("o")       // 4
"Hello, World".indexOf("o", 5)    // 8
"Çay şekeri".indexOf("ş")         // 4: characters, not bytes
"a5b".indexOf(5)                  // 1
```

### String.lastIndexOf

`String.lastIndexOf(s, find [, from])` / `s.lastIndexOf(find [, from])` → signed integer

The character position of the last `find`; -1 when absent. `from` is the last
position a match may start at (below 0 counts as 0), as in JavaScript.

```js
"Hello, World".lastIndexOf("o")   // 8
"a.b.c".lastIndexOf(".", 2)       // 1
"a.b.c".lastIndexOf(".", 0)       // -1
```

Before 4.4.2.703 a third argument made it answer -1 whatever the text.

### String.includes

`String.includes(s, find)` / `s.includes(find)` → boolean. True when `find` occurs
anywhere. A position argument is ignored: `"abc".includes("a", 1)` is `1`.

### String.startsWith

`String.startsWith(s, find)` / `s.startsWith(find)` → boolean.
`"Hello".startsWith("Hell")` is `1`.

### String.endsWith

`String.endsWith(s, find)` / `s.endsWith(find)` → boolean.
`"World".endsWith("ld")` is `1`.

### String.replace

`String.replace(s, find, repl)` / `s.replace(find, repl)` → text

`s` with **every** `find` replaced by `repl` (JavaScript replaces the first). Numbers
are read as text. Both arguments are needed: with one, or with an empty `find`, the
result is undefined. There are no regular expressions.

```js
"aXbXc".replace("X", "-")          // "a-b-c"
String.replace("a.b.c", ".", "/")  // "a/b/c"
"a1b1".replace(1, 2)               // "a2b2"
"ab".replace("", "x")              // undefined
```

### String.replaceAll

`String.replaceAll(s, find, repl)` / `s.replaceAll(find, repl)` → text. The same
function as `replace`.

### String.toUpperCase

`String.toUpperCase(s)` / `s.toUpperCase()` → text

Upper case, by the operating system's rules for the machine's language setting, so
`i` and `ı` can come out differently on another machine. Any argument gives `""`.

```js
"Çay şekeri".toUpperCase()    // "ÇAY ŞEKERI" on an English-language machine
```

### String.toLowerCase

`String.toLowerCase(s)` / `s.toLowerCase()` → text. Lower case, with `toUpperCase`'s
rules: `"IŞIK".toLowerCase()` is `"işik"` on an English-language machine.

### String.trim

`String.trim(s)` / `s.trim()` → text

`s` without the spaces, tabs, CR and LF at both ends. Other blanks (a no-break space)
stay.

```js
"  x  ".trim()        // "x"
```

### String.trimStart

`String.trimStart(s)` / `s.trimStart()` → text. Only the start: `"  x  "` → `"x  "`.

### String.trimEnd

`String.trimEnd(s)` / `s.trimEnd()` → text. Only the end: `"  x  "` → `"  x"`.

### String.padStart

`String.padStart(s, len [, fill])` / `s.padStart(len [, fill])` → text

`s` with `fill` (a space by default) repeated in front until it is `len` long.

```js
"7".padStart(3, "0")       // "007"
"7".padStart(3)            // "  7"
"7".padStart(5, "ab")      // "abab7"
"hello".padStart(5, "0")   // "hello"
```

`len` counts characters (`"ş".padStart(3, "0")` is `"00ş"`), a longer `s` comes back
unchanged, and an empty `fill` leaves `s` alone.

Before 4.4.2.703 two traps: `len` counted **bytes** (`"0ş"`), and when `s` was already
longer than `len` the result was the **fill** (`"hello".padStart(3, "0")` was `"0"`).

### String.padEnd

`String.padEnd(s, len [, fill])` / `s.padEnd(len [, fill])` → text

`fill` (a space by default) added at the end until `s` is `len` characters long. A
longer `s` comes back unchanged.

```js
"7".padEnd(3, "0")      // "700"
"ş".padEnd(3, ".")      // "ş.."
```

### String.repeat

`String.repeat(s, n)` / `s.repeat(n)` → text

`s` `n` times. `n` of 0 or less, or a result over 16 MiB: `""`.

```js
"ab".repeat(3)          // "ababab"
```

### String.concat

`String.concat(a, b, ..)` / `a.concat(b, ..)` → text

The arguments joined, each read as text.

```js
"a".concat("b", 1, 2.5)    // "ab12.5"
```

### String.split

`String.split(s [, sep])` / `s.split(sep)` → array of text

`s` cut at every `sep`. Two separators side by side give an empty element. Without a
separator, **or with an empty one**, the whole text is one element (JavaScript splits
into characters). A limit argument is ignored.

```js
"Hello, World".split(", ")   // ["Hello","World"]
"a,,b".split(",")            // ["a","","b"]
"abc".split("")              // ["abc"]
"".split(",")                // [""]
```

### String.utf8

`String.utf8(s)` → text in UTF-8. The same text; only the encoding changes.

### String.utf16

`String.utf16(s)` → text in UTF-16. `String.fromCharCode` already returns UTF-16; you
rarely need either.

---

## Array

`[a, b, c]` makes an array (type `0x050A`). **An array is shared, not copied**: `b = a`
gives the same array two names, and a function that changes it changes it for every
holder. Arrays can hold anything, other arrays included (`m[1][0]`).

```js
var a = [3, 1, 2];
var b = a;
b.push(99);
a                    // [3,1,2,99]
a[0]                 // 3
a[9]                 // undefined
a[5] = "x";          // grows the array; the gap holds undefined (null in JSON)
delete a[0];         // removes the element and closes the gap
for (var k in a) {}  // k = 0, 1, 2 ..
```

Two differences from JavaScript: **`a.length = 2` does nothing** (use `a.resize(2)`),
and **`a.length` is unsigned**, so `for (var i = a.length - 1; i >= 0; i--)` never ends;
write `a.length.toINT() - 1`.

An array also answers these members of its own:

| Member | Does | Returns |
|---|---|---|
| `a.length` | number of elements | unsigned 32-bit |
| `a.size` | room before the next allocation | unsigned 32-bit |
| `a.resize(n)` | cut to `n`, or grow with undefined | 0 |
| `a.ins(pos, n)` | insert `n` undefined at `pos` | 0 |
| `a.del(pos, n)` | remove `n` from `pos` | 0 |
| `a.put(pos, v)` | replace element `pos` (it must exist) | 0, another number when `pos` is past the end |
| `a.push(v)` | append one value | 0 |

There is no `a.get(i)` (it answers undefined): read `a[i]`.

The functions below work in both forms, `a.slice(1)` and `Array.slice(a, 1)`. Those
that read or change an array answer undefined for any other value.

### Array.push

`Array.push(a, v1, v2, ..)` / `a.push(v1, ..)` → result code

Appends the values. **Returns 0 (done), not the new length.**

```js
var a = [1];
a.push(5)               // 0
Array.push(a, 7, 8);    // a is [1,5,7,8]
```

### Array.pop

`Array.pop(a)` / `a.pop()` → the last element, or undefined when empty. Removes it.

### Array.shift

`Array.shift(a)` / `a.shift()` → the first element, or undefined when empty. Removes it.

### Array.unshift

`Array.unshift(a, v1, ..)` / `a.unshift(v1, ..)` → the new length

Puts the values in front, in their order.

```js
var a = [1, 2];
a.unshift(0, -1)        // 4; a is [0,-1,1,2]
```

### Array.slice

`Array.slice(a, beg [, end])` / `a.slice(beg [, end])` → a new array

A copy of the elements from `beg` up to, not including, `end`; negative counts from
the end. `a` is not changed.

```js
[0, -1, 1, 2, 10].slice(1, 3)   // [-1,1]
[0, -1, 1, 2, 10].slice(-2)     // [2,10]
```

### Array.splice

`Array.splice(a, start [, count [, v1, ..]])` / `a.splice(..)` → the removed elements

Removes `count` elements from `start` (without `count`: all from `start` on) and puts
the values in their place.

```js
var a = [0, -1, 1, 2];
a.splice(1, 2)            // [-1,1]; a is [0,2]
a.splice(1, 0, "x", "y")  // []; a is [0,"x","y",2]
```

### Array.join

`Array.join(a [, sep])` / `a.join(sep)` → text

The elements as text with `sep` between them (`,` by default). An undefined element
gives nothing, `null` gives `"null"`, an array or object inside gives `"<OARRAY>"` /
`"<OHASH>"`.

```js
[0, "x", 2].join()          // "0,x,2"
[0, "x", 2].join(" | ")     // "0 | x | 2"
[1, null, "z"].join("-")    // "1-null-z"
```

### Array.indexOf

`Array.indexOf(a, v)` / `a.indexOf(v)` → signed integer

The position of the first element equal to `v`, -1 when none. Equal means `==`: a
number matches the same number of any width and its text, and **text that is not a
number matches 0**. A start position is ignored.

```js
var a = [0, "x", 99];
a.indexOf(99)       // 2
a.indexOf("99")     // 2
a.indexOf("x")      // 0: "x" read as a number is 0, and a[0] is 0
```

### Array.includes

`Array.includes(a, v)` / `a.includes(v)` → boolean. Whether `indexOf` finds `v`, with
its rules.

### Array.reverse

`Array.reverse(a)` / `a.reverse()` → the same array, reversed in place.
`[1, 2, 3].reverse()` is `[3,2,1]`.

### Array.sort

`Array.sort(a)` / `a.sort()` → the same array, sorted in place

**Ascending by value**: numbers as numbers, text by its bytes (upper case before lower
case), a number before a text that holds a larger number. There is no comparator
argument.

```js
[10, 9, 1].sort()          // [1,9,10]: JavaScript would give [1,10,9]
["b", "a", "C"].sort()     // ["C","a","b"]
[2, "10", 1].sort()        // [1,2,"10"]
```

### Array.concat

`Array.concat(a, x1, ..)` / `a.concat(x1, ..)` → a new array

`a` followed by the arguments; an array argument is opened one level.

```js
[1, 2].concat([3, [4]], 5)    // [1,2,3,[4],5]
```

### Array.length

`Array.length(x)` → unsigned integer

The elements of an array, the keys of an object, the characters of a text.

```js
Array.length([1, 2, 3])       // 3
Array.length({a: 1, b: 2})    // 2
Array.length("şu")            // 2
```

### Array.isArray

`Array.isArray(x)` → boolean. `1` for an array, `0` for anything else, never an
error. The same function as `Object.isArray`.

### Array.create

`Array.create(typ, n)` → array

An array of `n` undefined elements. `typ` is read but has no effect; it is there for
old scripts.

```js
var t = Array.create(0x0208, 2);    // [null,null] in JSON
```

### Array.ins

`Array.ins(a, pos, n)` → `a`

Inserts `n` undefined elements at `pos` and returns the same array (changed for every
holder). With two arguments it does nothing and answers undefined.

### Array.del

`Array.del(a, pos, n)` → `a`

Removes `n` elements from `pos` and returns the same array.

### Array.put

`Array.put(a, pos, v)` → `a`

Writes `v` to element `pos` and returns the same array. A `pos` past the end changes
nothing. Three arguments: there is no bit offset.

```js
var t = Array.create(0, 2);
Array.put(t, 1, 42);        // t is [null,42]
```

### Array.get

`Array.get(a, pos, typ)` → the element

Element `pos`. Past the end it answers an empty value of type `typ` (`0` for
`0x0208`). `a[pos]` is the simpler form.

```js
Array.get(t, 1, 0x0208)     // 42
```

---

## Object

`{a: 1, b: "two"}` makes an object (a hash, type `0x050B`). Like an array **it is shared**:
`o2 = o` is the same object. Keys keep the order they were added in.

```js
var o = {a: 1, b: "two", c: [1, 2]};
o.a               // 1
o["b"]            // "two"
o.zz              // undefined
o.d = 4.5;        // adds a key
delete o.a;       // removes one
o.length          // 3: the number of keys (a key called "length" wins)
o.keys()          // '["b","c","d"]': TEXT, see Object.keys
for (var k in o) {}           // b, c, d in that order
o?.zz?.y                      // undefined, no error
```

### Object.type

`Object.type(v)` → unsigned 16-bit, hex

The value's type word, run-time bits included; see
[Types and literals](#types-and-literals). Undefined with no argument.

```js
Object.type(5)                 // 0x0208
Object.type(2.5)               // 0x0308
Object.type(null)              // 0x0500
Object.type(undefined)         // 0x0000
Object.type({}) & 0x0700       // 0x0500
```

### Object.isArray

`Object.isArray(x)` → boolean

`1` for an array, `0` for anything else, never an error. `typeof` says `"object"` for
both an array and an object, and both answer `.length`, so this is the test that tells
them apart.

```js
Object.isArray([])      // 1
Object.isArray({})      // 0
```

### Object.length

`Object.length(x)` → unsigned 32-bit

The keys of an object, the elements of an array. An element object answers 0.

```js
Object.length({a: 1, b: 2})    // 2
Object.length([1, 2])          // 2
```

### Object.keys

`Object.keys(o)` / `o.keys()` → **text**

The keys of an object as **JSON text**, not as an array. Parse it to get an array.
Anything but an object, an array included, gives `"[]"`.

```js
var o = {b: "two", c: 1};
Object.keys(o)                     // '["b","c"]'
typeof Object.keys(o)              // "string"
var ks = JSON.parse(o.keys());     // ["b","c"]
ks.length                          // 2
```

A key holding a quote is not escaped (`{'k"q': 1}` gives `["k"q"]`, which does not
parse). `for (var k in o)` walks the keys without the round trip.

### Object.item

`Object.item(o, i)` → the value at position `i`

The value of the `i`-th key, counting from 0 in the order the keys were added, of an
object made by `{..}` or `Object.create(0x50B)`. Past the end or on any other value:
undefined.

```js
var o = {b: "two", c: [1, 2]};
Object.item(o, 0)     // "two"
Object.item(o, 1)     // [1,2]
```

### Object.toUNS

`Object.toUNS(v [, cfg])` → unsigned integer

`v` as an unsigned integer of the size `cfg` gives.

| `cfg` | Result |
|---|---|
| `1` `2` `4` `8` | 8, 16, 32, 64 bits (64 when absent) |
| `0x41` `0x42` `0x44` `0x48` | the same, shown in hex |
| `0x11` | a boolean (one bit) |

Too large a value wraps; a float is rounded; text is read as a number.

```js
Object.toUNS(-1)            // 18446744073709551615
Object.toUNS(300, 1)        // 44: 300 does not fit in 8 bits
Object.toUNS(771, 0x42)     // 0x0303
Object.toUNS("0x1F", 1)     // 31
Object.toUNS(0xAB, 1)       // one byte, for Buffer.put
```

### Object.toINT

`Object.toINT(v [, cfg])` → signed integer

`v` as a signed integer of 8, 16, 32 or 64 bits (`cfg` 1, 2, 4, 8; 64 bits when absent).
Too large a value wraps; text is read as its leading integer (`"abc"` gives 0). A float
is rounded the way [`toINT`](#valuetoint) rounds: to the nearest integer, a half away
from zero.

```js
Object.toINT(200, 1)        // -56
Object.toINT("12px")        // 12
Object.toINT(2.7)           // 3
Object.toINT(-2.2)          // -2 (before 4.4.2.703: -1)
```

### Object.toFLT

`Object.toFLT(v [, cfg])` → float

`v` as a 64-bit float (`cfg` 8 or absent) or a 32-bit one (any other `cfg`). Text that
is not a number gives 0, not NaN; NaN and the infinities stay what they are.

```js
Object.toFLT(5)             // 5 (float)
Object.toFLT("2.5", 4)      // 2.5, 32-bit
Object.toFLT("abc")         // 0
```

### Object.toSTR

`Object.toSTR(v [, cfg])` → text

`v` as text, the way `"" + v` writes it. `cfg` 0 gives undefined; any other `cfg` is
ignored (there is no base: `Object.toSTR(255, 16)` is `"255"`).

```js
Object.toSTR(2.5)           // "2.5"
Object.toSTR(true)          // "1"
Object.toSTR(null)          // "null"
Object.toSTR(sta)           // "0x0303"
Object.toSTR([1, 2])        // "<OARRAY>": use JSON.stringify
```

### Object.create

`Object.create(typ)` → a new, empty value of that type

`0x50B` an object (as `{}`), `0x50A` an array (as `[]`).

```js
var h = Object.create(0x50B);
h.x = 1;
h["y z"] = 2;       // a key that is no name
JSON.stringify(h)   // {"x":1,"y z":2}
```

---

## JSON

Text to values and back. Attributes hold text, so a list or a record kept in one
attribute goes through these two: [PRJEDU_robot_mcp](../../examples/ai-vision/PRJEDU_robot_mcp/)
keeps its dashboard log that way.

### JSON.parse

`JSON.parse(text)` → a value, or undefined

| JSON | Becomes |
|---|---|
| `{..}` | an object |
| `[..]` | an array |
| `1`, `-9` | a signed 64-bit integer |
| `2.5`, `1e5` | a 64-bit float |
| a number above the signed range | an unsigned 64-bit integer |
| `true`, `false` | a boolean |
| `null` | `null` (`== null` is true) |
| `"text"` | text, escapes (`\n`, `\u00e7`) decoded |

It also takes what JavaScript refuses: single quotes, keys without quotes, a comma
before `}`, a hex number (`0x10`, unsigned), the word `undefined` (read as `null`).
A key given twice keeps the last value. **Anything after the value fails** the whole
parse.

**A failure gives undefined, with no log line and no exception**, even inside `try`.
Test the result. Text is required: a number or no argument gives undefined.

```js
var p = JSON.parse('{"a":1,"b":2.5,"f":[1,"y"]}');
p.b                           // 2.5
p.zz                          // undefined
JSON.parse("[1,2]")           // [1,2]
JSON.parse("5")               // 5
JSON.parse("{'a':1}")         // {"a":1}
JSON.parse('{"a":1}x')        // undefined
JSON.parse("bad")             // undefined
var log = JSON.parse(evt.GetValue("id('LOG')/@val"));
if (log == null) log = [];    // an empty or broken attribute
```

### JSON.stringify

`JSON.stringify(v [, null [, indent]])` → text

`v` as JSON text, keys in their order, no spaces. A second argument of `null` and an
`indent` are accepted, but **the text stays compact**; a real replacer (a function or
an array) is refused with one ERROR line. A number, a text or a boolean gives its own
JSON text.

Before 4.4.2.703 only one argument was taken (`JSON.stringify(o, null, 2)` gave
undefined) and a number or a text gave undefined.

| Value inside | Written as |
|---|---|
| integer, float | a number; a float with 15 significant digits |
| hex value | its decimal number: `sta` = `0x0303` is `771` |
| decimal | a number with its scale: `12.50` |
| time, date, time of day, duration | quoted ISO text: `"2026-10-01T12:00:00.000+03:00"` |
| boolean | `true` / `false`; a comparison result is `1` / `0` |
| NaN, Infinity, undefined | `null` |
| text | quoted; `"` `\` and control characters escaped, other characters as they are |
| a function | `"<OSCR>"` |
| a buffer | `"<BUF>"` |
| a blob | its descriptor `{"blob":1,"len":3,"fmt":"raw","seq":0,"tim":0}` |

```js
JSON.stringify({a: 1, b: 2.5, c: "x", d: true, e: null, f: [1, "y"]})
                  // {"a":1,"b":2.5,"c":"x","d":true,"e":null,"f":[1,"y"]}
JSON.stringify({n: Math.sqrt(-1)})         // {"n":null}
JSON.stringify({s: "q\"b\tş"})             // {"s":"q\"b\tş"}
JSON.stringify(5)                          // 5
JSON.stringify("x")                        // "x" (quoted)
JSON.stringify({a: 1}, null, 2)            // {"a":1}
```

An element object writes its own attributes, the tag in `xdb_elm`, typed attributes
as numbers, untyped ones as text, no children; attributes the caller's role may not read
are left out ([Access and safety](../06_Access_and_Safety.md)):

```js
JSON.stringify(evt.GetElement("id('F64')"))
    // {"xdb_elm":"var","id":"F64","sta_typ":322,"sta":771,"val_typ":776,"val":2.5}
```

---

## Buffer

A buffer holds raw bytes, or 16, 32 or 64-bit units. Protocol scripts build and read
them; a buffer comes from `CODEC.HEX_dec("0102")`, from `File.read`, or from
`Buffer.create`. `typeof` says `"object"`, `"" + b` gives its bytes as text, and
`CODEC.HEX_enc(b)` shows them in hex ([CODEC.HEX_enc](02_Time_Text_and_Codecs.md#codechex_enc)).

**A buffer is a value, copied on every assignment and into every call.** `Buffer.put`
returns a changed copy and leaves its argument alone, so always assign the result back:

```js
var b = Buffer.create(1, 4);                      // 00000000
b = Buffer.put(b, 0, 0, Object.toUNS(0xAB, 1));   // ab000000
```

The buffer's own members can read it:

| Member | Answers |
|---|---|
| `b.length` | units in the buffer |
| `b.size` | room before the next allocation |
| `b[i]` | unit `i` as an unsigned number (`undefined` past the end) |
| `b.find(bytes)` | the byte position of `bytes` in `b`, -1 when absent |

The members that would write (`b[i] = v`, `b.put`, `b.push`, `b.ins`, `b.del`,
`b.resize`) **change a copy that is thrown away**: they answer 0 and `b` stays as it
was. Use `Buffer.put`, `Buffer.ins`, `Buffer.del`.

```js
var f = CODEC.HEX_dec("0102030405");
f.find(CODEC.HEX_dec("0304"))     // 2
f[0]                              // 1
f[0] = 0x11;                      // f is still 0102030405
```

Multi-byte values are little-endian: the low byte first. For big-endian fields and
ready-made readers (`i16be`, `u32le` ..) see `BYTES` in [Time, text and codecs](02_Time_Text_and_Codecs.md).

### Buffer.create

`Buffer.create(typ, n)` → buffer

`n` units, all zero. Only the low digit of `typ` counts: `1` bytes, `2` 16-bit units,
`4` 32-bit, `8` 64-bit (`0x0101` is bytes too). `0` makes a buffer nothing can be put into.

```js
CODEC.HEX_enc(Buffer.create(1, 4))       // "00000000"
CODEC.HEX_enc(Buffer.create(0x0104, 2))  // "0000000000000000": two 32-bit units
```

### Buffer.ins

`Buffer.ins(b, pos, n)` → buffer

A copy of `b` with `n` zero units inserted at unit `pos` (`pos` = length appends).
Three arguments; with two the answer is undefined.

```js
b = Buffer.ins(b, 0, 2);     // ab341200 -> 0000ab341200
```

### Buffer.del

`Buffer.del(b, pos, n)` → buffer

A copy of `b` without the `n` units from `pos`.

```js
b = Buffer.del(b, 0, 3);     // 0000ab341200 -> 341200
```

### Buffer.put

`Buffer.put(b, pos, bit, v)` → buffer

A copy of `b` with the bits of `v` written from bit `pos × unit + bit`.

| Argument | Meaning |
|---|---|
| `b` | the buffer |
| `pos` | unit position |
| `bit` | bits further on; may run past the unit |
| `v` | the value; **it writes its own width** |

The width of `v` is the trap: an integer literal is 64 bits, a float 64, a boolean one
bit, a text its bytes. Give the value the width you mean with
[`Object.toUNS`](#objecttouns) / [`Object.toFLT`](#objecttoflt). A value that does not fit
before the end is not written, and nothing says so.

```js
var b = Buffer.create(1, 4);
b = Buffer.put(b, 0, 0, Object.toUNS(0xAB, 1));     // ab000000
b = Buffer.put(b, 1, 0, Object.toUNS(0x1234, 2));   // ab341200: low byte first
b = Buffer.put(b, 0, 0, 7);                          // unchanged: 64 bits do not fit in 4 bytes
var c = Buffer.create(1, 4);
c = Buffer.put(c, 0, 4, Object.toUNS(0xFF, 1));     // f00f0000: from bit 4
c = Buffer.put(c, 0, 0, Object.toFLT(2.5, 4));      // 00002040: a 32-bit float
```

A value narrower than a byte changes only its own bits, at any bit: `false` at bit 0 of
`FF` gives `fe`, at bit 3 `f7`.

Before 4.4.2.703 a value narrower than a byte written at a bit that starts a byte
(`bit` 0, 8, 16 ..) **overwrote the whole byte** (`false` at bit 0 of `FF` gave `00`).

### Buffer.get

`Buffer.get(b, pos, bit, typ)` → a value of type `typ`

Reads a `typ`-sized value from bit `pos × unit + bit`. Past the end: `0` of that type.
Four arguments; with fewer, undefined.

| `typ` | Reads |
|---|---|
| `0x0101` `0x0102` `0x0104` `0x0108` | unsigned 8, 16, 32, 64 bits |
| `0x0141` `0x0142` .. | the same, shown in hex |
| `0x0201` `0x0202` `0x0204` `0x0208` | signed |
| `0x0111` | one bit |
| `0x0304` `0x0308` | float 32, 64 |

```js
// b = ab341200
Buffer.get(b, 0, 0, 0x0101)    // 171
Buffer.get(b, 1, 0, 0x0102)    // 4660 (0x1234)
Buffer.get(b, 1, 0, 0x0142)    // 0x1234
Buffer.get(b, 0, 0, 0x0201)    // -85
Buffer.get(b, 0, 4, 0x0101)    // 74: the eight bits from bit 4
Buffer.get(b, 0, 1, 0x0111)    // 1: bit 1 of 0xAB
Buffer.get(b, 1, 0, 0x0104)    // 0: four bytes from byte 1 run past the end
```

A text type reads nothing; for bytes as text use `"" + b` or `CODEC`.

---

## Value methods

Every number (integer, float, boolean, hex, decimal, time) and every text answers
these methods; so does undefined, which converts to 0 or `""`. Arrays and objects
do not.

| Method | On a number | On text |
|---|---|---|
| `v.toINT([size])` | signed integer | its leading integer |
| `v.toUNS([size])` | unsigned integer | the same, read unsigned |
| `v.toHEX([size])` | unsigned, shown in hex | the same |
| `v.toFLT([size])` | float | its leading number |
| `v.toSTR([16])`, `v.toString([16])` | text | the text |
| `v.toS08()`, `v.toS16()` | UTF-8 / UTF-16 text | the same |
| `v.toDEC([scale])` | decimal | decimal |
| `v.toDTM([offset])` | a time from epoch milliseconds | a time from ISO 8601 |
| `v.toDATE()`, `v.toTIME()`, `v.toDUR()` | date, time of day, duration | the same, from text |
| `v.length` | 1 | characters |
| `v.help` | `"INT literal"`, `"FLT literal"` .. | `"STR literal"` |

`size` is a size code: `1`, `2`, `4`, `8` for 8 to 64 bits (`toFLT`: `4` or `8`). A value
too large for the size wraps.

### value.toINT

`v.toINT([size])` → signed integer (64-bit by default)

From text: the leading integer, `0` when there is none. From a float: the nearest
integer, a half away from zero (`2.5` → 3, `-2.5` → −3). From a time: epoch
milliseconds. From undefined: 0.

```js
"12px".toINT()       // 12
"0x1F".toINT()       // 31
"3.7".toINT()        // 3: text is cut
"abc".toINT()        // 0
(2.7).toINT()        // 3
(-2.2).toINT()       // -2
(300).toINT(1)       // 44
u.toINT() - 5        // -2 for an unsigned u = 3
```

The same rule applies when a float is written into an integer attribute: `-2.2` into a
`0x0204` attribute stores `-2`.

Before 4.4.2.703 a float **added 0.5 and cut the fraction**, which got every negative
number wrong: `(-2.2).toINT()` was −1, and `-2.2` written into a `0x0204` attribute
stored −1.

### value.toUNS

`v.toUNS([size])` → unsigned integer (64-bit by default). A hex value loses its hex.

```js
(-1).toUNS()         // 18446744073709551615
(-1).toUNS(2)        // 65535
"0x0303".toUNS()     // 771
```

### value.toHEX

`v.toHEX([size])` → unsigned integer shown in hex (64-bit by default)

The way to make a `sta`-style value: it prints and joins as `0x....`.

```js
(255).toHEX()        // 0x00000000000000FF
(255).toHEX(2)       // 0x00FF
(255).toHEX(1)       // 0xFF
"771".toHEX(2)       // 0x0303
```

### value.toFLT

`v.toFLT([size])` → float (64-bit; `4` gives 32-bit)

From text: the leading number, **0 when there is none** (`parseFloat` gives NaN). From
undefined: 0, so a missing SQL cell or JSON key becomes 0.

```js
"2.5x".toFLT()       // 2.5
"1e3".toFLT()        // 1000
"abc".toFLT()        // 0
(5).toFLT(4)         // 5, 32-bit
```

### value.toSTR

`v.toSTR([16])` → text. `v.toString` is the same method.

The value as text; a hex value keeps its `0x`. With `16`, an integer is written in hex
digits, upper case, without `0x` or leading zeros; a negative one as its 64-bit two's
complement. Any other base from 2 to 36 writes the integer part, a minus sign for a
negative number, letters in upper case; 10 or a base out of range is the plain text.

```js
(5).toSTR()          // "5"
sta.toSTR()          // "0x0303"
(255).toSTR(16)      // "FF"
(4096).toSTR(16)     // "1000"
(-255).toSTR(16)     // "FFFFFFFFFFFFFF01"
(0).toSTR(16)        // "0"
(255).toSTR(2)       // "11111111"
```

Before 4.4.2.703 zero in base 16 wrote nothing and any other base was ignored.

For a lower-case hex or another base use [`Number.toString`](#numbertostring).

### value.toS08

`v.toS08()` → the value as UTF-8 text. `(5).toS08()` is `"5"`.

### value.toS16

`v.toS16()` → the value as UTF-16 text. `(2.5).toS16()` is `"2.5"`.

### value.toDEC

`v.toDEC([scale])` → decimal

An exact decimal of up to 28 digits. Without `scale` text keeps its own scale; with
it the value is brought to `scale` places, a half away from zero. A float is first
written with 15 digits. Text that is no number is refused: one `ERROR` line
(`'toDEC' refused .. toDEC: not a decimal number`) and the result is 0; inside `try`
it throws with that text in `e.message`.

```js
"12.50".toDEC()          // 12.50
"2.345".toDEC(2)         // 2.35
"-2.345".toDEC(2)        // -2.35
"12.50".toDEC() + 1      // 13.50
1 + "12.50".toDEC()      // 14: the integer on the left decides
"12.50".toDEC() / 3      // 4.1666666666666666666666666667
```

What a decimal does in arithmetic, in attributes and in SQL:
[Decimals and times](../03_Scripting.md#decimals-and-times).

### value.toDTM

`v.toDTM([offset])` → time

An instant with its UTC offset. A number is epoch milliseconds; text is ISO 8601, and
**text without an offset is local time**. `offset` (minutes east of UTC, -1439 .. 1439)
writes the same instant with another offset. Refused like `toDEC`: one `ERROR` line,
or an exception inside `try`.

```js
var t = "2026-10-01T12:00:00+03:00".toDTM();
t                       // 2026-10-01T12:00:00.000+03:00
t + 1000                // 2026-10-01T12:00:01.000+03:00
t.toDTM(0)              // 2026-10-01T09:00:00.000+00:00: the same instant
t.toINT()               // 1790845200000: epoch milliseconds
"2026-10-01T13:00:00+03:00".toDTM() - t    // 3600000
```

[`Time.now()`](02_Time_Text_and_Codecs.md#timenow) gives the current instant as a time
value; the rest of time handling is in [Time, text and codecs](02_Time_Text_and_Codecs.md).

### value.toDATE

`v.toDATE()` → date

From `"YYYY-MM-DD"` (a date with a time is refused), from a number of days since
1970-01-01, or the day of a time value in the time's own offset. Adding a month clips
to the month's end.

```js
"2026-10-01".toDATE()                              // 2026-10-01
(1).toDATE()                                       // 1970-01-02
"2026-10-01T01:00:00+03:00".toDTM().toDATE()       // 2026-10-01, whatever the machine's zone
"2026-01-31".toDATE() + "P1M".toDUR()              // 2026-02-28
```

### value.toTIME

`v.toTIME()` → time of day

From `"HH:MM[:SS[.fff]]"`, from milliseconds since midnight, or the wall clock of a
time value in its own offset.

```js
"09:30:00.123".toTIME()                              // 09:30:00.123
(3600000).toTIME()                                   // 01:00:00.000
"2026-10-01T12:00:00+03:00".toDTM().toTIME()         // 12:00:00.000
```

### value.toDUR

`v.toDUR()` → duration

From ISO 8601 (`"P1M"`, `"PT1M30S"`), from PostgreSQL's `"1 day 02:00:00"`, or from
milliseconds. Months and days are kept apart from milliseconds.

```js
"P1M".toDUR()               // P1M
"1 day 02:00:00".toDUR()    // P1DT2H
(90000).toDUR()             // PT1M30S
```
