import { useState } from 'react';

import { Button } from '#components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#components/command';
import { Switch } from '#components/switch';

import { Drawer, LayerHeader, TopDialog } from './index';

/*
 * A playground to try both layers on a phone: a few rows or many, the
 * Top Dialog's search focused as it opens or not, and a second list behind
 * each row to go into and back from. What was chosen shows on the page.
 */

const FRUIT = [
  'Apple',
  'Apricot',
  'Banana',
  'Blackberry',
  'Blueberry',
  'Cherry',
  'Coconut',
  'Damson',
  'Date',
  'Dragonfruit',
  'Elderberry',
  'Fig',
  'Gooseberry',
  'Grape',
  'Guava',
  'Kiwi',
  'Lemon',
  'Lime',
  'Lychee',
  'Mango',
  'Melon',
  'Nectarine',
  'Orange',
  'Papaya',
  'Peach',
  'Pear',
  'Plum',
  'Quince',
  'Raspberry',
  'Strawberry',
];

const SIZES = ['Small', 'Medium', 'Large'];

type Layer = 'drawer' | 'dialog';

function Choosing({
  layer,
  title,
  rows,
}: {
  readonly layer: Layer;
  readonly title: string;
  readonly rows: ReadonlyArray<string>;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [fruit, setFruit] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = (fruit === null ? rows : SIZES).filter((row) =>
    row.toLowerCase().includes(query.toLowerCase()),
  );
  const close = () => {
    setOpen(false);
    setFruit(null);
    setQuery('');
  };
  const choose = (row: string) => {
    if (fruit === null && rows.length > 3) {
      setFruit(row);
      setQuery('');
      return;
    }
    setChosen(fruit === null ? row : `${fruit}, ${row}`);
    close();
  };
  const Layer = layer === 'drawer' ? Drawer : TopDialog;
  return (
    <div className="flex min-h-svh flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-sm">
      <Button className="h-11 self-start" onClick={() => setOpen(true)}>
        {layer === 'drawer' ? 'Open the Drawer' : 'Open the Top Dialog'}
      </Button>
      {layer === 'dialog' && (
        <label className="flex items-center gap-3">
          <Switch checked={focus} onCheckedChange={setFocus} />
          Focus the search as it opens
        </label>
      )}
      <p className="text-muted-foreground">
        {chosen === null ? 'Nothing chosen yet' : `Chosen: ${chosen}`}
      </p>
      <p className="mt-auto text-muted-foreground">
        A field at the foot of the page, to try the keyboard over the page.
      </p>
      <input
        className="h-11 rounded-md border border-input bg-transparent px-3 text-base"
        placeholder="Type here"
      />
      <Layer
        open={open}
        label={title}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <LayerHeader
          title={fruit ?? title}
          {...(fruit === null ? {} : { onBack: () => setFruit(null) })}
        />
        <Command shouldFilter={false} className="min-h-0 flex-1 bg-transparent">
          {layer === 'dialog' && (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={fruit === null ? 'Search fruit' : 'Search sizes'}
              {...(focus ? { 'data-autofocus': true } : {})}
            />
          )}
          <CommandList className="max-h-none min-h-0 flex-1 overscroll-contain">
            <CommandEmpty>No fruit by that name</CommandEmpty>
            <CommandGroup>
              {shown.map((row) => (
                <CommandItem
                  key={row}
                  value={row}
                  data-checked={row === chosen}
                  onSelect={() => choose(row)}
                >
                  {row}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </Layer>
    </div>
  );
}

export default {
  'drawer, a few rows': (
    <Choosing layer="drawer" title="Effort" rows={['Low', 'Medium', 'High']} />
  ),
  'drawer, many rows': (
    <Choosing layer="drawer" title="Fruit" rows={FRUIT.slice(0, 12)} />
  ),
  'top dialog, a few rows': (
    <Choosing layer="dialog" title="Fruit" rows={FRUIT.slice(0, 5)} />
  ),
  'top dialog, many rows': (
    <Choosing layer="dialog" title="Fruit" rows={FRUIT} />
  ),
};
