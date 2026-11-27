import type { Plugin } from '@oxlint/plugins';
import { noComments } from './no-comments.ts';

const plugin: Plugin = {
  meta: { name: 'monoverse' },
  rules: { 'no-comments': noComments },
};

export default plugin;

export const rules = {
  'monoverse/no-comments': 'error',
  'typescript/ban-ts-comment': 'error',
  'unicorn/no-abusive-eslint-disable': 'error',
  'react/jsx-no-comment-textnodes': 'error',
} as const;
