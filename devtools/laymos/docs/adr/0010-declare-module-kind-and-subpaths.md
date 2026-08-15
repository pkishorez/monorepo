# Declare Module kind and Subpaths

Laymos will declare each Configured Module as Normal, Shared, or Entry, with
Normal as the default. Shared adds same-Layer access while Layer Rules remain
the sole cross-Layer policy; Entry Modules may depend outward but cannot be
depended on. This replaces inferred Unexposed Modules and the `shared` boolean
with one explicit `kind`, so access intent is no longer inferred from the
presence of `index.ts`.

The `nested` field becomes `subpaths`. A Subpath is an extra public door into
the same Module, used only for tree shaking; it never creates a child Module or
grants dependency permission. The change is a clean config break because
supporting both vocabularies would keep the old ambiguity alive.

File and Directory remain source shapes, while Root, Terminal, Regular, and
Isolated become observed kinds derived from imports. This keeps configured
intent, physical shape, and observed graph position as separate facts.
