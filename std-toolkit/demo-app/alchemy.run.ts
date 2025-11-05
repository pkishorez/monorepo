import alchemy from 'alchemy';
import { TanStackStart } from 'alchemy/cloudflare';

const app = await alchemy('demo-app');

export const website = await TanStackStart('website', {
  bindings: {
    DYNAMO_TABLE_NAME: alchemy.secret(process.env.DYNAMO_TABLE_NAME),
    DYNAMO_REGION: alchemy.secret(process.env.DYNAMO_REGION ?? ''),
    DYNAMO_ENDPOINT: alchemy.secret(process.env.DYNAMO_ENDPOINT ?? ''),
    DYNAMO_ACCESS_KEY: alchemy.secret(process.env.DYNAMO_ACCESS_KEY),
    DYNAMO_SECRET_KEY: alchemy.secret(process.env.DYNAMO_SECRET_KEY),
  },
});

console.log({
  url: website.url,
});

await app.finalize();
