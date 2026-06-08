import { feature } from '../fixtures';
import type { TestStatus } from '../types';
import { TestGroup } from './test-group';

const group = feature.groups[0]!;

const noop = () => {};

const statusByName: Record<string, TestStatus> = {};
group.tests.forEach((t, i) => {
  statusByName[t.name] = (
    ['pass', 'fail', 'running', 'pending', 'skip'] as const
  )[i % 5]!;
});

export default {
  default: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup groupId={group.id} tests={group.tests} onRun={noop} />
    </div>
  ),
  queued: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup
        groupId={group.id}
        tests={group.tests}
        status="pending"
        onRun={noop}
      />
    </div>
  ),
  running: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup
        groupId={group.id}
        tests={group.tests}
        status="running"
        onRun={noop}
      />
    </div>
  ),
  passed: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup
        groupId={group.id}
        tests={group.tests}
        status="pass"
        onRun={noop}
        testStatus={(name) => statusByName[name]}
        onRunTest={noop}
      />
    </div>
  ),
  failed: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup
        groupId={group.id}
        tests={group.tests}
        status="fail"
        onRun={noop}
        testStatus={(name) => statusByName[name]}
        onRunTest={noop}
      />
    </div>
  ),
  empty: (
    <div className="mx-auto max-w-2xl p-8">
      <TestGroup groupId="no-tests" tests={[]} onRun={noop} />
    </div>
  ),
};
