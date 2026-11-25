import { Button } from '@kestack/web-platform/ui/components/button';
import { FolderOpenIcon, RotateCwIcon } from 'lucide-react';

import { Problem } from './shared/index.js';

export function CannotOpen({
  root,
  problem,
  missing,
  onRetry,
  onPickAnother,
}: {
  root: string;
  problem: string;
  missing: boolean;
  onRetry: () => void;
  onPickAnother: () => void;
}) {
  return (
    <Problem
      title={missing ? 'No project here' : 'Could not open this project'}
      problem={problem}
      path={root}
    >
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon />
        Try again
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onPickAnother}>
        <FolderOpenIcon />
        Open another
      </Button>
    </Problem>
  );
}
