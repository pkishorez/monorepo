import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';

import { FileTreePanel } from './files';
import { GraphPanel } from './graph';
import { useDependencyCruiserViz } from './use-dependency-cruiser-viz';
import type { DepcruiseVizData } from './model';

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
          <GraphPanel
            view={viz.graph}
            onSelectFeature={viz.actions.selectFeature}
            onSelectModule={viz.actions.selectModule}
            onSelectLayer={viz.actions.selectLayer}
            onHoverLayer={viz.actions.hoverLayer}
            onSetCanvasMode={viz.actions.setCanvasMode}
          />
          {viz.files && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={15}>
                <FileTreePanel
                  view={viz.files}
                  features={config.features}
                  onSelectFeature={viz.actions.selectFeature}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ReactFlowProvider>
    </div>
  );
}
