import { TraceDock, type TraceDockSettings } from './trace-dock';
import { TraceList } from './trace-list';
import { groupByTrace, type OtelSpan } from './trace-model';

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

const overlappingSpans: OtelSpan[] = [
  {
    traceId: 'fanout-abc',
    spanId: 'root',
    parentSpanId: null,
    name: 'fan-out-request',
    startTime: 0,
    endTime: 620,
    status: 'success',
    attributes: { 'http.method': 'GET', 'service.name': 'orchestrator' },
    events: [],
  },
  // Three concurrent children — all overlap each other (sub-row packing kicks in)
  {
    traceId: 'fanout-abc',
    spanId: 'fetch-users',
    parentSpanId: 'root',
    name: 'fetch-users',
    startTime: 10,
    endTime: 390,
    status: 'success',
    attributes: { 'db.system': 'postgresql', 'db.table': 'users' },
    events: [],
  },
  {
    traceId: 'fanout-abc',
    spanId: 'fetch-products',
    parentSpanId: 'root',
    name: 'fetch-products',
    startTime: 10,
    endTime: 340,
    status: 'success',
    attributes: { 'db.system': 'mongodb', 'db.collection': 'products' },
    events: [],
  },
  {
    traceId: 'fanout-abc',
    spanId: 'fetch-inventory',
    parentSpanId: 'root',
    name: 'fetch-inventory',
    startTime: 10,
    endTime: 510,
    status: 'success',
    attributes: { 'cache.system': 'redis', 'cache.key': 'inventory:*' },
    events: [],
  },
  // Sequential child — does NOT overlap above (starts after all fetches)
  {
    traceId: 'fanout-abc',
    spanId: 'merge-results',
    parentSpanId: 'root',
    name: 'merge-results',
    startTime: 520,
    endTime: 610,
    status: 'success',
    attributes: { 'result.count': 42 },
    events: [
      {
        name: 'merge.complete',
        timestamp: 610,
        attributes: { 'result.bytes': 8192 },
      },
    ],
  },
  // Grandchildren — show a third depth level
  {
    traceId: 'fanout-abc',
    spanId: 'db-query-a',
    parentSpanId: 'fetch-users',
    name: 'db.query',
    startTime: 15,
    endTime: 200,
    status: 'success',
    attributes: { 'db.statement': 'SELECT * FROM users WHERE active = true' },
    events: [],
  },
  {
    traceId: 'fanout-abc',
    spanId: 'db-query-b',
    parentSpanId: 'fetch-users',
    name: 'db.hydrate',
    startTime: 210,
    endTime: 385,
    status: 'success',
    attributes: { 'rows.count': 128 },
    events: [],
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
};
