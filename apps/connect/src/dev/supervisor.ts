import { runConnectDev } from './dev.js';

// The detached process `ensureConnect` starts: the branch's shared Connect.
await runConnectDev({ mode: 'shared' });
