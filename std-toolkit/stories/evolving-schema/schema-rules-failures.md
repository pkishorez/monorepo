# Schema rules & failures

What a schema refuses, and how it refuses.

One idea runs through these Stories. The system does not guess.

- A key that is absent is an error. It is not a silent `undefined`.
- A stamp that names an unknown version is refused. It is not approximated.
- Data that does not match the version it claims fails before any step runs.

There is one exception. Data written before stamps existed is read as the first
version. Even then, the system checks it against v1 before it accepts it.
