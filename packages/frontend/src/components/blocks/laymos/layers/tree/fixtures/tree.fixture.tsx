import { FixtureFrame } from '../../fixtures/fixture-frame';
import { layers } from '../../fixtures/fixture-data';
import { LayerScopeTree } from '../index';

export default {
  scopes: (
    <FixtureFrame>
      <LayerScopeTree className="max-w-2xl" layers={layers} />
    </FixtureFrame>
  ),
  empty: (
    <FixtureFrame>
      <LayerScopeTree className="max-w-2xl" layers={[]} />
    </FixtureFrame>
  ),
};
