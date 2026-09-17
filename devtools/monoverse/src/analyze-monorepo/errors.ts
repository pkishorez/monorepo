import { Data } from 'effect';

export class InvalidMonorepoPath extends Data.TaggedError(
  'InvalidMonorepoPath',
)<{
  readonly reason: 'relative' | 'not-found' | 'not-directory';
  readonly path: string;
}> {}
