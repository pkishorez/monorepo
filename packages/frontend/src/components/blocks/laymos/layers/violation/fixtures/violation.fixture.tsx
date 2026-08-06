import { FixtureFrame } from '../../fixtures/fixture-frame';
import {
  coverageViolations,
  violationPairs,
} from '../../fixtures/fixture-data';
import { LayerViolationsList } from '../index';

export default {
  grouped: (
    <FixtureFrame>
      <LayerViolationsList
        className="max-w-2xl"
        violationPairs={violationPairs}
        coverageViolations={coverageViolations}
        activeViolationGroupId="domain-to-infrastructure"
      />
    </FixtureFrame>
  ),
  clean: (
    <FixtureFrame>
      <LayerViolationsList className="max-w-2xl" violationPairs={[]} />
    </FixtureFrame>
  ),
};
