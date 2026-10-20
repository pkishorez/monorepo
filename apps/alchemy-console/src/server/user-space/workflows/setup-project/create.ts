import { Clock, Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  type NewProject,
  PRODUCTION_STAGE,
  ProjectError,
  SUPPORTED_PROVIDERS,
} from '../../../../shared/contracts/project/index.ts';
import { GitHub } from '../../services/github/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { folderOf, RunLifecycle, viewOf } from '../run-lifecycle/index.ts';
import { settleStage } from './stages.ts';

/*
 * Making a project, from a folder an Inspect read: its stack's name comes
 * from that Inspect, never from the browser. Every provider the Inspect
 * found needs one of the owner's credentials for it, and the stack must keep
 * its state in Cloudflare. The project is made and its Production deployed
 * at once, at the head of its production branch.
 */

const invalid = (message: string) =>
  new ProjectError({ reason: 'invalid', message });

const LABEL: Readonly<Record<string, string>> = {
  cloudflare: 'Cloudflare',
  aws: 'AWS',
};
const labelOf = (provider: string) => LABEL[provider] ?? provider;

export const createProject = (input: NewProject) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    const lifecycle = yield* RunLifecycle;

    const connection = yield* storage.connections.get(input.connectionId);
    const known = connection?.repositories.find(
      (each) => each.fullName.toLowerCase() === input.repo.toLowerCase(),
    );
    if (connection === null || known === undefined)
      return yield* new ProjectError({
        reason: 'not-found',
        message: `${input.repo} isn’t one of this connection’s repositories.`,
      });
    const folder = yield* folderOf(input.folder).pipe(
      Effect.mapError(({ message }) => invalid(message)),
    );

    // The Inspect of this very folder, which read its stack.
    const inspected = yield* storage.runs.get(input.inspectRunId);
    if (
      inspected === null ||
      inspected.kind !== 'inspect' ||
      inspected.projectId !== null ||
      inspected.connectionId !== connection.connectionId ||
      inspected.repo.toLowerCase() !== known.fullName.toLowerCase() ||
      inspected.folder !== folder
    )
      return yield* new ProjectError({
        reason: 'not-found',
        message: 'Inspect this folder before making a project of it.',
      });
    if (inspected.result?._tag !== 'Succeeded')
      return yield* invalid(
        'The Inspect of this folder didn’t read its stack. Inspect it again.',
      );
    const { stackName, stateStore, providers } = inspected.result.inspect;
    if (stateStore !== 'cloudflare')
      return yield* invalid(
        `This stack keeps its state in ${stateStore.other}. Console deploys stacks that keep it in Cloudflare: use \`Cloudflare.state()\`.`,
      );
    const unsupported = providers.filter(
      (provider) => !SUPPORTED_PROVIDERS.includes(provider),
    );
    if (unsupported.length > 0)
      return yield* invalid(
        `This stack also needs ${unsupported.join(', ')}, which Console can’t hand credentials for yet.`,
      );
    const credentials: Record<string, string> = {};
    for (const provider of providers) {
      const credentialId = input.production.credentials[provider];
      const credential =
        credentialId === undefined
          ? null
          : yield* storage.credentials.get(credentialId);
      if (credential === null || credential.provider !== provider)
        return yield* invalid(
          `Pick ${/^[AEIOU]/.test(labelOf(provider)) ? 'an' : 'a'} ${labelOf(provider)} credential for Production.`,
        );
      credentials[provider] = credential.credentialId;
    }
    const setupCommand = input.setupCommand?.trim() || null;
    if (setupCommand !== null && setupCommand.length > 1000)
      return yield* invalid('The setup command is too long.');

    const repository = yield* github.repository({
      installationId: connection.installationId,
      repo: known.fullName,
    });
    const productionBranch =
      input.productionBranch?.trim() || repository.defaultBranch;
    const head = yield* github.headCommit({
      installationId: connection.installationId,
      repo: repository.fullName,
      branch: productionBranch,
    });

    const made = yield* storage.projects.exclusively(
      Effect.gen(function* () {
        const taken = (yield* storage.projects.all).find(
          (each) => each.repo.id === repository.id && each.folder === folder,
        );
        if (taken !== undefined)
          return yield* invalid(
            `${repository.fullName}${folder === '.' ? '' : `/${folder}`} is already the project ${taken.stackName}.`,
          );
        const projectId = yield* nextUlid;
        const now = yield* Clock.currentTimeMillis;
        yield* storage.projects.insert({
          projectId,
          connectionId: connection.connectionId,
          repo: { id: repository.id, fullName: repository.fullName },
          folder,
          setupCommand,
          productionBranch,
          stackName,
          production: { credentials, variables: [] },
          preview: 'same-as-production',
          createdAt: now,
        });
        const runId = yield* lifecycle.enqueue({
          projectId,
          stage: PRODUCTION_STAGE,
          kind: 'deploy',
          commit: head.sha,
          trigger: 'user',
          spec: {
            connectionId: connection.connectionId,
            repo: repository.fullName,
            folder,
            setupCommand,
            credentials,
          },
        });
        yield* storage.stages.began({
          projectId,
          stage: PRODUCTION_STAGE,
          environment: 'production',
          pullRequest: null,
          status: 'deploying',
          runId,
        });
        return { projectId, runId };
      }),
    );
    // A run that ended before its stage was written (its container never
    // started) settles the stage now.
    const run = yield* storage.runs.get(made.runId);
    if (run !== null) yield* settleStage(viewOf(run));
    return made;
  });
