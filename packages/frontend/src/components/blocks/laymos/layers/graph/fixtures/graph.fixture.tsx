import { FixtureFrame } from '../../fixtures/fixture-frame';
import { layers, rules } from '../../fixtures/fixture-data';
import { LayerGraph } from '../index';

const foundationLayers = layers.filter((layer) =>
  ['infrastructure', 'domain', 'foundation'].includes(layer.id),
);
const foundationRules = rules.filter((rule) =>
  ['infrastructure', 'domain'].includes(rule.fromLayerId),
);

export default {
  overview: (
    <FixtureFrame className="h-[680px]">
      <LayerGraph className="h-full" layers={layers} rules={rules} />
    </FixtureFrame>
  ),
  filtered: (
    <FixtureFrame className="h-[680px]">
      <LayerGraph
        className="h-full"
        layers={foundationLayers}
        rules={foundationRules}
      />
    </FixtureFrame>
  ),
  empty: (
    <FixtureFrame>
      <LayerGraph layers={[]} rules={[]} />
    </FixtureFrame>
  ),
};
