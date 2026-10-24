import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { createContext, type ReactNode, use } from 'react';
import { keys, useBound } from '../../../../keys.ts';
import { Dictation } from '../../../actors/dictation/index.ts';
import { useOffline } from '../../../connection/index.ts';
import * as places from '../../../places/index.ts';
import * as Catalog from '../catalog/index.ts';
import {
  current,
  DraftLive,
  pickedHarness,
  pickedModel,
  skillsOf,
} from './actor.ts';
import { AskAnswer } from './ask.tsx';
import { btwQuestion } from './btw.ts';
import { Card, PRIMARY, StatusLine, useDraft } from './card.tsx';
import { ModelPicker, Triggers } from './model-picker/index.ts';
import { SkillPicker } from './skills.ts';

/*
 * The Draft at the page's foot: the line that says why nothing can be
 * sent or what went wrong, the Draft's card, and under it the Status Line
 * with the model Picker's triggers and the send button, which takes the
 * mic's place once there is something to send. A new session's
 * says Start session; a Session's says Send, Steer while the agent runs, or
 * Ask for a `/btw`, whose answer floats over it until Escape closes it.
 * What the page adds, such as a Session's Stop, comes through `Slots`.
 */

/** What the page that holds the Draft adds to its foot. */
export const Slots = createContext<{
  /** Beside the send button, such as Stop. */
  readonly actions?: ReactNode;
  /** The page's own problem, shown where the Draft's would be. */
  readonly problem?: string | null;
}>({});

export const DraftView = View.make(
  DraftLive,
  ({ root, model, props, children, send }) => {
    const { machineId, projectId, to } = props;
    const slots = use(Slots);
    const offline = useOffline(machineId);
    const dictation = Dictation.useDictation({
      machineId,
      projectId,
      sessionId: to._tag === 'Session' ? to.sessionId : null,
    });
    const skills = skillsOf(model, props);
    const { picking } = model;
    const fresh = to._tag === 'NewSession';
    const running = to._tag === 'Session' && to.running;
    const describedBy = fresh ? 'new-session-offline' : 'draft-offline';
    const draft = useDraft({
      label: fresh ? 'First message' : running ? 'Steer the agent' : 'Message',
      placeholder: fresh
        ? 'What should the agent do?'
        : running
          ? 'Steer the agent while it works'
          : 'Reply to the agent',
      text: model.text,
      onTextChange: (text) => send({ _tag: 'Typed', text }),
      attachments: model.attachments,
      onAttachmentsChange: (attachments) =>
        send({ _tag: 'AttachmentsChanged', attachments }),
      insert: model.insert,
      onInsert: (what) => send({ _tag: 'InsertAsked', what }),
      onSend: () => {
        if (offline === null) send({ _tag: 'SendAsked' });
      },
      known: SkillPicker.known(skills),
      skills: {
        how: picking?._tag === 'Skills' ? picking.how : null,
        offered: SkillPicker.offers(skills),
        onOpen: (how, typed) =>
          send({
            _tag: 'PickerOpened',
            picking: { _tag: 'Skills', how, typed },
          }),
        picker: children.skills && (
          <SkillPicker.View instance={children.skills} />
        ),
      },
      dictation,
      disabled: model.starting,
      ...(offline === null ? {} : { describedBy }),
    });
    keys.useAction('content.close', () => send({ _tag: 'AnswerDismissed' }), {
      enabled: model.asked !== null,
    });
    const sendKeys = useBound('content.send');

    // A new session's agent cannot run, or its catalog cannot be read.
    const harness = fresh ? pickedHarness(model) : null;
    const models = fresh
      ? Catalog.modelsOf(model.catalog, harness?.name ?? null)
      : undefined;
    const unavailable =
      harness?.available === false
        ? (harness.unavailableReason ?? 'This agent cannot run on this machine')
        : null;
    const unread =
      fresh && (model.catalog.problem !== null || !!models?.problem);
    const problem =
      model.problem ??
      slots.problem ??
      (fresh
        ? (model.catalog.problem ?? models?.problem ?? unavailable ?? null)
        : null);

    const label = fresh
      ? 'Start session'
      : btwQuestion(model.text) !== null
        ? 'Ask'
        : running
          ? 'Steer'
          : 'Send';
    const title = sendKeys === null ? label : `${label} (${sendKeys})`;
    const blocked =
      offline !== null ||
      !draft.filled ||
      (fresh &&
        (model.starting ||
          pickedModel(model) === null ||
          unavailable !== null));

    return (
      <div {...root} className="relative flex flex-col gap-2">
        {model.asked && (
          <AskAnswer
            key={model.asked.id}
            asked={model.asked}
            onDismiss={() => send({ _tag: 'AnswerDismissed' })}
          />
        )}
        {offline !== null ? (
          <p
            id={describedBy}
            className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
          >
            <WifiOffIcon
              aria-hidden
              className="size-3.5 shrink-0 text-warning"
            />
            {offline} to the server.{' '}
            {fresh
              ? 'You can start once it is back.'
              : 'Sending is paused until it is back.'}
          </p>
        ) : (
          problem !== null && (
            <p
              role="alert"
              className="flex items-center gap-2 px-1 text-sm text-destructive"
            >
              <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
              {problem}
              {problem === unavailable && (
                <Router.Link
                  to={places.settings()}
                  className="focus-ring shrink-0 rounded-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                  Open Settings
                </Router.Link>
              )}
              {unread && (
                <Button
                  variant="link"
                  size="xs"
                  type="button"
                  onClick={() => send({ _tag: 'CatalogRetryAsked' })}
                >
                  Try again
                </Button>
              )}
            </p>
          )
        )}
        <Card draft={draft}>
          <StatusLine
            draft={draft}
            actions={slots.actions}
            send={
              <Button
                type="button"
                size="icon"
                aria-label={label}
                title={title}
                disabled={blocked}
                onClick={draft.send}
                className={`${PRIMARY} @sm/status:w-auto @sm/status:px-3.5 pointer-coarse:@sm/status:w-auto`}
              >
                {model.starting ? <Spinner /> : <ArrowUpIcon aria-hidden />}
                <span className="hidden @sm/status:inline">{label}</span>
              </Button>
            }
          >
            <Triggers
              catalog={model.catalog}
              current={current(model, props)}
              started={!fresh}
              how={picking?._tag === 'Model' ? picking : null}
              onOpen={(at, how) =>
                send({
                  _tag: 'PickerOpened',
                  picking: { _tag: 'Model', how, at },
                })
              }
            >
              {children.models && (
                <ModelPicker.View instance={children.models} />
              )}
            </Triggers>
          </StatusLine>
        </Card>
      </div>
    );
  },
);
