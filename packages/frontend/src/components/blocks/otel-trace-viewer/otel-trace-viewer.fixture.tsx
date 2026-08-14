import { TraceDock, type TraceDockSettings } from './trace-dock';
import { TraceList } from './trace-list';
import { groupByTrace, type OtelSpan } from './trace-model';
import { TraceViewer } from './trace-viewer';

const spans: OtelSpan[] = [
  // Trace 1: successful POST request with nested spans
  {
    traceId: 'abc123',
    spanId: 's1',
    parentSpanId: null,
    name: 'POST /api/users',
    startTime: 1000,
    endTime: 1260,
    status: 'success',
    attributes: {
      'http.method': 'POST',
      'http.route': '/api/users',
      'http.status_code': 201,
      'http.url': 'http://localhost:3000/api/users',
    },
    events: [],
  },
  {
    traceId: 'abc123',
    spanId: 's2',
    parentSpanId: 's1',
    name: 'validate-request',
    startTime: 1010,
    endTime: 1030,
    status: 'success',
    attributes: { 'validation.schema': 'UserCreateSchema' },
    events: [],
  },
  {
    traceId: 'abc123',
    spanId: 's3',
    parentSpanId: 's1',
    name: 'db.insert users',
    startTime: 1035,
    endTime: 1220,
    status: 'success',
    attributes: {
      'db.system': 'postgresql',
      'db.operation': 'INSERT',
      'db.table': 'users',
      'db.statement': 'INSERT INTO users (email, name) VALUES ($1, $2)',
    },
    events: [
      { name: 'query.start', timestamp: 1035, attributes: {} },
      {
        name: 'query.end',
        timestamp: 1220,
        attributes: { 'rows.affected': 1, 'query.duration_ms': 185 },
      },
    ],
  },
  {
    traceId: 'abc123',
    spanId: 's4',
    parentSpanId: 's1',
    name: 'send-welcome-email',
    startTime: 1225,
    endTime: 1255,
    status: 'success',
    attributes: {
      'messaging.system': 'ses',
      'messaging.destination': 'welcome-queue',
    },
    events: [
      {
        name: 'email.queued',
        timestamp: 1255,
        attributes: { 'email.message_id': 'msg-0192' },
      },
    ],
  },

  // Trace 2: failed GET with nested error
  {
    traceId: 'def456',
    spanId: 's5',
    parentSpanId: null,
    name: 'GET /api/orders',
    startTime: 2000,
    endTime: 2160,
    status: 'error',
    attributes: {
      'http.method': 'GET',
      'http.route': '/api/orders',
      'http.status_code': 500,
    },
    events: [],
  },
  {
    traceId: 'def456',
    spanId: 's6',
    parentSpanId: 's5',
    name: 'cache.get orders',
    startTime: 2010,
    endTime: 2022,
    status: 'success',
    attributes: {
      'cache.system': 'redis',
      'cache.hit': false,
      'cache.key': 'orders:user:42',
    },
    events: [],
  },
  {
    traceId: 'def456',
    spanId: 's7',
    parentSpanId: 's5',
    name: 'db.query orders',
    startTime: 2025,
    endTime: 2155,
    status: 'error',
    attributes: {
      'db.system': 'postgresql',
      'db.operation': 'SELECT',
      'db.table': 'orders',
    },
    events: [
      {
        name: 'exception',
        timestamp: 2155,
        attributes: {
          'exception.type': 'ConnectionError',
          'exception.message': 'Connection pool exhausted after 130ms',
          'exception.stacktrace':
            'ConnectionError\n  at pool.acquire (/app/db.ts:42)\n  at OrdersService.list (/app/orders.ts:88)',
        },
      },
    ],
  },

  // Trace 3: in-progress background job
  {
    traceId: 'ghi789',
    spanId: 's8',
    parentSpanId: null,
    name: 'process-job email.welcome',
    startTime: 3000,
    endTime: null,
    status: 'running',
    attributes: {
      'job.id': 'job-9182',
      'job.queue': 'email',
      'job.attempt': 1,
    },
    events: [{ name: 'job.started', timestamp: 3000, attributes: {} }],
  },
  {
    traceId: 'ghi789',
    spanId: 's9',
    parentSpanId: 's8',
    name: 'render-template',
    startTime: 3010,
    endTime: 3045,
    status: 'success',
    attributes: {
      'template.name': 'welcome-email',
      'template.locale': 'en-US',
    },
    events: [],
  },
  {
    traceId: 'ghi789',
    spanId: 's10',
    parentSpanId: 's8',
    name: 'smtp.send',
    startTime: 3050,
    endTime: null,
    status: 'running',
    attributes: { 'net.peer.name': 'smtp.sendgrid.net', 'net.peer.port': 587 },
    events: [],
  },

  // Trace 4: unset status, no attributes/events
  {
    traceId: 'jkl000',
    spanId: 's11',
    parentSpanId: null,
    name: 'health-check',
    startTime: 4000,
    endTime: 4003,
    status: 'unset',
    attributes: {},
    events: [],
  },
];

function fixtureLog(
  name: string,
  timestamp: number,
  severityText: string,
  body: string,
  attributes: Readonly<Record<string, unknown>> = {},
): OtelSpan['events'][number] {
  return {
    name,
    timestamp,
    attributes: { body, severityText, ...attributes },
  };
}

const overlappingSpans: OtelSpan[] = [
  {
    traceId: 'checkout-demo',
    spanId: 'root',
    parentSpanId: null,
    name: 'POST /checkout',
    startTime: 0,
    endTime: 1800,
    status: 'success',
    attributes: {
      narrative: 'Handle a checkout request for a gold-tier customer',
      'http.request.method': 'POST',
      'http.route': '/checkout',
      'http.response.status_code': 207,
      'resource.service.name': 'checkout-api',
      'server.address': 'api.example.test',
    },
    events: [
      fixtureLog('request.accepted', 8, 'INFO', 'Checkout request accepted', {
        'cart.items': 7,
        'customer.tier': 'gold',
      }),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'authenticate',
    parentSpanId: 'root',
    name: 'authenticate-customer',
    startTime: 20,
    endTime: 430,
    status: 'success',
    attributes: {
      narrative: 'Verify who is checking out',
      'auth.provider': 'oauth2',
      'enduser.id': 'customer-418',
      'resource.service.name': 'identity-service',
    },
    events: [
      fixtureLog('token.received', 35, 'DEBUG', 'Bearer token received'),
      fixtureLog(
        'identity.verified',
        405,
        'INFO',
        'Customer identity verified',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'catalog',
    parentSpanId: 'root',
    name: 'load-cart-products',
    startTime: 30,
    endTime: 860,
    status: 'success',
    attributes: {
      narrative: 'Load the products sitting in the cart',
      'db.system': 'postgresql',
      'db.namespace': 'catalog',
      'resource.service.name': 'catalog-service',
    },
    events: [
      fixtureLog('cart.loaded', 170, 'INFO', 'Loaded seven cart lines', {
        'cart.lines': 7,
      }),
      fixtureLog('catalog.slow', 690, 'WARN', 'Catalog query exceeded SLO', {
        'slo.target_ms': 500,
      }),
      fixtureLog('catalog.complete', 845, 'INFO', 'Product details hydrated'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'inventory',
    parentSpanId: 'root',
    name: 'check-inventory (degraded)',
    startTime: 50,
    endTime: 760,
    status: 'unset',
    attributes: {
      narrative: 'Check that every cart item is in stock',
      'inventory.region': 'ap-south-1',
      'otel.status.description': 'Completed with inventory warnings',
      'resource.service.name': 'inventory-service',
    },
    events: [
      fixtureLog('inventory.lookup', 90, 'DEBUG', 'Inventory lookup started'),
      fixtureLog('inventory.low', 510, 'WARN', 'Two SKUs are below threshold', {
        'inventory.low_count': 2,
      }),
      fixtureLog(
        'inventory.partial',
        730,
        'WARN',
        'Using partial availability',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'recommendations',
    parentSpanId: 'root',
    name: 'calculate-recommendations',
    startTime: 120,
    endTime: 1050,
    status: 'error',
    attributes: {
      narrative: 'Compute cross-sell recommendations for the cart',
      'error.type': 'InferenceTimeout',
      'resource.service.name': 'recommendation-service',
      'retry.count': 1,
    },
    events: [
      fixtureLog(
        'model.requested',
        290,
        'INFO',
        'Recommendation model requested',
      ),
      fixtureLog(
        'model.retry',
        810,
        'WARN',
        'Primary model timed out; retrying',
      ),
      fixtureLog('model.failed', 1015, 'ERROR', 'Inference retry exhausted', {
        'error.code': 'MODEL_TIMEOUT',
      }),
      {
        name: 'exception',
        timestamp: 1020,
        attributes: {
          body: 'InferenceTimeout: model did not respond within 700ms',
          severityText: 'ERROR',
          'exception.type': 'InferenceTimeout',
          'exception.message': 'Model response deadline exceeded',
        },
      },
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'render',
    parentSpanId: 'root',
    name: 'render-checkout-response',
    startTime: 1080,
    endTime: 1480,
    status: 'success',
    attributes: {
      narrative: 'Assemble the checkout response',
      'response.format': 'json',
      'result.items': 7,
    },
    events: [
      fixtureLog('render.started', 1090, 'TRACE', 'Response rendering started'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'respond',
    parentSpanId: 'root',
    name: 'write-http-response',
    startTime: 1500,
    endTime: 1770,
    status: 'success',
    attributes: {
      narrative: 'Send the response back to the customer',
      'http.response.status_code': 207,
      'network.protocol.version': '2',
    },
    events: [
      fixtureLog('response.sent', 1760, 'INFO', 'Checkout response sent', {
        'response.bytes': 18_432,
      }),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'decode-token',
    parentSpanId: 'authenticate',
    name: 'decode-jwt',
    startTime: 35,
    endTime: 125,
    status: 'success',
    attributes: {
      'jwt.algorithm': 'RS256',
      'jwt.issuer': 'identity.example.test',
    },
    events: [fixtureLog('jwt.decoded', 115, 'DEBUG', 'JWT claims decoded')],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'permissions',
    parentSpanId: 'authenticate',
    name: 'load-permissions',
    startTime: 140,
    endTime: 400,
    status: 'success',
    attributes: { 'permissions.count': 14 },
    events: [],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'catalog-cache',
    parentSpanId: 'catalog',
    name: 'redis.mget product-cache',
    startTime: 55,
    endTime: 185,
    status: 'success',
    attributes: { 'db.system': 'redis', 'cache.hit_count': 4 },
    events: [
      fixtureLog(
        'cache.partial-hit',
        170,
        'INFO',
        'Four of seven products cached',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'catalog-query',
    parentSpanId: 'catalog',
    name: 'postgres.query products',
    startTime: 190,
    endTime: 815,
    status: 'success',
    attributes: {
      'db.system': 'postgresql',
      'db.operation.name': 'SELECT',
      'db.query.summary': 'Load products by SKU',
    },
    events: [
      fixtureLog('query.started', 200, 'DEBUG', 'Catalog query dispatched'),
      fixtureLog('query.rows', 610, 'INFO', 'Seven product rows received'),
      fixtureLog('query.slow', 700, 'WARN', 'Query crossed warning threshold'),
      fixtureLog('query.complete', 805, 'INFO', 'Catalog query completed'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'inventory-cache',
    parentSpanId: 'inventory',
    name: 'redis.mget inventory',
    startTime: 80,
    endTime: 365,
    status: 'success',
    attributes: { 'db.system': 'redis', 'db.operation.name': 'MGET' },
    events: [
      fixtureLog(
        'redis.connected',
        100,
        'DEBUG',
        'Connected to inventory cache',
      ),
      fixtureLog(
        'redis.result',
        350,
        'INFO',
        'Inventory cache returned five entries',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'inventory-reconcile',
    parentSpanId: 'inventory',
    name: 'reconcile-missing-inventory',
    startTime: 370,
    endTime: 735,
    status: 'unset',
    attributes: { 'inventory.missing_count': 2 },
    events: [
      fixtureLog(
        'reconcile.fallback',
        410,
        'WARN',
        'Falling back to warehouse API',
      ),
      fixtureLog(
        'reconcile.partial',
        720,
        'WARN',
        'One warehouse remained unavailable',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'features',
    parentSpanId: 'recommendations',
    name: 'load-customer-features',
    startTime: 150,
    endTime: 390,
    status: 'success',
    attributes: { 'feature.count': 48 },
    events: [
      fixtureLog('features.loaded', 375, 'INFO', 'Customer features loaded'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'inference',
    parentSpanId: 'recommendations',
    name: 'run-model-inference',
    startTime: 300,
    endTime: 1000,
    status: 'error',
    attributes: {
      narrative: 'Run the cross-sell model across its GPU shards',
      'ml.model.name': 'cross-sell-v4',
      'error.type': 'DeadlineExceeded',
    },
    events: [
      fixtureLog('inference.queued', 320, 'INFO', 'Inference queued'),
      fixtureLog(
        'inference.timeout',
        980,
        'ERROR',
        'Inference deadline exceeded',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'fallback',
    parentSpanId: 'recommendations',
    name: 'load-static-fallback',
    startTime: 1005,
    endTime: 1038,
    status: 'success',
    attributes: {
      narrative: 'Fall back to the static top-sellers list',
      'fallback.strategy': 'top-sellers',
    },
    events: [],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'db-connect',
    parentSpanId: 'catalog-query',
    name: 'acquire-db-connection',
    startTime: 205,
    endTime: 285,
    status: 'success',
    attributes: { 'db.pool.name': 'catalog-primary' },
    events: [],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'db-scan',
    parentSpanId: 'catalog-query',
    name: 'scan-product-index',
    startTime: 300,
    endTime: 700,
    status: 'success',
    attributes: { 'db.rows_examined': 12_480 },
    events: [
      fixtureLog('scan.progress', 460, 'TRACE', 'Index scan 50% complete'),
      fixtureLog(
        'scan.cardinality',
        650,
        'WARN',
        'Higher cardinality than expected',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'db-hydrate',
    parentSpanId: 'catalog-query',
    name: 'hydrate-products',
    startTime: 710,
    endTime: 800,
    status: 'success',
    attributes: { 'db.rows_returned': 7 },
    events: [
      fixtureLog('hydrate.complete', 792, 'INFO', 'Product models hydrated'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'model-queue',
    parentSpanId: 'inference',
    name: 'wait-for-model-slot',
    startTime: 320,
    endTime: 505,
    status: 'success',
    attributes: { 'queue.name': 'gpu-inference', 'queue.position': 3 },
    events: [
      fixtureLog('queue.wait', 420, 'DEBUG', 'Waiting for model capacity'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'model-shard-a',
    parentSpanId: 'inference',
    name: 'infer shard-a',
    startTime: 515,
    endTime: 860,
    status: 'success',
    attributes: { 'ml.shard': 'a', 'server.address': 'gpu-a.internal' },
    events: [
      fixtureLog('shard.started', 525, 'DEBUG', 'Shard A inference started'),
      fixtureLog(
        'shard.complete',
        850,
        'INFO',
        'Shard A returned 24 candidates',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'model-shard-b',
    parentSpanId: 'inference',
    name: 'infer shard-b',
    startTime: 520,
    endTime: 930,
    status: 'error',
    attributes: { 'ml.shard': 'b', 'error.type': 'CudaOutOfMemory' },
    events: [
      fixtureLog('shard.started', 530, 'DEBUG', 'Shard B inference started'),
      fixtureLog('gpu.memory', 760, 'WARN', 'GPU memory pressure reached 94%'),
      fixtureLog('shard.failed', 910, 'ERROR', 'Shard B ran out of GPU memory'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'template',
    parentSpanId: 'render',
    name: 'render-json-template',
    startTime: 1100,
    endTime: 1260,
    status: 'success',
    attributes: { 'template.version': '2026-08-09' },
    events: [
      fixtureLog(
        'template.selected',
        1110,
        'DEBUG',
        'Checkout template selected',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'serialize',
    parentSpanId: 'render',
    name: 'serialize-response',
    startTime: 1270,
    endTime: 1430,
    status: 'success',
    attributes: { 'response.bytes': 18_432 },
    events: [],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'compress',
    parentSpanId: 'render',
    name: 'compress-response',
    startTime: 1390,
    endTime: 1460,
    status: 'success',
    attributes: { 'compression.algorithm': 'br', 'compression.ratio': 0.31 },
    events: [
      fixtureLog(
        'compression.complete',
        1450,
        'INFO',
        'Brotli compression complete',
      ),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'audit',
    parentSpanId: 'respond',
    name: 'emit-audit-event',
    startTime: 1510,
    endTime: 1650,
    status: 'running',
    attributes: {
      'messaging.system': 'kafka',
      'messaging.destination.name': 'audit',
    },
    events: [
      fixtureLog('audit.buffered', 1600, 'INFO', 'Audit event buffered'),
    ],
  },
  {
    traceId: 'checkout-demo',
    spanId: 'http-write',
    parentSpanId: 'respond',
    name: 'flush-response-body',
    startTime: 1660,
    endTime: 1760,
    status: 'success',
    attributes: { 'network.transport': 'tcp', 'response.chunk_count': 3 },
    events: [
      fixtureLog('flush.started', 1665, 'DEBUG', 'Response flush started'),
      fixtureLog('flush.complete', 1755, 'INFO', 'Response body flushed'),
    ],
  },
];

const dockSettings: TraceDockSettings = {
  open: true,
  height: 420,
  sidebarWidth: 360,
  nameColWidth: 240,
  sidebarOpen: true,
  selectedSpanId: null,
};

export default {
  default: (
    <div className="p-6 max-w-5xl mx-auto">
      <TraceList traces={groupByTrace(spans)} onSelectTrace={() => {}} />
    </div>
  ),
  'overlapping-spans': (
    <div className="p-6 max-w-5xl mx-auto">
      <TraceList
        traces={groupByTrace(overlappingSpans)}
        onSelectTrace={() => {}}
      />
    </div>
  ),
  empty: (
    <div className="p-6 max-w-5xl mx-auto">
      <TraceList traces={[]} onSelectTrace={() => {}} />
    </div>
  ),
  'single-span': (
    <div className="p-6 max-w-5xl mx-auto">
      <TraceList traces={groupByTrace([spans[0]!])} onSelectTrace={() => {}} />
    </div>
  ),
  dock: (
    <TraceDock
      trace={groupByTrace(overlappingSpans)[0]!}
      settings={dockSettings}
      onSettingsChange={() => {}}
      onClose={() => {}}
    />
  ),
  viewer: (
    <div className="min-h-screen bg-muted/30 p-6">
      <TraceViewer className="h-[640px]" spans={overlappingSpans} />
    </div>
  ),
  'viewer-parallel': (
    <div className="min-h-screen bg-muted/30 p-6">
      <TraceViewer
        className="h-[640px]"
        defaultView="parallel"
        spans={overlappingSpans}
      />
    </div>
  ),
  'viewer-narrative': (
    <div className="min-h-screen bg-muted/30 p-6">
      <TraceViewer
        className="h-[640px]"
        defaultView="narrative"
        spans={overlappingSpans}
      />
    </div>
  ),
};
