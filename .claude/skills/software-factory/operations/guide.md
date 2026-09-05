# Operations

Start with what the application needs to do. Describe what each operation receives, what it returns, and how it can fail.

Write that behavior as an ordinary Effect. An operation can use STD tables, business rules from domain, other operations, or external services. Group related operations by the capability they provide.

Put operations that work in both environments in `shared/operations`. Each environment supplies the dependencies they need, such as a table provider. Check that the browser provider supports the behavior before sharing an operation.

Put server-specific workflows in `server/operations`. They can use shared operations and call external services through `server/services`.

RPC handlers call these operations. Keep business behavior here so other callers can use it too. Check the operation’s success and failure cases, including permissions and atomic writes where needed.

See [the architecture conventions](../architecture.md) for placement and dependencies.
