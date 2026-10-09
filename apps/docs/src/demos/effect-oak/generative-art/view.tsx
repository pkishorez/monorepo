import { View } from 'effect-oak/react';
import type { Snapshot } from 'effect-oak';
import type { UseFrame } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Slider } from '@kstackz/web-platform/components/slider';
import { advance, HEIGHT, POINTER_RADIUS, WIDTH } from './flow/index.js';
import {
  clockAt,
  FLOW_STRENGTH,
  NOISE_SCALE,
  Prism,
} from './generative-art.js';
import { Sky } from './sky/index.js';

/*
 * The field and its controls. Both States draw the same; Paused has a clock
 * that stands still, so the Sky carries nothing on.
 */

type Props = Snapshot<typeof Prism> & { readonly useFrame: UseFrame };

const Setting = ({
  label,
  value,
  range,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly range: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
  };
  readonly onChange: (value: number) => void;
}) => (
  <div className="flex min-w-44 flex-col gap-2">
    <div className="flex items-baseline justify-between text-xs tracking-widest text-muted-foreground uppercase">
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(2)}</span>
    </div>
    <Slider
      aria-label={label}
      value={value}
      min={range.min}
      max={range.max}
      step={range.step}
      onValueChange={(next) =>
        onChange(typeof next === 'number' ? next : (next[0] ?? value))
      }
    />
  </div>
);

const Field = ({ model, state, send, useFrame }: Props) => (
  <div className="flex size-full overflow-y-auto p-4">
    <div className="m-auto flex w-full flex-col items-center gap-4">
      <div className="text-center">
        <h1 className="text-2xl font-light tracking-[0.3em] uppercase">
          Prism Field
        </h1>
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          Move to stir. Click to bloom.
        </p>
      </div>
      <Sky
        width={WIDTH}
        height={HEIGHT}
        useFrame={useFrame}
        particles={model.particles}
        pointer={model.pointer}
        pointerRadius={POINTER_RADIUS}
        clock={(at) => clockAt(state, at)}
        carry={(particle, carried, clock) =>
          advance(particle, carried, model, clock)
        }
        onPress={({ x, y }) => send({ _tag: 'PressedCanvas', x, y })}
        onMove={({ x, y }) => send({ _tag: 'MovedPointer', x, y })}
      />
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex items-center gap-3">
          <Button
            className="min-w-20"
            onClick={() => send({ _tag: 'ClickedTogglePlay' })}
          >
            {state._tag === 'Running' ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="outline"
            onClick={() => send({ _tag: 'ClickedReset' })}
          >
            Reset
          </Button>
          <span className="text-xs tracking-widest text-muted-foreground uppercase">
            <span className="inline-block min-w-8 text-right tabular-nums">
              {model.particles.length}
            </span>{' '}
            particles
          </span>
        </div>
        <Setting
          label="Turbulence"
          value={model.flowStrength}
          range={FLOW_STRENGTH}
          onChange={(value) => send({ _tag: 'ChangedFlowStrength', value })}
        />
        <Setting
          label="Noise scale"
          value={model.noiseScale}
          range={NOISE_SCALE}
          onChange={(value) => send({ _tag: 'ChangedNoiseScale', value })}
        />
      </div>
    </div>
  </div>
);

export const PrismView = View.make(Prism, {
  Running: (props) => <Field {...props} />,
  Paused: (props) => <Field {...props} />,
});
