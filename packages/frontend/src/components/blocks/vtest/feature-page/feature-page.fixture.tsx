import { feature } from '../fixtures';
import type { TestStatus } from '../types';
import { VtestFeaturePage } from './feature-page';

const clean = { ...feature, diagnostics: [] };

const noop = () => {};

const groupStatus = (groupId: string): TestStatus | undefined =>
  groupId.length % 2 === 0 ? 'pass' : 'fail';

const testStatus = (_groupId: string, name: string): TestStatus =>
  (['pass', 'fail', 'running', 'pending'] as const)[name.length % 4]!;

const live = {
  groupStatus,
  onRunGroup: noop,
  testStatus,
  onRunTest: noop,
  onReload: noop,
};

export default {
  default: (
    <div className="mx-auto max-w-2xl p-8">
      <VtestFeaturePage feature={feature} health="fail" {...live} />
    </div>
  ),
  'no-diagnostics': (
    <div className="mx-auto max-w-2xl p-8">
      <VtestFeaturePage feature={clean} health="pass" {...live} />
    </div>
  ),
  'reload-pending': (
    <div className="mx-auto max-w-2xl p-8">
      <VtestFeaturePage
        feature={clean}
        health="pending"
        {...live}
        reloadPending
      />
    </div>
  ),
};
