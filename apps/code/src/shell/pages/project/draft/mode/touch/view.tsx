import type { EditorView } from '@codemirror/view';
import { Router } from '@kestack/kabuki/routing';
import { View } from '@kestack/kabuki/react';
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
} from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  createContext,
  use,
  useEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Availability } from '../../../../../actors/dictation/index.ts';
import * as routes from '../../../../../routes/index.ts';
import type * as Picker from '../../../../../../ui/picker/index.ts';
import { TouchDraftLive } from './actor.ts';
import { ModeSwitch, Row } from './controls/index.ts';
import { useMode, useTouchDraft } from './wiring.ts';
import { Words } from './words/index.ts';

/*
 * The Touch Draft as drawn, from its State; the Draft around it hands the
 * rest through `Touch`. The page's foot, edge to edge, a sheet with
 * rounded top corners and the safe area inside it; in a Drawer, flat, the
 * Drawer the sheet.
 *
 * 1. Top line  the model chip, and Text | Voice; it folds away while
 *              editing.
 * 2. Words     read only, or the Composer while editing (`words/`). Text
 *              is on the left, voice on the right: a Swipe left goes to
 *              voice, right back to text, and from text a Swipe right
 *              opens the sidebar. While no Machine can transcribe it
 *              stays text, and a Swipe to voice shakes the words and says
 *              why.
 * 3. Controls  the row under the words, which never moves (`controls/`).
 *
 * What it runs on, from the Actor and the Draft, is `wiring.ts`.
 */

/** What the Touch Draft draws of the Draft's editing (`useDraft`). */
export interface Draft {
  /** The ref that moves the editor into the Touch Draft. */
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  readonly placeholder: string;
  /** Nothing in it yet, nor a Dictation coming. */
  readonly empty: boolean;
  /** Something to send. */
  readonly filled: boolean;
  readonly disabled: boolean;
  /** Text only: no file goes in, as in a Side Question. */
  readonly textOnly?: boolean;
  readonly files: { readonly add: (files: ReadonlyArray<File>) => unknown };
  readonly skills: {
    readonly how: typeof Picker.How.Type | null;
    readonly offered: boolean;
    readonly onOpen: (how: typeof Picker.How.Type, typed: boolean) => void;
    readonly picker: ReactNode;
  };
  readonly dictation: {
    readonly recording:
      | { readonly _tag: 'Starting' }
      | {
          readonly _tag: 'Recording';
          readonly elapsed: ReactNode;
          readonly wave: ReactNode;
        }
      | null;
    readonly pending: {
      readonly _tag: 'Transcribing' | 'Failed' | 'Text';
      readonly id: number;
    } | null;
    /** Whether a Dictation could start now, and if not why. */
    readonly availability: Availability;
    readonly onRetry: (id: number) => void;
    /** Throws it away, wherever it is: a failed one's clip too. */
    readonly onCancel: () => void;
    readonly onShown: () => () => void;
    readonly onChooseMicrophone?: () => void;
  };
  /** Makes it the Composer and focuses it, in the tap. */
  readonly write: () => void;
  /** Sends it, if there is something to send. */
  readonly send: () => void;
}

/** What the Draft hands the Touch Draft's View. */
export const Touch = createContext<{
  readonly draft: Draft;
  /** Its files, and those refused, while there are any. */
  readonly attachments: ReactNode;
  /** The model chip. */
  readonly chip: ReactNode;
  /** What sending is called: Send, Steer, Ask or Start session. */
  readonly label: string;
  /** Nothing can be sent now, such as while offline. */
  readonly blocked: boolean;
  /** A new session is being started: the talk bar waits. */
  readonly starting: boolean;
  /** What the page adds, such as Stop. */
  readonly actions?: ReactNode;
  /** Starts the Draft with `/btw`, for a question on the side; null where there is no Session to ask. */
  readonly onAsk: (() => void) | null;
  readonly onPaste: (text: string) => void;
  /** Where the View says how the Draft is sent on touch: through it. */
  readonly sending: RefObject<(() => void) | null>;
} | null>(null);

const BACK = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;
const SHAKE = [0, -10, 8, -5, 3, 0];

export const TouchDraftView = View.make(
  TouchDraftLive,
  ({ root, model, state, send }) => {
    const slots = use(Touch);
    if (slots === null)
      throw new Error('The Touch Draft is drawn only in a Draft');
    const { draft } = slots;
    const t = useTouchDraft(slots, state, send);
    const { mode, choose, ready, nudge, swipes } = useMode(
      draft,
      model.mode,
      t.recording,
      send,
    );
    const voice = mode === 'voice';
    // The words lean with a Swipe, and shake when voice can't be had.
    const reduced = useReducedMotion() === true;
    const x = useMotionValue(0);
    useEffect(() => {
      if (nudge === null || reduced) return;
      void animate(x, SHAKE, { duration: 0.42, ease: 'easeOut' });
    }, [nudge?.key]);

    return (
      <MotionConfig reducedMotion="user">
        <div {...root} className="flex flex-col gap-2">
          {slots.actions !== undefined && slots.actions !== false && (
            <div className="flex justify-end">{slots.actions}</div>
          )}
          <div
            data-slot="draft"
            data-touch=""
            data-writing={t.editing || undefined}
            data-recording={t.recording || undefined}
            data-disabled={draft.disabled || undefined}
            onBlur={t.onBlur}
            className={cn(
              'group/draft relative flex flex-col',
              // Edge to edge: out past the foot's own sides and safe area.
              '-mx-4 -mb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6',
              'rounded-t-[1.75rem] border-t border-border bg-card px-3 pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-1px_2px_rgb(0_0_0/0.04),0_-12px_32px_rgb(0_0_0/0.08)]',
              'transition-[border-color] duration-200 ease-out motion-reduce:transition-none data-recording:border-destructive/40',
              // In a Drawer, the Drawer is the sheet, and keeps the safe area.
              'in-data-[slot=touch-drawer]:rounded-none in-data-[slot=touch-drawer]:border-t-0 in-data-[slot=touch-drawer]:bg-transparent in-data-[slot=touch-drawer]:pb-1 in-data-[slot=touch-drawer]:shadow-none',
            )}
          >
            {/* 1. Top line: folds away while editing, by its row's height. */}
            <div
              inert={t.editing}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                t.editing
                  ? 'grid-rows-[0fr] opacity-0'
                  : 'grid-rows-[1fr] opacity-100',
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2 pb-0.5">
                  <div className="-ml-2 flex min-w-0 flex-1">{slots.chip}</div>
                  <ModeSwitch
                    mode={mode}
                    ready={ready}
                    onChoose={choose}
                    disabled={t.recording}
                  />
                </div>
              </div>
            </div>
            {/* 2. Words */}
            <motion.div style={{ x }} className="relative flex min-w-0">
              <Words
                editor={draft}
                editing={t.editing}
                onEdit={t.edit}
                tapEdits={!voice}
                swipes={swipes}
                onSwipeMove={(offset) =>
                  offset === null
                    ? void animate(x, 0, BACK)
                    : x.set(offset * 0.2)
                }
                className={cn(
                  'px-1 py-1.5 text-[1.0625rem] leading-7',
                  t.editing
                    ? 'max-h-[min(40dvh,calc(6*1.75rem+0.75rem))] min-h-[calc(3*1.75rem+0.75rem)]'
                    : 'max-h-[calc(3*1.75rem+0.75rem)] min-h-[calc(1.75rem+0.75rem)]',
                )}
              />
              <AnimatePresence>
                {nudge !== null && <Nudge key="nudge" said={nudge.said} />}
              </AnimatePresence>
            </motion.div>
            {slots.attachments !== null && (
              <div className="px-1 pt-1">{slots.attachments}</div>
            )}
            {/* 3. Controls */}
            <Row
              phase={
                t.editing
                  ? 'editing'
                  : t.recording
                    ? 'recording'
                    : t.failed
                      ? 'failed'
                      : 'resting'
              }
              voice={t.voice}
              talking={voice && !t.editing}
              disabled={draft.disabled}
              recording={draft.dictation.recording}
              skills={draft.textOnly ? null : draft.skills}
              quick={{
                onAsk: t.ask,
                onPaste: slots.onPaste,
                onFiles: draft.textOnly
                  ? null
                  : (files) => void draft.files.add(files),
                onChooseMicrophone: draft.dictation.onChooseMicrophone,
              }}
              send={
                t.recording
                  ? {
                      label: 'Stop and send',
                      disabled: slots.blocked,
                      onSend: t.takeAndSend,
                    }
                  : {
                      label: slots.label,
                      disabled: !t.canSend,
                      onSend: draft.send,
                    }
              }
              onCancel={t.cancel}
              onDone={t.done}
              onTalk={t.talk}
            />
          </div>
        </div>
      </MotionConfig>
    );
  },
);

/** Why voice can't be had, over the words for a moment, with the way to Settings. */
function Nudge({ said }: { readonly said: string }) {
  return (
    <motion.p
      role="status"
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
      }}
      exit={{
        opacity: 0,
        y: -4,
        transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
      }}
      className="absolute inset-x-0 top-0.5 flex items-center justify-center gap-2 rounded-full bg-popover/95 px-4 py-2 text-sm text-popover-foreground shadow-md backdrop-blur-sm"
    >
      {said}
      <Router.Link
        to={routes.settings()}
        className="focus-ring rounded-sm font-medium underline decoration-border underline-offset-4"
      >
        Settings
      </Router.Link>
    </motion.p>
  );
}
