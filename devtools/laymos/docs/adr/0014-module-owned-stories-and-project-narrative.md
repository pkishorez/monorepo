---
status: superseded in part by ADR-0015
---

# Own Stories through Modules and author one Project Narrative

Executable Stories belong to folder Modules and are discovered from each
Module's optional, flat `stories` surface; Story Groups and separately
configured discovery roots are retired. Story surfaces may contain shared
support material, remain invisible to static architecture, and are removed
whole by Story ejection. This makes the declared architecture the single
ownership and discovery spine while allowing every Module to own any number of
Stories, including none.

The optional Project Narrative is authored as the config's `project` value,
inline or imported, and may reference declared Layer Graphs, Layers, and
Modules. It remains separate from executable Stories and survives Story
ejection. Project Map references expose optional typed navigation events, but
frontend blocks do not navigate between views themselves.

Layer Graphs, Layers, and Modules require short descriptions so the enforced
architecture also carries its human intent. Project Topics reference those
durable architecture values rather than individual Stories, allowing the
Project Narrative to remain valid after Story ejection.

Story and Scenario descriptions and optional rich documentation remain local to
their executable Story. Story coverage likewise remains local to one Story and
reports narrated, omitted, and unnarrated percentages without any higher-level
rollup.
