import { FixtureFrame } from '../../fixtures/fixture-frame';
import { layers } from '../../fixtures/fixture-data';
import { LayerDetails } from '../index';

export default {
  selected: (
    <FixtureFrame>
      <LayerDetails className="max-w-xl" layer={layers[1]} />
    </FixtureFrame>
  ),
  empty: (
    <FixtureFrame>
      <LayerDetails className="max-w-xl" />
    </FixtureFrame>
  ),
};
