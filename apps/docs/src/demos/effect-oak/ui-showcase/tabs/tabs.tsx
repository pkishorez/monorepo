import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import type { ReactNode } from 'react';
import { cn } from '@kstackz/web-platform/components/utils';
import { focusId, stepActive } from '../focus/index.js';
import { Picks, reportPick } from '../picks/index.js';

/*
 * Tabs as a Node: which tab is selected. Only that tab is in the Tab order
 * (a roving tabindex). Arrow keys along the tabs, Home and End select the
 * next tab and move focus to it with a Command; a click selects without
 * one, since the click already focused it. Each selection is reported up.
 *
 * The panels are the factory's, fixed when the Node is made: a parent
 * cannot hand a Child anything to draw (blocker 13).
 */

type Options = {
  readonly id: string;
  readonly label: string;
  readonly orientation: 'horizontal' | 'vertical';
  readonly tabs: ReadonlyArray<{
    readonly name: string;
    readonly panel: ReactNode;
  }>;
};

const make = (options: Options) => {
  const { tabs } = options;
  const ids = {
    tab: (index: number) => `${options.id}-tab-${index}`,
    panel: (index: number) => `${options.id}-panel-${index}`,
  };
  const keys =
    options.orientation === 'horizontal'
      ? { next: 'ArrowRight', previous: 'ArrowLeft' }
      : { next: 'ArrowDown', previous: 'ArrowUp' };

  const select = (index: number) => ({
    model: { selected: index },
    commands: [reportPick(options.id, tabs[index]!.name)],
  });

  const Tabs = Node.make(`Tabs(${options.id})`, {
    requires: { picks: Picks },
    model: Schema.Struct({ selected: Schema.Number }),
    message: Schema.TaggedUnion({
      ClickedTab: { index: Schema.Number },
      PressedKey: { key: Schema.String },
    }),
  }).build({
    init: () => ({ model: { selected: 0 } }),
    update: {
      ClickedTab: ({ index }, { model }) =>
        index === model.selected ? {} : select(index),
      PressedKey: ({ key }, { model }) => {
        const index = stepActive(model.selected, key, tabs.length, keys);
        if (index === null || index === model.selected) return {};
        const next = select(index);
        return {
          ...next,
          commands: [...next.commands, focusId(ids.tab(index))],
        };
      },
    },
  });

  const vertical = options.orientation === 'vertical';

  const TabsView = View.make(Tabs, ({ model, send }) => (
    <div className={cn('flex gap-4', !vertical && 'flex-col')}>
      <div
        role="tablist"
        aria-label={options.label}
        aria-orientation={options.orientation}
        className={cn(
          'flex gap-1 rounded-lg bg-muted p-1',
          vertical ? 'w-36 flex-col' : 'w-fit',
        )}
      >
        {tabs.map((tab, index) => {
          const selected = index === model.selected;
          return (
            <button
              key={tab.name}
              id={ids.tab(index)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={ids.panel(index)}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'rounded-md px-3 py-1.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => send({ _tag: 'ClickedTab', index })}
              onKeyDown={(event) => {
                if (
                  [keys.next, keys.previous, 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  send({ _tag: 'PressedKey', key: event.key });
                }
              }}
            >
              {tab.name}
            </button>
          );
        })}
      </div>
      <div
        id={ids.panel(model.selected)}
        role="tabpanel"
        aria-labelledby={ids.tab(model.selected)}
        tabIndex={0}
        className="flex-1 rounded-lg border p-4 text-sm"
      >
        {tabs[model.selected]!.panel}
      </div>
    </div>
  ));

  return { Tabs, TabsView };
};

export { make as makeTabs };
