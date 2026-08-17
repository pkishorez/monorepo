# Module visibility is two booleans

ADR-0010 declared each Configured Module as Normal, Shared, or Entry and added
`subpaths`. Those three kinds encoded two independent facts — whether same-Layer
peers may import the Module, and whether other Layers may — and encoded them
badly: the fourth combination, a capability shared inside its Layer but not
exported beyond it, was unrepresentable. Laymos replaces `kind` with two
booleans on every Configured Module, `shared` and `exposed`, both defaulting to
`false`, so a Module is importable by nobody until it says otherwise.

Normal becomes `exposed`, Shared becomes both, Entry becomes neither, and the
missing case becomes `shared` alone. The two flags mean the same thing wherever
they appear, so a Module Graph member and a free-form Module are configured
identically even though the rules governing them differ.

Entry's second, hidden meaning — that an Entry Module needs no public entry
point — becomes a derivation rather than a declaration: a Module needs an
`index.ts` exactly when `shared || exposed`, because a Module nobody may import
needs no door. The remaining job of the Entry kind was suppressing a dead-code
report on host-started Modules, which is now derived from position in the Layer
permission union: a private, unimported Module in a Layer with no inbound Rules
is where hosts enter and is not reported, while the same Module anywhere else is
dead. This can under-report dead code in top Layers, which are small, and it
cannot be gamed by moving dead code downward.

`subpaths` is deleted rather than migrated. It was used four times across five
projects and never with more than two entries, and every use converts to a
Module Graph (ADR-0013) whose facade is a root file Module. Keeping a
policy-free extra door alongside a policy-carrying member would preserve exactly
the flat-versus-nested ambiguity these decisions remove.

A third boolean for package-published Modules was considered and rejected. The
Modules that appeared to need it were mislabelled `shared` while having no
same-Layer dependents at all; they are simply `exposed`. The cost is that
"exposed Module nobody imports" cannot be reported, since a dead export and a
published one are indistinguishable without reading `package.json`. That report
does not exist today and is not worth a field on every Module.

This is a clean config break, consistent with ADR-0010's own reasoning.
