# Credentials are user-owned, matched by account, and selected per provider per deletion

## Context

Stores used to embed their Cloudflare token and, optionally, one AWS key pair with a fixed region. A user with several stores re-entered the same keys, a stage whose tables lived in another region was blocked, and the "Edit connections" form mixed the store's identity with optional add-ons.

Alchemy's engine provides one `Credentials` and one `Region` service per Apply, so two AWS credentials, or one credential across two regions, cannot act within a single stage deletion.

## Decision

- A **provider credential** is a user-owned record: a name, a provider, a secret, and the account the provider confirmed when the secret was saved. Credentials live on their own settings screen. AWS credentials carry no region.
- A **store** references one Cloudflare credential that locates its state, plus a list of granted credential ids. A credential in use by any store cannot be deleted.
- Deletion **selects one credential per provider for the whole stage**. The default is the granted credential whose account matches the accounts recorded on the stage's resources; AWS also defaults its region from the recorded table ARNs. The review always shows the selection and lets the user change it, which re-plans. The plan fingerprint binds to the selected identities.
- Provider knowledge lives in one module per provider behind a registry on both the server (verify, locate, check, layer, discovery) and the client (form fields). Adding a provider is one folder on each side plus a contract literal.
- The change is breaking: new entity names (`store`, `credential`) start at schema v1 and old rows are orphaned rather than migrated.

## Consequences

- One AWS key pair serves every region and every store, and cross-account stages are caught by the existing per-row account checks.
- A stage that spans two AWS accounts or two regions cannot be deleted from Console in one pass; the review reports it.
- Interrupted DynamoDB creates without an ARN are still verified by name, now using the region the user confirms in the review.
- Secrets remain stored as saved; encryption at rest is unchanged by this decision.
