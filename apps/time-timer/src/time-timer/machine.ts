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
    /** @xstate-layout N4IgpgJg5mDOIC5QBcCWBbMBaNmBOW6AhgMYAWqAdmAMQDKAKgPIAKA2gAwC6ioADgHtYqNAMq8QAD0RYALACYAdPIAcAdjWqAjLK0BmNVoCcKgGwAaEAE8ZAVlWLNHY8aOmOb2QF8vl3Nn8CYnIqMEVYZAE+PkgaFgAZAEEATU4eJBBBYVFxDOkELC1TPUVTHVtbIvlZWzUjWUsbAvkjW0V9WuLa2VM1FQqfPwwA4aDSCmpFPABXSkoqKDjEgFU6AFE0iSyRVDEJfMLTFUdauo0ddQqVRplZI0c+ltV5YtaONUGQfxxRwnHQqazeaURYMACSAGEANKbDLbHL7GR6DhKIx6dSmWwcUw46o9G7NPRaRTqeQcBTkrFk8mfb6BP4hSYzOYLGiw-hCHZ7PKIOqKO5lFpaNS2foVLQErBPEkqNymEzuAxo2nDH74BkTMJ8IjTWCxABKazoywAshtuFtOQieQh+ooKhwVEVam4tCp1JK7g8VE8fa8sWpvJ9KAIIHAJHTfsFNZbsrtcqADnosYo0RisTjTHiLNYZGVTIpyUTHRwDIH5PIVZg1WAxoywhEojEILGuQmpDJ5JpFHp0fZ7MnhRLcwUerIHkdZHoWndZSoqyN1dGAczgVBW9bE53HaVyr0jDo1CjRZKivdnC0+lPHZi1KYFzW65rFNrdZAN-HEQU9AXnA65SWsilgSFbtMmaI-lO4H2D4PhAA */
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
          PLAY: "running",
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
      }),
      updateElapsed: assign({
        elapsedInSeconds: (_1, event) => event.elapsedInSeconds,
      }),
      updateDuration: assign({
        durationInMinutes: (_1, event) => event.durationInMinutes,
      }),
    },
    guards: {
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
