# Nodes decide what exists; React only draws

All app state lives in one tree of Nodes outside React, as their Models and States, and only an Update can change it. Which Children exist, which Services are Provided, and which Lifetimes run all follow from the current States, never from what React mounts. Views read and Send; they never run Effects, hold state, or call hooks.

## Considered Options

- **React components own their state and effects (hooks)**: rejected. Mounting would create state and start work, so the same Messages could give different apps depending on StrictMode, Suspense or render order, and the Log could no longer rebuild the app.
- **Typed React Context for Services**: rejected. It cannot prove at compile time that a Provider exists above every consumer, and its lifecycle is React's mounting, not the State.
- **Foldkit itself**: rejected only because it draws with its own virtual DOM, so it cannot live inside a React app or use React components.

## Consequences

- Logic runs and is tested without rendering anything.
- A View may skip drawing a Child, draw it elsewhere, or draw it twice; the Child's logic is unaffected.
- State inside third-party React components (focus, scroll, a map's camera) is outside the Nodes and outside the Log unless an app mirrors it on purpose.
