# effect-tracer is a bundled devDependency, not a runtime dependency

Story artifacts (traces and flows) reuse `@pkishorez/effect-tracer`'s
recorder and flow contract, and the frontend reuses its FlowSwimlane
renderer. Publishing laymos with effect-tracer as a runtime dependency would
leak an unstable sibling devtool into every consumer's install, so
effect-tracer is declared only as a devDependency and inlined into the
published artifact by a bundling pack step. Consequence: laymos's plain-tsc
build must gain that bundling step before publishing; the renderer-neutral
report schema under `laymos/story/schema` is the seam where the coupling
would be broken if effect-tracer ever diverges.
