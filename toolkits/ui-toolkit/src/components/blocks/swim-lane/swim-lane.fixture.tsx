import { SwimLane } from './swim-lane';

const actors = [
  { id: 'browser', label: 'Browser', detail: 'React application' },
  { id: 'api', label: 'API', detail: 'HTTP service' },
  { id: 'database', label: 'Database' },
];

const messages = [
  { from: 'browser', to: 'api', label: 'Create order', level: 0 },
  { from: 'api', to: 'api', label: 'Validate request', level: 1 },
  { from: 'api', to: 'database', label: 'Insert order', level: 2 },
  {
    from: 'database',
    to: 'api',
    label: 'Saved order',
    kind: 'return' as const,
    level: 3,
  },
  {
    from: 'api',
    to: 'browser',
    label: '201 Created',
    kind: 'return' as const,
    level: 4,
  },
];

export default {
  'request lifecycle': (
    <SwimLane
      title="Order creation"
      label="A browser creates an order through an API and database"
      actors={actors}
      messages={messages}
    />
  ),
};
