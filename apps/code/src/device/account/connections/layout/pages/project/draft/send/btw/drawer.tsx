import { SWIPE_DISMISS } from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CopyIcon,
  XIcon,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValueEvent,
} from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useBound } from '../../../../../commands.ts';
import { notify } from '../../../../../../../../../ui/controls/notice/index.ts';
import { AgentLogo } from '../../../../../../../../../ui/labels/agent/index.ts';
import type { Asked, Drawer } from '../../actor.ts';
import type { Answerer } from '../../draft.ts';
import { BtwMark, useToggleKeys } from './btw.tsx';

/*
 * The Btw Drawer: the latest Btw and its answer, read only, drawn by the
 * Draft over its own top edge, so the transcript stays where it was.
 *
 * Expanded, it rises from behind the Draft's card over the foot of the
 * transcript: its head says who answers and how it stands, with Copy
 * once answered, Minimise and Close; under it the question, then the
 * answer as the transcript draws words, scrolling inside it. On touch it
 * is a sheet, edge to edge, its grabber's swipe down minimising it.
 * Minimised, it is one bar on the Draft: the question, how it stands,
 * Open and Close. Closed, the Btw and its answer go; nothing of them is
 * kept. The transcript is never covered whole nor dimmed: it scrolls and
 * is read as ever while the drawer is up.
 */

const COPIED_MS = 1500;
// As the transcript draws the agent's words: inline code a quiet chip,
// without the backticks prose adds.
const PROSE =
  'prose-sm max-w-none text-sm leading-6 prose-p:my-1.5 prose-pre:my-2 prose-pre:overflow-x-auto prose-code:rounded-[4px] prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.85em] prose-code:font-normal prose-code:break-words prose-code:before:content-none prose-code:after:content-none';
const RISE = [0.32, 0.72, 0, 1] as const;
const FALL = [0.4, 0, 1, 1] as const;

type Shown = {
  readonly asked: typeof Asked.Type | null;
  /** On a device with no keyboard: a sheet, and a bar a finger tall. */
  readonly touch: boolean;
  readonly onShow: (drawer: typeof Drawer.Type) => void;
  readonly onClose: () => void;
};

/** The drawer expanded, drawn in the box of the Draft's card. */
export function BtwDrawer({
  asked,
  answerer,
  touch,
  onShow,
  onClose,
}: Shown & { readonly answerer: Answerer | null }) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false}>
        {asked?.drawer === 'Expanded' && (
          <Expanded
            key={asked.id}
            asked={asked}
            answerer={answerer}
            touch={touch}
            onMinimise={() => onShow('Minimised')}
            onClose={onClose}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/**
 * The drawer minimised, drawn over the Draft's card: gone at once as it
 * expands, so the drawer rises from where the card's top edge stays.
 */
export function BtwBar({ asked, touch, onShow, onClose }: Shown) {
  if (asked === null || asked.drawer === 'Expanded') return null;
  return (
    <MotionConfig reducedMotion="user">
      <Bar
        asked={asked}
        touch={touch}
        onOpen={() => onShow('Expanded')}
        onClose={onClose}
      />
    </MotionConfig>
  );
}

/** How it stands: being answered, answered, or failed. */
const standing = (asked: typeof Asked.Type) =>
  asked.problem !== null
    ? 'failed'
    : asked.answer === null
      ? 'answering'
      : 'answered';

function Expanded({
  asked,
  answerer,
  touch,
  onMinimise,
  onClose,
}: {
  readonly asked: typeof Asked.Type;
  readonly answerer: Answerer | null;
  readonly touch: boolean;
  readonly onMinimise: () => void;
  readonly onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const minimiseKeys = useBound('content.close');
  const stands = standing(asked);
  const agent = answerer?.agent ?? 'The agent';
  return (
    <motion.section
      aria-label="By the way"
      data-slot="btw-drawer"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: RISE } }}
      exit={{ opacity: 0, y: 24, transition: { duration: 0.16, ease: FALL } }}
      className={cn(
        // Its foot tucked behind the Draft's card, which is drawn after it,
        // so it reads as coming out from under the Draft.
        'absolute inset-x-0 flex flex-col',
        touch
          ? 'bottom-[calc(100%-1.75rem)] max-h-[calc(var(--visible-height,100dvh)*0.58)]'
          : 'bottom-[calc(100%-0.875rem)] max-h-[min(36rem,58dvh)]',
      )}
    >
      <div
        ref={sheet}
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden border border-b-0 border-btw/25 bg-dialog text-popover-foreground shadow-[0_-1px_2px_rgb(0_0_0/0.04),0_-8px_24px_rgb(0_0_0/0.08),0_-24px_48px_rgb(0_0_0/0.06)] transition-[translate] duration-200 ease-out motion-reduce:transition-none',
          touch
            ? 'rounded-t-[1.375rem] border-x-0 pb-7'
            : 'mx-2 rounded-t-xl pb-3.5',
        )}
      >
        <Head sheet={sheet} touch={touch} onMinimise={onMinimise}>
          {touch && (
            <span
              aria-hidden
              className="mx-auto mb-1 h-1 w-9 rounded-full bg-muted-foreground/30"
            />
          )}
          <div className="flex min-h-8 items-center gap-2">
            <BtwMark />
            <h2 className="shrink-0 text-sm font-medium">By the way</h2>
            <span
              role="status"
              className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground"
            >
              {answerer?.harness != null && (
                <AgentLogo agent={answerer.harness} className="size-3.5" />
              )}
              {stands === 'answering'
                ? `${agent} is answering…`
                : stands === 'answered'
                  ? `${agent} answered`
                  : 'No answer'}
            </span>
            <span className="flex-1" />
            {asked.answer !== null && <Copy answer={asked.answer} />}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Minimise"
              title={
                minimiseKeys === null
                  ? 'Minimise'
                  : `Minimise (${minimiseKeys})`
              }
              onClick={onMinimise}
              className="text-muted-foreground pointer-coarse:size-11"
            >
              <ChevronDownIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              title="Close: the question and its answer go"
              onClick={onClose}
              className="-mr-1.5 text-muted-foreground pointer-coarse:size-11"
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        </Head>
        <div
          className={cn(
            'flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-2 select-text',
            touch ? 'px-5' : 'px-4',
          )}
        >
          <p className="border-l-2 border-btw/50 pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {asked.question}
          </p>
          <div aria-live="polite" aria-busy={stands === 'answering'}>
            {stands === 'answering' ? (
              <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                <Spinner className="size-3.5" />
                Asking {answerer?.agent ?? 'the agent'}, without interrupting
                it…
              </p>
            ) : stands === 'failed' ? (
              <p
                role="alert"
                className="flex items-start gap-2 text-sm text-destructive"
              >
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>Could not get an answer. {asked.problem}</span>
              </p>
            ) : (
              <MarkdownViewer className={PROSE}>
                {asked.answer ?? ''}
              </MarkdownViewer>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/**
 * The drawer's head: on touch, where a swipe down minimises it. The sheet
 * follows the finger with no transition; let go past the Touch Layers'
 * `SWIPE_DISMISS`, as a Drawer is, it minimises; short, it springs back.
 */
function Head({
  sheet,
  touch,
  onMinimise,
  children,
}: {
  readonly sheet: RefObject<HTMLElement | null>;
  readonly touch: boolean;
  readonly onMinimise: () => void;
  readonly children: ReactNode;
}) {
  const className = cn(
    'flex shrink-0 flex-col pt-2 pb-2',
    touch ? 'touch-none px-4 select-none' : 'pr-2 pl-4',
  );
  if (!touch) return <div className={className}>{children}</div>;
  return (
    <GestureProvider>
      <GestureZone trapped className={className}>
        <Following sheet={sheet} onMinimise={onMinimise} />
        {children}
      </GestureZone>
    </GestureProvider>
  );
}

function Following({
  sheet,
  onMinimise,
}: {
  readonly sheet: RefObject<HTMLElement | null>;
  readonly onMinimise: () => void;
}) {
  /** Down by `offset` px, at once; at 0, back to its own place and motion. */
  const move = (offset: number) => {
    const element = sheet.current;
    if (element === null) return;
    element.style.transition = offset === 0 ? '' : 'none';
    element.style.translate = offset === 0 ? '' : `0 ${offset}px`;
  };
  const swipe = useSwipe({
    direction: 'down',
    commit: SWIPE_DISMISS,
    onCommit: () => {
      move(0);
      onMinimise();
    },
    onCancel: () => move(0),
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => {
    if (swipe.state === 'tracking' || offset > 0) move(offset);
  });
  return null;
}

/** Copies the answer, says so for a moment, and quietly when it may not. */
function Copy({ answer }: { readonly answer: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? 'Copied' : 'Copy the answer'}
      title={copied ? 'Copied' : 'Copy the answer'}
      onClick={() => {
        void navigator.clipboard.writeText(answer).then(
          () => setCopied(true),
          () =>
            notify({
              title: "Couldn't copy",
              description: 'Allow Code to use the clipboard, then try again.',
              seconds: 4,
            }),
        );
      }}
      className="text-muted-foreground pointer-coarse:size-11"
    >
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
    </Button>
  );
}

/**
 * The drawer minimised: one bar on the Draft, the question and how it
 * stands, which opens it, then Open, naming its keys, and Close.
 */
function Bar({
  asked,
  touch,
  onOpen,
  onClose,
}: {
  readonly asked: typeof Asked.Type;
  readonly touch: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}) {
  const openKeys = useToggleKeys();
  const stands = standing(asked);
  return (
    <motion.div
      data-slot="btw-bar"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: RISE } }}
      className={cn(
        'flex items-center gap-1 rounded-full border border-btw/25 bg-background py-1 pr-1 pl-1.5 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.05)]',
        touch ? 'mx-3 min-h-12' : 'mx-2',
      )}
    >
      {/* The words open it too; Open is the one the keys name. */}
      <button
        type="button"
        tabIndex={-1}
        onClick={onOpen}
        className="focus-ring flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full pl-0.5 text-left pointer-coarse:min-h-10"
      >
        <BtwMark />
        <span className="min-w-0 flex-1 truncate">{asked.question}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {stands === 'answering' ? (
            <>
              <Spinner className="size-3" />
              <span className="max-sm:hidden">Answering</span>
            </>
          ) : stands === 'answered' ? (
            <>
              <span aria-hidden className="size-1.5 rounded-full bg-btw" />
              Answered
            </>
          ) : (
            <span className="text-destructive">No answer</span>
          )}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={
          openKeys === null
            ? 'Open the answer'
            : `Open the answer (${openKeys})`
        }
        onClick={onOpen}
        aria-label="Open the answer"
        className="gap-1 rounded-full text-muted-foreground keyboard:h-7 max-sm:w-9 max-sm:px-0 pointer-coarse:h-11 pointer-coarse:px-3 max-sm:pointer-coarse:w-11 max-sm:pointer-coarse:px-0"
      >
        <ChevronUpIcon aria-hidden />
        {/* On a phone's width the chevron alone, so the question has room. */}
        <span className="max-sm:hidden">Open</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        title="Close: the question and its answer go"
        onClick={onClose}
        className="rounded-full text-muted-foreground keyboard:size-7 pointer-coarse:size-11"
      >
        <XIcon aria-hidden />
      </Button>
    </motion.div>
  );
}
