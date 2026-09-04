# HTTP verification failures use 503

The HTTP API integration returns 401 when a request has no valid session, but returns a typed 503 when the Auth Worker cannot complete Server-Side Verification. Treating an infrastructure failure as an authentication failure would incorrectly tell callers that their credentials are invalid; this deliberately differs from the existing RPC behavior.
