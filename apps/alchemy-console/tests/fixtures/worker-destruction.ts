import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { execute } from 'alchemy-console/stage-destruction-engine';
export default {
  async fetch(request: Request) {
    const variant =
      new URL(request.url).searchParams.get('variant') === 'b' ? 'b' : 'a';
    const awsTest = new URL(request.url).searchParams.has('aws');
    const scenario = new URL(request.url).searchParams.get('scenario');
    const aws = {
      type: 'aws' as const,
      accessKeyId: `AKIAFAKE${variant}`,
      secretAccessKey: `fake-secret-${variant}`,
      region: variant === 'a' ? 'us-east-1' : 'us-west-2',
    };
    const awsAccount = variant === 'a' ? '111111111111' : '222222222222';
    const tableArn = `arn:aws:dynamodb:${aws.region}:${awsAccount}:table/fake-table`;
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
    if (awsTest)
      rows.Table = row('Table', 'AWS.DynamoDB.Table', {
        tableName: 'fake-table',
        tableId: 'table-id',
        tableArn,
      });
    if (scenario === 'unsupported')
      rows.Custom = row('Custom', 'Custom.Resource', {});
    if (scenario === 'wrong-region')
      rows.Table = row('Table', 'AWS.DynamoDB.Table', {
        tableName: 'fake-table',
        tableArn: tableArn.replace(aws.region, 'eu-west-1'),
      });
    if (scenario === 'wrong-account')
      rows.Table = row('Table', 'AWS.DynamoDB.Table', {
        tableName: 'fake-table',
        tableArn: tableArn.replace(awsAccount, '999999999999'),
      });
    let tableDeleted = false;
    let deletionPolls = 0;
    let deleted = false;
    const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init),
        url = new URL(request.url);
      const path = url.pathname;
      if (url.hostname.endsWith('.amazonaws.com')) {
        const authorization = request.headers.get('authorization') ?? '';
        if (
          !authorization.includes(`Credential=${aws.accessKeyId}/`) ||
          !authorization.includes(`/${aws.region}/`)
        )
          throw Error('wrong AWS credentials or region');
        const body = await request.text();
        const operation =
          request.headers.get('x-amz-target')?.split('.').at(-1) ??
          new URLSearchParams(body).get('Action');
        calls.push(`AWS ${operation}`);
        if (operation === 'GetCallerIdentity')
          return new Response(
            `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Account>${awsAccount}</Account><Arn>arn:aws:iam::${awsAccount}:user/test</Arn><UserId>test</UserId></GetCallerIdentityResult><ResponseMetadata><RequestId>test</RequestId></ResponseMetadata></GetCallerIdentityResponse>`,
            { headers: { 'content-type': 'text/xml' } },
          );
        if (operation === 'DescribeInsightRules')
          return Response.json({ InsightRules: [] });
        if (operation === 'DescribeContributorInsights')
          return Response.json({ ContributorInsightsStatus: 'DISABLED' });
        if (operation === 'DeleteTable') {
          if (scenario === 'denied')
            return Response.json(
              {
                __type:
                  'com.amazonaws.dynamodb.v20120810#AccessDeniedException',
                message: 'denied',
              },
              { status: 400 },
            );
          tableDeleted = true;
          return Response.json({
            TableDescription: { TableStatus: 'DELETING' },
          });
        }
        if (operation === 'DescribeTable') {
          if (tableDeleted && ++deletionPolls > 1)
            return Response.json(
              {
                __type:
                  'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException',
                message: 'missing',
              },
              { status: 400 },
            );
          return Response.json({
            Table: {
              TableName: 'fake-table',
              TableId: 'table-id',
              TableArn: tableArn,
              TableStatus: tableDeleted ? 'DELETING' : 'ACTIVE',
            },
          });
        }
        throw Error(`Unexpected AWS operation ${operation}`);
      }
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
          if (id === 'Table' && (!tableDeleted || deletionPolls < 2))
            throw Error('Table state removed before AWS confirmed absence');
          delete rows[id];
          return new Response(null, { status: 204 });
        }
        return Response.json(rows[id] ?? null);
      }
      throw Error('Unexpected mock state path: ' + path);
    };
    const target = {
      aws: awsTest && scenario !== 'missing' ? aws : null,
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
    const analysis: unknown[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* execute(target, 'preview', (event) =>
          analysis.push(event),
        );
        if (!plan || 'error' in plan) return { plan };
        const result = yield* execute(
          { ...target, fingerprint: plan.fingerprint },
          'delete',
          (event) => {
            if ('status' in event) events.push(event);
          },
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
      analysis,
      deleted,
      tableDeleted,
      deletionPolls,
      remaining: Object.keys(rows),
    });
  },
};
