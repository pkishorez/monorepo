import { Effect, Terminal } from 'effect';
import { Flag, Prompt } from 'effect/unstable/cli';
import { isPeerIdentifier } from '../contract/index.ts';

const normalize = (raw: string) => raw.trim().toLowerCase();

const peerIdentifier = (name: string, message: string) =>
  Flag.string(name).pipe(
    Flag.withDescription(message),
    Flag.withFallbackPrompt(
      Prompt.text({
        message,
        validate: (raw) =>
          isPeerIdentifier(normalize(raw))
            ? Effect.succeed(normalize(raw))
            : Effect.fail('Use 1-64 lowercase letters, digits, - or _'),
      }),
    ),
    Flag.map(normalize),
  );

/** Both Peer Identifiers, taken from flags or asked for when missing. */
export const identity = {
  name: peerIdentifier('name', 'Your name'),
  remote: peerIdentifier('remote', 'Connect to'),
};

/** Hands every typed line to `onLine` until the terminal quits. */
export const readLines = <E, R>(
  onLine: (line: string) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    yield* terminal.readLine.pipe(
      Effect.flatMap((line) => onLine(line.trim())),
      Effect.forever,
    );
  }).pipe(Effect.catchTag('QuitError', () => Effect.void));
