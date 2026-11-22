import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RotateCwIcon } from 'lucide-react';

import { TreeView } from '../tree/index.js';
import { Problem, Rereading, Waiting } from '../ui/index.js';
import { PackageLive, isReading } from './actor.js';

/*
 * A Package's view: its tree once read, quietly marked while it is read
 * again at another branch; or why it could not be read.
 */

export const PackageView = View.make(
  PackageLive,
  ({ root, model, props, state, children, send }) => {
    const reading = isReading(state, props.branch, model.tries);
    if (state._tag === 'Ready' && 'tree' in children)
      return (
        <div {...root} className="relative h-full min-h-0">
          <TreeView instance={children.tree} />
          {reading ? <Rereading>Reading the branch…</Rereading> : null}
        </div>
      );
    return (
      <div {...root} className="h-full min-h-0">
        {reading ? (
          <Waiting>Reading the package and its imports…</Waiting>
        ) : state._tag === 'Failed' ? (
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
  },
);
