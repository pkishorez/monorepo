import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@kstackz/web-platform/components/utils';
import { focusId, leftFor, stepActive } from '../focus/index.js';
import { Picks, reportPick } from '../picks/index.js';

/*
 * A select-only listbox as an Actor: open or closed, the active option, and
 * what is selected. It is uncontrolled: the selection lives here, starts
 * from the factory's `initial` (a Child's init takes no input, blocker 3),
 * and every change is reported up. Nothing above can clear or set it
 * (blocker 14).
 *
 * Single: choosing an option selects it and closes. Multiple: choosing
 * toggles it and the list stays open. Opening activates the selected
 * option, so the keyboard starts where the value is.
 */

type Options = {
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<string>;
  readonly multiple?: boolean;
  readonly initial?: ReadonlyArray<string>;
};

const make = (config: Options) => {
  const { options } = config;
  const ids = {
    button: `${config.id}-button`,
    list: `${config.id}-list`,
    option: (index: number) => `${config.id}-option-${index}`,
  };
  const closed = { open: false, active: null };

  const Listbox = Actor.make(`Listbox(${config.id})`, {
    requires: { picks: Picks },
    model: Schema.Struct({
      open: Schema.Boolean,
      active: Schema.NullOr(Schema.Number),
      selected: Schema.Array(Schema.String),
    }),
    message: Schema.TaggedUnion({
      ClickedButton: {},
      PressedButtonKey: { key: Schema.String },
      PressedListKey: { key: Schema.String },
      HoveredOption: { index: Schema.Number },
      ChoseOption: { index: Schema.Number },
      Blurred: {},
    }),
  }).build({
    init: () => ({
      model: { open: false, active: null, selected: config.initial ?? [] },
    }),
    update: {
      ClickedButton: (_, { model }) =>
        model.open ? { model: { ...model, ...closed } } : open(model),
      PressedButtonKey: ({ key }, { model }) =>
        ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key) ? open(model) : {},
      PressedListKey: ({ key }, { model }) => {
        if (key === 'Escape')
          return {
            model: { ...model, ...closed },
            command: focusId(ids.button),
          };
        if (key === 'Tab') return { model: { ...model, ...closed } };
        if ((key === 'Enter' || key === ' ') && model.active !== null)
          return choose(model, model.active);
        const active = stepActive(model.active, key, options.length);
        return active === null ? {} : { model: { ...model, active } };
      },
      HoveredOption: ({ index }, { model }) =>
        model.active === index ? {} : { model: { ...model, active: index } },
      ChoseOption: ({ index }, { model }) => choose(model, index),
      Blurred: (_, { model }) =>
        model.open ? { model: { ...model, ...closed } } : {},
    },
  });

  type Model = {
    readonly open: boolean;
    readonly active: number | null;
    readonly selected: ReadonlyArray<string>;
  };

  function open(model: Model) {
    const first = options.indexOf(model.selected[0] ?? '');
    return {
      model: { ...model, open: true, active: Math.max(0, first) },
      command: focusId(ids.list),
    };
  }

  function choose(model: Model, index: number) {
    const option = options[index]!;
    if (!config.multiple)
      return {
        model: { ...model, ...closed, selected: [option] },
        command: Effect.all(
          [reportPick(config.id, option), focusId(ids.button)],
          {
            concurrency: 'unbounded',
            discard: true,
          },
        ),
      };
    const selected = model.selected.includes(option)
      ? model.selected.filter((value) => value !== option)
      : options.filter(
          (value) => value === option || model.selected.includes(value),
        );
    return {
      model: { ...model, active: index, selected },
      command: reportPick(config.id, selected.join(', ') || '(none)'),
    };
  }

  const ListboxView = View.make(Listbox, ({ model, send }) => (
    <div
      className="relative w-64"
      onBlur={(event) => {
        if (leftFor(event)) send({ _tag: 'Blurred' });
      }}
    >
      <span
        id={`${config.id}-label`}
        className="mb-1 block text-sm font-medium"
      >
        {config.label}
      </span>
      <button
        id={ids.button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={model.open}
        aria-labelledby={`${config.id}-label ${ids.button}`}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => send({ _tag: 'ClickedButton' })}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            send({ _tag: 'PressedButtonKey', key: event.key });
          }
        }}
      >
        <span className="truncate">
          {model.selected.join(', ') || (
            <span className="text-muted-foreground">Pick someone</span>
          )}
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </button>
      {model.open && (
        <ul
          id={ids.list}
          role="listbox"
          tabIndex={-1}
          aria-multiselectable={config.multiple}
          aria-labelledby={`${config.id}-label`}
          aria-activedescendant={
            model.active === null ? undefined : ids.option(model.active)
          }
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Tab') event.preventDefault();
            send({ _tag: 'PressedListKey', key: event.key });
          }}
        >
          {options.map((option, index) => {
            const selected = model.selected.includes(option);
            return (
              <li
                key={option}
                id={ids.option(index)}
                role="option"
                aria-selected={selected}
                className={cn(
                  'flex cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                  model.active === index && 'bg-muted',
                )}
                onPointerMove={() => send({ _tag: 'HoveredOption', index })}
                onClick={() => send({ _tag: 'ChoseOption', index })}
              >
                {option}
                {selected && <Check className="size-4" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  ));

  return { Listbox, ListboxView };
};

export { make as makeListbox };
