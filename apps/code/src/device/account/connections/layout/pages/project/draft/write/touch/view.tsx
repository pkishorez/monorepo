import { Router } from '@kestack/kabuki/routing';
import { View } from '@kestack/kabuki/react';
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import { CheckIcon, ChevronDownIcon, PencilIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { GestureZone } from '@kestack/web-platform/ui/input';
import { type Ref, type RefObject, use, useEffect, useRef } from 'react';
import * as routes from '../../../../../../../../routes/index.ts';
import { TouchDraftLive } from './actor.ts';
import * as Picker from '../../../../../../../../../ui/controls/picker/index.ts';
import { Controls } from './controls/index.ts';
import { useMorph } from './morph.ts';
import { Touch, useTouchDraft } from './touch.ts';
import { Words } from './words/index.ts';

/*
 * The Touch Draft as drawn, from its State; the Draft around it hands the
 * rest through `Touch`. A card at the page's foot, one grid whose cells
 * move as it opens, so its words are never drawn anew and the keyboard
 * raised in the tap stays up; in a Drawer, flat, the Drawer the card.
 * On a page, edge to edge at its foot, its top corners round, the home
 * indicator's room in it but while it is typed in, as the keyboard is
 * there instead; its owner keeps no room around it.
 *
 * 1. Collapsed  one line: Add, the words, the microphone and Send. While
 *               a Dictation records or is written out, what it is doing
 *               is drawn over the words. A tap anywhere but a button opens
 *               it: to edit, or with Smart Input only open.
 * 2. Open       the model chip, with Smart Input Edit or Done, and
 *               Collapse on top, the words under them, and the same
 *               controls under those. Collapse and open is one control;
 *               typing and not, another. Open but not editing, a tap in the words places
 *               the caret with Smart Input, and edits without; while a
 *               Dictation records, it places the caret either way.
 *
 * Its controls are `controls/`; what it runs on, from the Actor and the
 * Draft, is `touch.ts`.
 */

const SHAKE = [0, -10, 8, -5, 3, 0];

/** The grid's cells, collapsed and expanded. */
const CELLS = cn(
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1',
  "data-collapsed:[grid-template-areas:'files_files_files'_'left_words_right']",
  "not-data-collapsed:[grid-template-areas:'head_head_head'_'words_words_words'_'files_files_files'_'left_mid_right']",
);

export const TouchDraftView = View.make(
  TouchDraftLive,
  ({ root, model, state, send }) => {
    const slots = use(Touch);
    if (slots === null)
      throw new Error('The Touch Draft is drawn only in a Draft');
    const { draft } = slots;
    // The View's root holds the card: what the keyboard is measured from.
    const holder = useRef<HTMLDivElement>(null);
    const t = useTouchDraft(slots, { model, state }, send, holder);
    // Opened straight to editing, it is at its size at once (`touch.ts`).
    useMorph(t.card, t.expanded, !(t.editing && !t.smart));
    const openPicker = Picker.useOpen();
    // The microphone's row shakes when voice can't be had.
    const reduced = useReducedMotion() === true;
    const x = useMotionValue(0);
    useEffect(() => {
      if (t.nudge === null || reduced) return;
      void animate(x, SHAKE, { duration: 0.42, ease: 'easeOut' });
    }, [t.nudge?.key]);
    const recording = draft.dictation.recording;
    const { skills } = draft;

    return (
      <MotionConfig reducedMotion="user">
        <div
          {...root}
          ref={(element) => both(holder, root.ref, element)}
          className="flex flex-col gap-2"
        >
          {/* Trapped: no swipe that starts on it reaches the sidebar. */}
          <GestureZone trapped className="contents">
            <motion.div
              ref={t.card}
              style={{
                x,
                // Its foot over the keyboard, then its own p-1 above that.
                ...(t.covered > 0
                  ? { paddingBottom: `calc(${t.covered}px + 0.25rem)` }
                  : {}),
              }}
              data-slot="draft"
              data-touch=""
              data-btw={draft.btw || undefined}
              data-collapsed={!t.expanded || undefined}
              data-writing={t.editing || undefined}
              data-recording={t.phase === 'recording' || undefined}
              data-disabled={draft.disabled || undefined}
              onBlur={t.onBlur}
              onPointerDownCapture={t.onPointerDownCapture}
              // Collapsed, a tap anywhere on it but a button opens it; the
              // words take their own. Not one in the Skills' Sheet, drawn
              // elsewhere in the page, whose clicks still come through here.
              onClick={(event) => {
                const on = event.target as Element;
                if (
                  t.expanded ||
                  !event.currentTarget.contains(on) ||
                  on.closest('button, [data-words]') !== null
                )
                  return;
                t.open();
              }}
              className={cn(
                'group/draft relative',
                CELLS,
                'rounded-t-[1.625rem] border-t border-border bg-card p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-1px_2px_rgb(0_0_0/0.04),0_-8px_24px_rgb(0_0_0/0.08)] data-writing:pb-1',
                'transition-[border-color,border-radius,background-color] duration-200 ease-out motion-reduce:transition-none data-recording:border-destructive/40',
                'data-btw:border-btw/50 data-btw:bg-(--btw-card)',
                'not-data-collapsed:rounded-t-[1.375rem] not-data-collapsed:px-2 not-data-collapsed:pt-1.5',
                // In a Drawer, the Drawer is the card.
                'in-data-[slot=touch-drawer]:rounded-none in-data-[slot=touch-drawer]:border-0 in-data-[slot=touch-drawer]:bg-transparent in-data-[slot=touch-drawer]:pb-1 in-data-[slot=touch-drawer]:shadow-none',
              )}
            >
              {/* 2. Open: its top line, drawn always and shown by the card's
                own data-collapsed, so a tap that opens it by hand finds it. */}
              <div
                data-head=""
                className="flex min-w-0 items-center gap-1 [grid-area:head] group-data-collapsed/draft:hidden"
              >
                <div className="-ml-1 flex min-w-0 flex-1">{slots.chip}</div>
                {/* With Smart Input, typing is its own control: Edit, Done. */}
                {t.smart &&
                  (state._tag === 'Expanded' || state._tag === 'Editing') && (
                    <Button
                      type="button"
                      variant="ghost"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={t.editing ? t.done : t.edit}
                      className="h-10 shrink-0 gap-1.5 rounded-full border border-border px-4 text-sm font-medium [&_svg]:size-4"
                    >
                      {t.editing ? (
                        <CheckIcon aria-hidden />
                      ) : (
                        <PencilIcon aria-hidden />
                      )}
                      {t.editing ? 'Done' : 'Edit'}
                    </Button>
                  )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Collapse"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={t.collapse}
                  className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg]:size-5"
                >
                  <ChevronDownIcon aria-hidden />
                </Button>
              </div>
              {/* The words: one cell, whichever way it is drawn. */}
              <div
                data-words=""
                className="relative flex min-w-0 [grid-area:words]"
              >
                {/* Collapsed, the one line says it asks by the way. */}
                {slots.btw?.on === true && (
                  <span className="mt-1.5 mr-1 ml-0.5 flex group-not-data-collapsed/draft:hidden">
                    {slots.btw.mark}
                  </span>
                )}
                <Words
                  editor={draft}
                  editing={t.editing}
                  onEdit={t.edit}
                  tapEdits={!t.expanded || (!t.smart && !t.dictating)}
                  oneLine={!t.expanded}
                  displace={t.displace}
                  swipes={{}}
                  onSwipeMove={() => {}}
                  className={cn(
                    // At most 40% of what is visible, so with the keyboard
                    // up, in a Drawer above it, the whole card still fits.
                    'max-h-[min(40dvh,calc(var(--visible-height,100dvh)*0.4),calc(8*1.75rem+0.75rem))] min-h-[calc(3*1.75rem+0.75rem)] px-1.5 py-1.5 text-base leading-7',
                    'group-data-collapsed/draft:max-h-7 group-data-collapsed/draft:min-h-7 group-data-collapsed/draft:py-0',
                  )}
                />
                <AnimatePresence>
                  {t.nudge !== null && (
                    <Nudge key="nudge" said={t.nudge.said} />
                  )}
                </AnimatePresence>
              </div>
              {slots.attachments !== null && (
                <div className="px-1 pb-1 [grid-area:files]">
                  {slots.attachments}
                </div>
              )}
              <Controls
                phase={t.phase}
                disabled={draft.disabled}
                recording={recording?._tag === 'Recording' ? recording : null}
                add={{
                  onSkill:
                    draft.textOnly || !skills.offered
                      ? null
                      : () => openPicker(() => skills.onOpen('touch', false)),
                  onPaste: slots.onPaste,
                  onFiles: draft.textOnly
                    ? null
                    : (files) => void draft.files.add(files),
                  onChooseMicrophone: draft.dictation.onChooseMicrophone,
                  btw: slots.btw,
                }}
                send={
                  t.phase === 'recording'
                    ? {
                        label: 'Stop and send',
                        shown: true,
                        disabled: slots.blocked,
                        busy: false,
                        onSend: t.takeAndSend,
                      }
                    : {
                        label: slots.label,
                        shown: draft.filled || slots.starting,
                        disabled: !t.canSend || t.phase === 'transcribing',
                        busy: slots.starting || state._tag === 'Sending',
                        onSend: draft.send,
                      }
                }
                stop={slots.stop}
                onDictate={t.dictate}
                onTake={t.take}
                onRetry={t.retry}
                onCancel={t.cancel}
              />
              {/* Skills' Sheet, opened from Add. */}
              {!draft.textOnly && (
                <Picker.Frame
                  how={skills.how}
                  typing={skills.typing}
                  mode="sheet"
                  label="Skills"
                >
                  {skills.picker}
                </Picker.Frame>
              )}
            </motion.div>
          </GestureZone>
        </div>
      </MotionConfig>
    );
  },
);

/** Gives `element` to the View's own ref and to the one its parent hands it. */
const both = (
  own: RefObject<HTMLDivElement | null>,
  given: Ref<never> | undefined,
  element: HTMLDivElement | null,
) => {
  own.current = element;
  const ref = given as Ref<HTMLDivElement | null> | undefined;
  if (typeof ref === 'function') ref(element);
  else if (ref !== undefined && ref !== null) ref.current = element;
};

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

export default TouchDraftView;
