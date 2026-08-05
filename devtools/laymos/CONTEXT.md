# CONTEXT — laymos

Glossary for laymos: layers, modules, and tests — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

_Being redefined from scratch. Layer, Module, and Story are deferred to later
sessions — this pass only covers the raw file-dependency extraction that
those concepts will eventually sit on top of._

**Source root**:
A configured project-relative file or folder that defines the complete static
analysis universe. Only supported source files beneath source roots participate
in rules or coverage; Git state has no bearing on membership.
