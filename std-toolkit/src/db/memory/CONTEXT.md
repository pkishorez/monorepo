# db/memory — Ubiquitous Language

The Memory adapter. It realizes the shared [[db]] **StdTable contract** as ephemeral state available anywhere the toolkit can run, without a database or platform binding. This glossary defines only where Memory diverges from the shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**Memory adapter table**:
The result of `Memory.make` (`MemoryTable`): one isolated, immediately usable in-memory realization of a shared [[db]] **StdTable**. Its state belongs to the returned adapter table, so reusing its layer shares the state while another `Memory.make` starts empty.
_Avoid_: InMemoryTable, test database, global memory store.

**Memory lifetime**:
The lifetime of a **Memory adapter table** within one JavaScript runtime. Its state is never persisted and becomes unreachable with the adapter table; Effect layer construction does not reset or recreate it.
_Avoid_: Session, process-global database, layer lifetime.

**Memory read consistency**:
Primary, LSI, and GSI access patterns observe the latest completed Memory write.
