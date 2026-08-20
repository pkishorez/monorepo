# Schema rules & failures

What a schema refuses, and how it refuses it.

The theme running through these is that nothing is guessed. A missing key is an
error rather than a silent `undefined`. A stamp naming a version that was never
declared is refused rather than approximated. Data that does not match the
version it claims fails before any rung runs.

The one exception is data written before stamps existed, which is adopted as the
earliest version — and even that is validated against v1 before it is trusted.
