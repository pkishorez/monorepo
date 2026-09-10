# Alchemy Console — Ubiquitous Language

## Terms

**Store**
A saved, user-owned connection to one Alchemy state endpoint on Cloudflare. A
user picks a store; they rarely browse stores. Stores are managed (added,
renamed, re-credentialed, removed) separately from exploring their contents.

**Stack**
A named application within a store, as Alchemy records it. A stack contains
stages.

**Stage**
A deployed environment of a stack (for example `dev`, `preview`, `prod`). A
stage owns resources and outputs. Stages whose names start with `prod` are
protected from deletion in the console.

**Resource**
One unit of infrastructure recorded in a stage's state, identified by its
fully qualified name. A resource has a type, a status, properties and outputs.
An _action_ is a resource-like record produced by a one-off step; it has an
action type instead of a resource type.

**Resource summary**
The row-level view of a resource: its fully qualified name, kind, type and
status. Enough to scan a stage without opening each resource.

**Resource state**
The full recorded state of one resource, including properties, outputs and
provider-specific fields, with secrets masked.

**Outputs**
The values a stage exports after deployment. Outputs belong to the stage, not
to any single resource.

**Workspace**
The screen for one store: a tree of stacks and stages beside a pane showing
the selected stage's resources and outputs, with a resource's state opening in
a detail panel alongside the list.

**Access**
What the saved credentials allow the console to do with a store: `view` reads
state; `admin` also allows stage deletion.
