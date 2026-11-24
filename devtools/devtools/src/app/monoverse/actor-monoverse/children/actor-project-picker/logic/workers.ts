import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { MonoverseClient } from '../../../../services/monoverse-client/contract/index.js';
import { listingOf } from './selectors.js';
import {
  absolute,
  hiddenOf,
  topOf,
  waits,
  type ProjectPickerShape,
} from './shared/index.js';

// A moment after the typing stops: each key typed stops the asking before.
const DEBOUNCE = '150 millis';

/** What went wrong, in words, whatever the server or the wire failed with. */
export function problemOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if (
      'message' in error &&
      typeof error.message === 'string' &&
      error.message !== ''
    )
      return error.message;
    if ('_tag' in error) {
      const { _tag, ...rest } = error as { _tag: string };
      const detail = Object.values(rest).filter(
        (value) => typeof value === 'string',
      );
      return [String(_tag), ...detail].join(': ');
    }
  }
  return String(error);
}

export const workers: WorkersOf<typeof ProjectPickerShape> = {
  // 1. Recent, read again after a refusal only when asked.
  recent: {
    each: ({ model }) =>
      model.recent === null && model.recentProblem === null ? ['read'] : [],
    run: (self) =>
      Effect.flatMap(MonoverseClient, (client) => client.ListProjects()).pipe(
        Effect.map((projects) => ({
          _tag: 'RecentRead' as const,
          projects,
        })),
        Effect.catch((error) =>
          Effect.succeed({
            _tag: 'RecentRefused' as const,
            problem: problemOf(error),
          }),
        ),
        Effect.flatMap((message) => self.send(message)),
      ),
  },
  // 2. Folder: home read ahead, which also says where home is. A failure
  // is said by the folder Step, which asks again.
  home: {
    each: ({ model }) => (model.home === null ? ['home'] : []),
    run: (self) =>
      Effect.flatMap(MonoverseClient, (client) =>
        client.ListFolders({ path: null, query: '', hidden: false }),
      ).pipe(
        Effect.flatMap((listing) => self.send({ _tag: 'HomeFound', listing })),
        Effect.ignore,
      ),
  },
  // 2. Folder: the top Step, for a search its listing does not cover.
  load: {
    each: ({ model }) => {
      const top = topOf(model);
      if (top === null || !waits(top)) return [];
      const query = top.query.trim();
      return [JSON.stringify([top.segments, query, hiddenOf(query)])];
    },
    run: (self, key) =>
      Effect.gen(function* () {
        const [segments, query, hidden] = JSON.parse(key) as [
          ReadonlyArray<string>,
          string,
          boolean,
        ];
        if (query !== '') yield* Effect.sleep(DEBOUNCE);
        const client = yield* MonoverseClient;
        const { model } = yield* self.get;
        const message = yield* Effect.gen(function* () {
          // Below home, the folder is written out from home, found first
          // if no listing has said where it is yet.
          const home =
            segments.length === 0
              ? null
              : (model.home ??
                (yield* client.ListFolders({
                  path: null,
                  query: '',
                  hidden: false,
                })).home);
          const listing = yield* client.ListFolders({
            path: home === null ? null : absolute(home, segments),
            query,
            hidden,
          });
          return {
            _tag: 'Loaded' as const,
            segments,
            listing: listingOf(listing, query, hidden),
            home: listing.home,
          };
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed({
              _tag: 'Loaded' as const,
              segments,
              listing: {
                query,
                hidden,
                path: '',
                kind: null,
                folders: [],
                truncated: false,
                problem: problemOf(error),
              },
              home: null,
            }),
          ),
        );
        yield* self.send(message);
      }),
  },
};
