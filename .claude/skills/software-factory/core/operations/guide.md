# Operations

Describe each operation’s input, result, and failure cases.

Write the behavior as an Effect using tables, domain rules, other operations, or external services.

Group related operations by capability using [shared architecture](../architecture.md).

Put portable operations in `shared/operations` after checking that both server and client providers support their behavior.

Put server workflows in `server/operations`, calling external services through `server/services`.

Call operations from RPC handlers and other callers, keeping business behavior in the operations.

Check success and failure cases, including permissions and atomic writes where needed.
