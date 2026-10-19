# The runner drives Alchemy through the project's own installed version

The runner does not shell out to the `alchemy` CLI, and it does not bundle Alchemy. It imports `alchemy/Alchemist` from the project's own `node_modules`, then calls `open`, `plan` and `apply` and forwards Alchemy's typed progress events to the User Space. Every run therefore uses exactly the Alchemy version, and the custom resources, that its commit installs, which is what lets a stage be destroyed with its last deployed commit long after `main` has upgraded Alchemy or dropped a resource type. Using `Alchemist` also lets Inspect read the stack name, state store and providers from the loaded stack instead of parsing source.

## Consequences

- `Alchemist` is a beta API, so Console declares a minimum supported Alchemy version and Inspect fails clearly below it. Commits older than the minimum cannot be destroyed from Console, so the minimum rises only when it must, and the runner uses as little of `Alchemist` as it can.
