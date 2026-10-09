import { Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { cn } from '@kstackz/web-platform/components/utils';
import { focusId, leftFor, stepActive } from '../focus/index.js';
import { Picks, reportPick } from '../picks/index.js';

/*
 * A dropdown menu of actions as a Node: open or closed, which item is
 * active, and what has been typed to jump to an item.
 *
 * The keyboard is all Update: Arrow keys, Home and End move the active item,
 * Enter and Space choose it, Escape and Tab close, and letters jump to the
 * first item starting with what was typed. The typed letters are cleared
 * 350 ms later by a Command that each new letter replaces, so only the last
 * one's timer runs, in the app's Time.
 *
 * Focus moves to the item list on opening and back to the button on closing
 * from the keyboard, as Commands. The active item is
 * `aria-activedescendant`, not focus, so moving it is a Message and nothing
 * else. Clicking outside is the list losing focus; the View checks where
 * focus went and sends `Blurred` only when it left the menu.
 */

const CLEAR_TYPED_MS = 350;

type Options = {
  readonly id: string;
  readonly label: string;
  readonly items: ReadonlyArray<string>;
};

const make = (options: Options) => {
  const ids = {
    button: `${options.id}-button`,
    items: `${options.id}-items`,
    item: (index: number) => `${options.id}-item-${index}`,
  };
  const { items } = options;

  const Menu = Node.make(`Menu(${options.id})`, {
    requires: { picks: Picks },
    model: Schema.Struct({
      open: Schema.Boolean,
      active: Schema.NullOr(Schema.Number),
      typed: Schema.String,
    }),
    message: Schema.TaggedUnion({
      ClickedButton: {},
      PressedButtonKey: { key: Schema.String },
      PressedItemsKey: { key: Schema.String },
      HoveredItem: { index: Schema.Number },
      ChoseItem: { index: Schema.Number },
      Blurred: {},
      ClearedTyped: {},
    }),
  }).build({
    init: () => ({ model: { open: false, active: null, typed: '' } }),
    update: {
      ClickedButton: (_, { model }) =>
        model.open
          ? { model: { ...model, open: false, active: null } }
          : {
              model: { open: true, active: null, typed: '' },
              commands: [focusId(ids.items)],
            },
      PressedButtonKey: ({ key }) => {
        const active =
          key === 'ArrowUp'
            ? items.length - 1
            : ['ArrowDown', 'Enter', ' '].includes(key)
              ? 0
              : null;
        return active === null
          ? {}
          : {
              model: { open: true, active, typed: '' },
              commands: [focusId(ids.items)],
            };
      },
      PressedItemsKey: ({ key }, { model }) => {
        if (key === 'Escape')
          return {
            model: { ...model, open: false, active: null },
            commands: [focusId(ids.button)],
          };
        if (key === 'Tab')
          return { model: { ...model, open: false, active: null } };
        if ((key === 'Enter' || key === ' ') && model.active !== null)
          return choose(model.active);
        const stepped = stepActive(model.active, key, items.length);
        if (stepped !== null) return { model: { ...model, active: stepped } };
        if (key.length !== 1) return {};
        const typed = model.typed + key.toLowerCase();
        const found = items.findIndex((item) =>
          item.toLowerCase().startsWith(typed),
        );
        return {
          model: { ...model, typed, active: found < 0 ? model.active : found },
          commands: [
            Effect.sleep(CLEAR_TYPED_MS).pipe(
              Effect.as({ _tag: 'ClearedTyped' as const }),
            ),
          ],
          replaceCommands: true,
        };
      },
      HoveredItem: ({ index }, { model }) =>
        model.active === index ? {} : { model: { ...model, active: index } },
      ChoseItem: ({ index }) => choose(index),
      Blurred: (_, { model }) =>
        model.open ? { model: { ...model, open: false, active: null } } : {},
      ClearedTyped: (_, { model }) => ({ model: { ...model, typed: '' } }),
    },
  });

  function choose(index: number) {
    return {
      model: { open: false, active: null, typed: '' },
      commands: [reportPick(options.id, items[index]!), focusId(ids.button)],
    };
  }

  const MenuView = View.make(Menu, ({ model, send }) => (
    <div
      className="relative inline-block"
      onBlur={(event) => {
        if (leftFor(event)) send({ _tag: 'Blurred' });
      }}
    >
      <Button
        id={ids.button}
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={model.open}
        aria-controls={model.open ? ids.items : undefined}
        onClick={() => send({ _tag: 'ClickedButton' })}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            send({ _tag: 'PressedButtonKey', key: event.key });
          }
        }}
      >
        {options.label}
        <ChevronDown />
      </Button>
      {model.open && (
        <div
          id={ids.items}
          role="menu"
          tabIndex={-1}
          aria-labelledby={ids.button}
          aria-activedescendant={
            model.active === null ? undefined : ids.item(model.active)
          }
          className="absolute left-0 z-20 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Tab') event.preventDefault();
            send({ _tag: 'PressedItemsKey', key: event.key });
          }}
        >
          {items.map((item, index) => (
            <div
              key={item}
              id={ids.item(index)}
              role="menuitem"
              className={cn(
                'cursor-default rounded-sm px-2 py-1.5 text-sm',
                model.active === index && 'bg-muted',
              )}
              onPointerMove={() => send({ _tag: 'HoveredItem', index })}
              onClick={() => send({ _tag: 'ChoseItem', index })}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  ));

  return { Menu, MenuView };
};

export { make as makeMenu };
