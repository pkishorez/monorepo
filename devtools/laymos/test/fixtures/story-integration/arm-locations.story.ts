import { Effect } from 'effect';
import { decision, exhaustive, story, when } from 'laymos/story';

const route = (value: 'left' | 'right') =>
  decision('route', { description: 'Chooses one route.' }, value).pipe(
    when('left', { description: 'Takes the left route.' }, () =>
      Effect.succeed('left'),
    ),
    when('right', { description: 'Takes the right route.' }, () =>
      Effect.succeed('right'),
    ),
    exhaustive,
  );

story('arm locations', {
  description: 'Records authored Decision Arm locations.',
})
  .execute(route)
  .scenario(
    'left',
    { description: 'Selects the left route.' },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed('left' as const))
        .verify(() => Effect.void),
  );
