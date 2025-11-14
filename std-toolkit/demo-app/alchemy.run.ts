import type { DurableTest } from '@/worker';
import alchemy from 'alchemy';
import {
  Worker,
  DurableObjectNamespace,
  TanStackStart,
} from 'alchemy/cloudflare';

const app = await alchemy('demo-app');

const durableTest = DurableObjectNamespace<DurableTest>('durable-test', {
  className: 'DurableTest',
  // whether you want a sqllite db per DO (usually yes!)
  sqlite: true,
});

export const durableWorker = await Worker('durable-test', {
  entrypoint: './src/worker.ts',
  bindings: {
    DURABLE_TEST: durableTest,
  },
});

export const website = await TanStackStart('website', {
  domains: ['std-todos.kishore.app'],
  bindings: {
    DURABLE: durableWorker,
    DYNAMO_TABLE_NAME: alchemy.secret(process.env.DYNAMO_TABLE_NAME),
    DYNAMO_REGION: alchemy.secret(process.env.DYNAMO_REGION ?? ''),
    DYNAMO_ENDPOINT: alchemy.secret(process.env.DYNAMO_ENDPOINT ?? ''),
    DYNAMO_ACCESS_KEY: alchemy.secret(process.env.DYNAMO_ACCESS_KEY),
    DYNAMO_SECRET_KEY: alchemy.secret(process.env.DYNAMO_SECRET_KEY),
  },
});

console.log({
  url: website.domains?.[0]?.name,
  workerUrl: website.url,
  durableWorker: durableWorker.url,
});

await app.finalize();
