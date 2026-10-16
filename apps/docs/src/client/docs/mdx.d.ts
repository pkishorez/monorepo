/*
 * What a docs page's MDX module exports beside its content: its headings,
 * which `mdx/remark-docs.ts` reads out of it at build time.
 */
declare module '*.mdx' {
  export const headings: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly depth: 2 | 3;
  }>;
}
