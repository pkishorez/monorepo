// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  internalEvents: {
    "": { type: "" };
    "xstate.init": { type: "xstate.init" };
  };
  invokeSrcNameMap: {
    runTimer: "done.invoke.time-timer-machine.running:invocation[0]";
  };
  missingImplementations: {
    actions: never;
    delays: never;
    guards: never;
    services: never;
  };
  eventsCausingActions: {
    resetElapsed: "" | "STOP" | "xstate.init";
    updateDuration: "UPDATE_DURATION";
    updateElapsed: "TICK";
  };
  eventsCausingDelays: {};
  eventsCausingGuards: {
    isNotStopped: "STOP";
    isTimeUp: "";
  };
  eventsCausingServices: {
    runTimer: "PLAY" | "RESUME";
  };
  matchesStates: "paused" | "running" | "stopped";
  tags: never;
}
