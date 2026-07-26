import '@xyflow/react/dist/style.css';

import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useFixtureInput, useFixtureSelect } from 'react-cosmos/client';

import { StateMachineSvg } from '../components/state-machine-svg';
import { StateMachineSvgViewer } from '../components/state-machine-svg-viewer';
import { layoutStateMachine } from '../lib/layout';
import { serializeStateMachine } from '../lib/serialize-machine';
import type {
  SerializedStateMachine,
  StateMachineLayout,
  StateMachineSvgClassNames,
  StateMachineSvgEdgeRole,
  StateMachineSvgNodeRole,
  StateMachineWrappingStrategy,
} from '../types';
import {
  documentReviewMachine,
  mediaPlayerMachine,
  orderMachine,
  releaseMachine,
  trafficLightMachine,
  uploadMachine,
} from './machines';

type Machine = Parameters<typeof serializeStateMachine>[0];
type Renderer = 'viewer' | 'bare' | 'react-flow';
type AspectRatioOption = keyof typeof ASPECT_RATIOS;
type WrappingOption = 'Default' | StateMachineWrappingStrategy;
type StylingOption =
  | 'Light'
  | 'Dark'
  | 'Ocean'
  | 'Forest'
  | 'Sunset'
  | 'Violet';
type ThemeVariables = CSSProperties & Record<`--${string}`, string>;

interface FixtureDefaults {
  readonly aspectRatio?: AspectRatioOption;
  readonly wrapping?: WrappingOption;
  readonly pan?: boolean;
  readonly zoom?: boolean;
  readonly bounded?: boolean;
}

interface SvgNodeData extends Record<string, unknown> {
  readonly layout: StateMachineLayout;
  readonly ariaLabel: string;
  readonly classNames?: StateMachineSvgClassNames;
}

type SvgFlowNode = Node<SvgNodeData, 'state-machine-svg'>;

const ASPECT_RATIOS = {
  Default: undefined,
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '2:1': 2,
} as const;

const WRAPPING_OPTIONS: WrappingOption[] = [
  'Default',
  'OFF',
  'SINGLE_EDGE',
  'MULTI_EDGE',
];

const reactFlowNodeTypes = { 'state-machine-svg': ReactFlowSvgNode };

function roleClassNames(
  node: Record<StateMachineSvgNodeRole, string>,
  edge: Record<StateMachineSvgEdgeRole, string>,
): StateMachineSvgClassNames {
  return {
    node: ({ role }) => node[role],
    edge: ({ role }) => edge[role],
  };
}

const customClassNames = roleClassNames(
  {
    'initial-indicator': 'bg-ring ring-ring/30',
    initial: 'border-ring bg-accent ring-ring/20',
    final: 'border-foreground bg-muted',
    intermediate: 'border-muted-foreground/50 bg-card',
  },
  {
    'initial-arrow': 'stroke-ring stroke-[2.5]',
    transition: 'stroke-foreground/60 stroke-[1.5]',
  },
);

const stylingClassNames = roleClassNames(
  {
    'initial-indicator': 'border-background bg-primary ring-primary/25',
    initial: 'border-primary bg-primary/10 ring-primary/20',
    final: 'border-positive bg-positive/10',
    intermediate: 'border-border bg-card',
  },
  {
    'initial-arrow': 'stroke-primary stroke-[2.5]',
    transition: 'stroke-muted-foreground stroke-[1.5]',
  },
);

const STYLING_PRESETS: Record<
  StylingOption,
  {
    readonly base: 'light' | 'dark';
    readonly variables?: ThemeVariables;
  }
> = {
  Light: {
    base: 'light',
  },
  Dark: {
    base: 'dark',
  },
  Ocean: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.14 0.035 240)',
      '--foreground': 'oklch(0.96 0.015 220)',
      '--card': 'oklch(0.2 0.04 238)',
      '--card-foreground': 'oklch(0.96 0.015 220)',
      '--primary': 'oklch(0.76 0.14 205)',
      '--muted': 'oklch(0.26 0.04 238)',
      '--muted-foreground': 'oklch(0.75 0.04 220)',
      '--border': 'oklch(0.76 0.08 215 / 24%)',
      '--ring': 'oklch(0.76 0.14 205)',
      '--positive': 'oklch(0.76 0.16 155)',
    },
  },
  Forest: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.15 0.025 145)',
      '--foreground': 'oklch(0.95 0.025 120)',
      '--card': 'oklch(0.21 0.035 145)',
      '--card-foreground': 'oklch(0.95 0.025 120)',
      '--primary': 'oklch(0.76 0.16 142)',
      '--muted': 'oklch(0.27 0.035 145)',
      '--muted-foreground': 'oklch(0.75 0.045 130)',
      '--border': 'oklch(0.76 0.08 142 / 22%)',
      '--ring': 'oklch(0.76 0.16 142)',
      '--positive': 'oklch(0.82 0.15 95)',
    },
  },
  Sunset: {
    base: 'light',
    variables: {
      '--background': 'oklch(0.97 0.02 65)',
      '--foreground': 'oklch(0.24 0.045 30)',
      '--card': 'oklch(0.99 0.012 65)',
      '--card-foreground': 'oklch(0.24 0.045 30)',
      '--primary': 'oklch(0.62 0.2 35)',
      '--muted': 'oklch(0.92 0.04 65)',
      '--muted-foreground': 'oklch(0.5 0.06 40)',
      '--border': 'oklch(0.75 0.08 50 / 45%)',
      '--ring': 'oklch(0.67 0.18 35)',
      '--positive': 'oklch(0.58 0.15 145)',
    },
  },
  Violet: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.15 0.035 292)',
      '--foreground': 'oklch(0.96 0.02 290)',
      '--card': 'oklch(0.21 0.045 292)',
      '--card-foreground': 'oklch(0.96 0.02 290)',
      '--primary': 'oklch(0.76 0.17 300)',
      '--muted': 'oklch(0.27 0.045 292)',
      '--muted-foreground': 'oklch(0.76 0.05 290)',
      '--border': 'oklch(0.78 0.1 300 / 24%)',
      '--ring': 'oklch(0.76 0.17 300)',
      '--positive': 'oklch(0.78 0.16 160)',
    },
  },
};

function FixtureCanvas({
  machine,
  renderer = 'viewer',
  defaults = {},
  classNames,
}: {
  readonly machine: Machine;
  readonly renderer?: Renderer;
  readonly defaults?: FixtureDefaults;
  readonly classNames?: StateMachineSvgClassNames;
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
  const [pan] = useFixtureInput('Pan', defaults.pan ?? false);
  const [zoom] = useFixtureInput('Zoom', defaults.zoom ?? false);
  const [bounded] = useFixtureInput('Bounded', defaults.bounded ?? true);
  const [minimumVisibleRatio] = useFixtureInput('Minimum visible ratio', 0.5);
  const serializedMachine = useMemo(
    () => serializeStateMachine(machine),
    [machine],
  );
  const { layout, error } = useFixtureLayout(
    serializedMachine,
    ASPECT_RATIOS[aspectRatioOption],
    wrappingOption === 'Default' ? undefined : wrappingOption,
  );
  const ariaLabel = `${serializedMachine.label} state machine`;

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
            layout={layout}
            classNames={classNames}
            ariaLabel={ariaLabel}
            svgProps={{ style: { minWidth: layout.width + 56 } }}
          />
        </div>
      )}
      {!error && layout && renderer === 'react-flow' && (
        <ReactFlowSvgFixture
          layout={layout}
          classNames={classNames}
          ariaLabel={ariaLabel}
        />
      )}
      {!error && layout && renderer === 'viewer' && (
        <StateMachineSvgViewer
          layout={layout}
          classNames={classNames}
          title={serializedMachine.label}
          ariaLabel={ariaLabel}
          showHeader={showHeader}
          interaction={{
            pan,
            zoom,
            bounded,
            minimumVisibleRatio,
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
    readonly layout?: StateMachineLayout;
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
  layout,
  ariaLabel,
  classNames,
}: {
  readonly layout: StateMachineLayout;
  readonly ariaLabel: string;
  readonly classNames?: StateMachineSvgClassNames;
}) {
  const nodes = useMemo<SvgFlowNode[]>(
    () => [
      {
        id: 'state-machine-svg',
        type: 'state-machine-svg',
        position: { x: 0, y: 0 },
        data: { layout, ariaLabel, classNames },
        style: {
          width: layout.width + 56,
          height: layout.height + 56,
        },
        draggable: false,
        selectable: false,
      },
    ],
    [ariaLabel, classNames, layout],
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
      layout={data.layout}
      ariaLabel={data.ariaLabel}
      classNames={data.classNames}
      className="pointer-events-none"
    />
  );
}

function FixtureMessage({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-border text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function ViewerFixture({ machine }: { readonly machine: Machine }) {
  return <FixtureCanvas machine={machine} />;
}

function StylingFixture({ machine }: { readonly machine: Machine }) {
  const [styling] = useFixtureSelect<StylingOption>('Styling', {
    options: Object.keys(STYLING_PRESETS) as StylingOption[],
    defaultValue: 'Light',
  });
  const preset = STYLING_PRESETS[styling];

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-theme={preset.base}
      style={preset.variables}
    >
      <FixtureCanvas machine={machine} classNames={stylingClassNames} />
    </div>
  );
}

export default {
  '01 simple cycle': <ViewerFixture machine={trafficLightMachine} />,
  '02 branching workflow': <ViewerFixture machine={orderMachine} />,
  '03 retries and self loops': <ViewerFixture machine={uploadMachine} />,
  '04 hierarchical states': <ViewerFixture machine={mediaPlayerMachine} />,
  '05 parallel review': <ViewerFixture machine={documentReviewMachine} />,
  '06 nested release workflow': <ViewerFixture machine={releaseMachine} />,
  '07 bare StateMachineSvg': (
    <FixtureCanvas machine={orderMachine} renderer="bare" />
  ),
  '08 interactive SVG viewer': (
    <FixtureCanvas
      machine={orderMachine}
      defaults={{ pan: true, zoom: true }}
    />
  ),
  '09 StateMachineSvg in React Flow': (
    <FixtureCanvas machine={orderMachine} renderer="react-flow" />
  ),
  '10 square aspect with multi-edge wrapping': (
    <FixtureCanvas
      machine={orderMachine}
      defaults={{ aspectRatio: '1:1', wrapping: 'MULTI_EDGE' }}
    />
  ),
  '11 square aspect with single-edge wrapping': (
    <FixtureCanvas
      machine={orderMachine}
      defaults={{ aspectRatio: '1:1', wrapping: 'SINGLE_EDGE' }}
    />
  ),
  '12 custom node and edge classes': (
    <FixtureCanvas machine={orderMachine} classNames={customClassNames} />
  ),
  '13 styling playground': <StylingFixture machine={orderMachine} />,
};
