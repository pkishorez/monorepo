import { View, useChild } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CircleAlertIcon, MicIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Ask } from '../voice.ts';
import { DictationLive, onScreen, State } from './actor.ts';
import { connectionFor, type Hearing } from './choose.ts';

/*
 * The Dictation as the app draws it. Each Draft on screen shows it in the
 * line over its text: while the microphone opens, that it is Waiting;
 * while it records, a red dot, the time, a level and the microphone; while
 * it is written out for that Draft, that it is coming. With no Draft on
 * screen, as at home or in Settings, a badge in the bottom right corner,
 * over everything, shows the same. The badge also says, for a few
 * seconds, why one could not start or what went wrong with the
 * microphone, wherever the app is, and lists the texts that came with no
 * Draft on screen: each can be pasted into the Draft drawn later, or
 * thrown away.
 *
 * Voice hands down `Dictating`: the Dictation itself, how to ask it for
 * something, the button that chooses the microphone, and what it draws.
 * The level and the time change many times a second, so only the meter
 * and the clock read them: a Draft, and the page around it, draw again
 * only when a Dictation starts, stops, or changes microphone. A Draft
 * says only that it is drawn, so text comes to it, and takes the text
 * that comes; Layout binds the keys.
 */

type Asked = typeof Ask.Type;
type Dictation = View.Handle<typeof DictationLive>;

/**
 * The Dictation, how to ask it for something, the microphone's button, and
 * what Voice draws, from Voice.
 */
export const Dictating = createContext<{
  readonly dictation: Dictation;
  readonly ask: (ask: Asked) => void;
  /** The button by the mic that opens the Microphone Picker by pointer, titled with its keys. */
  readonly microphones: (keys: string | null) => ReactNode;
  /** Opens the Microphone Picker: by keys, centred, or by a tap, in a Drawer. */
  readonly chooseMicrophone: (how: 'keys' | 'touch') => void;
  /** The Microphone Picker and the badge, for Layout to draw inside its keyboard. */
  readonly drawn: ReactNode;
} | null>(null);

const useDictating = () => {
  const dictating = use(Dictating);
  if (dictating === null) throw new Error('A Draft is drawn only under Voice');
  return dictating;
};

/**
 * For Layout, which binds the keys and draws Voice inside its keyboard:
 * start or stop, open the Microphone Picker, and what Voice draws.
 */
export const useVoice = () => {
  const { ask, chooseMicrophone, drawn } = useDictating();
  return {
    toggle: () => ask({ _tag: 'Toggle' }),
    chooseMicrophone,
    drawn,
  };
};

/**
 * The Dictation as one Draft sees it: the one recording, if any, with its
 * clock and meter to draw; the one coming to it, if any; what it can ask;
 * and the microphone's button. `onShown`, called while the Draft is on
 * screen, makes it where text goes until what it returns is called; the
 * last one drawn wins. It reads only what changes as a Dictation starts,
 * stops or changes microphone, never the level, so the page does not draw
 * again as it moves.
 */
export const useDictation = (connectionId: string) => {
  const { dictation, ask, microphones, chooseMicrophone } = useDictating();
  const key = useId();
  const phase = useChild(dictation, ({ state }) => state._tag);
  const microphone = useChild(dictation, ({ state }) =>
    state._tag === 'Recording' ? state.microphone : null,
  );
  // A settled State, or a text, is one object until it moves on.
  const coming = useChild(dictation, ({ state }) =>
    (state._tag === 'Transcribing' || state._tag === 'Failed') &&
    state.target === key
      ? state
      : null,
  );
  const text = useChild(
    dictation,
    ({ model }) => model.texts.find(({ target }) => target === key) ?? null,
  );
  const availability = useAvailability(dictation);
  const onShown = useCallback(() => {
    ask({ _tag: 'Register', key, connectionId });
    return () => ask({ _tag: 'Unregister', key });
  }, [ask, key, connectionId]);
  return {
    availability,
    recording:
      phase === 'Waiting'
        ? { _tag: 'Waiting' as const }
        : phase === 'Recording'
          ? {
              _tag: 'Recording' as const,
              microphone: microphone ?? '',
              elapsed: <Elapsed dictation={dictation} />,
              level: <Level dictation={dictation} />,
              wave: <Wave dictation={dictation} />,
            }
          : null,
    pending:
      text !== null && text !== undefined
        ? { _tag: 'Text' as const, id: text.id, text: text.text }
        : coming === null || coming === undefined
          ? null
          : coming._tag === 'Failed'
            ? { _tag: 'Failed' as const, id: coming.id, reason: coming.reason }
            : { _tag: 'Transcribing' as const, id: coming.id },
    onToggle: () => ask({ _tag: 'Toggle' }),
    /** Throws it away, wherever it is: a failed one's clip too. */
    onCancel: () => ask({ _tag: 'Cancel' }),
    onTook: (id: number) => ask({ _tag: 'Took', id }),
    onRetry: (id: number) => ask({ _tag: 'Retry', id }),
    onShown,
    microphones,
    onChooseMicrophone: () => chooseMicrophone('touch'),
  };
};

/** Whether a Dictation could start now, and if not why, from what each Connection says. */
export type Availability =
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Downloading'; readonly progress: number }
  | { readonly _tag: 'Off'; readonly reason: string };

/**
 * Whether a Dictation could start now: ready on the Connection it would
 * choose; else downloading, the furthest along; else off, and why.
 */
const availabilityOf = ({
  connections,
  listed,
}: {
  readonly connections: Readonly<
    Record<string, Hearing & { readonly downloading: number | null }>
  >;
  readonly listed: ReadonlyArray<string>;
}): Availability => {
  const choice = connectionFor(connections, listed, null);
  if (choice._tag === 'On') return READY;
  const downloading = listed
    .map((id) => connections[id]?.downloading ?? null)
    .filter((progress) => progress !== null);
  return downloading.length > 0
    ? { _tag: 'Downloading', progress: Math.max(...downloading) }
    : { _tag: 'Off', reason: choice.reason };
};

const READY: Availability = { _tag: 'Ready' };

const equal = (a: Availability, b: Availability) =>
  a._tag === b._tag &&
  (a._tag !== 'Downloading' || a.progress === (b as typeof a).progress) &&
  (a._tag !== 'Off' || a.reason === (b as typeof a).reason);

/**
 * Availability, the same object while it is equal, so the page draws
 * again only as it changes, not as the level moves.
 */
const useAvailability = (dictation: Dictation): Availability => {
  const last = useRef<Availability>(READY);
  return (
    useChild(dictation, ({ model }) => {
      const next = availabilityOf(model);
      return equal(next, last.current) ? last.current : (last.current = next);
    }) ?? last.current
  );
};

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** How long it has recorded, m:ss; it draws again once a second. */
function Elapsed({ dictation }: { readonly dictation: Dictation }) {
  const seconds = useChild(dictation, ({ state }) =>
    state._tag === 'Recording'
      ? Math.floor((state.heard - state.started) / 1000)
      : 0,
  );
  return <Clock seconds={seconds ?? 0} />;
}

function Clock({ seconds }: { readonly seconds: number }) {
  return <span className="tabular-nums">{clock(seconds)}</span>;
}

/** How loud it is now, for the meter; it draws again with each level. */
function Level({ dictation }: { readonly dictation: Dictation }) {
  const level = useChild(dictation, ({ state }) =>
    state._tag === 'Recording' ? state.level : 0,
  );
  return <Bars level={level ?? 0} />;
}

/** How many levels the waveform keeps, the newest on the right: more than fit, the oldest cut off. */
const WAVE = 64;

/**
 * The level as a waveform, for the Touch Draft: as wide as it is given,
 * thin bars grown from their middle, one for each of the last levels
 * heard, moving left as each new one comes in and fading as they go.
 * Under reduced motion they hold still at the levels last drawn.
 */
function Wave({ dictation }: { readonly dictation: Dictation }) {
  const level = useChild(dictation, ({ state }) =>
    state._tag === 'Recording' ? state.level : 0,
  );
  const reduced = useReducedMotion() === true;
  const [levels, setLevels] = useState<ReadonlyArray<number>>(() =>
    Array.from({ length: WAVE }, () => 0),
  );
  useEffect(() => {
    if (!reduced) setLevels((now) => [...now.slice(1), level ?? 0]);
  }, [level]);
  return (
    <span
      aria-hidden
      data-slot="wave"
      className="flex h-7 w-full min-w-0 items-center justify-end gap-0.75 overflow-hidden mask-l-from-50%"
    >
      {levels.map((heard, at) => (
        <span
          key={at}
          className="h-full w-0.75 shrink-0 rounded-full bg-destructive transition-transform duration-100 ease-out motion-reduce:transition-none"
          style={{
            transform: `scaleY(${Math.round(Math.max(0.1, Math.min(1, heard * 1.8)) * 100) / 100})`,
          }}
        />
      ))}
    </span>
  );
}

/** Each bar's share of the level, so the meter has a shape. */
const BARS = [0.55, 1, 0.75];

/**
 * The meter: three short bars that grow from their foot, only by
 * transform, eased into each new level; they jump under reduced motion.
 */
function Bars({ level }: { readonly level: number }) {
  return (
    <span aria-hidden data-slot="level" className="flex h-3 items-end gap-0.5">
      {BARS.map((share, at) => (
        <span
          key={at}
          className="h-full w-0.75 origin-bottom rounded-full bg-destructive/80 transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{
            transform: `scaleY(${Math.max(0.2, Math.min(1, level * share))})`,
          }}
        />
      ))}
    </span>
  );
}

/** The red dot of a Dictation recording: a slow breath, still under reduced motion. */
function RecordingDot() {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-destructive animate-breathe motion-reduce:animate-none"
    />
  );
}

const PILL =
  'flex items-center gap-2 rounded-full border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.08)]';

/** Whether one is being written out, or failed, with no Draft on screen to show it. */
const unseen = (state: typeof State.Type) =>
  (state._tag === 'Transcribing' || state._tag === 'Failed') &&
  state.target === null
    ? state
    : null;

/**
 * The badge in the corner, over everything: the Dictation recording while
 * no Draft is on screen to show it; why something went wrong, for a few
 * seconds, anywhere; and the list of texts that came with no Draft on
 * screen, each to paste into the Draft drawn now, or throw away.
 */
export const DictationBadge = View.make(
  DictationLive,
  ({ root, model, state, send }) => {
    if (typeof document === 'undefined') return null;
    const target = onScreen(model);
    const recording =
      target !== null ? null : state._tag === 'Recording' ? (
        <div className={PILL}>
          <RecordingDot />
          <span className="font-medium">Recording</span>
          <span className="text-muted-foreground">
            <Clock seconds={Math.floor((state.heard - state.started) / 1000)} />
          </span>
          <Bars level={state.level} />
        </div>
      ) : state._tag === 'Waiting' ? (
        <div className={PILL}>
          <MicIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="text-muted-foreground">
            Waiting for the microphone
          </span>
        </div>
      ) : null;
    const away = unseen(state);
    const writing =
      away === null ? null : away._tag === 'Transcribing' ? (
        <div className={PILL}>
          <MicIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="text-muted-foreground">Writing it out…</span>
        </div>
      ) : (
        <div className={`${PILL} pointer-events-auto`}>
          <CircleAlertIcon
            aria-hidden
            className="size-3.5 shrink-0 text-destructive"
          />
          <span>{away.reason}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => send({ _tag: 'Retry', id: away.id })}
          >
            Retry
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => send({ _tag: 'Cancel' })}
          >
            Discard
          </Button>
        </div>
      );
    const kept = model.texts.filter((each) => each.target === null);
    const list =
      kept.length === 0 ? null : (
        <ul
          aria-label="Dictations"
          className="pointer-events-auto flex max-w-80 flex-col gap-2"
        >
          {kept.map(({ id, text }) => (
            <li key={id} className={`${PILL} rounded-xl`}>
              <span className="line-clamp-2 min-w-0 flex-1">{text}</span>
              <Button
                size="xs"
                variant="ghost"
                disabled={target === null}
                title={
                  target === null ? 'Open a Draft to paste into' : undefined
                }
                onClick={() => send({ _tag: 'Paste', id })}
              >
                Paste
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => send({ _tag: 'Discard', id })}
              >
                Discard
              </Button>
            </li>
          ))}
        </ul>
      );
    const notice =
      model.notice === null ? null : (
        <div className={PILL}>
          <CircleAlertIcon
            aria-hidden
            className="size-3.5 shrink-0 text-destructive"
          />
          <span>{model.notice.reason}</span>
        </div>
      );
    if (
      recording === null &&
      notice === null &&
      writing === null &&
      list === null
    )
      return null;
    return createPortal(
      <div
        {...root}
        role="status"
        className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-100 max-md:bottom-[calc(env(safe-area-inset-bottom)+9rem)] flex flex-col items-end gap-2"
      >
        {notice}
        {list}
        {writing}
        {recording}
      </div>,
      document.body,
    );
  },
);
