import { Effect } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { HeartbeatApi } from '../contract/index.js';
import { Catalog } from '../../../services/catalog/contract/index.js';
import { Connections } from '../../../services/connections/contract/index.js';

export const heartbeatHandlers = HeartbeatApi.toLayer({
  Report: (report) =>
    Effect.gen(function* () {
      const principal = yield* Authz.User;
      const connections = yield* Connections;
      const catalog = yield* Catalog;
      const choices = yield* connections.report(principal, report);
      return { plugins: catalog.enabled(choices) };
    }),
  Remove: ({ id }) =>
    Effect.gen(function* () {
      const principal = yield* Authz.User;
      const connections = yield* Connections;
      yield* connections.remove(principal, id);
    }),
});
