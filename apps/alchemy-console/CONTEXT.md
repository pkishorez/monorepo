# Alchemy Console — Ubiquitous Language

## Terms

**Store**
A named, user-owned Alchemy state location. A store lives in one provider
(Cloudflare today), located through one provider credential, and may be
granted further provider credentials for deleting the resources it records. A
user picks a store; they rarely browse stores. Stores are managed (added,
renamed, re-granted, removed) separately from exploring their contents.

**Provider credential**
A named, user-owned set of credentials for one account at one provider
(Cloudflare or AWS today). Provider credentials are managed on their own
settings screen, independently of any store. A credential records the account
it belongs to, so Console can match a recorded resource to the credential that
can delete it. One credential can serve many stores.

**Grant**
A store's permission to use one provider credential during deletion. A store's
locating credential is always granted; further credentials are granted by the
user per store.

**Stack**
A named application within a store, as Alchemy records it. A stack contains
stages. When a stack has no stages, an administrator can remove its empty state
entry without deleting deployed infrastructure.

**Alchemy-managed stack**
A stack that represents infrastructure Alchemy created for its own operation,
rather than application infrastructure. It is identified visibly without
relying on color alone and cannot use generic stage deletion. Its lifecycle is
managed through Alchemy's dedicated flow. `CloudflareStateStore` is an
Alchemy-managed stack.

**Stage**
A deployed environment of a stack (for example `dev`, `preview`, `prod`). A
stage owns resources and outputs. Stages whose names start with `prod` are
protected: deleting one requires typing the acknowledgement phrase
`I KNOW WHAT I AM DOING`, which the server checks again. Deletion begins only
when every recorded resource can be managed. Execution can partially succeed;
failed resources remain recorded for a later retry.

**Resource**
One unit of infrastructure recorded in a stage's state, identified by its
fully qualified name. A resource has a type, a status, properties and
attributes.

**DynamoDB table**
An AWS resource containing items. Deleting this resource during stage deletion
means deleting the whole table and its data, rather than clearing its items
while keeping the table.

**Credential selection**
The deletion review's per-provider choice of which credential (and, for AWS,
which region) the stage will be deleted with. Console proposes a default from
the accounts and regions recorded on the stage's resources, falling back to the
store's locating credential or the only granted option; the user can change it
before confirming. One credential serves each provider for the whole stage.

**Settings**
The screen where a user manages their provider credentials, grouped by
provider, independently of any store.

**Ignore a resource**
A per-resource checkbox in the deletion review for any resource Console cannot
delete, whether the type is unsupported or the resource is blocked. On confirm,
Alchemy removes the resource from the stage's state and leaves whatever the
resource created in place, so it may become an orphan.

**Deletion review**
A stage-wide summary of the intended outcome for each resource before deletion
begins, including the credential selection per provider and the reasons Console
cannot delete particular resources.

**Action**
A resource-like record produced by a one-off step. An action has an action
type, status, input and output rather than resource properties and attributes.

**Resource summary**
The row-level view of a resource: its fully qualified name, kind, type and
status. Enough to scan a stage without opening each resource.

**Resource state**
The full recorded state of one resource, including properties, attributes and
provider-specific fields, with secrets masked.

**Outputs**
The values a stage exports after deployment. Outputs belong to the stage, not
to any single resource.

**Workspace**
The screen for one store: a tree of stacks and stages beside a pane showing
the selected stage's resources, actions and outputs.

**Token template**
A prefilled Cloudflare token form the console links to: `Read` covers browsing
state; `Write` adds the products Alchemy deletes through. The console stores no
access level; a missing permission surfaces when Alchemy deletes the resource.
