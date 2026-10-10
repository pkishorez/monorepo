---
'effect-oak': patch
---

Every Message carries its Time, and Update gets it as `at`. Replay and `useTimeTravel` seek by Time instead of by Message count. Each State's draw gets `useFrame` to move things between Messages without a React render, and is mounted as its own component, so it can use hooks. `useTimeTravel` can `pause` and `resume` the app's Time, and Commands and Lifetimes sleep in it, so their timers pause too. An Update can return `replaceCommands: true` to stop its Node's running Commands first. `toReact` adds `useRoot` for the live root's Model and State.
