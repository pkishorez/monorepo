import { basename } from 'node:path';
import mdx from '@mdx-js/rollup';
import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { start } from '@kestack/kabuki/start/vite';
import rehypeShiki from '@shikijs/rehype';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { remarkDocs } from './mdx/remark-docs.ts';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.docs.kishore.computer', '.ts.net'],
  },
  // Its components are ESM with CSS-only side effects: bundle them for the server too.
  ssr: { noExternal: ['@kestack/web-platform'] },
  plugins: [
    tailwindcss(),
    // Before React's plugin, so it sees each page as the JSX MDX compiles it to.
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [remarkDocs],
        rehypePlugins: [
          [
            rehypeShiki,
            {
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: 'light',
              // A block that includes a file is named after it: a Demo's tab.
              parseMetaString: (meta: string) => {
                const file = meta.match(/file=(\S+)/)?.[1];
                return file ? { 'data-file': basename(file) } : {};
              },
            },
          ],
        ],
      }),
    },
    react({ include: /\.(mdx|tsx|ts)$/ }),
    start({ platform: cloudflare(), app: 'src/client/app' }),
  ],
});
