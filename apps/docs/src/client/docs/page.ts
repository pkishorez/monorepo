import type { ComponentType } from 'react';
import type { MDXProps } from 'mdx/types';

/** A written docs page: its MDX, and the headings in it. */
export type Page = {
  readonly Content: ComponentType<MDXProps>;
  readonly headings: ReadonlyArray<Heading>;
};

/** One `##` or `###` heading of a page, and the id it is linked by. */
export type Heading = {
  readonly id: string;
  readonly title: string;
  readonly depth: 2 | 3;
};

/** A page from its MDX module, as `import * as page from './page.mdx'` gives it. */
export const page = (module: {
  readonly default: ComponentType<MDXProps>;
  readonly headings: ReadonlyArray<Heading>;
}): Page => ({ Content: module.default, headings: module.headings });
