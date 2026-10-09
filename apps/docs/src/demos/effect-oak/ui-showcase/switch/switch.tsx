import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Switch as KitSwitch } from '@kstackz/web-platform/components/switch';
import { Picks, reportPick } from '../picks/index.js';

/*
 * A switch as a Node: on or off, reported up on every toggle. The kit's
 * Switch only draws it: it is controlled by the Model, so its own state
 * never holds anything the Log does not.
 */

type Options = { readonly id: string; readonly label: string };

const make = (options: Options) => {
  const Switch = Node.make(`Switch(${options.id})`, {
    requires: { picks: Picks },
    model: Schema.Struct({ on: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggled: { on: Schema.Boolean } }),
  }).build({
    init: () => ({ model: { on: false } }),
    update: {
      Toggled: ({ on }) => ({
        model: { on },
        commands: [reportPick(options.id, on ? 'on' : 'off')],
      }),
    },
  });

  const SwitchView = View.make(Switch, ({ model, send }) => (
    <label className="flex items-center gap-3 text-sm">
      <KitSwitch
        checked={model.on}
        onCheckedChange={(on) => send({ _tag: 'Toggled', on })}
      />
      {options.label}
    </label>
  ));

  return { Switch, SwitchView };
};

export { make as makeSwitch };
