import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Typing a title, paced by coalesce. Every keystroke shows on screen at
 * once. The first is sent straight away; while it is in flight, the next
 * keystrokes wait as one change, each replacing the last. When the first
 * request is done, what waited goes as one request. Four keystrokes, two
 * requests. The two request rows and the waiting change keep their places
 * from the start, faded until they are needed, so nothing grows.
 */

type Request = {
  readonly title: string;
  readonly done: boolean;
};

type Step = {
  readonly typed: string;
  readonly requests: ReadonlyArray<Request>;
  readonly waiting?: string;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    typed: '',
    requests: [],
    caption: 'Someone is about to type a task’s title. Nothing has been sent.',
  },
  {
    typed: 'P',
    requests: [{ title: 'P', done: false }],
    caption: 'The first keystroke shows at once, and is sent to the Backend.',
  },
  {
    typed: 'Pl',
    requests: [{ title: 'P', done: false }],
    waiting: 'Pl',
    caption: 'While that request is in flight, the next keystroke waits.',
  },
  {
    typed: 'Plan',
    requests: [{ title: 'P', done: false }],
    waiting: 'Plan',
    caption:
      'Each new keystroke replaces the one waiting. The screen still shows every key.',
  },
  {
    typed: 'Plan',
    requests: [
      { title: 'P', done: true },
      { title: 'Plan', done: false },
    ],
    caption: 'The first request is done, so what waited goes as one request.',
  },
  {
    typed: 'Plan',
    requests: [
      { title: 'P', done: true },
      { title: 'Plan', done: true },
    ],
    caption: 'Four keystrokes, two requests, and the Backend ends with “Plan”.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

/** The two requests, as they look once both are sent. */
const SENT = ['P', 'Plan'];

export function CoalescePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const before = step > 0 ? STEPS[step - 1]! : undefined;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-sm space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              On screen
            </p>
            <div className="flex h-9 items-center rounded-lg border border-border bg-background px-3 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {now.typed}
              <span className="ml-px h-4 w-px animate-pulse bg-foreground motion-reduce:animate-none" />
            </div>
          </div>
          <div>
            <p className="mb-1.5 flex h-5 items-center justify-between text-[11px] font-medium text-muted-foreground">
              To the Backend
              <motion.span
                initial={false}
                animate={{ opacity: now.waiting ? 1 : 0 }}
                transition={now.waiting ? ENTER : EXIT}
                aria-hidden={!now.waiting}
                className={`rounded border border-dashed px-1.5 font-mono text-[10px] leading-4 font-normal transition-colors duration-300 ${now.waiting && now.waiting !== before?.waiting ? 'border-(--field-accent) text-(--field-accent)' : 'border-foreground/40'}`}
              >
                waiting: '{now.waiting ?? before?.waiting ?? 'Plan'}'
              </motion.span>
            </p>
            <ul className="space-y-1.5">
              {SENT.map((title, index) => {
                const request = now.requests[index];
                const was = before?.requests[index];
                const changed =
                  request !== undefined &&
                  (was === undefined || was.done !== request.done);
                return (
                  <motion.li
                    key={title}
                    initial={false}
                    animate={
                      request ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }
                    }
                    transition={request ? ENTER : EXIT}
                    aria-hidden={!request}
                    className="relative flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px]"
                  >
                    <span className="whitespace-nowrap">
                      update {'{'} title: '{title}' {'}'}
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {request?.done ? 'saved' : 'in flight…'}
                    </span>
                    <Flash at={changed ? round * 10 + step : undefined} />
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
