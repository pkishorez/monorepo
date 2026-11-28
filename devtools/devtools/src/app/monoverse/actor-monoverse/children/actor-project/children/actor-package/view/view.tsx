import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RotateCwIcon } from 'lucide-react';

import { Waiting } from '../../../../../view/shared/index.js';
import { Problem, Rereading } from '../../../view/shared/index.js';
import { isReading, type PackageShape } from '../logic/shared/index.js';

type BodyProps = ViewPropsOf<typeof PackageShape> & {
  readonly tree: ReactNode;
};

export function Body({ root, model, props, state, send, tree }: BodyProps) {
  const reading = isReading(state, props.branch, model.tries, props.reloads);
  if (state._tag === 'Contents' && tree !== null)
    return (
      <div {...root} className="relative h-full min-h-0">
        {tree}
        {reading ? <Rereading>Reading…</Rereading> : null}
      </div>
    );
  return (
    <div {...root} className="h-full min-h-0">
      {reading ? (
        <Waiting>Reading {model.name} and its imports…</Waiting>
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
