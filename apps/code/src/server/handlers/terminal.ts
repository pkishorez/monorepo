import { Effect, Stream } from 'effect';
import { TerminalRpcs } from '../api/terminal.js';
import { TerminalService } from '../../services/terminal.js';

export const TerminalHandlersLive = TerminalRpcs.toLayer({
  createTerminal: (req) =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      return yield* svc.create({
        command: req.command,
        cwd: req.cwd,
        env: req.env,
        cols: req.cols,
        rows: req.rows,
        scrollback: req.scrollback,
      });
    }),

  listTerminals: () =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      return yield* svc.list();
    }),

  getTerminalSnapshot: (req) =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      return yield* svc.getSnapshot(req.id);
    }),

  streamTerminal: (req) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const svc = yield* TerminalService;
        return yield* svc.stream(req.id);
      }),
    ),

  writeToTerminal: (req) =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      yield* svc.write(req.id, req.data);
    }),

  resizeTerminal: (req) =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      yield* svc.resize(req.id, req.cols, req.rows);
    }),

  killTerminal: (req) =>
    Effect.gen(function* () {
      const svc = yield* TerminalService;
      yield* svc.kill(req.id);
    }),
});
