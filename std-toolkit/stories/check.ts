import { Cause, Duration, Effect, Layer, Option } from 'effect';
import { StoryContext, isStory, type Story } from 'laymos/story';

const argument = process.argv[2];
if (argument === undefined) {
  console.error('usage: tsx stories/check.ts <story-file...>');
  process.exit(2);
}

const run = async () => {
  let failures = 0;
  for (const path of process.argv.slice(2)) {
    const module: Record<string, unknown> = await import(
      path.startsWith('.') || path.startsWith('/') ? path : `./${path}`
    );
    const stories = Object.values(module).filter(isStory) as Story[];
    if (stories.length === 0) {
      console.error(`✗ ${path}: no exported Story`);
      failures += 1;
    }
    for (const story of stories) {
      console.log(`\n${story.title}`);
      const budget = Option.getOrElse(
        Duration.fromInput(story.timeout ?? '10 seconds'),
        () => Duration.seconds(10),
      );
      const deadline = Date.now() + Duration.toMillis(budget);
      for (const question of story.questions) {
        const assertions: { description: string; passed: boolean }[] = [];
        const context = Layer.succeed(StoryContext, {
          beginSection: () => Effect.void,
          assert: (description, passed) =>
            Effect.sync(() => {
              assertions.push({ description, passed });
            }),
        });
        const remaining = deadline - Date.now();
        const exit = await Effect.runPromiseExit(
          remaining <= 0
            ? Effect.fail(`story timed out after ${Duration.format(budget)}`)
            : question.proof.pipe(
                Effect.provide(context),
                Effect.timeout(Duration.millis(remaining)),
                Effect.mapError((error) =>
                  error instanceof Cause.TimeoutError
                    ? `story timed out after ${Duration.format(budget)}`
                    : error,
                ),
              ),
        );
        const failed = assertions.some(({ passed }) => !passed);
        const errored = exit._tag === 'Failure';
        if (errored || failed) failures += 1;
        console.log(
          `  ${errored ? '!' : failed ? '✗' : '✓'} ${question.question}`,
        );
        for (const assertion of assertions) {
          console.log(
            `      ${assertion.passed ? '✓' : '✗'} ${assertion.description}`,
          );
        }
        if (exit._tag === 'Success') {
          console.log(`      result ${JSON.stringify(exit.value)}`);
        } else {
          console.log(`      error ${String(exit.cause)}`);
        }
      }
    }
  }
  console.log(
    failures === 0 ? '\nall questions passed' : `\n${failures} failed`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
};

void run();
