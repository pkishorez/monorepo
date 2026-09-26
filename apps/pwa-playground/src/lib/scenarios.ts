export interface Scenario {
  readonly path: string;
  readonly title: string;
  readonly summary: string;
}

export const scenarios: ReadonlyArray<Scenario> = [
  {
    path: '/status',
    title: 'Status',
    summary: 'Build ID, worker and registration state, storage, caches.',
  },
  {
    path: '/install',
    title: 'Install Prompt',
    summary: 'The browser install flow, or manual steps on iOS.',
  },
  {
    path: '/update',
    title: 'Update Prompt',
    summary: 'Check for a new build and reload every tab into it.',
  },
  {
    path: '/runtime-cache',
    title: 'Runtime Cache',
    summary: 'One endpoint per strategy; see which answers come from cache.',
  },
  {
    path: '/data',
    title: 'Route data offline',
    summary: 'A loader whose data is cached network-first.',
  },
  {
    path: '/rpc',
    title: 'Worker RPC',
    summary: 'Unary and streaming calls into the service worker.',
  },
  {
    path: '/auth-sim',
    title: 'Auth never cached',
    summary: 'A session endpoint the worker never caches; sign-out clears.',
  },
  {
    path: '/offline',
    title: 'Offline Fallback',
    summary: 'The page shown for a navigation with no network and no cache.',
  },
];
