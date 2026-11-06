import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ChevronRightIcon, RotateCcwIcon } from 'lucide-react';
import type { Effect, Param, ParamSpecs, ParamValues } from '@kestack/dune';

/*
 * An effect's params as React state, with controls drawn from the effect's
 * own definition: a slider per number, a swatch per colour. Nothing about
 * a control is written by hand; a scene may only say how to group them.
 */

/** Some of an effect's params under a heading; closed until opened, unless `open`. */
export type Group = {
  readonly title: string;
  readonly keys: ReadonlyArray<string>;
  readonly open?: boolean;
};

export type Params<P extends ParamSpecs> = {
  readonly values: ParamValues<P>;
  readonly set: (key: keyof P & string, value: number | string) => void;
  readonly reset: () => void;
  /** The effect's controls, to put in a panel. */
  readonly controls: ReactNode;
};

export const useParams = <P extends ParamSpecs>(
  effect: Effect<P>,
  options: {
    readonly initial?: Partial<ParamValues<P>>;
    readonly groups?: ReadonlyArray<Group>;
  } = {},
): Params<P> => {
  const { definition } = effect;
  const { initial, groups } = options;
  const start = useMemo(
    () => ({ ...definition.defaults, ...initial }),
    // The initial values are read once, as useState reads its own.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [definition],
  );
  const [values, setValues] = useState<ParamValues<P>>(start);
  const set = useCallback(
    (key: keyof P & string, value: number | string) =>
      setValues((current) => ({ ...current, [key]: value })),
    [],
  );
  const reset = useCallback(() => setValues(start), [start]);
  const changed = Object.keys(start).some(
    (key) => values[key as keyof P] !== start[key as keyof P],
  );
  const controls = (
    <Controls
      name={definition.name}
      params={definition.params}
      groups={
        groups ?? [
          {
            title: definition.name,
            keys: Object.keys(definition.params),
            open: true,
          },
        ]
      }
      values={values}
      start={start}
      changed={changed}
      onChange={set}
      onReset={reset}
    />
  );
  return { values, set, reset, controls };
};

function Controls({
  name,
  params,
  groups,
  values,
  start,
  changed,
  onChange,
  onReset,
}: {
  readonly name: string;
  readonly params: ParamSpecs;
  readonly groups: ReadonlyArray<Group>;
  readonly values: Readonly<Record<string, number | string>>;
  readonly start: Readonly<Record<string, number | string>>;
  readonly changed: boolean;
  readonly onChange: (key: string, value: number | string) => void;
  readonly onReset: () => void;
}) {
  return (
    <section aria-label={`${name} settings`} className="flex flex-col gap-1">
      <header className="flex h-8 items-center justify-between">
        <h4 className="text-[13px] font-medium text-(--pg-text)">{name}</h4>
        <button
          type="button"
          onClick={onReset}
          disabled={!changed}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-(--pg-text-3) transition-colors duration-150 hover:bg-(--pg-raised) hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) disabled:cursor-default disabled:text-(--pg-text-4) disabled:hover:bg-transparent"
        >
          <RotateCcwIcon className="size-3" strokeWidth={2} />
          Reset
        </button>
      </header>
      <div className="flex flex-col divide-y divide-(--pg-line) rounded-xl border border-(--pg-line)">
        {groups.map((group) => (
          <Disclosure key={group.title} title={group.title} open={group.open}>
            {group.keys.map((key) => {
              const param = params[key];
              if (!param) return null;
              return (
                <Control
                  key={key}
                  name={key}
                  param={param}
                  value={values[key] ?? param.value}
                  changed={values[key] !== start[key]}
                  onChange={(value) => onChange(key, value)}
                />
              );
            })}
          </Disclosure>
        ))}
      </div>
    </section>
  );
}

/** A group's heading, which opens and closes it. */
function Disclosure({
  title,
  open: initially = false,
  children,
}: {
  readonly title: string;
  readonly open?: boolean | undefined;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(initially);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-xs font-medium text-(--pg-text-2) transition-colors duration-150 hover:text-(--pg-text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--pg-focus)"
      >
        <ChevronRightIcon
          className={`size-3.5 text-(--pg-text-3) transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          strokeWidth={2}
        />
        {title}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-4 px-3 pt-1 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * "reach (px)" → "Reach" and "px": a unit goes beside the value. Any other
 * note in brackets stays in the name.
 */
const split = (label: string): { name: string; unit: string } => {
  const match = /^(.*?)\s*\((px|ms|s|%|deg)\)$/.exec(label);
  const name = match?.[1] ?? label;
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    unit: match?.[2] ?? '',
  };
};

function Control({
  name: key,
  param,
  value,
  changed,
  onChange,
}: {
  readonly name: string;
  readonly param: Param;
  readonly value: number | string;
  readonly changed: boolean;
  readonly onChange: (value: number | string) => void;
}) {
  const id = useId();
  const { name, unit } = split(param.label ?? key);
  const reading = `text-xs tabular-nums transition-colors duration-150 ${changed ? 'text-(--pg-accent-text)' : 'text-(--pg-text-3)'}`;

  if (param.kind === 'color')
    return (
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs text-(--pg-text-2)">
          {name}
        </label>
        <span className="flex items-center gap-2.5">
          <span className={`font-mono uppercase ${reading}`}>
            {String(value)}
          </span>
          {/* The swatch is the picker: the input fills it, unseen. */}
          <span
            className="relative size-6 overflow-hidden rounded-md border border-(--pg-line) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--pg-focus)"
            style={{ background: String(value) }}
          >
            <input
              id={id}
              type="color"
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </span>
        </span>
      </div>
    );

  const number = Number(value);
  const digits =
    param.step >= 1 ? 0 : param.step >= 0.1 ? 1 : param.step >= 0.01 ? 2 : 3;
  const fill = ((number - param.min) / (param.max - param.min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-(--pg-text-2)">
          {name}
        </label>
        <span className={reading}>
          {number.toFixed(digits)}
          {unit && <span className="ml-0.5 text-(--pg-text-4)">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={number}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        className={RANGE}
      />
    </div>
  );
}

/**
 * A slider: a thin track filled with the accent up to the value, and a
 * round thumb that grows a little under the pointer.
 */
const RANGE =
  'h-4 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full ' +
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--pg-accent)_var(--fill),var(--pg-control)_var(--fill))] ' +
  '[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--pg-text) ' +
  '[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_oklch(0_0_0/0.2),0_1px_3px_oklch(0_0_0/0.4)] ' +
  '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 ' +
  'hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95 ' +
  'focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-(--pg-focus) ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-(--pg-control) ' +
  '[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-(--pg-accent) ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-(--pg-text)';
