# Verification failures use 503, not 401

Both the RPC and the HTTP API integration fail with `Authz.Unauthenticated` (401) when a request has no valid session, but with a typed `Authz.VerificationUnavailable` (503) when the Auth Worker cannot complete Server-Side Verification. Treating an infrastructure failure as an authentication failure would incorrectly tell callers that their credentials are invalid. The RPC integration originally reported both as `Unauthenticated`; it was aligned when both integrations moved onto one Auth Cannotation Server Implementation shape.
