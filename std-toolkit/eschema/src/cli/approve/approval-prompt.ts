import { Effect, Terminal } from 'effect';
import { Prompt } from 'effect/unstable/cli';

export type ApprovalDecision = 'approve' | 'ignore';

export type ApprovalTextReader<E = never, R = never> = (
  label: string,
) => Effect.Effect<string, E, R>;

export type ApprovalDisplay<E = never, R = never> = (
  text: string,
) => Effect.Effect<void, E, R>;

export function promptApprovalText(label: string) {
  return Prompt.run(
    Prompt.text({
      message: `Approve ${label}? [approve/ignore]`,
    }),
  );
}

export function displayLine(line: string) {
  return Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    yield* terminal.display(`${line}\n`);
  });
}

export function readApprovalDecision<
  ReadError,
  ReadContext,
  DisplayError,
  DisplayContext,
>(input: {
  readonly label: string;
  readonly readApprovalText: ApprovalTextReader<ReadError, ReadContext>;
  readonly display: ApprovalDisplay<DisplayError, DisplayContext>;
}): Effect.Effect<
  ApprovalDecision,
  ReadError | DisplayError,
  ReadContext | DisplayContext
> {
  return Effect.gen(function* () {
    const answer = yield* input.readApprovalText(input.label);
    const decision = parseApprovalDecision(answer);
    if (decision !== null) {
      return decision;
    }
    yield* input.display('Please answer approve, a, ignore, or i.');
    return yield* readApprovalDecision(input);
  });
}

function parseApprovalDecision(answer: string): ApprovalDecision | null {
  const normalized = answer.trim();
  if (normalized === 'approve' || normalized === 'a') {
    return 'approve';
  }
  if (normalized === 'ignore' || normalized === 'i') {
    return 'ignore';
  }
  return null;
}
