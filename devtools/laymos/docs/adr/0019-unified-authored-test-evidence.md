# Unified Laymos Test evidence

Laymos uses one Laymos Test model instead of separate Value Test and Trace Test
suite kinds. `laymosTest` records required documentation and multiple named
Vitest assertions, while an optional single `trace(effect)` capture adds span
and log evidence without changing the Effect's result. Logs retain their
current captured span when one exists and remain unscoped otherwise. The Test
Report therefore retains an assertion list and optional trace per Laymos Test
rather than one case-level input, expectation, actual value, intent, or evidence
kind. This keeps Vitest's test and assertion APIs authoritative while allowing
Laymos to present richer evidence without a parallel test DSL.
