# Provides is a Layer built once per State

What a State Provides is a scoped Layer, built when the State is entered and closed when it is left. It gets the Actor's Requires from Effect and its Instance's current Model, State and changes, so a Capability that follows the Model updates itself from inside (for example into a `SubscriptionRef`). The Children's work waits until it is built; if it fails, the failure is logged and those Children's work never starts.

## Considered Options

- **Building the Capability again on every Model change and handing it down the subtree (until now)**: rejected. Every change cost a walk of the subtree, and work already running kept the old value anyway.
- **Restarting the work that depends on a Capability when it changes**: rejected. It needs to know which work reads which Capability.
