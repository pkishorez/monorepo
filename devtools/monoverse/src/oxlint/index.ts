import type { Plugin } from '@oxlint/plugins';
import { noComments } from './no-comments.ts';
import { noStar } from './no-star.ts';
import { valuesBeforeTypes } from './values-before-types.ts';

const plugin: Plugin = {
  meta: { name: 'monoverse' },
  rules: {
    'no-comments': noComments,
    'no-star': noStar,
    'values-before-types': valuesBeforeTypes,
  },
};

export default plugin;

export const rules = {
  'monoverse/no-comments': 'error',
  'monoverse/no-star': 'error',
  'monoverse/values-before-types': 'error',
  'typescript/ban-ts-comment': 'error',
  'unicorn/no-abusive-eslint-disable': 'error',
  'react/jsx-no-comment-textnodes': 'error',
} as const;
