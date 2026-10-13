import type { ReactNode } from 'react';
import { Layer } from 'effect';
import type { AnyActor } from '@kestack/kabuki';
import { View, toReact } from '@kestack/kabuki/react';
import type { Handle, ViewOf } from '@kestack/kabuki/react';
import * as shop from './shop.ts';

/*
 * The bigger Shop as a running app, drawn plainly: one box per Instance,
 * with its State and a button for each Message its Update handles in that
 * State, and its Children inside it. What a Message carries is made up.
 */

const JARS = Array.from({ length: 6 }, (_, index) => `jar-${index + 1}`);

/** What a Message carries, when it carries anything. */
const CARRIES: Readonly<Record<string, object>> = {
  Put: { item: 'cup' },
  Stocked: { ids: JARS },
  Queued: { ids: JARS },
  Thumbed: { id: 'tea' },
};

const views = new Map<string, ViewOf<AnyActor>>();

const viewOf = (actor: AnyActor): ViewOf<AnyActor> => {
  const known = views.get(actor.definition.name);
  if (known) return known;
  const { definition } = actor;
  const drawn = View.make(actor, (self): ReactNode => {
    const { _tag, send, root } = self;
    const children = self.children as Readonly<
      Record<string, Handle<AnyActor> | ReadonlyArray<Handle<AnyActor>>>
    >;
    const handles = Object.keys({
      ...definition.update['*'],
      ...definition.update[_tag],
    });
    return (
      <div {...root} className="flex flex-col gap-2 rounded-lg border p-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold">{definition.name}</span>
          {self.id.match(/\[([^\]]*)\]#\d+$/)?.[1] && (
            <span className="text-muted-foreground font-mono">
              {self.id.match(/\[([^\]]*)\]#\d+$/)![1]}
            </span>
          )}
          {_tag !== 'Single' && (
            <span className="text-muted-foreground">· {_tag}</span>
          )}
          <span className="flex-1" />
          {handles.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                (send as (message: object) => void)({
                  _tag: tag,
                  ...CARRIES[tag],
                })
              }
              className="hover:bg-muted rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors duration-150"
            >
              {tag}
            </button>
          ))}
        </div>
        {Object.entries(children).map(([slot, held]) => {
          const child = definition.children[_tag]?.[slot]?.definition;
          if (!child) return null;
          const ChildView = viewOf({
            name: child.name,
            definition: child,
          } as AnyActor);
          const list = Array.isArray(held) ? held : [held as Handle<AnyActor>];
          return (
            <div key={slot} className="flex flex-col gap-2 pl-3">
              {list.slice(0, 4).map((handle) => (
                <ChildView key={handle.id} instance={handle} />
              ))}
              {list.length > 4 && (
                <span className="text-muted-foreground text-[11px]">
                  and {list.length - 4} more {child.name}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  });
  views.set(definition.name, drawn as ViewOf<AnyActor>);
  return drawn as ViewOf<AnyActor>;
};

/** The bigger Shop, running. */
export const LiveShop = toReact(
  shop.Shop,
  viewOf(shop.Shop) as ViewOf<typeof shop.Shop>,
  Layer.empty,
  { name: 'devtools-live-shop' },
);
