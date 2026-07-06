const consumer = { name: 'consumer', paths: ['src/consumer'], config: {} };
const feature = { name: 'feature', paths: ['src/feature'], config: {} };
const core = { name: 'core', paths: ['src/core'], config: {} };

export default {
  rootDir: 'src',
  ignore: ['src/ignored.ts'],
  rules: [
    {
      kind: 'layer-graph',
      name: 'app',
      layers: [consumer, feature, core],
      edges: [
        { from: consumer, to: feature },
        { from: feature, to: core },
      ],
      config: {},
    },
  ],
  modules: [
    { path: 'src/feature', opaque: false },
    { path: 'src/core', opaque: false },
  ],
};
