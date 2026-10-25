import { useChild, useChildren, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useDevice } from '@kestack/web-platform/ui/input';
import { createContext, type ReactNode, use, useRef } from 'react';
import { createPortal } from 'react-dom';
import { keys, useBound } from '../../../../keys.ts';
import { Dictation } from '../../../actors/dictation/index.ts';
import { useOffline } from '../../../machines/index.ts';
import * as routes from '../../../routes/index.ts';
import { Catalog } from '../capabilities/index.ts';
import {
  current,
  DraftLive,
  modesOf,
  pickedHarness,
  pickedModel,
  skillsOf,
} from './actor.ts';
import { AttachmentStrip } from './attachments/index.ts';
import { Card, PRIMARY, StatusLine, useDraft } from './card.tsx';
import { DraftMode, type Mode, type Written } from './mode/index.ts';
import { SideQuestion } from './side-question.tsx';
import { Chip, ModelPicker, Triggers } from './model-picker/index.ts';
import { SkillPicker } from './skills.ts';
import { TouchDraft } from './touch/index.ts';

/*
 * The Draft at the page's foot: the line that says why nothing can be
 * sent or what went wrong, the Draft's card, and under it the Status Line
 * with the model Picker's triggers and the send button, which takes the
 * mic's place once there is something to send. A new session's
 * says Start session; a Session's says Send, or Steer while the agent
 * runs. Its one editor shows the Draft Mode open (`mode/`), and hands
 * each edit to that mode and to the Draft. In a Session, Ask on the side
 * switches to Side Question mode and back, as do Escape and the "Back to
 * session" over it: text only, no model Picker, and its send says Ask.
 * The question and its answer take the transcript's place, drawn where
 * the page says through `Slots`. What the page adds, such as a Session's
 * Stop, comes through `Slots` too. On a device with no keyboard it is the
 * Touch Draft (`touch/`), with the model chip in place of the triggers,
 * and every send goes through it.
 */

/** What the page that holds the Draft adds to its foot. */
export const Slots = createContext<{
  /** Beside the send button, such as Stop. */
  readonly actions?: ReactNode;
  /** The page's own problem, shown where the Draft's would be. */
  readonly problem?: string | null;
  /** Where Side Question mode is drawn, in place of the transcript. */
  readonly aside?: HTMLElement | null;
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
    // 6. Modes: the one open, as its Child holds it.
    const side = model.mode === 'SideQuestion';
    const asking = modesOf(props).includes('SideQuestion');
    const takes = DraftMode.takes(model.mode);
    const modes = useChildren(children.modes);
    const written =
      modes.find((each) => each.props.mode === model.mode)?.model.written ??
      model.written[model.mode];
    // Set by each mode's View: how an edit reaches it.
    const edits = useRef<Partial<Record<Mode, (written: Written) => void>>>({});
    const edit = (text: string, selection: Omit<Written, 'text'>) => {
      const next = { text, ...selection };
      edits.current[model.mode]?.(next);
      send({ _tag: 'Written', mode: model.mode, ...next });
    };
    const toggle = () =>
      send({ _tag: 'ModeAsked', mode: side ? 'Message' : 'SideQuestion' });
    const back = () => send({ _tag: 'ModeAsked', mode: 'Message' });
    const running = to._tag === 'Session' && to.running;
    const describedBy = fresh ? 'new-session-offline' : 'draft-offline';
    const { keyboard } = useDevice();
    const touchState = useChild(children.touch, ({ state }) => state._tag);
    // On touch, set by the Touch Draft's View: a send goes through it.
    const touchSend = useRef<(() => void) | null>(null);
    const draft = useDraft({
      label: fresh
        ? 'First message'
        : side
          ? 'Side question'
          : running
            ? 'Steer the agent'
            : 'Message',
      placeholder: fresh
        ? 'What should the agent do?'
        : side
          ? 'Ask about this session, without interrupting it'
          : running
            ? 'Steer the agent while it works'
            : 'Reply to the agent',
      text: written.text,
      doc: model.mode,
      selection: written,
      onTextChange: edit,
      onSelect: edit,
      ...(side
        ? { title: 'Side question', textOnly: true, onEscape: back }
        : {}),
      attachments: takes.files ? model.attachments : [],
      onAttachmentsChange: (attachments) => {
        if (takes.files) send({ _tag: 'AttachmentsChanged', attachments });
      },
      insert: model.insert,
      onInsert: (what) => send({ _tag: 'InsertAsked', what }),
      onSend: () => {
        if (offline !== null) return;
        if (!keyboard && touchSend.current !== null) touchSend.current();
        else send({ _tag: 'SendAsked' });
      },
      known: takes.skills ? SkillPicker.known(skills) : [],
      skills: {
        how: picking?._tag === 'Skills' ? picking.how : null,
        offered: takes.skills && SkillPicker.offers(skills),
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
      editing: touchState === 'Editing',
      ...(offline === null ? {} : { describedBy }),
    });
    keys.useAction('content.side', toggle, { enabled: asking });
    keys.useAction('content.sideAnywhere', toggle, { enabled: asking });
    keys.useAction('content.close', back, { enabled: side });
    const sendKeys = useBound('content.send');

    // A new session's agent cannot run, or its catalog cannot be read.
    const harness = fresh ? pickedHarness(model) : null;
    const models = fresh
      ? Catalog.modelsOf(model.catalog, harness?.account ?? null)
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
      : side
        ? 'Ask'
        : running
          ? 'Steer'
          : 'Send';
    const title = sendKeys === null ? label : `${label} (${sendKeys})`;
    // Nothing could be sent now, whatever the Draft holds.
    const unsendable =
      offline !== null ||
      (fresh &&
        (model.starting ||
          pickedModel(model) === null ||
          unavailable !== null));
    const blocked = unsendable || !draft.filled;

    return (
      <div {...root} className="relative flex flex-col gap-2">
        <DraftMode.Edits value={edits}>
          {children.modes.map((mode) => (
            <DraftMode.view key={mode.id} instance={mode} />
          ))}
        </DraftMode.Edits>
        {side &&
          slots.aside &&
          createPortal(
            <SideQuestion asked={model.asked} onBack={back} />,
            slots.aside,
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
                  to={routes.settings()}
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
        {draft.touch ? (
          <TouchDraft.Touch
            value={{
              draft,
              label,
              blocked: unsendable,
              starting: model.starting,
              actions: slots.actions,
              attachments:
                draft.attachments.length > 0 ||
                draft.files.refused.length > 0 ? (
                  <AttachmentStrip
                    attachments={draft.attachments}
                    refused={draft.files.refused}
                    disabled={draft.disabled}
                    onRemove={draft.files.remove}
                  />
                ) : null,
              onAsk: asking && !side ? toggle : null,
              onPaste: (text) =>
                send({ _tag: 'InsertAsked', what: { _tag: 'Text', text } }),
              sending: touchSend,
              chip: takes.picks && (
                <Chip
                  catalog={model.catalog}
                  current={current(model, props)}
                  started={!fresh}
                  how={picking?._tag === 'Model' ? picking.how : null}
                  onOpen={(at) =>
                    send({
                      _tag: 'PickerOpened',
                      picking: { _tag: 'Model', how: 'touch', at },
                    })
                  }
                  onSet={(key, value) =>
                    send({ _tag: 'SettingChosen', key, value })
                  }
                >
                  {children.models && (
                    <ModelPicker.View instance={children.models} />
                  )}
                </Chip>
              ),
            }}
          >
            <TouchDraft.view instance={children.touch} />
          </TouchDraft.Touch>
        ) : (
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
              {takes.picks && (
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
              )}
            </StatusLine>
          </Card>
        )}
      </div>
    );
  },
);
