import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { RenderCounts, counted } from '../render-count/index.js';
import { Header, List, Row } from './list.js';

const HeaderView = View.make(Header, ({ id, model, send }) => {
  counted(id);
  return (
    <Button variant="outline" onClick={() => send({ _tag: 'Clicked' })}>
      Header clicked {model.clicks}×
    </Button>
  );
});

const RowView = View.make(
  Row,
  ({ id, model, send }, { selected }: { readonly selected: boolean }) => {
    counted(id);
    return (
      <div
        className="flex flex-1 items-center justify-between gap-4 rounded-md border px-3 py-2 data-[selected=true]:border-primary"
        data-selected={selected}
      >
        <span className="font-mono">
          {model.text} · {model.bumps}
        </span>
        <Button size="sm" onClick={() => send({ _tag: 'ClickedBump' })}>
          Bump
        </Button>
      </div>
    );
  },
);

/**
 * Each View counts its renders. A Row renders when its own Model changes or
 * when `selected` changes for it; nothing the List does reaches the others.
 */
export const ListView = View.make(List, ({ id, model, children, send }) => {
  counted(id);
  return (
    <div className="flex size-full gap-6 overflow-y-auto p-6">
      <div className="flex max-w-md flex-1 flex-col gap-3">
        <h1 className="text-lg font-semibold">{model.title}</h1>
        <HeaderView instance={children.header} />
        <ul className="flex flex-col gap-2">
          {children.rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <RowView instance={row} selected={row.key === model.selected} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => send({ _tag: 'ClickedSelect', id: row.key })}
              >
                Select
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => send({ _tag: 'ClickedRemove', id: row.key })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button onClick={() => send({ _tag: 'ClickedAdd' })}>Add row</Button>
          <Button
            variant="outline"
            onClick={() => send({ _tag: 'ClickedRename' })}
          >
            Rename list
          </Button>
        </div>
      </div>
      <RenderCounts />
    </div>
  );
});
