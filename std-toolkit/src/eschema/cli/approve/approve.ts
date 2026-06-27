import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { analyzeSnapshots } from '../shared/schema-snapshots/index.js';
import { approvalItems } from './approval-items.js';
import { approveVersionSnapshot } from './approve-version.js';
import {
  displayLine,
  promptApprovalText,
  readApprovalDecision,
  type ApprovalDisplay,
  type ApprovalTextReader,
} from './approval-prompt.js';
import { renderApprovalItem } from './render-approval-item.js';

const rootFlag = Flag.string('root').pipe(
  Flag.withDescription('Schema collection root to approve versions for'),
);

const forceFlag = Flag.boolean('force').pipe(
  Flag.withDescription('Allow approval of modified non-latest versions'),
);

export const approveCommand = Command.make(
  'approve',
  {
    root: rootFlag,
    force: forceFlag,
  },
  ({ root, force }) =>
    Effect.gen(function* () {
      yield* runApproval(root, force);
    }),
).pipe(Command.withDescription('Interactively approve schema versions'));

export function runApproval(root: string, force: boolean) {
  return runApprovalWith({
    root,
    force,
    readApprovalText: promptApprovalText,
    display: displayLine,
  });
}

export function runApprovalWith<
  ReadError,
  ReadContext,
  DisplayError,
  DisplayContext,
>(input: {
  readonly root: string;
  readonly force: boolean;
  readonly readApprovalText: ApprovalTextReader<ReadError, ReadContext>;
  readonly display: ApprovalDisplay<DisplayError, DisplayContext>;
}) {
  return Effect.gen(function* () {
    const report = yield* analyzeSnapshots(input.root);
    yield* input.display(`Schema approval report: ${report.root}`);

    for (const item of approvalItems(report, input.force)) {
      yield* input.display(
        renderApprovalItem(report.root, item.schema, item.issue),
      );
      if (!item.canApprove) {
        yield* input.display(item.blockReason);
        continue;
      }

      const decision = yield* readApprovalDecision({
        label: `${item.schema.relativePath} ${item.issue.version}`,
        readApprovalText: input.readApprovalText,
        display: input.display,
      });
      if (decision === 'approve') {
        yield* approveVersionSnapshot({
          schemaRoot: item.schema.path,
          version: item.issue.version!,
        });
        yield* input.display(
          `Approved ${item.schema.relativePath} ${item.issue.version}`,
        );
      } else {
        yield* input.display(
          `Ignored ${item.schema.relativePath} ${item.issue.version}`,
        );
      }
    }
  });
}
