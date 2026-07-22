# Eager, statement-first decisions

Laymos decisions use a fluent builder, but unlike a conventional terminal
matcher each `when` eagerly executes its matching Arm. This keeps a Decision
statement-first and mechanically replaceable with an `if` or `switch`;
`exhaustive` is an optional compile-time proof and result unwrapping operation,
while `otherwise` declares and executes one fallback Arm. The accepted cost is
that an exception in a selected Arm stops later `when` calls from declaring
their Arms; Laymos describes the code that actually ran and does not add lazy
registration machinery to recover from broken branch code.
