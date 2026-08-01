import { defineConfig, edge, layer, layerGraph } from 'laymos';

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
});
