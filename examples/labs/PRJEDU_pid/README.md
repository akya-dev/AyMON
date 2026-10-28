# PRJEDU_pid — a PID lab: a heater, its controller, and a tuning to find

The laboratory of a control course, in one engine: a heater block that
behaves like the real ones on a lab bench, a PID controller written in
script, and a page to run the experiments from.

```bat
run.bat
```

Then open **http://127.0.0.1:8092/**.

On Linux the same example starts with `./run.sh` (the engine in `../../../bin/linux-x64`; see
"On Linux" in the top README).

| Document | Role | What it is |
|---|---|---|
| `PLT/S00` | the **plant** | a heater block: first order plus dead time, sensor noise, and a fan as the disturbance. It knows its heater power and gives back a temperature |
| `CTL/S00` | the **controller** | a PID in script, the step-response measurement, a step test that fits a model and suggests a tuning, and the lab page |

The two meet at two values only: the controller reads
`doc('PLT/S00')/id('TM')/@val`, the plant reads `doc('CTL/S00')/id('MV')/@val`.
That is where a real heater would be wired in instead.

The rig starts **warm and in balance**: 40 °C, held by 28.3 % of heater power.
The first set-point step can be made at once.

## The plant

```
tau * dT/dt = K * u(t - theta) - (T - T_AMB) * loss
```

| | Value | Element |
|---|---|---|
| gain K | 0.6 °C per % | `K_GAIN` |
| time constant tau | 30 s | `TAU` |
| dead time theta | 3 s | `DEAD` |
| room | 23 °C | `T_AMB` |
| heat loss with the fan on | × 1.6 | `FAN_LOSS` |
| sensor noise | 0.05 °C, read in 0.01 °C steps | `NOISE` |

At full power the block settles at 23 + 60 = 83 °C. A set point above that
cannot be reached, which is what the anti-windup experiment below is about.
The numbers are read every step. Change them in `db\db_PLT.xml` to give the
controller a harder plant: a longer `DEAD` is the classic way to make a loop
oscillate.

## The controller

The textbook ISA form, discrete, every `T_PID` period (h = 0.5 s):

```
MV = Kp * ( e  +  (1/Ti) * integral(e)  +  Td * de/dt ),   then 0..100 %
```

* **the derivative acts on the measurement**, not on e, so a set-point step
  gives no derivative kick. It is filtered (N = 10), or the sensor noise would
  come through Td amplified
* **MANUAL**: the heater power is the operator's (`MV_MAN`), and the integral
  tracks it (I = MV − P − D). Switching back to AUTO does not bump the
  output
* **anti-windup** (`AW`): while MV is at 0 or 100 %, the integral stops growing
  in the direction that cannot help (conditional integration)
* **a trip** at `T_TRIP` (90 °C): heater off, MANUAL, whatever the tuning
  says

Every set-point change made in AUTO is measured while it settles: rise time
(10 → 90 %), overshoot, settling time (the last moment outside a band of 2 %
of the step) and IAE. The result is logged after 180 s and added to the page's
table.

The starting tuning, Kp 2 and Ti 60 s, is **deliberately sluggish**: a loop
that works and leaves the student something to do.

## What it measures

The step 40 → 50 °C, each from the rig in balance, measured by the controller
itself:

| Tuning | Rise 10–90 % | Overshoot | Settling (2 %) | IAE |
|---|---|---|---|---|
| Kp 2, Ti 60 s (the start) | 123.5 s | 0 % | not within 180 s | 444 °C·s |
| Kp 8.3, Ti 24 s (SIMC from the true plant) | 7.5 s | 1.5 % | 53.5 s | 96 °C·s |
| Kp 6.92, Ti 28 s (SIMC from the step test) | 8.5 s | 1.1 % | 43.5 s | 91 °C·s |

The step test, run from the page, fitted **K 0.59 °C/%, tau 28.5 s, theta
3.5 s** to a plant that is really 0.6, 30 and 3, and suggested Kp 6.92, Ti
28 s. The noise and the two-point method put it close, not exact, which is
what a real step test does too.

Anti-windup, with Kp 8.3 and Ti 24 s. The set point goes to 85 °C (above the
83 °C the heater can reach), then after two minutes back to 50 °C:

| | Integral when the set point drops | Heater after the drop | The step 85 → 50 settles in | IAE |
|---|---|---|---|---|
| AW off | 587 % | still at 100 % for 20 s. The block climbs on to 82.5 °C | 113.5 s | 1578 °C·s |
| AW on | 75 % | off at once | 51.5 s | 480 °C·s |

The fan (a heat loss 1.6 times higher) with the same tuning: the block drops
1.6 °C, the controller raises the heater from 28 to 45 % and brings it back
within about a minute. Fan off: 1.7 °C too high, the same way back.

## What it teaches

**A loop is two documents.** The controller never reads the plant's `T`, the
true temperature. It reads `TM`, what the sensor says, with noise and 0.01 °C
steps. The plant never knows the set point. Everything the controller knows is
in its own document, and every term of the PID is a `<var>`:
`P_TERM`, `I_TERM`, `D_TERM`, and the page draws them.

**The sample time is configuration.** `main.tick` reads `evt_per` from its own
timer element. Change `T_PID`'s `evt_per` to 2 in `db\db_CTL.xml` and the
controller's h is 2 s. A tuning that was fine at 0.5 s may oscillate.

**The page asks, the controller decides.** `xdb_acl="0xFF111111"` on the
controller document: a page reads everything and writes only the lab's
controls (`SP`, `MODE`, `MV_MAN`, `KP`, `TI`, `TD`, `AW`, `TUNE`), and each of
them is clamped by `ATR.lmt`. A set point of 500 becomes 85. A write to `PV`
or `T_TRIP` is refused, and the log says so:
`CTL/S00:PV.val: xdb_acl yazma reddetti (rol 0)`. The fan belongs to the plant,
whose document has no `xdb_acl`: the lab bench's knobs are for turning.

**A step test is a state machine.** `main.tune`: MANUAL at the current power,
wait until the temperature moves less than 0.3 °C in 15 s, step the heater by
20 %, record until it moves less than 1 % of the change in 20 s, fit, put the
loop back the way it was. Every phase is in `TUNE_STATE` and the log.

## Try this

| Do | See |
|---|---|
| **+10**, with the starting tuning | the table's first row: slow, and not settled within the 180 s the measurement waits |
| **Run step test**, then **Use the suggestion**, then **+10** | the third row. Compare |
| Kp 20, Ti 24, then the same with Td 3 | how much faster, and at what price in overshoot? What does the derivative change? (not measured here: that is the exercise) |
| raise Kp until the loop oscillates, then set `DEAD` to 6 in `db_PLT.xml` and restart | the gain at which it starts to oscillate, before and after. Dead time is what limits a loop |
| Kp 8.3, Ti 24, untick **anti-windup**, set point 85, wait two minutes, set point 50 | the table above: the integral climbs past 500 %, and the heater stays full on after the set point has dropped |
| **fan on** | a disturbance. The P term reacts at once, the integral takes over |
| MANUAL, move the heater, then AUTO | no bump: the integral was tracking |
| **download CSV** | every sample since the page was opened: t, SP, PV, MV, P, I, D, the tuning, the mode, the fan. For the report |

## A real heater

The page, the controller and its measurements do not change. Replace
`PLT/S00` with a connection to the heater: something that reads the
temperature into a `<var>` and writes MV to the heater. Then point
`main.tick` at those two values instead of `doc('PLT/S00')/id('TM')` and
`doc('CTL/S00')/id('MV')`. Many control courses use a small Arduino heater
board with a serial text protocol, which `PRO.raw` over `CON.ser` can speak
(`PRJPER_tello` shows `PRO.raw` with a text protocol). That part is **not in
this example and not tested**.

## Licence

Two connections, three documents: well inside FREE.
