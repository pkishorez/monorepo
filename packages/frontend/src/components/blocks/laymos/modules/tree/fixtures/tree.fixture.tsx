import { FixtureFrame } from '../../../layers/fixtures/fixture-frame';
import { modules, moduleViolations } from '../../fixtures/fixture-data';
import { ModuleTree } from '../index';

export default {
  overview: (
    <FixtureFrame>
      <ModuleTree className="max-w-sm" modules={modules} />
    </FixtureFrame>
  ),
  selected: (
    <FixtureFrame>
      <ModuleTree
        className="max-w-sm"
        modules={modules}
        activeModuleId="src/domain/orders/events"
        highlightedModuleIds={
          new Set(['src/domain/orders', 'src/application/orders'])
        }
      />
    </FixtureFrame>
  ),
  violation: (
    <FixtureFrame>
      <ModuleTree
        className="max-w-sm"
        modules={modules}
        activeViolation={moduleViolations.find(
          ({ id }) => id === 'missing-pricing-entry-point',
        )}
      />
    </FixtureFrame>
  ),
  empty: (
    <FixtureFrame>
      <ModuleTree className="max-w-sm" modules={[]} />
    </FixtureFrame>
  ),
};
