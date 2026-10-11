# 2. States

Status: works

## What it shows

State, Transition, State data. The Door is a rounded box with one Slot per
State: Closed, Open, Locked. The Circle sits in the lit Slot and slides to
the next one on a Transition. While Locked, the code is written in the Slot
under the Circle: it is State data, and it is gone once the Door is Closed.

## What to click

- The Circle: Toggle. Closed and Open swap; in Locked it is ignored.
- Chips: Lock 1234 (only from Closed), Unlock 1234 (Locked to Closed),
  Unlock 0000 (the wrong code: the rule runs but nothing changes).

## What to watch

- The Strip: a hollow Marble for Toggle while Locked, and for Lock while
  Open: Messages with no rule in the current State. Unlock 0000 lands filled,
  since Locked has a rule for it, but the Circle does not pulse: no Change.
- The devtools: a Transition is a Step whose Change moves the State; Unlock
  0000 is a Step with no Change at all.

## Deviations from the spec

- A wrong code is handled, not ignored: Update's rule for Unlock returns no
  change, and only a Message with no rule in the current State is ignored.

## Blockers

None.
