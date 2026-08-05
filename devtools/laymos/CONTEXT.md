# CONTEXT — laymos

Glossary for laymos: layers, modules, and tests — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

_Being redefined from scratch. Module and Story are deferred to later
sessions._

**Source root**:
A configured project-relative file or folder that defines the complete static
analysis universe. Only supported source files beneath source roots participate
in rules or coverage; Git state has no bearing on membership.

**Layer**:
A named, configured group of project-relative paths. Layers are disjoint — no
path may belong to more than one layer.

**LayerGraph**:
A named, configured set of Rules representing one responsibility (e.g. core
architecture, test boundaries) — an organizational and visual grouping, not an
enforcement boundary. A LayerGraph may reference any subset of the project's
Layers; a Layer absent from a given LayerGraph simply has no rules declared
under that responsibility. Enforcement never scopes to a single LayerGraph:
the permission set actually enforced is the union of every Rule declared
across every LayerGraph in the project. Because Rules only grant permission
(never restrict), LayerGraphs cannot conflict with one another.

**Rule** (within a LayerGraph):
A direct, declared permission: Layer X may depend on Layer Y. Rules are
default-deny — a dependency between two Layers with no declared path between
them (direct or transitive, across the union of all LayerGraphs) is a
violation. Permission is transitive: if X may depend on Y and Y may depend on
Z, X may also depend on Z, without X → Z being declared explicitly. A Layer
with no outgoing rule is a valid, intentional leaf, not a configuration gap.

**FileGraph**:
The raw file-dependency graph produced by cruising a project: for every
source file, the set of source files it directly imports. This is the single
source of truth all dependency queries are computed from — it is never
presented to a user directly.

**Dependency query**:
A request for the dependencies of one target — a file or a folder — rather
than the whole project's FileGraph. A query is either non-recursive (direct
dependencies only, one hop) or recursive (direct dependencies plus every
dependency reachable transitively through them).

**Target** (of a dependency query):
The file or folder a dependency query is computed for. A folder target's
membership always includes files in nested subfolders. A target's own member
files are never themselves reported as its dependencies — a folder does not
depend on itself, so only files outside the target ever appear in a query's
result.

**Direct dependency**:
In a dependency query's result, a file outside the target that is imported
straight from inside the target — one hop.

**Recursive dependency**:
In a dependency query's result, a file outside the target only reached by
walking further out through another dependency — a dependency of a
dependency, two or more hops from the target. Only appears when the query is
recursive.
