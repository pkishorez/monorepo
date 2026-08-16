# Peer Sync is a collection-scoped freshness path

Each qualified Collection owns one Peer Channel, and Peer Sync carries complete
backend-confirmed Entities rather than change notices. Complete Entities let a
receiver run the same convergence rule as backend delivery without an extra
fetch, while Collection-scoped channels isolate schemas, validation, and traffic
without adding a second routing identity.

Peer Sync remains best effort: backend push or polling is authoritative and
repairs every missed peer delivery. This keeps Memory versus IndexedDB as a
durability choice instead of turning either storage adapter or browser messaging
into a correctness dependency.

Sync Addresses are readable, lossy observability labels and are never parsed or
used as storage identities; exact typed partition identity remains separate. No
migration aliases are provided for the former package paths, durable names, or
change-notice language because the package is `0.0.2`, and preserving two models
would make the new boundary ambiguous before it has a stable installed base.
