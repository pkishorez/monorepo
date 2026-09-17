import path from 'node:path';
import { Console, Effect, FileSystem } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

export type SkillsCommandOptions = {
  /** Folder holding one sub-folder per skill, each with a `SKILL.md`. */
  readonly skillsRoot: string;
  /** Skill folder names in listing order. */
  readonly names: ReadonlyArray<string>;
  /** The CLI's own name, used in help text. */
  readonly cliName: string;
};

type SkillSummary = { readonly name: string; readonly description: string };

const descriptionOf = (markdown: string) =>
  /^description:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';

const renderList = (skills: ReadonlyArray<SkillSummary>) =>
  skills.map((skill) => `${skill.name}  ${skill.description}`).join('\n');

const fail = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

const nameArgument = Argument.string('name').pipe(
  Argument.withDescription('Skill to print or install; omit for all skills'),
  Argument.optional,
);

const installFlag = Flag.directory('install', { mustExist: false }).pipe(
  Flag.withDescription(
    'Copy the skill folder(s) into <dir>/<name>/ instead of printing',
  ),
  Flag.optional,
);

const formatFlag = Flag.choice('format', ['json', 'text']).pipe(
  Flag.withDescription('List skills as readable text or JSON'),
  Flag.withDefault('text' as 'json' | 'text'),
);

/**
 * Builds a `skills` subcommand: `skills` lists, `skills <name>` prints one
 * SKILL.md, and `--install <dir>` copies one or every skill folder into
 * `<dir>/<name>/`, overwriting what is there.
 */
export const makeSkillsCommand = ({
  skillsRoot,
  names,
  cliName,
}: SkillsCommandOptions) => {
  const skillDir = (name: string) => path.join(skillsRoot, name);

  const summarize = (name: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const markdown = yield* fs.readFileString(
        path.join(skillDir(name), 'SKILL.md'),
      );
      return { name, description: descriptionOf(markdown), markdown };
    });

  const printSkill = (name: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { markdown } = yield* summarize(name);
      yield* Console.log(markdown.trimEnd());
      const files = yield* fs.readDirectory(skillDir(name), {
        recursive: true,
      });
      const extra = files.filter((file) => file !== 'SKILL.md').length;
      if (extra > 0) {
        yield* Console.error(
          `Note: ${name} ships ${extra} more file(s). Use --install <dir> to get all of them.`,
        );
      }
    });

  const installSkills = (selected: ReadonlyArray<string>, directory: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = path.resolve(directory);
      yield* fs.makeDirectory(root, { recursive: true });
      for (const name of selected) {
        const target = path.join(root, name);
        yield* fs.copy(skillDir(name), target, { overwrite: true });
        yield* Console.log(`Installed skill ${name} at ${target}`);
      }
    });

  return Command.make(
    'skills',
    { name: nameArgument, install: installFlag, format: formatFlag },
    ({ name, install, format }) =>
      Effect.gen(function* () {
        if (name._tag === 'Some' && !names.includes(name.value)) {
          return yield* fail(
            `Unknown skill: ${name.value}. Available: ${names.join(', ')}`,
          );
        }
        const selected = name._tag === 'Some' ? [name.value] : names;
        if (install._tag === 'Some') {
          return yield* installSkills(selected, install.value);
        }
        if (name._tag === 'Some') return yield* printSkill(name.value);
        const skills = yield* Effect.forEach(names, (skill) =>
          Effect.map(summarize(skill), ({ name, description }) => ({
            name,
            description,
          })),
        );
        yield* Console.log(
          format === 'json'
            ? JSON.stringify(skills, null, 2)
            : renderList(skills),
        );
      }),
  ).pipe(
    Command.withDescription(
      `List the agent skills shipped with ${cliName}, print one, or install them into a skills folder`,
    ),
  );
};
