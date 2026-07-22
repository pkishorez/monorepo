import '@xyflow/react/dist/style.css';

import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import { useMemo, type MouseEvent } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { cn } from '#lib/utils';

import { moduleColors } from '../../laymos-modules/lib/colors';
import type { LaymosModulesModel } from '../../laymos-modules/lib/model';
import { computeFocusFlowLayout } from '../lib/layout';
import { focusNodeTypes } from './flow-nodes';

interface ModuleFocusDialogProps {
  readonly model: LaymosModulesModel;
  readonly modulePath: string | null;
  readonly transitive: boolean;
  readonly onModulePathChange: (path: string | null) => void;
  readonly onTransitiveChange: (transitive: boolean) => void;
}

function FocusCanvas({
  model,
  modulePath,
  transitive,
  onModulePathChange,
}: Omit<ModuleFocusDialogProps, 'onTransitiveChange'> & {
  readonly modulePath: string;
}) {
  const layout = useMemo(
    () => computeFocusFlowLayout(model, modulePath, transitive),
    [model, modulePath, transitive],
  );
  const onNodeClick = (_event: MouseEvent, node: Node): void => {
    if (node.type === 'focus-module') {
      onModulePathChange((node.data as { path: string }).path);
    }
  };
  return (
    <ReactFlow
      key={`${modulePath}:${transitive ? 'transitive' : 'direct'}`}
      nodes={layout.nodes}
      edges={layout.edges}
      nodeTypes={focusNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.1}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      onNodeClick={onNodeClick}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--border)" gap={20} />
    </ReactFlow>
  );
}

export function ModuleFocusDialog({
  model,
  modulePath,
  transitive,
  onModulePathChange,
  onTransitiveChange,
}: ModuleFocusDialogProps) {
  const module = modulePath ? model.modules.get(modulePath) : undefined;
  return (
    <Dialog
      open={Boolean(module)}
      onOpenChange={(open) => !open && onModulePathChange(null)}
    >
      <DialogContent className="grid h-[86vh] w-[min(1280px,94vw)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 duration-0 data-closed:animate-none data-open:animate-none sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm">
                {module?.label ?? 'Module connections'}
              </DialogTitle>
              <DialogDescription className="truncate font-mono text-[10px]">
                {module?.path}
              </DialogDescription>
            </div>
            <div className="mr-5 grid shrink-0 grid-cols-2 rounded-md border border-border bg-muted/35 p-0.5">
              {[false, true].map((next) => (
                <button
                  key={String(next)}
                  type="button"
                  className={cn(
                    'rounded px-2.5 py-1 text-[10px] font-medium text-muted-foreground',
                    transitive === next &&
                      'bg-background text-foreground shadow-sm',
                  )}
                  onClick={() => onTransitiveChange(next)}
                  aria-pressed={transitive === next}
                >
                  {next ? 'Transitive' : 'Direct'}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0">
          {module && (
            <ReactFlowProvider>
              <FocusCanvas
                model={model}
                modulePath={module.path}
                transitive={transitive}
                onModulePathChange={onModulePathChange}
              />
            </ReactFlowProvider>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-2 text-[10px] text-muted-foreground">
          <span>click a module to re-center</span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-5"
              style={{ background: moduleColors.incoming }}
            />
            consumed by
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-5"
              style={{ background: moduleColors.outgoing }}
            />
            imports
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-5 border-t-2 border-dashed"
              style={{ borderColor: moduleColors.violation }}
            />
            violating import
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
