import { Effect, Stream } from 'effect';
import { AppError } from '../definitions/app.js';
import { TerminalRpcs } from '../definitions/terminal.js';
import { TerminalService } from '../../terminal/service.js';

export const TerminalHandlers = TerminalRpcs.toLayer(
  TerminalRpcs.of({
    'terminal.open': ({ absolutePath, name }) =>
      Effect.gen(function* () {
        const terminal = yield* TerminalService;
        return yield* terminal.open(absolutePath, name);
      }).pipe(
        Effect.mapError((e) => new AppError({ message: String(e) })),
        Effect.withSpan('rpc.terminal.open', { attributes: { absolutePath } }),
      ),
    'terminal.write': ({ sessionId, data }) =>
      Effect.gen(function* () {
        const terminal = yield* TerminalService;
        yield* terminal.write(sessionId, data);
      }).pipe(
        Effect.mapError((e) => new AppError({ message: String(e) })),
        Effect.withSpan('rpc.terminal.write', { attributes: { sessionId } }),
      ),
    'terminal.resize': ({ sessionId, cols, rows }) =>
      Effect.gen(function* () {
        const terminal = yield* TerminalService;
        yield* terminal.resize(sessionId, cols, rows);
      }).pipe(
        Effect.mapError((e) => new AppError({ message: String(e) })),
        Effect.withSpan('rpc.terminal.resize', { attributes: { sessionId } }),
      ),
    'terminal.close': ({ sessionId }) =>
      Effect.gen(function* () {
        const terminal = yield* TerminalService;
        yield* terminal.close(sessionId);
      }).pipe(
        Effect.mapError((e) => new AppError({ message: String(e) })),
        Effect.withSpan('rpc.terminal.close', { attributes: { sessionId } }),
      ),
    'terminal.stream': ({ sessionId }) =>
      Stream.unwrap(
        TerminalService.pipe(
          Effect.map((terminal) => terminal.stream(sessionId)),
          Effect.mapError((e) => new AppError({ message: String(e) })),
        ),
      ),
  }),
);
