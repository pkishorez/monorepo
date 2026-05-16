import { getSnippetMap } from '@/lib/get-snippet-map';

export const snippetMap = getSnippetMap(
  import.meta.glob('./*.ts', {
    eager: true,
    import: 'default',
  }),
  import.meta.glob('./*.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);
