# Effect-only Stories

The engine, config loading, CLI, Node API, Story builder, and Story runner use
Effect. `laymos/story` is the only Story authoring surface: lifecycle functions,
blocks, and decision arms all return Effects.

This keeps one execution, failure, interruption, concurrency, and service model.
Recorder state and parent visits travel through Effect context references. A
plain global slot is used only while the sequential Node loader imports one
Story file, allowing Jiti's module instance to publish its declaration without
async-local state.

Rejected: a Promise-based or zero-dependency Story API. It duplicates the
builder and runner, introduces separate timeout and error semantics, and needs
ambient async context to preserve nested visits.
