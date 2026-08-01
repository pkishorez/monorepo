import { defineConfig, edge, layer, layerGraph, module } from 'laymos';

const entry = layer('entry', ['src/index.ts'], {
  description: 'Public barrel composing handlers with services',
});
const handlers = layer('handlers', ['src/handlers'], {
  description: 'Thin adapters implementing the contract via orchestrators',
});
const contract = layer('contract', ['src/contract'], {
  description: 'RPC surface shared with clients',
});
const orchestrators = layer('orchestrators', ['src/orchestrators'], {
  description: 'Ready functionality composed from services and domain',
});
const services = layer('services', ['src/services'], {
  description: 'Resource-backed capabilities (sqlite db)',
});
const domain = layer('domain', ['src/domain'], {
  description: 'Fundamental schemas and pure functionality',
});

export default defineConfig({
  sourceRoots: ['src'],
  graphs: [
    layerGraph(
      'code',
      [
        edge(entry, handlers),
        edge(entry, services),
        edge(handlers, contract),
        edge(handlers, orchestrators),
        edge(orchestrators, services),
        edge(orchestrators, domain),
        edge(services, domain),
        edge(contract, domain),
      ],
      { description: 'Layered architecture of @pkishorez/code' },
    ),
  ],
  modules: [
    module('src/contract/hello', { description: 'Hello RPC' }),
    module('src/contract/code', { description: 'Coding-agent RPC group' }),
    module('src/handlers/hello', { description: 'Hello RPC handlers' }),
    module('src/handlers/code', { description: 'Coding-agent handler group' }),
    module('src/orchestrators/code', {
      description: 'Coding-agent run orchestration',
    }),
    module('src/services/db', { description: 'Sqlite-backed entity store' }),
    module('src/services/git', { description: 'Git inspection service' }),
    module('src/services/harness', {
      description: 'Stateful coding-harness runtime over TanStack AI',
    }),
    module('src/domain/hello', { description: 'Hello functionality' }),
    module('src/domain/machine', { description: 'Machine entity' }),
    module('src/domain/thread', { description: 'Thread entity' }),
    module('src/domain/run', { description: 'Run entity' }),
    module('src/domain/message', { description: 'Message entity' }),
  ],
});
