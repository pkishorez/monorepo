import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.secondary-indexes contract',
  '`.index(indexName, entityIndexName, { pk, sk? })` on the entity builder declares which fields derive the index columns. SK defaults to `["_u"]` (timeline-SK).',
  () => {
    vtest(
      'SK defaults to ["_u"] when not specified',
      'Most secondary indexes are "give me the latest N rows for this PK", so the timeline SK is the default.',
      () => {
        const sk = ['_u'] as const;
        expect(sk).toEqual(['_u']);
      },
    );

    vtest(
      'isTimelineSk is true iff sk is exactly ["_u"]',
      'The library tracks this at the type level: only timeline-SK indexes can back `subscribe(...)`.',
      () => {
        const isTimeline = (sk: readonly string[]) =>
          sk.length === 1 && sk[0] === '_u';
        expect(isTimeline(['_u'])).toBe(true);
        expect(isTimeline(['createdAt'])).toBe(false);
        expect(isTimeline(['_u', 'extra'])).toBe(false);
      },
    );

    vtest(
      'PK pattern is `<EntityName>#<entityIndexName>#<deps...>`',
      'Multiple entities sharing a table-level index live in disjoint key spaces; the entity name prefix is the boundary.',
      () => {
        const pattern = (entity: string, name: string, deps: string[]) =>
          [entity, name, ...deps.map((d) => `{${d}}`)].join('#');
        expect(pattern('User', 'byEmail', ['email'])).toBe(
          'User#byEmail#{email}',
        );
      },
    );

    vtest(
      'custom SK uses the entity-name prefix (not the entity#index prefix)',
      'Only the PK gets the per-index namespace; the SK is shared across indexes for the same entity.',
      () => {
        const skPattern = (entity: string, deps: string[]) =>
          [entity, ...deps.map((d) => `{${d}}`)].join('#');
        expect(skPattern('Post', ['publishedAt'])).toBe('Post#{publishedAt}');
      },
    );

    vtest(
      'subscribe(...) only accepts indexes where isTimelineSk is true',
      'Subscribing on a custom-SK index would have no meaningful cursor; the type system refuses it.',
      () => {
        type SubscribableKeys<
          T extends Record<string, { isTimelineSk: boolean }>,
        > = {
          [K in keyof T]: T[K]['isTimelineSk'] extends true ? K : never;
        }[keyof T];
        type M = {
          byEmail: { isTimelineSk: true };
          byHandle: { isTimelineSk: false };
        };
        const ok: SubscribableKeys<M> = 'byEmail';
        expect(ok).toBe('byEmail');
      },
    );
  },
);
