import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type {
  Group,
  KeyLine,
  Level,
  Line,
  Skeleton,
} from '../logic/shared/index.js';
import { Ask } from './ask.js';

const HEADING =
  'text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground/80 uppercase';

const LABEL = 'text-[10.5px] leading-5 text-muted-foreground/70';

const INDENT = 12;

const LIT =
  'rounded-l-none bg-running/10 shadow-[inset_2px_0_0_var(--color-running)]';

interface Hands {
  readonly free: boolean;
  readonly dim: boolean;
  readonly onToggle: (ref: string) => void;
  readonly onFold: (state: string) => void;
  readonly onAsk: (ref: string) => void;
}

const tone = (lit: boolean, dim: boolean) =>
  cn(
    'transition-[opacity,background-color] duration-150 ease-out motion-reduce:transition-none',
    lit ? LIT : dim && 'opacity-40',
  );

function Row({
  name,
  ask,
  lit,
  hands,
  children,
}: {
  readonly name: string;
  readonly ask: string;
  readonly lit: boolean;
  readonly hands: Hands;
  readonly children: ReactNode;
}) {
  if (!hands.free)
    return (
      <div className={cn('-mx-1.5 rounded-sm px-1.5', tone(lit, hands.dim))}>
        {children}
      </div>
    );
  return (
    <div
      className={cn(
        'group/ask -mx-1.5 flex items-start gap-1 rounded-sm pr-0.5 pl-1.5 hover:bg-muted/50',
        tone(lit, hands.dim),
      )}
    >
      <button
        type="button"
        aria-pressed={lit}
        title={lit ? `Unlight ${name}` : `Light ${name}`}
        onClick={() => hands.onToggle(ask)}
        className="min-w-0 flex-1 cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </button>
      <Ask label={name} onAsk={() => hands.onAsk(ask)} className="mt-0.5" />
    </div>
  );
}

function Keys({
  keys,
  hands,
}: {
  readonly keys: ReadonlyArray<KeyLine>;
  readonly hands: Hands;
}) {
  return (
    <div className="flex flex-col">
      {keys.map((key) => (
        <Row
          key={key.id}
          name={key.name}
          ask={key.ref}
          lit={key.lit}
          hands={hands}
        >
          <span
            className="flex min-w-0 items-baseline gap-2.5 leading-5"
            style={{ paddingLeft: key.depth * INDENT }}
          >
            <span className="shrink-0 font-mono text-[11.5px] text-foreground/90 wrap-anywhere">
              {key.name}
            </span>
            {key.description !== null && (
              <span className="min-w-0 text-xs text-pretty text-muted-foreground">
                {key.description}
              </span>
            )}
          </span>
        </Row>
      ))}
    </div>
  );
}

function Lines({
  lines,
  hands,
}: {
  readonly lines: ReadonlyArray<Line>;
  readonly hands: Hands;
}) {
  return (
    <div className="flex flex-col">
      {lines.map((line) => (
        <div key={line.id} className="flex flex-col">
          <Row name={line.name} ask={line.ref} lit={line.lit} hands={hands}>
            <span className="flex min-w-0 items-baseline gap-2 leading-5">
              <span className="min-w-0 text-[12.5px] text-foreground wrap-anywhere">
                {line.name}
              </span>
              {line.note !== null && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {line.note}
                </span>
              )}
            </span>
          </Row>
          {line.keys.length > 0 && (
            <div className="mt-0.5 mb-1 ml-1 border-l border-border pl-2.5">
              <Keys keys={line.keys} hands={hands} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Groups({
  groups,
  hands,
}: {
  readonly groups: ReadonlyArray<Group>;
  readonly hands: Hands;
}) {
  return (
    <div className="grid grid-cols-[4.75rem_1fr] gap-x-2 gap-y-1">
      {groups.map((group) => (
        <div key={group.title} className="col-span-2 grid grid-cols-subgrid">
          <span className={LABEL}>{group.title}</span>
          <Lines lines={group.lines} hands={hands} />
        </div>
      ))}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1 border-t border-border px-3 pt-2 pb-2.5">
      <h4 className={HEADING}>{title}</h4>
      {children}
    </section>
  );
}

function State({
  level,
  hands,
}: {
  readonly level: Level;
  readonly hands: Hands;
}) {
  const head = (
    <span className="flex min-w-0 items-baseline gap-2 leading-6">
      <span className="text-[12.5px] font-medium text-foreground">
        {level.tag}
      </span>
      {!level.expanded && level.count !== '' && (
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {level.count}
        </span>
      )}
    </span>
  );
  const chevron = (
    <ChevronRightIcon
      aria-hidden
      className={cn(
        'size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 ease-out motion-reduce:transition-none',
        level.expanded && 'rotate-90',
      )}
    />
  );
  const quiet = hands.dim && !level.lit && !level.expanded;
  return (
    <li className="flex flex-col">
      <div
        className={cn(
          '-mx-1.5 flex items-center gap-1 rounded-sm px-1.5',
          tone(level.lit, quiet),
        )}
      >
        {hands.free ? (
          <>
            <button
              type="button"
              aria-expanded={level.expanded}
              aria-label={`${level.expanded ? 'Collapse' : 'Expand'} ${level.tag}`}
              onClick={() => hands.onFold(level.tag)}
              className="-ml-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {chevron}
            </button>
            <button
              type="button"
              aria-pressed={level.lit}
              title={level.lit ? `Unlight ${level.tag}` : `Light ${level.tag}`}
              onClick={() => hands.onToggle(level.ref)}
              className="group/ask flex min-w-0 flex-1 cursor-pointer items-center rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {head}
            </button>
            <Ask label={level.tag} onAsk={() => hands.onAsk(level.ref)} />
          </>
        ) : (
          <>
            {chevron}
            {head}
          </>
        )}
      </div>
      {level.expanded && (
        <div className="mt-0.5 mb-1.5 ml-1.5 flex flex-col gap-1 border-l border-border pl-2.5">
          {level.data.length > 0 && (
            <div className="grid grid-cols-[4.75rem_1fr] gap-x-2">
              <span className={LABEL}>Data</span>
              <Keys keys={level.data} hands={hands} />
            </div>
          )}
          {level.groups.length > 0 && (
            <Groups groups={level.groups} hands={hands} />
          )}
          {level.data.length === 0 && level.groups.length === 0 && (
            <p className="text-xs text-muted-foreground">Holds nothing</p>
          )}
        </div>
      )}
    </li>
  );
}

export function Levels({
  skeleton,
  free,
  dim,
  onToggle,
  onFold,
  onAsk,
}: {
  readonly skeleton: Skeleton;
  readonly free: boolean;
  readonly dim: boolean;
  readonly onToggle: (ref: string) => void;
  readonly onFold: (state: string) => void;
  readonly onAsk: (ref: string) => void;
}) {
  const hands = { free, dim, onToggle, onFold, onAsk };
  const { model, always, states } = skeleton;
  const shaped = [
    ['Input', always.input],
    ['Props', always.props],
  ] as const;
  return (
    <>
      {model.length > 0 && (
        <Block title="Model">
          <Keys keys={model} hands={hands} />
        </Block>
      )}
      {(always.groups.length > 0 ||
        always.input.length > 0 ||
        always.props.length > 0) && (
        <Block title="Always">
          <Groups groups={always.groups} hands={hands} />
          {shaped.map(([title, keys]) =>
            keys.length === 0 ? null : (
              <div key={title} className="grid grid-cols-[4.75rem_1fr] gap-x-2">
                <span className={LABEL}>{title}</span>
                <Keys keys={keys} hands={hands} />
              </div>
            ),
          )}
        </Block>
      )}
      {states.length > 0 && (
        <Block title="States">
          <ul className="flex flex-col">
            {states.map((level) => (
              <State key={level.tag} level={level} hands={hands} />
            ))}
          </ul>
        </Block>
      )}
    </>
  );
}
