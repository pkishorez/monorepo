import { Context, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';

/*
 * The chart's three radio groups as an Actor: which chart, which package, which
 * period. Every choice is reported up through the Choices Request; the app
 * keeps a copy to draw the chart with, since a parent cannot read its Child.
 */

export const Choice = Schema.Struct({
  mode: Schema.Literals(['Adoption', 'Velocity', 'Ecosystem']),
  packageId: Schema.Literals(['Core', 'Ui', 'Devtools', 'VitePlugin']),
  period: Schema.Literals(['LastEightWeeks', 'LastSixteenWeeks', 'LastYear']),
});
type Choice = typeof Choice.Type;

export const FIRST_CHOICE: Choice = {
  mode: 'Adoption',
  packageId: 'Core',
  period: 'LastSixteenWeeks',
};

/** Whoever takes the chart's choices: the app. */
export class Choices extends Context.Service<
  Choices,
  { readonly chose: (choice: Choice) => Effect.Effect<void> }
>()('docs/charting/Choices') {}

export const Controls = Actor.make('Controls', {
  requires: { choices: Choices },
  model: Choice,
  message: Schema.TaggedUnion({ Chose: { choice: Choice } }),
}).build({
  init: () => ({ model: FIRST_CHOICE }),
  update: {
    Chose: ({ choice }) => ({
      model: choice,
      command: Effect.gen(function* () {
        yield* (yield* Choices).chose(choice);
      }),
    }),
  },
});

const GROUPS = [
  {
    key: 'mode',
    label: 'Chart',
    options: [
      ['Adoption', 'Adoption'],
      ['Velocity', 'Velocity'],
      ['Ecosystem', 'Ecosystem'],
    ],
  },
  {
    key: 'packageId',
    label: 'Package',
    options: [
      ['Core', 'foldkit'],
      ['Ui', '@foldkit/ui'],
      ['Devtools', '@foldkit/devtools'],
      ['VitePlugin', '@foldkit/vite-plugin'],
    ],
  },
  {
    key: 'period',
    label: 'Period',
    options: [
      ['LastEightWeeks', '8 weeks'],
      ['LastSixteenWeeks', '16 weeks'],
      ['LastYear', '1 year'],
    ],
  },
] as const;

export const ControlsView = View.make(Controls, ({ model, send }) => (
  <div className="flex flex-col gap-4">
    {GROUPS.map((group) => (
      <div
        key={group.key}
        role="radiogroup"
        aria-label={group.label}
        className="flex flex-col gap-1.5"
      >
        <span className="text-xs font-medium text-muted-foreground">
          {group.label}
        </span>
        <div className="flex flex-wrap gap-1">
          {group.options.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              role="radio"
              aria-checked={model[group.key] === value}
              variant={model[group.key] === value ? 'default' : 'outline'}
              onClick={() =>
                send({
                  _tag: 'Chose',
                  choice: { ...model, [group.key]: value } as Choice,
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    ))}
  </div>
));
