# One turn is one run with asymmetric channels

> **Status:** output clause superseded by ADR-0010. Output is no longer a replay-and-tail stream; it is Message rows in the AI Table. The one-turn-is-one-run rule and the idempotent input calls stand.

A Run starts with a user turn and remains the same Run while waiting for questions or approvals. Output is a detachable replay-and-tail stream, while input arrives through discrete idempotent calls keyed by Run and Interaction Request. This deliberately rejects continuation runs and connection-bound duplex streams: coding harnesses retain native state while waiting, and closing a client connection must not strand their input path.

The trade-off is that active Runs are stateful and host-pinned. Every wait therefore has a timeout and cancellation path, and persisted Run records support orphan recovery.
