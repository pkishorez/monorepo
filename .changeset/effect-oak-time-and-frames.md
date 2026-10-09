---
'effect-oak': patch
---

Every Message carries its Time, and Update gets it as `at`. Replay and `useTimeTravel` seek by Time instead of by Message count. Each State's draw gets `useFrame` to move things between Messages without a React render, and is mounted as its own component, so it can use hooks. `useTimeTravel` can `pause` and `resume` the app's Time.
