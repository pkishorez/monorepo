import { View } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useDevice } from '@kestack/web-platform/ui/input';
import { use, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlertIcon } from 'lucide-react';
import { keys, useBound } from '../../../../commands.ts';
import { notify } from '../../../../../../../../ui/controls/notice/index.ts';
import { expandedOf, QuestionLive, shownOf } from './actor.ts';
import { isAnswered, draftOf } from './answer.ts';
import { Bar } from './bar.tsx';
import { Form } from './form.tsx';
import { Around } from './question.ts';

/*
 * The Question Panel, while the open Session's agent waits on an Agent
 * Question: drawn in the Draft's place, which it stands in for until the
 * question is answered, skipped, or its Turn ends, then the Draft comes
 * back as it was. It covers the page's content column only, never the
 * sidebar or the header, which work as ever while it waits.
 *
 * Expanded, it covers the transcript, under the page's header, drawn
 * where the page says (`Around`), and has the keys (`form.tsx`).
 * Minimised, it is a bar where the Draft was (`bar.tsx`), and the
 * transcript is the page's again, by pointer, touch and keys. Ctrl+Y, or
 * `y` in Vim Mode, toggles it, its own button or a swipe down minimises
 * it, and the bar, or `i`, which never reaches the hidden Draft, opens it.
 * Expanding by the user's ask takes focus into it; a new question takes
 * focus only from the page, never from the sidebar; minimising gives it
 * back to the page, and coming back to the page while it is expanded goes
 * into it. It moves in and out quickly, by transform and opacity
 * alone, not at all when motion is reduced. A refusal to take the answer
 * is said in a toast; a refusal to stop, over the bar.
 */

export const QuestionView = View.make(QuestionLive, ({ root, model, send }) => {
  const { place, agent, stop, problem } = use(Around);
  const shown = shownOf(model);
  const expanded = expandedOf(model);
  const { keyboard } = useDevice();
  const touch = !keyboard;
  const keyboardNow = keys.useKeyboard();
  const { enter } = keyboardNow;
  /** Whether the user is in it now, where its taking leaves them. */
  const inIt = useRef(false);
  inIt.current = keyboardNow.active === 'question';
  /** The user asked for it to expand, so it takes focus. */
  const asked = useRef(false);
  /** Back to the page, focus too, as the panel lets go of it. */
  const toPage = () => {
    const now = document.activeElement;
    if (now instanceof HTMLElement && place?.contains(now) === true) now.blur();
    enter('content');
  };
  /** Minimising: the page it hands the keys to is no way back into it. */
  const leaving = useRef(false);
  const minimise = () => {
    leaving.current = true;
    if (inIt.current) toPage();
    send({ _tag: 'Minimised' });
  };
  const expand = () => {
    asked.current = true;
    send({ _tag: 'Expanded' });
  };
  /** Focus is the page's, or nobody's: the panel may take it. */
  const claim = () => {
    const wanted = asked.current;
    asked.current = false;
    const now = document.activeElement;
    return (
      wanted ||
      now === null ||
      now === document.body ||
      place?.parentElement?.contains(now) === true
    );
  };
  const toggle = () => (expanded ? minimise() : expand());
  const on = { enabled: shown !== null };
  keys.useAction('content.question', toggle, on);
  keys.useAction('content.questionAnywhere', toggle, on);
  // `i` opens the question, never the Draft it stands in for.
  keys.useAction('content.write', expand, on);
  // Back to the page while it covers the transcript, as by `l` or Ctrl+L
  // from the sidebar: the keys go into it, never to the transcript under
  // it, which takes no focus.
  const onPage = keyboardNow.active === 'content';
  useEffect(() => {
    if (!expanded) leaving.current = false;
    else if (onPage && !leaving.current) enter('question');
  }, [onPage, expanded]);
  // Answered, skipped or gone with focus in it: focus back to the page.
  const id = shown?.id ?? null;
  useEffect(
    () => () => {
      if (inIt.current) toPage();
    },
    [id],
  );
  const { refused } = model;
  useEffect(() => {
    if (refused === null) return;
    notify({ title: 'Your answer was not sent', description: refused.reason });
  }, [refused?.n]);
  // The keys that open it from where the user is: `y` in Vim Mode's
  // Normal Mode, else Ctrl+Y.
  const available = keys.useAvailableActions();
  const openKeys = useBound(
    available.some(({ id, shadowed }) => id === 'content.question' && !shadowed)
      ? 'content.question'
      : 'content.questionAnywhere',
  );
  if (shown === null) return <div {...root} hidden />;
  const sending =
    model.sending !== null && model.sending.questionId === shown.id
      ? { declining: model.sending.declining }
      : null;
  const drafts = model.drafts[shown.id];
  const answered = shown.items.filter((item) =>
    isAnswered(item, draftOf(drafts, item)),
  ).length;
  return (
    <div {...root}>
      <div inert={expanded} aria-hidden={expanded}>
        {/* Why a stop was refused, where the Draft would have said it. */}
        {problem !== null && (
          <p
            role="alert"
            className="mb-2 flex items-center gap-1.5 text-xs text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {problem}
          </p>
        )}
        <Bar
          question={shown}
          answered={answered}
          agent={agent}
          sending={sending}
          stop={stop}
          touch={touch}
          openKeys={keyboard ? openKeys : null}
          onOpen={expand}
          onDecline={() => send({ _tag: 'DeclineAsked' })}
        />
      </div>
      {place !== null &&
        createPortal(
          <div
            inert={!expanded}
            aria-hidden={!expanded}
            data-expanded={expanded ? '' : undefined}
            className={cn(
              'absolute inset-x-0 bottom-0 z-20 flex flex-col',
              touch ? 'top-3' : 'top-0 bg-background',
              // Out: down a little and gone; in: up into place.
              'pointer-events-none translate-y-3 opacity-0 transition-[opacity,translate] duration-150 ease-in',
              'data-expanded:pointer-events-auto data-expanded:translate-y-0 data-expanded:opacity-100 data-expanded:duration-200 data-expanded:ease-[cubic-bezier(0.32,0.72,0,1)]',
              'motion-reduce:translate-y-0 motion-reduce:transition-none',
            )}
          >
            <Form
              key={shown.id}
              question={shown}
              drafts={drafts}
              tried={model.tried.includes(shown.id)}
              sending={sending}
              touch={touch}
              agent={agent}
              stop={stop}
              expanded={expanded}
              claim={claim}
              onChoose={(itemId, label) =>
                send({ _tag: 'Chose', questionId: shown.id, itemId, label })
              }
              onChooseOther={(itemId) =>
                send({ _tag: 'ChoseOther', questionId: shown.id, itemId })
              }
              onType={(itemId, text) =>
                send({ _tag: 'Typed', questionId: shown.id, itemId, text })
              }
              onSend={() => send({ _tag: 'SendAsked' })}
              onDecline={() => send({ _tag: 'DeclineAsked' })}
              onMinimise={minimise}
            />
          </div>,
          place,
        )}
    </div>
  );
});

export default QuestionView;
