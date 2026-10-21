import { tmpdir } from 'node:os';
import { Duration, Effect } from 'effect';
import {
  HarnessError,
  type HarnessBinaries,
  type Skill,
} from '../../../harness/index.js';
import {
  start,
  type AppServer,
  type SkillMetadata,
} from '../app-server/index.js';

const LIST_TIMEOUT = Duration.seconds(15);

/** The enabled Skills Codex finds for `cwd`, as Codex describes them. */
export const listSkills = (
  server: AppServer,
  cwd: string,
  forceReload = false,
): Effect.Effect<ReadonlyArray<SkillMetadata>, HarnessError> =>
  server
    .request('skills/list', { cwds: [cwd], forceReload })
    .pipe(
      Effect.map(({ data }) =>
        data.flatMap((entry) => entry.skills.filter((skill) => skill.enabled)),
      ),
    );

export const toSkill = (skill: SkillMetadata): Skill => ({
  name: skill.name,
  description:
    skill.interface?.shortDescription ??
    skill.shortDescription ??
    skill.description,
});

/** Asks a short-lived `codex app-server` which Skills it offers in `cwd`. */
export const skills = (
  cwd: string,
): Effect.Effect<ReadonlyArray<Skill>, HarnessError, HarnessBinaries> =>
  Effect.gen(function* () {
    const server = yield* start(tmpdir());
    return (yield* listSkills(server, cwd)).map(toSkill);
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: LIST_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({
            message: 'Codex took too long to list its skills',
          }),
        ),
    }),
  );
