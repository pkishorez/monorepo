import { basename } from 'node:path';
import mdx from '@mdx-js/rollup';
import { cloudflare } from '@kestack/kabuki/start/cloudflare';
import rehypeShiki from '@shikijs/rehype';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';
import remarkGfm from 'remark-gfm';
import { remarkDocs } from './mdx/remark-docs.ts';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.docs.kishore.computer', '.ts.net'],
  },
  plugins: [
    // Before React's plugin, so it sees each page as the JSX MDX compiles it to.
    {
      enforce: 'pre',
      ...mdx({
        // GitHub's Markdown: tables, above all.
        remarkPlugins: [remarkGfm, remarkDocs],
        rehypePlugins: [
          [
            rehypeShiki,
            {
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: 'light',
              // Left unset, Shiki loads all of its ~200 grammars on the first page.
              langs: ['sh', 'ts', 'tsx'],
              // A block that includes a file is named after it: a Demo's tab,
              // and where it sits in a demo page's tree of Files.
              parseMetaString: (meta: string) => {
                const file = meta.match(/file=(\S+)/)?.[1];
                return file
                  ? {
                      'data-file': basename(file),
                      'data-path': file.replace(/^\.\//, ''),
                    }
                  : {};
              },
            },
          ],
        ],
      }),
    },
    // Kabuki Start on Cloudflare, and a PWA whose icons are the ones
    // public/ holds by name.
    app({
      name: 'ke stack',
      platform: cloudflare(),
      app: 'src/client/app',
      react: { include: /\.(mdx|tsx|ts)$/ },
    }),
  ],
});
