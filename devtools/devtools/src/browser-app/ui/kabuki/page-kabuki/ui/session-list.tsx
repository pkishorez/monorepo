import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/ui/components/native-select';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { grouped } from '@kestack/devtools-kabuki/server';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

/*
 * The live Kabuki Sessions, to pick one from, grouped by app, then by
 * Environment: a column of headings and rows on a wide screen, a selector
 * over the Inspector on a narrow one. A Kabuki Session picked that is not
 * live stays in both, marked gone, until it is back: in the column, under
 * the app and Environment it was last seen in.
 */

export type Link = 'connecting' | 'live' | 'reconnecting';

interface ListProps {
  readonly sessions: ReadonlyArray<KabukiSessionSummary>;
  /** The name picked, live or not. */
  readonly picked: string | null;
  readonly link: Link;
  readonly onPick: (name: string) => void;
}

/** The page a Kabuki Session runs on, under its Environment: the path alone where the Environment is the page's host. */
export const pageOf = (url: string, environment: string) => {
  try {
    const { host, pathname } = new URL(url);
    return host === environment ? pathname : `${host}${pathname}`;
  } catch {
    return url;
  }
};

/** How long ago `since` was, short: `12s`, `4m`, `2h`, `3d`. */
const ago = (since: number, now: number) => {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/** The wall clock, read again every few seconds: only how long ago things were reads it. */
const useNow = (every: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
};

export function LinkStatus({ link }: { readonly link: Link }) {
  if (link === 'live') return null;
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-amber-500/80 motion-reduce:animate-none" />
      {link === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );
}

/** A Kabuki Session as the column lists it: live, or the one picked, gone. */
type Listed = KabukiSessionSummary & { readonly gone?: true };

/** The column of Kabuki Sessions, for a wide screen: a heading per app and Environment. Arrow keys move between rows. */
export function SessionColumn({ sessions, picked, link, onPick }: ListProps) {
  const now = useNow(5000);
  const list = useRef<HTMLDivElement>(null);
  // Where each Kabuki Session was last seen, so one gone stays in its group.
  const seen = useRef(new Map<string, KabukiSessionSummary>());
  for (const session of sessions) seen.current.set(session.name, session);
  const live = picked !== null && sessions.some((one) => one.name === picked);
  const last = picked === null || live ? undefined : seen.current.get(picked);
  const listed: ReadonlyArray<Listed> =
    last === undefined ? sessions : [{ ...last, gone: true }, ...sessions];
  const unplaced = picked !== null && !live && last === undefined;

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <aside
      aria-label="Kabuki Sessions"
      className="hidden w-64 shrink-0 flex-col border-r border-border/50 md:flex"
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
        <h2 className="text-xs font-medium text-muted-foreground">
          Kabuki Sessions
          <span className="ml-1.5 text-muted-foreground/60 tabular-nums">
            {sessions.length}
          </span>
        </h2>
        <LinkStatus link={link} />
      </div>
      <MotionConfig reducedMotion="user">
        <div
          ref={list}
          onKeyDown={move}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-2 transition-opacity duration-200',
            link === 'reconnecting' && 'opacity-60',
          )}
        >
          {unplaced && <GoneRow name={picked} />}
          {grouped(listed).map(({ app, environments }) => {
            const single = environments.length === 1;
            const count = environments.reduce(
              (sum, { sessions }) =>
                sum + sessions.filter((one) => !one.gone).length,
              0,
            );
            return (
              <section key={app} aria-label={app} className="flex flex-col">
                <h3 className="flex items-baseline gap-1.5 px-2.5 pb-1 text-xs">
                  <span className="shrink-0 font-medium text-foreground/80">
                    {app}
                  </span>
                  {single && (
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                      · {environments[0]!.environment}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-muted-foreground/60 tabular-nums">
                    {count}
                  </span>
                </h3>
                {environments.map(({ environment, sessions }) => (
                  <div key={environment} className="flex flex-col">
                    {!single && (
                      <h4 className="truncate px-2.5 pt-1.5 pb-0.5 font-mono text-[11px] text-muted-foreground">
                        {environment}
                      </h4>
                    )}
                    <ul className="flex flex-col gap-px">
                      <AnimatePresence initial={false}>
                        {sessions.map((session) => (
                          <Row
                            key={`${session.gone ? 'gone' : 'live'}:${session.name}@${session.connectedAt}`}
                          >
                            {session.gone ? (
                              <GoneRow name={session.name} />
                            ) : (
                              <SessionRow
                                session={session}
                                now={now}
                                picked={session.name === picked}
                                onPick={() => onPick(session.name)}
                              />
                            )}
                          </Row>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </MotionConfig>
    </aside>
  );
}

function Row({ children }: { readonly children: React.ReactNode }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
      }}
      exit={{
        opacity: 0,
        transition: { duration: 0.12, ease: 'easeIn' },
      }}
    >
      {children}
    </motion.li>
  );
}

function SessionRow({
  session,
  now,
  picked,
  onPick,
}: {
  readonly session: KabukiSessionSummary;
  readonly now: number;
  readonly picked: boolean;
  readonly onPick: () => void;
}) {
  const connected = new Date(session.connectedAt);
  return (
    <button
      type="button"
      aria-current={picked ? 'true' : undefined}
      onClick={onPick}
      className={cn(
        'group flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-muted',
        picked && 'bg-muted hover:bg-muted',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-emerald-500"
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-foreground/75 transition-colors duration-150 group-hover:text-foreground',
            picked && 'text-foreground',
          )}
        >
          {session.name}
        </span>
        <time
          dateTime={connected.toISOString()}
          title={`Connected ${connected.toLocaleString()}`}
          className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums"
        >
          {ago(session.connectedAt, now)}
        </time>
      </span>
      {session.url !== '' && (
        <span className="truncate pl-3.5 text-xs text-muted-foreground">
          {pageOf(session.url, session.environment)}
        </span>
      )}
    </button>
  );
}

function GoneRow({ name }: { readonly name: string }) {
  return (
    <div
      aria-current="true"
      className="flex w-full flex-col gap-0.5 rounded-md bg-muted/60 px-2.5 py-2"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full border border-muted-foreground/60"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-muted-foreground">
          {name}
        </span>
      </span>
      <span className="pl-3.5 text-xs text-muted-foreground/70">
        Not connected
      </span>
    </div>
  );
}

/** The selector over the Inspector, for a narrow screen: an option group per app. */
export function SessionSelect({ sessions, picked, link, onPick }: ListProps) {
  const live = picked !== null && sessions.some((one) => one.name === picked);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-3 py-2 md:hidden">
      <NativeSelect
        size="sm"
        className="min-w-0 flex-1"
        aria-label="Kabuki Session"
        value={picked ?? ''}
        onChange={(event) => onPick(event.target.value)}
      >
        <NativeSelectOption value="" disabled>
          {sessions.length === 0
            ? 'No Kabuki Sessions'
            : 'Choose a Kabuki Session'}
        </NativeSelectOption>
        {picked !== null && !live && (
          <NativeSelectOption value={picked}>
            {picked} (not connected)
          </NativeSelectOption>
        )}
        {grouped(sessions).map(({ app, environments }) => (
          <optgroup key={app} label={app}>
            {environments.flatMap(({ environment, sessions }) =>
              sessions.map((session) => (
                <NativeSelectOption key={session.name} value={session.name}>
                  {session.name} · {environment}
                </NativeSelectOption>
              )),
            )}
          </optgroup>
        ))}
      </NativeSelect>
      <LinkStatus link={link} />
    </div>
  );
}

/** Where the Kabuki Session picked runs, over the Inspector on a wide screen: app › Environment › name. */
export function SessionPath({
  sessions,
  picked,
}: {
  readonly sessions: ReadonlyArray<KabukiSessionSummary>;
  readonly picked: string;
}) {
  const session = sessions.find((one) => one.name === picked);
  const parts = session ? [session.app, session.environment] : [];
  return (
    <nav
      aria-label="Kabuki Session"
      className="hidden h-9 shrink-0 items-center border-b border-border/50 px-3 text-xs md:flex"
    >
      <ol className="flex min-w-0 items-center gap-1.5">
        {parts.map((part) => (
          <li
            key={part}
            className="flex min-w-0 shrink items-center gap-1.5 text-muted-foreground"
          >
            <span className="truncate">{part}</span>
            <span aria-hidden className="text-muted-foreground/50">
              ›
            </span>
          </li>
        ))}
        <li
          aria-current="page"
          className="shrink-0 truncate font-mono font-medium text-foreground"
        >
          {picked}
        </li>
      </ol>
    </nav>
  );
}
