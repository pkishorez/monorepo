import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { execute } from 'alchemy-console/stage-destruction-engine';
export default {
  async fetch(request: Request) {
    const variant =
      new URL(request.url).searchParams.get('variant') === 'b' ? 'b' : 'a';
    const accountId = variant.repeat(32);
    const apiToken = `fake-token-${variant}`;
    const authToken = `fake-state-${variant}`;
    const row = (
      id: string,
      type: string,
      attr: unknown,
      downstream: string[] = [],
    ) => ({
      status: 'created',
      resourceType: type,
      fqn: id,
      logicalId: id,
      instanceId: id,
      providerVersion: 1,
      downstream,
      bindings: [],
      props: {},
      attr,
    });
    const rows: Record<string, unknown> = {
      Database: row(
        'Database',
        'Cloudflare.D1Database',
        { accountId, databaseId: 'fake-db' },
        ['Worker'],
      ),
      Worker: row('Worker', 'Cloudflare.Worker', {
        accountId,
        workerName: 'fake-worker',
      }),
    };
    const calls: string[] = [];
    let deleted = false;
    const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init),
        url = new URL(request.url);
      const path = url.pathname;
      if (url.hostname === 'api.cloudflare.com') {
        if (request.headers.get('authorization') !== `Bearer ${apiToken}`)
          throw Error('wrong API credentials');
        if (!path.includes(`/accounts/${accountId}/`))
          throw Error('wrong account');
        await new Promise((resolve) => setTimeout(resolve, 1));
        calls.push(request.method + ' ' + path);
        return Response.json({
          success: true,
          errors: [],
          messages: [],
          result: request.method === 'GET' ? [] : {},
        });
      }
      if (
        url.hostname !== 'state.example.workers.dev' ||
        request.headers.get('authorization') !== `Bearer ${authToken}`
      )
        throw Error('wrong state credentials');
      if (request.method === 'DELETE' && path === '/state/stacks/App') {
        if (url.searchParams.get('stage') !== 'dev')
          throw Error('unscoped stage delete');
        deleted = true;
        return new Response(null, { status: 204 });
      }
      const id = decodeURIComponent(path.split('/resources/')[1] ?? '');
      if (path.endsWith('/stages'))
        return Response.json(deleted ? ['prod'] : ['dev', 'prod']);
      if (path.endsWith('/resources')) return Response.json(Object.keys(rows));
      if (path.endsWith('/replaced-resources')) return Response.json([]);
      if (path.endsWith('/output')) return Response.json(null);
      if (id) {
        if (request.method === 'PUT') {
          rows[id] = await request.json();
          return Response.json(rows[id]);
        }
        if (request.method === 'DELETE') {
          delete rows[id];
          return new Response(null, { status: 204 });
        }
        return Response.json(rows[id] ?? null);
      }
      throw Error('Unexpected mock state path: ' + path);
    };
    const target = {
      stack: 'App',
      stage: 'dev',
      connection: {
        accountId,
        apiToken,
        authToken,
        url: 'https://state.example.workers.dev',
      },
    };
    const events: unknown[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* execute(target, 'preview', () => {});
        if (!plan || 'error' in plan) return { plan };
        const result = yield* execute(
          { ...target, fingerprint: plan.fingerprint },
          'delete',
          (event) => events.push(event),
        );
        return { plan, result };
      }).pipe(
        Effect.scoped,
        Effect.provideService(
          FetchHttpClient.Fetch,
          Object.assign(mock, { preconnect: () => {} }),
        ),
      ),
    );
    return Response.json({
      ...result,
      calls,
      events,
      deleted,
      remaining: Object.keys(rows),
    });
  },
};
