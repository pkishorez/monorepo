import { Effect } from 'effect';
import type {
  Storage,
  StoredEnvironment,
} from '../../services/storage/index.ts';

const names = (environment: StoredEnvironment | 'same-as-production') =>
  environment === 'same-as-production'
    ? []
    : Object.values(environment.credentials);

/**
 * The names of the projects that deploy with a credential, in Production or
 * Preview, which may not be removed while any does.
 */
export const projectsUsing = (
  storage: Storage['Service'],
  credentialId: string,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(storage.projects.all, (projects) =>
    projects
      .filter((project) =>
        [...names(project.production), ...names(project.preview)].includes(
          credentialId,
        ),
      )
      .map((project) => project.stackName),
  );
