# Alchemy Console — Ubiquitous Language

## Terms

**Store**
A saved, user-owned connection to one Alchemy state endpoint on Cloudflare. A
user picks a store; they rarely browse stores. Stores are managed (added,
renamed, re-credentialed, removed) separately from exploring their contents.

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

**AWS connection**
An optional connection attached to a store that supplies access to one AWS
account in one region. A store has at most one AWS connection, independently
of its Cloudflare state-store connection.

**Ignore a resource**
A per-resource checkbox in the deletion review for types Console cannot
delete. On confirm, Alchemy removes the resource from the stage's state and
leaves whatever the resource created in place.

**Deletion review**
A stage-wide summary of the intended outcome for each resource before deletion
begins, including the reasons Console cannot delete particular resources.

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
