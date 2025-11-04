import alchemy from 'alchemy';
import { TanStackStart } from 'alchemy/cloudflare';

const app = await alchemy('demo-app');

export const website = await TanStackStart('website');

console.log({
  url: website.url,
});

await app.finalize();
