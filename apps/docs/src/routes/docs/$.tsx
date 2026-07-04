import { createFileRoute, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { createIsomorphicFn } from '@tanstack/react-start';
import type { SerializedPageTree } from 'fumadocs-core/source/client';
import browserCollections from 'collections/browser';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { baseOptions } from '@/lib/layout.shared';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { Suspense } from 'react';
import { useMDXComponents } from '@/components/mdx';

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slug = params._splat ?? '';
    const { pages, pageTree } = await getSourceData();
    const path = pages[slug];
    if (!path) throw notFound();

    await clientLoader.preload(path);
    return { path, pageTree };
  },
});

interface SourceData {
  pages: Record<string, string>;
  pageTree: SerializedPageTree;
}

/**
 * Resolves the docs source data (slug -> path map + page tree) isomorphically:
 * directly from the source at prerender time on the server, and from the
 * prerendered `/api/source` JSON on client-side navigation. This keeps the
 * deployment fully static — no server function endpoint to 404.
 */
const getSourceData = createIsomorphicFn()
  .server(async (): Promise<SourceData> => {
    const { loadSourceData } = await import('@/lib/source');
    return loadSourceData();
  })
  .client(async (): Promise<SourceData> => (await fetch('/api/source')).json());

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { path, pageTree } = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Suspense>{clientLoader.useContent(path)}</Suspense>
    </DocsLayout>
  );
}
