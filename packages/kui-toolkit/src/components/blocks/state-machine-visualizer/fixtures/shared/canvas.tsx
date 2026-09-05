import '@xyflow/react/dist/style.css';

import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFixtureInput, useFixtureSelect } from 'react-cosmos/client';

import { StateMachineSvg } from '../../components/state-machine-svg';
import { StateMachineViewer } from '../../components/state-machine-viewer';
import { layoutStateMachine } from '../../lib/layout';
import type {
  SerializedStateMachine,
  StateMachineClassNames,
  StateMachineDiagram,
  StateMachineFocus,
  StateMachineWrappingStrategy,
} from '../../types';

export type Renderer = 'viewer' | 'bare' | 'react-flow';
export type AspectRatioOption = keyof typeof ASPECT_RATIOS;
export type WrappingOption = 'Default' | StateMachineWrappingStrategy;

export interface FixtureDefaults {
  readonly aspectRatio?: AspectRatioOption;
  readonly wrapping?: WrappingOption;
  readonly pan?: boolean;
  readonly zoom?: boolean;
  readonly bounded?: boolean;
}

interface SvgNodeData extends Record<string, unknown> {
  readonly diagram: StateMachineDiagram;
  readonly classNames?: StateMachineClassNames;
}

type SvgFlowNode = Node<SvgNodeData, 'state-machine-svg'>;

export const ASPECT_RATIOS = {
  Default: undefined,
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '2:1': 2,
} as const;

export const WRAPPING_OPTIONS: WrappingOption[] = [
  'Default',
  'OFF',
  'SINGLE_EDGE',
  'MULTI_EDGE',
];

const reactFlowNodeTypes = { 'state-machine-svg': ReactFlowSvgNode };

export function FixtureCanvas({
  machine,
  renderer = 'viewer',
  defaults = {},
  classNames,
  focus,
}: {
  readonly machine: SerializedStateMachine;
  readonly renderer?: Renderer;
  readonly defaults?: FixtureDefaults;
  readonly classNames?: StateMachineClassNames;
  readonly focus?: StateMachineFocus;
}) {
  const [aspectRatioOption] = useFixtureSelect<AspectRatioOption>(
    'Aspect ratio',
    {
      options: Object.keys(ASPECT_RATIOS) as AspectRatioOption[],
      defaultValue: defaults.aspectRatio ?? 'Default',
    },
  );
  const [wrappingOption] = useFixtureSelect<WrappingOption>(
    'Wrapping strategy',
    {
      options: WRAPPING_OPTIONS,
      defaultValue: defaults.wrapping ?? 'Default',
    },
  );
  const [showHeader] = useFixtureInput('Show header', true);
  const [pan] = useFixtureInput('Pan', defaults.pan ?? true);
  const [zoom] = useFixtureInput('Zoom', defaults.zoom ?? true);
  const [bounded] = useFixtureInput('Bounded', defaults.bounded ?? true);
  const [minimumVisibleRatio] = useFixtureInput('Minimum visible ratio', 0.9);
  const [minZoom] = useFixtureInput('Minimum zoom', 0.5);
  const [maxZoom] = useFixtureInput('Maximum zoom', 3);
  const { layout, error } = useFixtureLayout(
    machine,
    ASPECT_RATIOS[aspectRatioOption],
    wrappingOption === 'Default' ? undefined : wrappingOption,
  );
  return (
    <div className="h-dvh min-h-[480px] max-h-[780px] w-full min-w-0 p-3 sm:p-6">
      {error && (
        <FixtureMessage>
          Unable to lay out state machine: {error.message}
        </FixtureMessage>
      )}
      {!error && !layout && (
        <FixtureMessage>Laying out state machine…</FixtureMessage>
      )}
      {!error && layout && renderer === 'bare' && (
        <div className="h-full w-full min-w-0 overflow-auto">
          <StateMachineSvg
            diagram={layout}
            classNames={classNames}
            svgProps={{ style: { minWidth: layout.width + 56 } }}
          />
        </div>
      )}
      {!error && layout && renderer === 'react-flow' && (
        <ReactFlowSvgFixture diagram={layout} classNames={classNames} />
      )}
      {!error && layout && renderer === 'viewer' && (
        <StateMachineViewer
          diagram={layout}
          classNames={classNames}
          showHeader={showHeader}
          focus={focus}
          navigation={{
            pan,
            zoom,
            bounded,
            minimumVisibleRatio,
            minZoom,
            maxZoom,
          }}
        />
      )}
    </div>
  );
}

function useFixtureLayout(
  machine: SerializedStateMachine,
  aspectRatio: number | undefined,
  wrappingStrategy: StateMachineWrappingStrategy | undefined,
) {
  const [result, setResult] = useState<{
    readonly layout?: StateMachineDiagram;
    readonly error?: Error;
  }>({});

  useEffect(() => {
    let active = true;
    setResult({});

    void layoutStateMachine(machine, { aspectRatio, wrappingStrategy })
      .then((layout) => {
        if (active) setResult({ layout });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResult({
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => {
      active = false;
    };
  }, [aspectRatio, machine, wrappingStrategy]);

  return result;
}

function ReactFlowSvgFixture({
  diagram,
  classNames,
}: {
  readonly diagram: StateMachineDiagram;
  readonly classNames?: StateMachineClassNames;
}) {
  const nodes = useMemo<SvgFlowNode[]>(
    () => [
      {
        id: 'state-machine-svg',
        type: 'state-machine-svg',
        position: { x: 0, y: 0 },
        data: { diagram, classNames },
        style: {
          width: diagram.width + 56,
          height: diagram.height + 56,
        },
        draggable: false,
        selectable: false,
      },
    ],
    [classNames, diagram],
  );

  return (
    <ReactFlowProvider>
      <div className="h-full overflow-hidden rounded-xl border border-border bg-background">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={reactFlowNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1.1 }}
          minZoom={0.12}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Controls
            showInteractive={false}
            className="!border-border !bg-background !shadow-sm [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground"
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

function ReactFlowSvgNode({ data }: NodeProps<SvgFlowNode>) {
  return (
    <StateMachineSvg
      diagram={data.diagram}
      classNames={data.classNames}
      className="pointer-events-none"
    />
  );
}

function FixtureMessage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-border text-xs text-muted-foreground">
      {children}
    </div>
  );
}
