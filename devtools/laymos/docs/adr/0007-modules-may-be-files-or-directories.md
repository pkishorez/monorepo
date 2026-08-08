# Modules may be files or directories

Laymos accepts an explicitly configured supported source file as a File Module
and an explicitly configured directory as a Directory Module. A File Module is
its own public entry point, cannot expose nested public entry points, and uses
the same Shared and Layer Rule permissions as a Directory Module. Configured
Modules remain disjoint and path-identified; when a File Module needs private
companion files, it is promoted to a Directory Module instead of gaining a
second membership mechanism. This supersedes ADR-0006 only where it rejected
or deferred File Modules; attached paths remain unsupported.
