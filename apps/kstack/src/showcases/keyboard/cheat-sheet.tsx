import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import type { ReactNode } from 'react';
import { cn } from '@kstackz/ui-toolkit/utils';
import { BindingKeys } from './binding-keys.tsx';
import { definition, keys } from './keys.ts';

type Status = ReturnType<typeof keys.useStatus>;

// The definition as a tree to walk: each Surface's Actions and Surfaces.
type Node = {
  readonly actions?: Readonly<Record<string, unknown>>;
  readonly surfaces?: Readonly<Record<string, Node>>;
  readonly isolated?: boolean;
  readonly globals?: boolean;
};

const STATE_LABELS = {
  active: 'works',
  shadowed: 'shadowed',
  unhandled: 'no handler',
  inactive: 'off',
} as const;

/**
 * Every key, as the tree of Surfaces the definition names: the Global
 * Actions, then each Surface with the Surfaces inside it. The Active
 * Surface is ringed, the ones around it marked, and each Action says
 * whether it works right now, from `useStatus`.
 */
export function CheatSheet() {
  const status = keys.useStatus();
  const globalsOn = status.actions.some(
    (action) => !action.id.includes('.') && action.state !== 'inactive',
  );
  return (
    <aside className="w-96 shrink-0 overflow-y-auto border-l border-border p-4">
      <h2 className="mb-4 font-semibold">Every key</h2>
      <Block
        title="Global"
        chip={globalsOn ? 'on' : 'off here'}
        on={globalsOn}
        active={false}
      >
        <Actions status={status} prefix="" node={definition as Node} />
      </Block>
      <h3 className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Surfaces
      </h3>
      <Surfaces status={status} prefix="" node={definition as Node} />
    </aside>
  );
}

function Surfaces(props: {
  readonly status: Status;
  readonly prefix: string;
  readonly node: Node;
}) {
  return (
    <div className="space-y-2">
      {Object.entries(props.node.surfaces ?? {}).map(([name, node]) => {
        const id = `${props.prefix}${name}`;
        const surface = props.status.surface ?? '';
        const active = surface === id;
        const around = surface.startsWith(`${id}.`);
        const flags = [
          node.isolated && 'isolated',
          node.globals === false && 'globals off',
        ].filter(Boolean);
        return (
          <Block
            key={id}
            title={name}
            chip={
              active ? 'active' : around ? 'around the active one' : undefined
            }
            flags={flags as ReadonlyArray<string>}
            on={active || around}
            active={active}
          >
            <Actions status={props.status} prefix={`${id}.`} node={node} />
            {node.surfaces && (
              <div className="mt-2 border-l border-border pl-3">
                <Surfaces status={props.status} prefix={`${id}.`} node={node} />
              </div>
            )}
          </Block>
        );
      })}
    </div>
  );
}

function Block(props: {
  readonly title: string;
  readonly chip?: string | undefined;
  readonly flags?: ReadonlyArray<string>;
  readonly on: boolean;
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-lg p-2.5 ring-1 ring-edge transition',
        props.active && 'bg-primary/5 ring-2 ring-primary',
        !props.on && 'opacity-55',
      )}
    >
      <header className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        {props.title}
        {props.flags?.map((flag) => (
          <span
            key={flag}
            className="text-xs font-normal text-muted-foreground"
          >
            {flag}
          </span>
        ))}
        {props.chip && (
          <Badge
            className="ml-auto"
            variant={props.active ? 'default' : 'secondary'}
          >
            {props.chip}
          </Badge>
        )}
      </header>
      {props.children}
    </section>
  );
}

function Actions(props: {
  readonly status: Status;
  readonly prefix: string;
  readonly node: Node;
}) {
  const ids = Object.keys(props.node.actions ?? {}).map(
    (name) => `${props.prefix}${name}`,
  );
  return (
    <ul className="space-y-1">
      {ids.map((id) => {
        const action = props.status.actions.find((each) => each.id === id);
        if (action === undefined) return null;
        const works = action.state === 'active';
        return (
          <li
            key={id}
            className={cn(
              'flex items-center gap-2 text-sm',
              !works && 'text-muted-foreground',
            )}
          >
            <span className="flex-1 truncate">{action.description}</span>
            {action.bindings.map(({ binding, works: on }, i) => (
              <BindingKeys key={i} binding={binding} muted={works && !on} />
            ))}
            <span
              className={cn(
                'w-16 text-right text-[11px]',
                works ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {STATE_LABELS[action.state]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
