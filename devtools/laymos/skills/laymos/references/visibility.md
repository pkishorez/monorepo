# Module visibility

Read this when deciding who may import a module.

## What are the two flags?

Every module declares two booleans, both defaulting to `false`.
They open layer-wide and cross-layer access; module graph rules separately grant
member-to-member access.

- `shared` — peers in the same layer may import it.
- `exposed` — other layers may import it, subject to layer rules.

That is the whole vocabulary. There is no `kind`, and no `subpaths`.

| you want                                       | declare                                |
| ---------------------------------------------- | -------------------------------------- |
| a layer's public capability                    | `exposed`                              |
| a layer-internal helper its peers share        | `shared`                               |
| both                                           | `shared` and `exposed`                 |
| a graph-private capability                     | neither; grant graph rules to its door |
| a host-started root — a CLI, a route, a worker | neither                                |

## What follows from the flags?

A directory module needs an `index.ts` when `shared || exposed`, and every
directory module graph member needs one so permitted peers use its door. A
free-form module nobody may import needs no door and follows its host convention.

An unimported free-form private module is an intentional root when its layer has
no inbound rules — that is where hosts enter. In a module graph, a private member
with no incoming graph rule is dead. Laymos reports either invalid case.

## When is shared wrong?

Shared exists for a genuine layer-wide capability. Match the symptom, take the verdict.

- No same-layer user → it is not shared. Drop the flag.
  Laymos reports this as an `unused-shared` violation.
- Exactly one same-layer user → either that user owns the code, or the two
  modules should merge. Check before keeping shared.
- Several peers forming a chain → they are one capability with an interior.
  Make them a module graph, where each edge is declared.
- A shared module importing another shared module → merge them, or move the
  lower one into a layer with the right dependency policy.

Each verdict demands a stated reason. None of them decides the design alone.

## What if peers need common code?

Test three options before adding shared.

1. One peer already owns the capability. Let it own it.
2. The peers are one capability split in two. Merge them, or make them a graph.
3. The capability is stable and lower. Move it to a layer the peers may reach.

## When do I reach for a module graph?

When one capability is too large for one module and its parts need declared
connections. Read `graphs.md`.
