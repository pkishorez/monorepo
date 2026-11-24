import type { ContractsOptions } from '../contracts/index.ts';
import type { ImportsOptions } from '../imports/index.ts';

/*
 * Ready-made settings for the rules, one per folder convention. A preset
 * is plain data: spread it into a lint override's `rules`, or copy it and
 * change the folders.
 */

export interface Preset {
  readonly 'kestack/imports': ['error', ImportsOptions];
  readonly 'kestack/contracts': ['error', ContractsOptions];
}

/**
 * A Kabuki app: each Actor shares pure code through `logic/shared/`,
 * components through `view/shared/`, Actors through `children/shared/`,
 * and Effect contexts through `capabilities/*\/contract/` and
 * `services/*\/contract/`. A feature's browser half reaches its server
 * half only through its RPC contracts, `server/rpc/contract/` and
 * `server/rpc/*\/contract/`; an `http/*\/contract/` is open to its server
 * alone. Tests may import anything.
 */
export const kabuki: Preset = {
  'kestack/imports': [
    'error',
    {
      doors: [
        'logic/shared',
        'view/shared',
        'children/shared',
        'capabilities/*/contract',
        'services/*/contract',
        'server/rpc/contract',
        'server/rpc/*/contract',
        'http/*/contract',
      ],
      ignore: ['**/tests/**', '**/*.test.ts', '**/*.test.tsx'],
    },
  ],
  'kestack/contracts': [
    'error',
    {
      folders: ['capabilities/*/contract', 'services/*/contract'],
      required: ['services/*/contract'],
    },
  ],
};
