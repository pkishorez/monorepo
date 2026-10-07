# RPC Toolkit

Opinionated abstractions over Effect RPC and Effect HttpApi that capture the patterns already learned building real client–server integrations, so they are declared once instead of re-implemented per app.

## Language

**Middleware**:
A declaration on an endpoint or a group about how it may be called (sign-in, a capability, a rate limit), with a server half and an optional client half. A more specific endpoint's value replaces the group's; an endpoint without one inherits the group's; values are never merged. Built with `Rpc.middleware` or `HttpApi.middleware`.
_Avoid_: Cannotation (the former name), annotation, requirement, policy (reserved for the auth-specific value a Middleware may carry)

**Declaration**:
The implementation-free part of a Middleware that lives in shared contract code: its identity, value type, what it provides, what it requires, and its error. Safe to import from both client and server bundles.
_Avoid_: definition, contract (reserved for the endpoint group itself)

**Server Implementation**:
The server-only half of a Middleware (`layer`): the per-request logic that receives the resolved value and produces what the Declaration promised to provide.
_Avoid_: handler, resolver (reserved for the consumer's own underlying service)

**Client Implementation**:
The client-only half of a Middleware (`client`), present only when its Declaration opts in: logic that rewrites an outgoing request before it is sent.
_Avoid_: client middleware, clientLayer (the former name)

**Nearest Wins**:
The one resolution rule for a Middleware's value: the declaration closest to the endpoint applies in full and shadows any group declaration.
_Avoid_: merge, combine, override chain

**Sibling**:
The two flavours of the toolkit, `Rpc` and `HttpApi`. Each is self-contained with the same Middleware shape; they share vocabulary, not a common core.
_Avoid_: adapter, transport layer

**Transport**:
How an Api is called and served: `http` (POST, NDJSON, batched), `websocket` (a hibernating Durable Object, JSON) or `inProcess` (no wire). Each is a client and server pair with the protocol fixed, so the two always agree.
_Avoid_: protocol (never chosen by a consumer), connection

**In-Process Transport**:
A Transport whose server is the group's handlers in the same process. Requests, headers, and middleware run as over a wire; nothing is sent or serialized.
_Avoid_: mock, local server, test client, In-Process Connection (the former name)

**Hibernation Replay**:
Restarting an active streaming call after its server wakes, using the saved request and checkpoint while the client's connection remains open.
_Avoid_: reconnect, fiber resume

**Subscription Restart**:
A fresh subscription initiated by the client after its connection is re-established. It is distinct from Hibernation Replay on an existing connection.
_Avoid_: hibernation replay

**Connection Identity**:
The identity established when a connection opens and retained for that connection. It does not by itself establish the caller's current authorization.
_Avoid_: current permissions

**Fresh Call**:
A new call received from a client, including a subscription started after reconnect. Restoration through Hibernation Replay is not a Fresh Call.

**Invocation Kind**:
The websocket server's distinction between a Fresh Call and Hibernation Replay. It describes why a call is executing, independently of the caller's identity or authorization.

**Admission Rate Limit**:
A limit on Fresh Calls accepted from a caller. Restoring an existing subscription through Hibernation Replay does not consume another admission by default.
