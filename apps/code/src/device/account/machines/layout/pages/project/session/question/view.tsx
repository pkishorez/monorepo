import { View } from '@kestack/kabuki/react';
import { useDevice } from '@kestack/web-platform/ui/input';
import { use, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlertIcon } from 'lucide-react';
import { keys, useBound } from '../../../../commands.ts';
import { notify } from '../../../../../../../../ui/controls/notice/index.ts';
import { expandedOf, QuestionLive, shownOf } from './actor.ts';
import { isAnswered, draftOf } from './answer.ts';
import { Bar } from './bar.tsx';
import { Dialog } from './dialog/dialog.tsx';
import { Around } from './question.ts';

/*
 * The Question Panel, while the open Session's agent waits on an Agent
 * Question: drawn in the Draft's place, which it stands in for until the
 * question is answered, skipped, or its Turn ends, then the Draft comes
 * back as it was. It covers the page's content column only, never the
 * sidebar or the header, which work as ever while it waits.
 *
 * Expanded, it is a dialog of steps over the transcript, under the page's
 * header, drawn where the page says (`Around`), with the keys
 * (`dialog/`). Minimised, it is a bar where the Draft was (`bar.tsx`),
 * and the transcript is the page's again, by pointer, touch and keys.
 * Ctrl+Y toggles it in either Mode; `m` and Escape in it, its own button,
 * a click on the transcript behind it, or a swipe down minimise it; the
 * bar, or `m` or `i` in Vim Mode, which never reach the model Picker or
 * the Draft it stands in for, open it. Expanding by the user's ask takes
 * focus into it; a new question takes focus only from the page, never
 * from the sidebar; minimising gives it back to the page, and coming back
 * to the page while it is expanded goes into it. A refusal to take the
 * answer is said in a toast; a refusal to stop, over the bar.
 */

export const QuestionView = View.make(QuestionLive, ({ root, model, send }) => {
  const { place, agent, harness, stop, problem } = use(Around);
  const asker = { agent, harness };
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
  keys.useAction('content.questionAnywhere', toggle, on);
  // `m` and `i` open the question, never the model Picker or the Draft,
  // which are not drawn while it stands in for them.
  keys.useAction('content.model', toggle, on);
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
  // The keys that open it from where the user is: `m` in Vim Mode's
  // Normal Mode, else Ctrl+Y.
  const available = keys.useAvailableActions();
  const openKeys = useBound(
    available.some(({ id, shadowed }) => id === 'content.model' && !shadowed)
      ? 'content.model'
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
      {/* Gone while expanded, so nothing of it shows behind the dialog. */}
      <div
        inert={expanded}
        aria-hidden={expanded}
        className="transition-opacity duration-150 ease-out data-[hidden]:opacity-0 motion-reduce:transition-none"
        data-hidden={expanded ? '' : undefined}
      >
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
          asker={asker}
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
          <Dialog
            key={shown.id}
            question={shown}
            drafts={drafts}
            tried={model.tried.includes(shown.id)}
            sending={sending}
            touch={touch}
            asker={asker}
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
          />,
          place,
        )}
    </div>
  );
});

export default QuestionView;
