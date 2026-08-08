# FileGraph is domain-owned, not file-cruiser-owned

`FileGraph` (file → its direct imports) now lives in `src/domain/file-graph/`,
and `file-cruiser` imports the type from there instead of defining it — a
deliberate deviation from ADR 0002, which says a capability's data types stay
internal to its deep module "until a real external caller needs to name
them." The file-inspection transformation (`fileDependencies`) is that real
caller: it operates purely on `FileGraph` data with no I/O, so it belongs in a
domain layer rather than inside `file-cruiser` itself, and a domain layer needs
the type to do that.
The alternative — leaving `FileGraph` defined in `file-cruiser` and having
domain import it from there — would make the domain layer depend on a
service's internals instead of the reverse, inverting the intended direction
(services depend on domain, not the other way around) for no benefit, since
`FileGraph` was never meaningfully "file-cruiser-specific" logic to begin
with. `FileGraph` still isn't part of laymos's public package API; only its
ownership within `src/` moved.
