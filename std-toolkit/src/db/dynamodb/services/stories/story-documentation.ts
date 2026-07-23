import { markdown } from 'laymos/story';

export const dynamodbStoryDocumentation = {
  batchInsert: markdown`
    ## Writing a bounded batch

    Batch insertion encodes each domain value and delegates chunking and
    unprocessed-item handling to the entity service. The operation returns only
    after every accepted item has been written.

    Use this path for independent new entities. Workflows that require one
    atomic all-or-nothing decision need a transactional boundary instead.
  `,
  delete: markdown`
    ## Soft deleting an entity

    Delete marks the stored record as deleted while preserving its value and
    metadata. Ordinary reads no longer expose it, but the retained record makes
    restoration and audit-oriented workflows possible.

    The write is conditional, so callers can distinguish a successful delete,
    an already missing identity, and stale concurrency state.
  `,
  getAndUpdate: markdown`
    ## Reading and mutating atomically

    Get-and-update evaluates a domain mutation against the latest stored value
    and commits the resulting entity through one conditional operation. It
    avoids the race created by a separate read followed by an unrelated write.

    The callback may decline to change the entity, return a replacement value,
    or surface a typed domain failure.
  `,
  query: markdown`
    ## Reading an ordered entity range

    Query combines a named index with explicit partition and sort-key bounds.
    Results are decoded domain entities, accompanied by the continuation state
    needed to request the next bounded page.

    Bounds make direction and inclusivity visible at the call site instead of
    hiding pagination policy inside string expressions.
  `,
  restore: markdown`
    ## Restoring a soft-deleted entity

    Restore makes a retained deleted record visible again without rebuilding it
    from another source. The operation preserves identity and domain data while
    advancing storage metadata to represent the new write.

    Only a deleted record can be restored; active and absent identities remain
    distinct outcomes.
  `,
  update: markdown`
    ## Updating with explicit concurrency

    Update applies a typed mutation to an existing entity and writes the new
    representation under the service's conditional guarantees. Callers receive
    the freshly decoded value and metadata.

    The stories cover success, missing records, stale expectations, no-op
    mutations, and domain-level failures so each outcome remains observable.
  `,
  singleGet: markdown`
    ## Reading a singleton record

    A single-entity service owns one well-known key. Callers request the current
    decoded value without supplying an application identity, and absence is
    represented as \`null\`.
  `,
  singlePut: markdown`
    ## Replacing a singleton value

    Put creates or replaces the one record owned by the schema. It is useful
    for configuration, checkpoints, and other state where the identity is fixed
    by the service rather than chosen by a caller.
  `,
  singleUpdate: markdown`
    ## Mutating singleton state

    Update transforms the current singleton value under a conditional write.
    Missing state and callback failures remain typed outcomes rather than being
    collapsed into a generic storage error.
  `,
  singleGetAndUpdate: markdown`
    ## Inspecting and changing singleton state

    Get-and-update exposes the current value to a domain callback and commits
    its decision atomically. This is the singleton counterpart to keyed entity
    mutation and carries the same observable no-op and failure behavior.
  `,
  singleReset: markdown`
    ## Returning singleton state to absence

    Reset removes the one stored value owned by the service. It gives tests,
    administrative workflows, and lifecycle code an explicit operation for
    returning the singleton to its initial absent state.
  `,
} as const;
