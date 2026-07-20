# Full Effect engine, zero-dependency story core

The engine (extract → resolve → evaluate → emit), config loading, CLI, and
vitest reporter are built on Effect — tagged errors, `Effect`-returning stage
signatures — consistent with the rest of this repo, and devtools (the main
programmatic consumer) is already Effect-native. `analyzeProjectPromise`
covers non-Effect consumers.

The deliberate exception: `laymos/story` primitives (`storyFn`, `step`,
`decision`) import nothing — they ship inside user production bundles in
noop/log mode, and three wrappers don't justify pulling `effect` into a
consumer's bundle. Effect users get `yield*`-able companions at
`laymos/story/effect` instead; both variants drive the same tracer core, so
traces are identical. Do not "unify" these two surfaces — the split is the
point.
