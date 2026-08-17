import { FixtureFrame } from '../../../layer-inspection/fixtures/fixture-frame';
import { moduleViolations } from '../../fixtures/fixture-data';
import { ModuleViolationsList } from '../index';

export default {
  all: (
    <FixtureFrame>
      <ModuleViolationsList
        className="max-w-md"
        violations={moduleViolations}
      />
    </FixtureFrame>
  ),
  active: (
    <FixtureFrame>
      <ModuleViolationsList
        className="max-w-md"
        violations={moduleViolations}
        activeViolationId="missing-pricing-entry-point"
      />
    </FixtureFrame>
  ),
  empty: (
    <FixtureFrame>
      <ModuleViolationsList className="max-w-md" violations={[]} />
    </FixtureFrame>
  ),
};
