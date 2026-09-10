import { Effect } from 'effect';
import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'kui-toolkit/components/ui/collapsible';
import { ChevronRight } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../store-query/index.ts';
import { RefreshButton } from '../state-view/index.ts';
import { Outputs } from './outputs-view.tsx';

export function StageOutputs(input: {
  storeId: string;
  stack: string;
  stage: string;
}) {
  const [open, setOpen] = useState(true);
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.GetStageOutputs'](input),
    ),
    rpcQueryKeys.outputs(input.storeId, input.stack, input.stage),
    { enabled: open },
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-labelledby="outputs-heading" />}
    >
      <div className="flex items-center justify-between gap-3">
        <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronRight
            className={`size-3.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <span id="outputs-heading">Outputs</span>
        </CollapsibleTrigger>
        {open && <RefreshButton query={query} label="Refresh outputs" />}
      </div>
      <CollapsibleContent className="pt-3">
        <Outputs query={query} />
      </CollapsibleContent>
    </Collapsible>
  );
}
