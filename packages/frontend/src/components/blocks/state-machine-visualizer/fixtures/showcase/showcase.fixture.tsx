import { useFixtureSelect } from 'react-cosmos/client';

import { serializeV5 } from '../../lib/v5/serialize';
import { serializeV6 } from '../../lib/v6/serialize';
import type {
  SerializedStateMachine,
  StateMachineClassNames,
} from '../../types';
import {
  FixtureCanvas,
  type FixtureDefaults,
  type Renderer,
} from '../shared/canvas';
import {
  STYLING_PRESETS,
  customClassNames,
  stylingClassNames,
  type StylingOption,
} from '../shared/styling';
import { orderMachine, releaseMachine } from '../xstate-v5/machines';
import {
  checkoutMachineV6,
  documentReviewMachineV6,
} from '../xstate-v6/machines';

const SAMPLE_MACHINES: Record<string, SerializedStateMachine> = {
  'V5 order': serializeV5(orderMachine),
  'V5 release': serializeV5(releaseMachine),
  'V6 checkout': serializeV6(checkoutMachineV6),
  'V6 review': serializeV6(documentReviewMachineV6),
};

type SampleOption = keyof typeof SAMPLE_MACHINES;

function useSampleMachine(defaultValue: SampleOption = 'V5 order') {
  const [sample] = useFixtureSelect<SampleOption>('Machine', {
    options: Object.keys(SAMPLE_MACHINES),
    defaultValue,
  });

  return SAMPLE_MACHINES[sample]!;
}

function ShowcaseFixture({
  renderer,
  defaults,
  classNames,
  defaultMachine,
}: {
  readonly renderer?: Renderer;
  readonly defaults?: FixtureDefaults;
  readonly classNames?: StateMachineClassNames;
  readonly defaultMachine?: SampleOption;
}) {
  const machine = useSampleMachine(defaultMachine);

  return (
    <FixtureCanvas
      machine={machine}
      renderer={renderer}
      defaults={defaults}
      classNames={classNames}
    />
  );
}

function StylingFixture() {
  const machine = useSampleMachine();
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
  '01 bare StateMachineSvg': <ShowcaseFixture renderer="bare" />,
  '02 interactive SVG viewer': (
    <ShowcaseFixture defaults={{ pan: true, zoom: true }} />
  ),
  '03 StateMachineSvg in React Flow': <ShowcaseFixture renderer="react-flow" />,
  '04 square aspect with multi-edge wrapping': (
    <ShowcaseFixture
      defaults={{ aspectRatio: '1:1', wrapping: 'MULTI_EDGE' }}
    />
  ),
  '05 square aspect with single-edge wrapping': (
    <ShowcaseFixture
      defaults={{ aspectRatio: '1:1', wrapping: 'SINGLE_EDGE' }}
    />
  ),
  '06 custom node and edge classes': (
    <ShowcaseFixture classNames={customClassNames} />
  ),
  '07 styling playground': <StylingFixture />,
  '08 long descriptions': <ShowcaseFixture defaultMachine="V6 checkout" />,
};
