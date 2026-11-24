import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RotateCwIcon } from 'lucide-react';

import { Problem, Rereading, Waiting } from '../../../../view/shared/index.js';
import { isReading, type PackageShape } from '../logic/shared/index.js';

/*
 * A Package's view: its tree once read, quietly marked while it is read
 * again at another branch; or why it could not be read.
 */

type BodyProps = ViewPropsOf<typeof PackageShape> & {
  /** The Package's tree, once it is read. */
  readonly tree: ReactNode;
};

export function Body({ root, model, props, state, send, tree }: BodyProps) {
  const reading = isReading(state, props.branch, model.tries);
  if (state._tag === 'Contents' && tree !== null)
    return (
      <div {...root} className="relative h-full min-h-0">
        {tree}
        {reading ? <Rereading>Reading the branch…</Rereading> : null}
      </div>
    );
  return (
    <div {...root} className="h-full min-h-0">
      {reading ? (
        <Waiting>Reading the package and its imports…</Waiting>
      ) : state._tag === 'Failure' ? (
        <Problem title="Could not read this package" problem={state.problem}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => send({ _tag: 'Retried' })}
          >
            <RotateCwIcon />
            Try again
          </Button>
        </Problem>
      ) : null}
    </div>
  );
}
