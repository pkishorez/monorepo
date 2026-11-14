import {
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { lighting } from '@kestack/dune';
import { HtmlCanvas } from '@kestack/dune/react';
import { STAGE_HEX } from '../theme/index.ts';
import { TimelineContext, TodosApp } from '../todos/index.ts';
import { FOCUS } from './styles.ts';

/*
 * A real app drawn through dune: a to-do list on a Kabuki Actor, under the
 * lighting, with the Add button as a lamp. Under it, the light: on or off,
 * and how strong. Canvases live in the browser alone, so the server draws
 * the empty frame.
 */

const never = () => () => {};

const { intensity, ambient } = lighting.definition.params;

export function Demo() {
  const browser = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const [lit, setLit] = useState(true);
  const [light, setLight] = useState(intensity.value);
  const [base, setBase] = useState(ambient.value);
  const effect = useMemo(
    () =>
      lit
        ? lighting({ intensity: light, ambient: base, floor: STAGE_HEX })
        : [],
    [lit, light, base],
  );

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-(--dn-line) bg-(--dn-stage) shadow-[0_1px_2px_oklch(0_0_0/0.3),0_8px_24px_oklch(0_0_0/0.25),0_24px_64px_oklch(0_0_0/0.2)]">
        <div className="h-[540px] sm:h-[580px]">
          {browser && (
            <HtmlCanvas
              effect={effect}
              contentClassName="px-4 py-5 sm:px-12 sm:py-8"
            >
              <Todos />
            </HtmlCanvas>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-(--dn-line) bg-(--dn-panel) px-4 py-3">
          <Toggle on={lit} onChange={setLit} />
          <Slider
            label="Light"
            min={intensity.min}
            max={2}
            step={intensity.step}
            value={light}
            disabled={!lit}
            onChange={setLight}
          />
          <Slider
            label="Ambient"
            min={ambient.min}
            max={ambient.max}
            step={ambient.step}
            value={base}
            disabled={!lit}
            onChange={setBase}
          />
        </div>
      </div>
      <figcaption className="text-[13px] leading-5 text-pretty text-(--dn-text-3)">
        The real app, not a recording. Move the pointer, type a to-do, click one
        to complete it, or step back with ‹ and fork from there.
      </figcaption>
    </figure>
  );
}

/** The app, with its History handed to the time-travel bar. */
function Todos() {
  const runtime = TodosApp.useRuntime();
  const { shown, branch } = runtime;
  const timeline = useMemo(
    () => ({ runtime, shown, branch }),
    [runtime, shown, branch],
  );
  return (
    <TimelineContext.Provider value={timeline}>
      <TodosApp />
    </TimelineContext.Provider>
  );
}

function Toggle({
  on,
  onChange,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`-ml-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-[13px] text-(--dn-text-2) ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${on ? 'bg-(--dn-accent)' : 'bg-(--dn-control)'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-(--dn-text) shadow-[0_1px_2px_oklch(0_0_0/0.4)] transition-transform duration-150 ease-out ${on ? 'translate-x-4' : ''}`}
        />
      </span>
      Lighting
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div
      className={`flex min-w-[9rem] flex-1 items-center gap-3 transition-opacity duration-150 ${disabled ? 'opacity-50' : ''}`}
    >
      <label htmlFor={id} className="text-[13px] text-(--dn-text-2)">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        className={RANGE}
      />
      <output
        htmlFor={id}
        className="w-8 text-right text-xs text-(--dn-text-3) tabular-nums"
      >
        {value.toFixed(2)}
      </output>
    </div>
  );
}

/** A thin track filled with the accent up to the value, and a round thumb. */
const RANGE =
  'h-5 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent focus-visible:outline-none disabled:cursor-default ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full ' +
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--dn-accent)_var(--fill),var(--dn-control)_var(--fill))] ' +
  '[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--dn-text) ' +
  '[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_oklch(0_0_0/0.2),0_1px_3px_oklch(0_0_0/0.4)] ' +
  '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 ' +
  'active:[&::-webkit-slider-thumb]:scale-110 ' +
  'focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-(--dn-focus) ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-(--dn-control) ' +
  '[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-(--dn-accent) ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-(--dn-text)';
