import { FilePenIcon } from '@kestack/web-platform/ui/components/lucide';
import { DiffViewer } from '@kestack/web-platform/ui/viewers/diff-viewer';
import { diffsOf } from '../../call/index.ts';
import { type Kind, Output } from '../../output/index.ts';

/** A file edited: opened, the diff it made, one per file; why, if it failed. */
export const edit: Kind = {
  icon: FilePenIcon,
  Detail: ({ row, opening, folder }) => {
    const diffs = diffsOf(row.call, folder);
    if (diffs.length === 0) return <Output row={row} opening={opening} />;
    return (
      <>
        {diffs.map((diff) => (
          <div key={diff.path} className="min-w-0 overflow-x-auto">
            <DiffViewer
              diff={diff as Parameters<typeof DiffViewer>[0]['diff']}
              defaultLayout="unified"
              autoHeight
              className="rounded-lg border border-border"
            />
          </div>
        ))}
        {row.result?.isError && <Output row={row} opening={opening} />}
      </>
    );
  },
};
