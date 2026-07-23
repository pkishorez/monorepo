# Provide project-wide Story ejection

Laymos provides `laymos stories eject` as an atomic, one-way escape hatch from
Story instrumentation. It rewrites supported Story Blocks to native Effect and
TypeScript forms across the current project and deletes only discovered Laymos
Story files, allowing teams to adopt Stories without permanently committing
their application code to Laymos's narrative model. Partial ejection is not
supported because mixed traced and untraced execution is unsafe and misleading.

ADR-0014 replaces only the deletion boundary: ejection now removes complete
Module Story surfaces, including their support material.
