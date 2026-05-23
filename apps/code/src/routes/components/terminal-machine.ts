import { setup, assign, fromPromise, fromCallback } from 'xstate';
import { Effect, Option } from 'effect';
import { CodeClient, codeRuntime } from '@/routes/internal/effect';
import type { TerminalInfo } from '@/domain/terminal';

const POLL_INTERVAL_MS = 2000;

export const terminalMachine = setup({
  types: {
    context: {} as {
      sessions: TerminalInfo[];
      activeSessionId: number | null;
      readOnly: boolean;
      error: string | null;
    },
    events: {} as
      | { type: 'CREATE' }
      | { type: 'SELECT'; id: number; readOnly: boolean }
      | { type: 'DISCONNECT' }
      | { type: 'REFRESH' }
      | { type: 'SESSIONS_UPDATED'; sessions: TerminalInfo[] },
  },
  actors: {
    loadSessions: fromPromise(async () => {
      const sessions = await codeRuntime.runPromise(
        Effect.gen(function* () {
          const { client } = yield* CodeClient;
          return yield* client.listTerminals();
        }),
      );
      return [...sessions];
    }),
    createSession: fromPromise(async () => {
      return codeRuntime.runPromise(
        Effect.gen(function* () {
          const { client } = yield* CodeClient;
          const { id } = yield* client.createTerminal({
            command: Option.none(),
            cwd: '.',
            env: Option.none(),
            cols: 50,
            rows: 25,
            scrollback: 1000,
          });
          return id;
        }),
      );
    }),
    pollSessions: fromCallback(({ sendBack }) => {
      const poll = async () => {
        try {
          const sessions = await codeRuntime.runPromise(
            Effect.gen(function* () {
              const { client } = yield* CodeClient;
              return yield* client.listTerminals();
            }),
          );
          sendBack({ type: 'SESSIONS_UPDATED', sessions: [...sessions] });
        } catch {}
      };
      const id = setInterval(poll, POLL_INTERVAL_MS);
      poll();
      return () => clearInterval(id);
    }),
  },
}).createMachine({
  id: 'terminal',
  initial: 'loading',
  context: {
    sessions: [],
    activeSessionId: null,
    readOnly: false,
    error: null,
  },
  states: {
    loading: {
      invoke: {
        src: 'loadSessions',
        onDone: {
          target: 'idle',
          actions: assign({
            sessions: ({ event }) => event.output,
            error: () => null,
          }),
        },
        onError: {
          target: 'idle',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    idle: {
      on: {
        CREATE: 'creating',
        SELECT: {
          target: 'active',
          actions: assign({
            activeSessionId: ({ event }) => event.id,
            readOnly: ({ event }) => event.readOnly,
          }),
        },
        REFRESH: 'loading',
      },
    },
    creating: {
      invoke: {
        src: 'createSession',
        onDone: {
          target: 'active',
          actions: assign({
            activeSessionId: ({ event }) => event.output,
            readOnly: () => false,
          }),
        },
        onError: {
          target: 'idle',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    active: {
      invoke: {
        src: 'pollSessions',
      },
      on: {
        SESSIONS_UPDATED: {
          actions: assign({
            sessions: ({ event }) => event.sessions,
          }),
        },
        DISCONNECT: {
          target: 'loading',
          actions: assign({
            activeSessionId: () => null,
            readOnly: () => false,
          }),
        },
      },
    },
  },
});
