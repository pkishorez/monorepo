import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Check } from 'lucide-react';
import { Input } from '@kstackz/web-platform/components/input';
import { cn } from '@kstackz/web-platform/components/utils';
import { stepActive } from '../focus/index.js';
import { Picks, reportPick } from '../picks/index.js';

/*
 * A combobox as a Node: what is typed, the options it matches, the active
 * one, and the selected value.
 *
 * Focus never leaves the input, so unlike the menu and listbox it needs no
 * focus Commands: the active option is `aria-activedescendant`, and options
 * keep the focus in the input by cancelling their mousedown. Typing filters
 * and opens; Enter chooses the active match; Escape or leaving the input
 * puts the text back to the selected value. Choosing reports up.
 *
 * Matches are worked out from the query in Update and View alike, so the
 * Model keeps only the query, not a second copy of the filtered list.
 */

type Options = {
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<string>;
};

const make = (config: Options) => {
  const ids = {
    input: `${config.id}-input`,
    list: `${config.id}-list`,
    option: (index: number) => `${config.id}-option-${index}`,
  };

  const matching = (query: string) =>
    config.options.filter((option) =>
      option.toLowerCase().includes(query.trim().toLowerCase()),
    );

  const Combobox = Node.make(`Combobox(${config.id})`, {
    requires: { picks: Picks },
    model: Schema.Struct({
      open: Schema.Boolean,
      query: Schema.String,
      active: Schema.NullOr(Schema.Number),
      selected: Schema.NullOr(Schema.String),
    }),
    message: Schema.TaggedUnion({
      Typed: { query: Schema.String },
      PressedKey: { key: Schema.String },
      HoveredOption: { index: Schema.Number },
      ChoseOption: { option: Schema.String },
      Blurred: {},
    }),
  }).build({
    init: () => ({
      model: { open: false, query: '', active: null, selected: null },
    }),
    update: {
      Typed: ({ query }, { model }) => ({
        model: {
          ...model,
          query,
          open: true,
          active: matching(query).length > 0 ? 0 : null,
        },
      }),
      PressedKey: ({ key }, { model }) => {
        const matches = matching(model.query);
        if (key === 'Escape') return { model: reset(model) };
        if (key === 'Enter') {
          const option =
            model.active === null ? undefined : matches[model.active];
          return option === undefined ? {} : choose(model, option);
        }
        if (!model.open && (key === 'ArrowDown' || key === 'ArrowUp'))
          return {
            model: { ...model, open: true, active: matches.length ? 0 : null },
          };
        const active = stepActive(model.active, key, matches.length);
        return active === null ? {} : { model: { ...model, active } };
      },
      HoveredOption: ({ index }, { model }) =>
        model.active === index ? {} : { model: { ...model, active: index } },
      ChoseOption: ({ option }, { model }) => choose(model, option),
      Blurred: (_, { model }) => ({ model: reset(model) }),
    },
  });

  type Model = {
    readonly open: boolean;
    readonly query: string;
    readonly active: number | null;
    readonly selected: string | null;
  };

  function reset(model: Model): Model {
    return { ...model, open: false, active: null, query: model.selected ?? '' };
  }

  function choose(model: Model, option: string) {
    return {
      model: { open: false, active: null, query: option, selected: option },
      commands: [reportPick(config.id, option)],
    };
  }

  const ComboboxView = View.make(Combobox, ({ model, send }) => {
    const matches = matching(model.query);
    return (
      <div className="relative w-64">
        <label htmlFor={ids.input} className="mb-1 block text-sm font-medium">
          {config.label}
        </label>
        <Input
          id={ids.input}
          role="combobox"
          autoComplete="off"
          placeholder="Type a city"
          aria-expanded={model.open}
          aria-controls={ids.list}
          aria-autocomplete="list"
          aria-activedescendant={
            model.open && model.active !== null
              ? ids.option(model.active)
              : undefined
          }
          value={model.query}
          onChange={(event) =>
            send({ _tag: 'Typed', query: event.target.value })
          }
          onBlur={() => send({ _tag: 'Blurred' })}
          onKeyDown={(event) => {
            if (
              ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)
            ) {
              event.preventDefault();
              send({ _tag: 'PressedKey', key: event.key });
            }
          }}
        />
        {model.open && (
          <ul
            id={ids.list}
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          >
            {matches.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">
                No cities match
              </li>
            )}
            {matches.map((option, index) => (
              <li
                key={option}
                id={ids.option(index)}
                role="option"
                aria-selected={option === model.selected}
                className={cn(
                  'flex cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                  model.active === index && 'bg-muted',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => send({ _tag: 'HoveredOption', index })}
                onClick={() => send({ _tag: 'ChoseOption', option })}
              >
                {option}
                {option === model.selected && <Check className="size-4" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  });

  return { Combobox, ComboboxView };
};

export { make as makeCombobox };
