# Run output is a sequenced envelope

> **Status:** superseded by ADR-0010. No sequenced chunk envelope exists; idempotent Run start by input hash stands.

Persisted and streamed output wraps an unchanged protocol chunk with its Run ID and monotonic sequence. Watchers resume strictly after a supplied sequence, avoiding ambiguous inclusive offsets and keeping AG-UI metadata out of the protocol event itself. Starting an existing Run is idempotent only when its decoded input matches; a conflicting reuse fails rather than silently executing or attaching to different work.
