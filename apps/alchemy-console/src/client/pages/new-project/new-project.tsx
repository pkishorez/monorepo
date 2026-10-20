import { Effect, Layer, Schedule, Stream } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import type { CredentialSummary } from '../../../shared/contracts/credential/index.ts';
import { SUPPORTED_PROVIDERS } from '../../../shared/contracts/project/index.ts';
import {
  type InspectResult,
  isFinished,
} from '../../../shared/contracts/run/index.ts';
import { Api, NewProject, router } from '../../../shared/pages/index.ts';
import {
  AddCredentialLive,
  AddCredentialOpener,
  AddCredentialSheet,
} from '../../add-credential/index.ts';
import { createProject, findFolders, startInspect } from './commands.ts';
import {
  ChooseFolderStep,
  DeployStep,
  InspectingStep,
  PickRepoStep,
  StepHeader,
} from './steps.tsx';

/*
 * New project, as it behaves: one Actor whose State is the step.
 *
 * 1. Follow   Workers follow the member's repositories and credentials,
 *             so one added in another tab shows here at once.
 * 2. Pick     a repository, then one of its folders holding an
 *             `alchemy.run.ts`: the root is picked already when it has one.
 * 3. Inspect  the folder's stack is read by a run, followed live; a failure
 *             says why and offers another go.
 * 4. Choose   a credential for each provider the stack uses, picked
 *             already when exactly one fits; a new one is added in the
 *             add-credential sheet, a Child, and picked when it is added.
 * 5. Deploy   the project is made and Production starts deploying; the page
 *             moves on to that run.
 */

const retried = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie);

/** The credentials picked already: each provider's only one. */
const preselected = (
  inspect: InspectResult,
  credentials: ReadonlyArray<CredentialSummary> | null,
  kept: Readonly<Record<string, string>>,
) => {
  const choices: Record<string, string> = {};
  for (const provider of inspect.providers) {
    const fitting = (credentials ?? []).filter(
      (credential) => credential.provider === provider,
    );
    const still = fitting.find(
      ({ credentialId }) => credentialId === kept[provider],
    );
    if (still !== undefined) choices[provider] = still.credentialId;
    else if (fitting.length === 1) choices[provider] = fitting[0]!.credentialId;
  }
  return choices;
};

/** Whether the stack can deploy with `choices`: Cloudflare state, and a credential for each provider. */
export const readyToDeploy = (
  inspect: InspectResult,
  choices: Readonly<Record<string, string>>,
) =>
  inspect.stateStore === 'cloudflare' &&
  inspect.providers.every(
    (provider) =>
      SUPPORTED_PROVIDERS.includes(provider) && choices[provider] !== undefined,
  );

const fresh = {
  folders: null,
  folder: null,
  phase: null,
  lines: [],
  heard: { events: 0, logs: 0 },
  choices: {},
  adding: null,
  busy: false,
  problem: null,
} as const;

/** The most log lines the Inspect keeps on screen. */
const LINES = 300;

export const NewProjectLive = Page.build(NewProject, {
  init: () => ({
    model: {
      repositories: null,
      credentials: null,
      query: '',
      attempt: 0,
      ...fresh,
    },
    state: { _tag: 'PickRepo' },
  }),
  // 1. Follow
  workers: {
    repositories: {
      run: (self) =>
        retried(
          Effect.gen(function* () {
            const api = yield* Api;
            yield* api
              .follow((client) => client['Repositories.list']())
              .pipe(
                Stream.runForEach((repositories) =>
                  self.send({ _tag: 'RepositoriesSeen', repositories }),
                ),
              );
          }),
        ),
    },
    credentials: {
      run: (self) =>
        retried(
          Effect.gen(function* () {
            const api = yield* Api;
            yield* api
              .follow((client) => client['Credentials.list']())
              .pipe(
                Stream.runForEach((credentials) =>
                  self.send({ _tag: 'CredentialsSeen', credentials }),
                ),
              );
          }),
        ),
    },
  },
  children: {
    sheet: {
      actor: AddCredentialLive,
      props: ({ model }) => ({
        open: model.adding !== null,
        provider: model.adding ?? 'cloudflare',
      }),
    },
  },
  provides: (self) =>
    Layer.succeed(
      AddCredentialOpener,
      AddCredentialOpener.of({
        added: (credentialId) =>
          self.send({ _tag: 'CredentialAdded', credentialId }),
        closed: self.send({ _tag: 'AddCredentialClosed' }),
      }),
    ),
  on: {
    RepositoriesSeen: ({ repositories }, { model }) => ({
      model: { ...model, repositories },
    }),
    CredentialsSeen: ({ credentials }, { model }) => ({
      model: { ...model, credentials },
    }),
    Failed: ({ message }, { model }) => ({
      model: { ...model, busy: false, problem: message },
    }),
  },
  state: {
    // 2. Pick
    PickRepo: {
      on: {
        QueryTyped: ({ query }, { model }) => ({ model: { ...model, query } }),
        RepoChosen: ({ target }, { model }) => ({
          model: { ...model, ...fresh, busy: true },
          state: { _tag: 'ChooseFolder', target },
          command: findFolders({
            connectionId: target.connectionId,
            repo: target.repo,
          }),
        }),
      },
    },
    ChooseFolder: {
      on: {
        FoldersFound: ({ repo, folders }, { model, state }) =>
          repo !== state.target.repo
            ? {}
            : {
                model: {
                  ...model,
                  busy: false,
                  folders,
                  folder: folders.includes('.')
                    ? '.'
                    : folders.length === 1
                      ? folders[0]!
                      : null,
                },
              },
        FolderChosen: ({ folder }, { model }) => ({
          model: { ...model, folder },
        }),
        InspectChosen: (_, { model, state }) =>
          model.folder === null || model.busy
            ? {}
            : {
                model: {
                  ...model,
                  attempt: model.attempt + 1,
                  busy: true,
                  problem: null,
                  phase: null,
                  lines: [],
                  heard: { events: 0, logs: 0 },
                },
                state: {
                  _tag: 'Inspecting',
                  target: state.target,
                  folder: model.folder,
                  runId: null,
                },
                command: startInspect({
                  attempt: model.attempt + 1,
                  connectionId: state.target.connectionId,
                  repo: state.target.repo,
                  folder: model.folder,
                }),
              },
        BackChosen: (_, { model }) => ({
          model: { ...model, ...fresh },
          state: { _tag: 'PickRepo' },
        }),
      },
    },
    // 3. Inspect
    Inspecting: {
      workers: {
        watch: {
          each: ({ state }) => (state.runId === null ? [] : [state.runId]),
          run: (self, runId) =>
            retried(
              Effect.gen(function* () {
                const api = yield* Api;
                yield* api
                  .follow((client) => client['Runs.watch']({ runId }))
                  .pipe(
                    Stream.takeUntil(
                      (update) =>
                        update._tag === 'Run' && isFinished(update.run.status),
                    ),
                    Stream.runForEach((update) =>
                      self.send({ _tag: 'InspectHeard', update }),
                    ),
                  );
              }),
            ),
        },
      },
      on: {
        // An answer to an Inspect asked for before Back or Try again is old.
        InspectStarted: ({ attempt, runId }, { model, state }) =>
          attempt !== model.attempt || state.runId !== null
            ? {}
            : {
                model: { ...model, busy: false },
                state: { ...state, runId },
              },
        InspectRefused: ({ attempt, message }, { model }) =>
          attempt !== model.attempt
            ? {}
            : { model: { ...model, busy: false, problem: message } },
        InspectHeard: ({ update }, { model, state }) => {
          if (update._tag === 'Events') {
            const fresh = update.events.filter(
              ({ seq }) => seq > model.heard.events,
            );
            if (fresh.length === 0) return {};
            const phase =
              fresh
                .flatMap(({ event }) =>
                  event._tag === 'Phase' ? [event.phase] : [],
                )
                .at(-1) ?? model.phase;
            return {
              model: {
                ...model,
                phase,
                heard: { ...model.heard, events: fresh.at(-1)!.seq },
              },
            };
          }
          if (update._tag === 'Logs') {
            const fresh = update.logs.filter(
              ({ seq }) => seq > model.heard.logs,
            );
            if (fresh.length === 0) return {};
            return {
              model: {
                ...model,
                lines: [
                  ...model.lines,
                  ...fresh.flatMap(({ lines }) => lines),
                ].slice(-LINES),
                heard: { ...model.heard, logs: fresh.at(-1)!.seq },
              },
            };
          }
          const { run } = update;
          if (run.runId !== state.runId || !isFinished(run.status)) return {};
          if (run.result?._tag === 'Succeeded')
            return {
              model: {
                ...model,
                problem: null,
                choices: preselected(
                  run.result.inspect,
                  model.credentials,
                  model.choices,
                ),
              },
              state: {
                _tag: 'Providers',
                target: state.target,
                folder: state.folder,
                runId: run.runId,
                inspect: run.result.inspect,
              },
            };
          return {
            model: {
              ...model,
              problem:
                run.result?._tag === 'Failed'
                  ? run.result.message
                  : 'The Inspect was cancelled.',
            },
          };
        },
        InspectChosen: (_, { model, state }) =>
          model.busy
            ? {}
            : {
                model: {
                  ...model,
                  attempt: model.attempt + 1,
                  busy: true,
                  problem: null,
                  phase: null,
                  lines: [],
                  heard: { events: 0, logs: 0 },
                },
                state: { ...state, runId: null },
                command: startInspect({
                  attempt: model.attempt + 1,
                  connectionId: state.target.connectionId,
                  repo: state.target.repo,
                  folder: state.folder,
                }),
              },
        BackChosen: (_, { model, state }) => ({
          // An Inspect still being asked for is forgotten.
          model: {
            ...model,
            attempt: model.attempt + 1,
            busy: false,
            problem: null,
          },
          state: { _tag: 'ChooseFolder', target: state.target },
        }),
      },
    },
    // 4. Choose
    Providers: {
      on: {
        CredentialChosen: ({ provider, credentialId }, { model }) => ({
          model: {
            ...model,
            problem: null,
            choices: { ...model.choices, [provider]: credentialId },
          },
        }),
        CredentialsSeen: ({ credentials }, { model, state }) => ({
          model: {
            ...model,
            credentials,
            choices: preselected(state.inspect, credentials, model.choices),
          },
        }),
        AddCredentialChosen: ({ provider }, { model }) => ({
          model: { ...model, adding: provider },
        }),
        AddCredentialClosed: (_, { model }) => ({
          model: { ...model, adding: null },
        }),
        CredentialAdded: ({ credentialId }, { model }) =>
          model.adding === null
            ? {}
            : {
                model: {
                  ...model,
                  adding: null,
                  choices: { ...model.choices, [model.adding]: credentialId },
                },
              },
        // 5. Deploy
        DeployChosen: (_, { model, state }) =>
          model.busy || !readyToDeploy(state.inspect, model.choices)
            ? {}
            : {
                model: { ...model, busy: true, problem: null },
                state: { ...state, _tag: 'Deploying' },
                command: createProject({
                  connectionId: state.target.connectionId,
                  repo: state.target.repo,
                  folder: state.folder,
                  setupCommand: null,
                  productionBranch: null,
                  production: {
                    credentials: Object.fromEntries(
                      state.inspect.providers.map((provider) => [
                        provider,
                        model.choices[provider]!,
                      ]),
                    ),
                  },
                  inspectRunId: state.runId,
                }),
              },
        BackChosen: (_, { model, state }) => ({
          model: { ...model, problem: null },
          state: { _tag: 'ChooseFolder', target: state.target },
        }),
      },
    },
    Deploying: {
      on: {
        Created: ({ projectId, runId }, { model }) => ({
          model,
          command: Router.push(
            router.Console.Project.Run({ projectId, runId }),
          ),
        }),
        Failed: ({ message }, { model, state }) => ({
          model: { ...model, busy: false, problem: message },
          state: { ...state, _tag: 'Providers' },
        }),
      },
    },
  },
});

export const NewProjectView = View.make(NewProjectLive, (self) => {
  const { model, props, send, children, root } = self;
  const drawn = props.status._tag === 'Ready' ? props.status.data : null;
  const repositories = model.repositories ?? drawn?.repositories ?? null;
  const credentials = model.credentials ?? drawn?.credentials ?? null;
  const back = () => send({ _tag: 'BackChosen' });
  const body = (() => {
    switch (self._tag) {
      case 'PickRepo':
        return (
          <PickRepoStep
            repositories={repositories}
            query={model.query}
            onQuery={(query) => send({ _tag: 'QueryTyped', query })}
            onPick={(target) => send({ _tag: 'RepoChosen', target })}
          />
        );
      case 'ChooseFolder':
        return (
          <ChooseFolderStep
            repo={self.state.target.repo}
            folders={model.folders}
            folder={model.folder}
            busy={model.busy}
            problem={model.problem}
            onPick={(folder) => send({ _tag: 'FolderChosen', folder })}
            onInspect={() => send({ _tag: 'InspectChosen' })}
            onBack={back}
          />
        );
      case 'Inspecting':
        return (
          <InspectingStep
            repo={self.state.target.repo}
            folder={self.state.folder}
            phase={model.phase}
            lines={model.lines}
            problem={model.problem}
            busy={model.busy}
            onRetry={() => send({ _tag: 'InspectChosen' })}
            onBack={back}
          />
        );
      case 'Providers':
      case 'Deploying':
        return (
          <DeployStep
            repo={self.state.target.repo}
            folder={self.state.folder}
            branch={self.state.target.defaultBranch}
            inspect={self.state.inspect}
            credentials={credentials}
            choices={model.choices}
            busy={self._tag === 'Deploying'}
            problem={model.problem}
            ready={readyToDeploy(self.state.inspect, model.choices)}
            onChoose={(provider, credentialId) =>
              send({ _tag: 'CredentialChosen', provider, credentialId })
            }
            onAdd={(provider) =>
              send({ _tag: 'AddCredentialChosen', provider })
            }
            onDeploy={() => send({ _tag: 'DeployChosen' })}
            onBack={back}
          />
        );
    }
  })();
  return (
    <section
      {...root}
      aria-labelledby="new-project-title"
      className="flex max-w-xl flex-col gap-6 py-10 sm:py-16"
    >
      <StepHeader step={self._tag} />
      {body}
      <AddCredentialSheet instance={children.sheet} />
    </section>
  );
});
