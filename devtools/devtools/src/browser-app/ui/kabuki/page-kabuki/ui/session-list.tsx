import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/ui/components/native-select';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

/*
 * The live Kabuki Sessions, to pick one from: a column of rows on a wide
 * screen, a selector over the Inspector on a narrow one. A Kabuki Session
 * picked that is not live stays in both, marked gone, until it is back.
 */

export type Link = 'connecting' | 'live' | 'reconnecting';

interface ListProps {
  readonly sessions: ReadonlyArray<KabukiSessionSummary>;
  /** The name picked, live or not. */
  readonly picked: string | null;
  readonly link: Link;
  readonly onPick: (name: string) => void;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isLocal = (origin: string | null) => {
  if (origin === null) return true;
  try {
    const { hostname } = new URL(origin);
    return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
};

/** The page a Kabuki Session runs on, as its host and path. */
export const pageOf = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return pathname === '/' ? host : `${host}${pathname}`;
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

/** The column of Kabuki Sessions, for a wide screen. Arrow keys move between rows. */
export function SessionColumn({ sessions, picked, link, onPick }: ListProps) {
  const now = useNow(5000);
  const list = useRef<HTMLUListElement>(null);
  const gone =
    picked !== null && !sessions.some((one) => one.name === picked)
      ? picked
      : null;

  const move = (event: KeyboardEvent<HTMLUListElement>) => {
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
        <ul
          ref={list}
          onKeyDown={move}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-2 transition-opacity duration-200',
            link === 'reconnecting' && 'opacity-60',
          )}
        >
          <AnimatePresence initial={false}>
            {gone !== null && (
              <Row key={`gone:${gone}`}>
                <GoneRow name={gone} />
              </Row>
            )}
            {sessions.map((session) => (
              <Row key={`${session.name}@${session.connectedAt}`}>
                <SessionRow
                  session={session}
                  now={now}
                  picked={session.name === picked}
                  onPick={() => onPick(session.name)}
                />
              </Row>
            ))}
          </AnimatePresence>
        </ul>
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
      <span className="truncate pl-3.5 text-xs text-muted-foreground">
        {session.app}
        {session.url !== '' && (
          <>
            <span className="text-muted-foreground/50"> · </span>
            {pageOf(session.url)}
          </>
        )}
      </span>
      {!isLocal(session.origin) && (
        <span className="truncate pl-3.5 text-[11px] text-muted-foreground/70">
          from {session.origin}
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

/** The selector over the Inspector, for a narrow screen. */
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
        {sessions.map((session) => (
          <NativeSelectOption key={session.name} value={session.name}>
            {session.name} · {session.app}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <LinkStatus link={link} />
    </div>
  );
}
