# Migration practice

Habits that keep a ladder safe to climb years later.

Three rules, and one thing that is not a rule.

**Append, never reach back.** A rung that has shipped is history.
**Be total.** A migration must answer for every value the old version allowed.
**Be pure.** The same bytes must decode to the same value on every read, every
replica, and every day.

And `makePartial`, which validates nothing — worth knowing precisely because it
looks like it does.
