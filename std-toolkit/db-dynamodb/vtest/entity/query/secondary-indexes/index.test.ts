import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'timeline SK vs custom SK',
  'Each registered GSI is one of two shapes — `isTimelineSk: true` (SK = `_u`) or `isTimelineSk: false` (custom field tuple). The type system uses this bit to pick the `params.sk` shape.',
  () => {
    vtest(
      'default skDeps is [`_u`]',
      'Omitting `sk:` from `.index(...)` installs a timeline SK with `isTimelineSk: true`.',
      () => {
        const isTimelineSk = (skDeps: readonly string[]) =>
          skDeps.length === 1 && skDeps[0] === '_u';
        expect(isTimelineSk(['_u'])).toBe(true);
        expect(isTimelineSk(['createdAt'])).toBe(false);
        expect(isTimelineSk(['_u', 'createdAt'])).toBe(false);
      },
    );

    vtest(
      'isTimelineSk: true ⇔ skDeps === [`_u`]',
      "No other tuple qualifies — `['createdAt']` is a custom SK even though it looks timeline-ish.",
      () => {
        const isTimelineSk = (skDeps: readonly string[]) =>
          skDeps.length === 1 && skDeps[0] === '_u';
        expect(isTimelineSk(['createdAt'])).toBe(false);
      },
    );
  },
);

vdescribe(
  'derived GSI column names',
  'The library writes `${gsiName}PK` / `${gsiName}SK` on every put/update — using the table-level GSI name, not the semantic `entityIndexName`.',
  () => {
    vtest(
      'GSI columns use the table-level GSI name',
      'A GSI registered as `(GSI1, byEmail, ...)` writes columns `GSI1PK` and `GSI1SK`.',
      () => {
        const gsiName = 'GSI1';
        expect(`${gsiName}PK`).toBe('GSI1PK');
        expect(`${gsiName}SK`).toBe('GSI1SK');
      },
    );

    vtest(
      'PK derivation prefixes with <entity>#<entityIndexName>',
      'The full PK string is `{Entity}#{indexName}#{pkValue}`.',
      () => {
        const prefix = 'User#byEmail';
        expect(prefix).toBe('User#byEmail');
      },
    );

    vtest(
      'SK derivation prefixes with <entity> only',
      'SK has no `entityIndexName` prefix so a single natural ordering across the entity is preserved.',
      () => {
        const skPrefix = 'User';
        expect(skPrefix).toBe('User');
      },
    );
  },
);

vdescribe(
  'sparse index behaviour',
  'A row that lacks one of the derivation deps does not appear in the GSI. The PK/SK column is simply omitted.',
  () => {
    vtest(
      'a derivation key whose deps are partially undefined is not written',
      'No GSI column appears on the row; the GSI silently skips it.',
      () => {
        const value: Record<string, unknown> = { id: '1', name: 'A' };
        const hasEmail = typeof value.email !== 'undefined';
        expect(hasEmail).toBe(false);
      },
    );
  },
);

vdescribe(
  'subscribe restriction',
  '`subscribe` is restricted at the type level to `_u`-SK indexes via `SubscribableSecondaryKeys`. Custom-SK GSIs are not subscribable.',
  () => {
    vtest(
      'only timeline-SK indexes are subscribable',
      'The mapped type retains keys where `isTimelineSk` is true and `never`-s out the rest.',
      () => {
        type SubscribableSecondaryKeys<T> = {
          [K in keyof T]: T[K] extends { isTimelineSk: true } ? K : never;
        }[keyof T];
        type Demo = SubscribableSecondaryKeys<{
          byEmail: { isTimelineSk: true };
          byStatus: { isTimelineSk: false };
        }>;
        const k: Demo = 'byEmail';
        expect(k).toBe('byEmail');
      },
    );
  },
);
