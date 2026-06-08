import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const iface = layer('interface', ['src/cli', 'src/server'], {
  description: 'Process entry + HTTP wiring (vtest-serve bin, Effect server)',
});

const contract = layer('contract', ['src/rpc'], {
  description: 'The RPC contract shared by client and server (pure schema)',
});

const engine = layer('engine', ['src/runtime'], {
  description: 'Vitest manager, subset runner, live store (boots Vitest)',
});

const core = layer('core', ['src/analysis'], {
  description: 'Pure model + fs: discover, parse directives, toc, validate',
});

const authoringLayer = layer('authoring', ['src/authoring'], {
  description: 'Frozen vtest()/vdescribe() authoring API. Imports nothing.',
});

const authoring = feature('authoring', {
  description: 'Frozen authoring API: vtest/vdescribe',
});
const analysis = feature('analysis', {
  description: 'Pure discovery, directive parsing, toc loading, validation',
});
const runtime = feature('runtime', {
  description: 'Lazy Vitest manager, subset runner, live event store',
});
const rpc = feature('rpc', {
  description: 'RpcGroup contract + request/response schemas',
});
const server = feature('server', {
  description: 'Effect layers wiring RPC handlers over HTTP',
});
const cli = feature('cli', {
  description: 'vtest-serve bin entry',
});

export default {
  rootDir: 'src',
  rules: [
    layersTopDown('vtest', [iface, contract, engine, core, authoringLayer]),
  ],
  features: [authoring, analysis, runtime, rpc, server, cli],
  modules: [
    module('src/authoring', { feature: 'authoring', visibility: 'public' }),
    module('src/analysis', { feature: 'analysis', visibility: 'public' }),
    module('src/runtime', { feature: 'runtime', sharedWith: ['server'] }),
    module('src/rpc', { feature: 'rpc', visibility: 'public' }),
    module('src/server', { feature: 'server', visibility: 'public' }),
    module('src/cli', { feature: 'cli' }),
  ],
} satisfies ProjectConfig;
