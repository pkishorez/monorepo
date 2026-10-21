# Replica

Replica keeps local copies of the Backend on the device and keeps them fresh,
as part of a Kabuki app: every Instance, Query and Action is an actor or a
Command, so time travel and the Inspector see sync. It replaces [[sync]] for
Kabuki apps; [[sync]] stays the React way. Every edge it shares with a
Backend or a Store carries [[core]] **Entities**.

## Language

### Shapes

**Replica**:
One domain's local copy of the Backend: a Key and a set of Collections, with
one responsibility, like one single-table database. Written in two steps:
`make` gives its **Shape** (the Key and Collection schemas), `build` its
**Build** (Strategies and Gate).
_Avoid_: Std Sync, Mirror, Dataset.

**Key**:
What tells one Instance of a Replica from another, such as an account id. A
Replica without a Key has exactly one Instance.
_Avoid_: Owner, Scope, Tenant.

**Instance**:
One Replica for one Key, such as `todo·acct-42`. Its Key never changes, and
its stored data is named by Replica and Key, never by its place in the tree.
_Avoid_: Replica Instance, Std Sync, current instance.

**Collection**:
One kind of record in a Replica. In an Instance it always shows what the Store
holds, plus Optimistic Changes on top.

### Syncing

**Strategy**:
How a Collection reads the Backend for one Key, resuming from its saved
cursor.
_Avoid_: Source, Feed, Reader.

**Gate**:
Whether an Instance may fetch now, decided per Key. While it is closed the
Instance stays readable and no Strategy runs.
_Avoid_: Guard, Condition.

**Store**:
Where Instances are kept on this device (IndexedDB, SQLite, memory): the only
truth there. It lists and deletes Instances, and keeps tabs in agreement.
_Avoid_: Sync Store, cache, persistence.

**Leader**:
The one participant that runs an Instance's Strategies; every other
participant with the same Instance follows through the Store.
_Avoid_: primary tab.

**Doorbell**:
The signal that an Instance's stored data changed, so followers re-read it. It
carries no records.

### Reading and writing

**Query**:
A reader whose Model is rows from Collections of any Instances, joins
included. Its rows always say which Instances they came from.
_Avoid_: live query actor, selector.

**Action**:
A named write: Optimistic Changes now, then the Backend, then Confirm; a
failure anywhere rolls every Optimistic Change back. It may span Instances and
Replicas, and it names the Keys it writes.
_Avoid_: Mutation, insert/update/delete handler.

**Optimistic Change**:
A change an Action makes to Collections before the Backend answers. It is
never stored.

**Confirm**:
Putting the records the Backend returned into an Instance's Store, which
replaces the Optimistic Changes they answer.
