---
status: accepted
---

# Make the Project Narrative one Markdown document

The optional Project Narrative is one named Markdown document. Project Maps,
Project Topics, architecture references, and reference navigation callbacks are
removed from the configuration DSL, report model, and frontend.

A continuous technical narrative is easier to author and read than a sequence
of prose and editorial diagrams. Laymos already provides dedicated Layer,
Module, and Story views from actual analysis data, so a second authored diagram
on the project page duplicates those views and can drift from them.

The Project Narrative remains separate from executable Stories and survives
Story ejection.

This supersedes only the Project Map and block-sequence decisions in ADR-0014.
Module-owned Story surfaces remain unchanged.
