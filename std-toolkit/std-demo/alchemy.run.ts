import alchemy from 'alchemy';
import { BunSPA } from 'alchemy/cloudflare';

const app = await alchemy('std-demo', {});

export const bunsite = await BunSPA('bun-spa-site', {
  entrypoint: 'src/worker.ts',
  frontend: ['src/index.html'],
  // Use Cloudflare bindings in your worker as normal
  bindings: {
    SOME_VALUE: 'some-value',
  },
});

console.log({
  url: bunsite.url,
});

await app.finalize();
