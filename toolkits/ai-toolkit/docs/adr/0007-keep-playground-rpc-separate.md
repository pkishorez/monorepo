# Keep the Playground RPC separate

The local browser demo composes a demo-only `AiPlaygroundRpc` with the public `AiRpc` instead of adding Thread creation and query operations to the toolkit's execution contract. Applications remain responsible for Thread ownership, while the Playground Server acts as one small application that creates and inspects its own ephemeral state.
