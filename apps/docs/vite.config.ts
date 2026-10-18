import { basename } from 'node:path';
import mdx from '@mdx-js/rollup';
import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { nitro } from '@kestack/kabuki/start/platform/nitro';
import { start } from '@kestack/kabuki/start/vite';
import rehypeShiki from '@shikijs/rehype';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { nitro as nitroVite } from 'nitro/vite';
import { defineConfig } from 'vite';
import { remarkDocs } from './mdx/remark-docs.ts';

// Where the server runs, by Vite's mode: Cloudflare through Alchemy by
// default, or a Nitro preset, as `vp build --mode vercel` names it.
const onNitro = {
  vercel: nitro({ preset: 'vercel' }),
  node: nitro({ preset: 'node_server' }),
  bun: nitro({ preset: 'bun' }),
} as const;

export default defineConfig(({ mode }) => {
  const platform = onNitro[mode as keyof typeof onNitro];
  return {
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
      react({ include: /\.(mdx|tsx|ts)$/ }),
      start({
        platform: platform ?? cloudflare(),
        app: 'src/client/app',
      }),
      ...(platform ? [nitroVite()] : []),
    ],
  };
});
