import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';

import { FileTreePanel } from './files/file-tree-panel';
import { GraphPanel } from './graph/graph-panel';
import { useDependencyCruiserViz } from './use-dependency-cruiser-viz';
import type { DepcruiseVizData } from './types';

export type DependencyCruiserVizProps = Omit<DepcruiseVizData, 'summary'> & {
  summary?: DepcruiseVizData['summary'];
};

export function DependencyCruiserViz({
  config,
  summary,
}: DependencyCruiserVizProps) {
  const viz = useDependencyCruiserViz({ config, summary });

  return (
    <div className="h-dvh w-full">
      <ReactFlowProvider>
        <ResizablePanelGroup orientation="horizontal">
          <GraphPanel view={viz.graph} actions={viz.actions} />
          {viz.files && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={15}>
                <FileTreePanel
                  view={viz.files}
                  onToggleHideIrrelevant={viz.actions.toggleHideIrrelevant}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ReactFlowProvider>
    </div>
  );
}
