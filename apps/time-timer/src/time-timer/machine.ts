import { assign, createMachine } from "xstate";

type Event =
  | {
      type: "PAUSE" | "RESUME" | "STOP";
    }
  | { type: "PLAY"; durationInMinutes: number }
  | { type: "TICK"; elapsedInSeconds: number }
  | {
      type: "UPDATE_DURATION";
      durationInMinutes: number;
    };

type Context = {
  durationInMinutes: number;
  elapsedInSeconds: number;
};

export const timeTimerMachine = createMachine(
  {
    /** @xstate-layout N4IgpgJg5mDOIC5QBcCWBbMBaNmBOW6AhgMYAWqAdmAMQDKAKgPIAKA2gAwC6ioADgHtYqNAMq8QAD0QBGAOwcAdAE4ATDIAcygMwA2DdrmqOugDQgAnoiwAWDTMUBWE7pu6ZM5Wrm6Avr-NcbCCCYnIqMEVYZAE+PkgaFgAZAEEATU4eJBBBYVFxbOkELE1HRQ5jA01tStdtcyti1Q0bRW1tDVUauRs3NQ1Hf0CMYJHQ0gpqKJi4hIBVFgARFIYAUQB9RbmAJRWASSYAOUyJXJFUMQki22VFXWMbHoeOZw4NButHZTkVNW-tGSOXR6fRDEBBHBjQgTCKKPAAV0olCoUESKTmdFWJ2yZ3yV2sniUMlcHDkcjUXU6wI+xQ6Kg0pPcXhJOj8AXBI0h+Gh4SmCKRKJoDD2AGEANLY-hCc6XQrWPQaRQtQz3ToDe6qGlYVSOMoaTo2doVZyODT3MEQkI8yaRfnIyioyU5aV4uUIU3lLQtLT6bR2Nxa5qqcpqGTaZQcbSR1kWzlWsI2xR8Ijw2AJbarOhzACyWO4pxdFwKoCKrkUMl6jj0hnUHk6WrpygZPk8yhZhn87MoAggcAklqhCYiBbyRfxxUNuju5N05JsqmMMg48i1+jKANNZt0jjs9hkscwXLA415kWisXiEBHMuLUnl+unbbnC+Xy7kWrsU-1qh0PSjP+BQZ2QHbkhz5RF7Sga9XRLawuiUCo3jsGQF2MNt6ksAkPXUHdHl0Dg3gZF4D1GUCYSmZNU0gaCxzdLBHB+ed5C9X0PFJGkahUdo3F6ORuMcBcgP8IA */
    initial: "stopped",
    tsTypes: {} as import("./machine.typegen").Typegen0,
    context: { durationInMinutes: 30, elapsedInSeconds: 0 } as Context,

    schema: {
      events: {} as Event,
      context: {
        durationInMinutes: 30,
        elapsedInSeconds: 0,
      } satisfies Context as Context,
    },

    states: {
      stopped: {
        entry: "resetElapsed",
        description: "Initial or the stopped state of the time timer.",
        on: {
          PLAY: {
            target: "running",
            cond: "canPlay",
          },
          UPDATE_DURATION: {
            actions: "updateDuration",
          },
        },
      },
      running: {
        always: {
          target: "stopped",
          cond: "isTimeUp",
        },
        invoke: {
          src: "runTimer",
        },
        on: {
          PAUSE: "paused",
          TICK: {
            actions: "updateElapsed",
          },
        },
      },
      paused: {
        on: {
          RESUME: "running",
        },
      },
    },
    on: {
      STOP: {
        description: "The timer cannot be stopped if already in stopped state.",
        target: ".stopped",
        cond: "isNotStopped",
      },
    },
    id: "time-timer-machine",
  },
  {
    actions: {
      resetElapsed: assign({
        elapsedInSeconds: 0,
        durationInMinutes: 0,
      }),
      updateElapsed: assign({
        elapsedInSeconds: (_1, event) => event.elapsedInSeconds,
      }),
      updateDuration: assign({
        durationInMinutes: (_1, event) => event.durationInMinutes,
      }),
    },
    guards: {
      canPlay: (context) => context.durationInMinutes > 0,
      isNotStopped: (_1, _2, meta) => {
        return !meta.state.matches("stopped");
      },
      isTimeUp: (context) =>
        context.elapsedInSeconds >= context.durationInMinutes * 60,
    },
    services: {
      runTimer: (context) => (sendBack) => {
        const durationInSeconds = context.durationInMinutes * 60;

        const until =
          Date.now() +
          (durationInSeconds * 60 - context.elapsedInSeconds) * 1000;

        const interval = setInterval(() => {
          const elapsed =
            durationInSeconds * 60 - Math.round((until - Date.now()) / 1000);
          sendBack({ type: "TICK", elapsedInSeconds: elapsed });
        }, 1000);

        return () => clearInterval(interval);
      },
    },
  },
);
