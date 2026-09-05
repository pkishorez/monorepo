# RPC Toolkit

Opinionated abstractions over Effect RPC and Effect HttpApi that capture the patterns already learned building real client–server integrations, so they are declared once instead of re-implemented per app.

## Language

**Cannotation**:
A cascading annotation — a declaration on an endpoint or a group about how it may be called (sign-in, a capability, a rate limit). A more specific endpoint's value replaces the group's; an endpoint without one inherits the group's; values are never merged.
_Avoid_: requirement, policy (reserved for the auth-specific value a Cannotation may carry), middleware (the Cannotation attaches one, it is not one)

**Declaration**:
The transport-specific, implementation-free half of a Cannotation that lives in shared contract code: its identity, value type, what it provides, what it requires, and its error. Safe to import from both client and server bundles.
_Avoid_: definition, contract (reserved for the endpoint group itself)

**Server Implementation**:
The server-only half of a Cannotation: the per-request logic that receives the resolved value and produces what the Declaration promised to provide.
_Avoid_: handler, resolver (reserved for the consumer's own underlying service)

**Client Implementation**:
The client-only half of a Cannotation, present only when its Declaration opts in: logic that rewrites an outgoing request before it is sent.
_Avoid_: client middleware

**Nearest Wins**:
The one resolution rule for a Cannotation's value: the declaration closest to the endpoint applies in full and shadows any group declaration.
_Avoid_: merge, combine, override chain

**Sibling**:
The RPC and HTTP flavours of the toolkit. Each is self-contained with the same shape; they share vocabulary, not a common core.
_Avoid_: adapter, transport layer

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
The server's distinction between a Fresh Call and Hibernation Replay. It describes why a call is executing, independently of the caller's identity or authorization.

**Admission Rate Limit**:
A limit on Fresh Calls accepted from a caller. Restoring an existing subscription through Hibernation Replay does not consume another admission by default.
