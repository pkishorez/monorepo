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
How a Collection reads the Backend for one Key, or for one Window of it,
resuming from its saved cursor.
_Avoid_: Source, Feed, Reader.

**Window**:
The records of one Collection whose field reads one value, such as the
entries of wallet 7. A Query that filters on that field opens it, and its
Strategy runs while it is open; its records stay in the Store after it closes.
_Avoid_: Partition (a [[db]] word for a physical slice of a table).

**Caught Up**:
A Collection, or a Window of one, whose Strategy has had its first answer
from the Backend since it started running, whatever that answer held. Until
then an empty read may only mean not read yet; rows already stored show at
once either way.
_Avoid_: Settled, Synced, Loaded, Ready.

**Never Synced**:
A Collection, or a Window of one, whose Strategy has never answered on this
device: the Store holds no cursor for it. Only then is an empty read not
known yet; once it has answered, even with nothing, what the Store holds is
what was last synced, across reloads and while no Strategy runs.
_Avoid_: Empty, Unloaded, First Load.

**GC Time**:
How long an Instance or a Window keeps running after the last thing using it
lets go. Its stored records stay.
_Avoid_: Linger, keep-alive.

**Settle Window**:
How long, back from the newest change read, a Backend may take to make a
write readable. A Strategy that honors it re-reads that stretch each time.
_Avoid_: Cadence Repair, lookback.

**Gate**:
Whether an Instance may fetch now, decided per Key. While it is closed the
Instance stays readable and no Strategy runs.
_Avoid_: Guard, Condition.

**Store**:
Where Instances are kept on this device (IndexedDB, SQLite, memory): the only
truth there. It lists and deletes Instances, and keeps tabs in agreement. An
app may keep one Store per Account, each holding only that Account's
Instances.
_Avoid_: Sync Store, cache, persistence.

**Prune**:
A Store told the whole list of what it keeps, Replicas and the Keys of each,
deleting every other Instance it holds. What it keeps is declared, never what
it drops, so a Replica renamed or a Key gone is deleted without anyone
naming it.
_Avoid_: retire, garbage-collect, cleanup, sweep.

**Leader**:
The one participant that runs an Instance's Strategies, those of the Windows
any participant has open included; every other participant with the same
Instance follows through the Store.
_Avoid_: primary tab.

**Doorbell**:
The signal that an Instance's stored data changed, so followers re-read it. It
carries no records.

### Reading and writing

**Query**:
A reader whose Model is rows from Collections of any Instances, joins and
unions included. Its rows always say which Instances they came from, and it
names the Instances holding what it reads that is Never Synced.
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
