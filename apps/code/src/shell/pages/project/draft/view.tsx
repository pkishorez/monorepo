import { View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useDevice } from '@kestack/web-platform/ui/input';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { keys, useBound } from '../../../../keys.ts';
import { Dictation } from '../../../actors/dictation/index.ts';
import { useOffline } from '../../../machines/index.ts';
import * as routes from '../../../routes/index.ts';
import { Catalog } from '../capabilities/index.ts';
import { DraftLive, modesOf } from './actor.ts';
import { AttachmentStrip } from './attachments/index.ts';
import { Card, PRIMARY, StatusLine, useDraft } from './card.tsx';
import type { Held } from './editor/index.ts';
import { DraftMode, type Composing, type Mode } from './mode/index.ts';
import { SideQuestion } from './side-question.tsx';
import { Chip, ModelPicker, Triggers } from './model-picker/index.ts';
import { current, pickedHarness, pickedModel, skillsOf } from './picks.ts';
import { SkillPicker } from './skills.ts';

/*
 * The Draft at the page's foot: the line that says why nothing can be
 * sent or what went wrong, the Draft's card, and under it the Status Line
 * with the model Picker's triggers and the send button, which takes the
 * mic's place once there is something to send. A new session's
 * says Start session; a Session's says Send, or Steer while the agent
 * runs. The card is drawn by the Draft Mode open (`mode/`), around its
 * own text, which its edits and sends go to; switched to, it takes focus
 * as the one before had it. In a Session, Ask on the side switches to
 * Side Question mode and back, as do Escape and the "Back to session"
 * over it: text only, no model Picker, and its send says Ask. The
 * question and its answer take the transcript's place, drawn where the
 * page says through `Slots`. What the page adds, such as a Session's
 * Stop, comes through `Slots` too. On a device with no keyboard it is the
 * Touch Draft (`mode/touch/`), with the model chip in place of the
 * triggers, and every send goes through it.
 */

/** What the page that holds the Draft adds to its foot. */
export const Slots = createContext<{
  /** Beside the send button, such as Stop. */
  readonly actions?: ReactNode;
  /** The page's own problem, shown where the Draft's would be. */
  readonly problem?: string | null;
  /** Where Side Question mode is drawn, in place of the transcript. */
  readonly sideQuestion?: HTMLElement | null;
}>({});

/**
 * Nothing until its Saved Draft is read back, so it never shows empty
 * before its text comes; then the Draft, drawn by `Drafting`.
 */
export const DraftView = View.make(DraftLive, (self) =>
  self.model.restored ? <Drafting {...self} /> : <div {...self.root} />,
);

/** The mode last drawn, and whether it was being written in, with focus. */
type Shown = RefObject<{
  readonly mode: Mode;
  readonly writing: boolean;
} | null>;

function Drafting(self: ViewProps<typeof DraftLive>) {
  const { root, model, props, children, send } = self;
  const { machineId, to } = props;
  const slots = use(Slots);
  const offline = useOffline(machineId);
  const fresh = to._tag === 'NewSession';
  const side = model.mode === 'SideQuestion';
  const asking = modesOf(props).includes('SideQuestion');
  const toggle = () =>
    send({ _tag: 'ModeAsked', mode: side ? 'Message' : 'SideQuestion' });
  const back = () => send({ _tag: 'ModeAsked', mode: 'Message' });
  keys.useAction('content.side', toggle, { enabled: asking });
  keys.useAction('content.sideAnywhere', toggle, { enabled: asking });
  keys.useAction('content.close', back, { enabled: side });
  const shown: Shown = useRef(null);
  // Each mode's editor, as it was left: the card is drawn anew per mode.
  const held = useRef<Held>(new Map()).current;
  const describedBy = fresh ? 'new-session-offline' : 'draft-offline';

  // A new session's agent cannot run, or its catalog cannot be read.
  const harness = fresh ? pickedHarness(model) : null;
  const models = fresh
    ? Catalog.modelsOf(model.catalog, harness?.account ?? null)
    : undefined;
  const unavailable =
    harness?.available === false
      ? (harness.unavailableReason ?? 'This agent cannot run on this machine')
      : null;
  const unread = fresh && (model.catalog.problem !== null || !!models?.problem);
  const problem =
    model.problem ??
    slots.problem ??
    (fresh
      ? (model.catalog.problem ?? models?.problem ?? unavailable ?? null)
      : null);
  // Nothing could be sent now, whatever the Draft holds.
  const unsendable =
    offline !== null ||
    (fresh &&
      (model.starting || pickedModel(model) === null || unavailable !== null));
  const open = children.modes.find((each) => each.key === model.mode);

  return (
    <div {...root} className="relative flex flex-col gap-2">
      {side &&
        slots.sideQuestion &&
        createPortal(
          <SideQuestion asked={model.asked} onBack={back} />,
          slots.sideQuestion,
        )}
      {offline !== null ? (
        <p
          id={describedBy}
          className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
        >
          <WifiOffIcon aria-hidden className="size-3.5 shrink-0 text-warning" />
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
                onClick={() => routes.openSettingsOn('Machines')}
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
      <DraftMode.Compose
        value={(composing) => (
          <Composer
            self={self}
            composing={composing}
            offline={offline !== null ? describedBy : null}
            unsendable={unsendable}
            onAsk={asking && !side ? toggle : null}
            onBack={back}
            shown={shown}
            held={held}
          />
        )}
      >
        {open && <DraftMode.view instance={open} />}
      </DraftMode.Compose>
    </div>
  );
}

/** The card of the mode open, around its own text, and its Status Line. */
function Composer({
  self: { model, props, children, send },
  composing,
  offline,
  unsendable,
  onAsk,
  onBack,
  shown,
  held,
}: {
  readonly self: ViewProps<typeof DraftLive>;
  readonly composing: Composing;
  /** The id of the line that says it is offline, while it is. */
  readonly offline: string | null;
  readonly unsendable: boolean;
  readonly onAsk: (() => void) | null;
  readonly onBack: () => void;
  readonly shown: Shown;
  readonly held: Held;
}) {
  const { machineId, projectId, to } = props;
  const { mode, written } = composing;
  const slots = use(Slots);
  const dictation = Dictation.useDictation({
    machineId,
    projectId,
    sessionId: to._tag === 'Session' ? to.sessionId : null,
  });
  const skills = skillsOf(model, props);
  const { picking } = model;
  const fresh = to._tag === 'NewSession';
  const side = mode === 'SideQuestion';
  const takes = DraftMode.takes(mode);
  const edit = (text: string, selection: { anchor: number; head: number }) =>
    composing.onEdit({ text, ...selection });
  const running = to._tag === 'Session' && to.running;
  const { keyboard } = useDevice();
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
        ? 'Ask about this session'
        : running
          ? 'Steer the agent while it works'
          : 'Reply to the agent',
    text: written.text,
    doc: mode,
    held,
    selection: written,
    onTextChange: (text, selection) => {
      edit(text, selection);
      if (model.problem !== null) send({ _tag: 'Retyped' });
    },
    onSelect: edit,
    ...(side
      ? { title: 'Side question', textOnly: true, onEscape: onBack }
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
      else composing.onSend();
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
    editing: composing.editing,
    ...(offline === null ? {} : { describedBy: offline }),
  });
  const sendKeys = useBound('content.send');

  // Switched to with a keyboard, it takes focus; written in, if the mode
  // before was.
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const before = shown.current;
    if (!keyboard || before === null || before.mode === mode) return;
    if (before.writing || !draft.vim) draft.write();
    else draft.view.current?.focus();
  }, []);
  // Read as it goes, while its editor is still on the page.
  useLayoutEffect(
    () => () => {
      const { view, writing } = latest.current;
      shown.current = {
        mode,
        writing: writing && (view.current?.hasFocus ?? false),
      };
    },
    [],
  );

  const label = fresh
    ? 'Start session'
    : side
      ? 'Ask'
      : running
        ? 'Steer'
        : 'Send';
  const title = sendKeys === null ? label : `${label} (${sendKeys})`;
  const blocked = unsendable || !draft.filled;

  return draft.touch ? (
    <DraftMode.Touch
      value={{
        draft,
        label,
        blocked: unsendable,
        starting: model.starting,
        actions: slots.actions,
        attachments:
          draft.attachments.length > 0 || draft.files.refused.length > 0 ? (
            <AttachmentStrip
              attachments={draft.attachments}
              refused={draft.files.refused}
              disabled={draft.disabled}
              onRemove={draft.files.remove}
            />
          ) : null,
        onAsk,
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
            onSet={(key, value) => send({ _tag: 'SettingChosen', key, value })}
          >
            {children.models && <ModelPicker.View instance={children.models} />}
          </Chip>
        ),
      }}
    >
      {composing.touch}
    </DraftMode.Touch>
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
            {children.models && <ModelPicker.View instance={children.models} />}
          </Triggers>
        )}
      </StatusLine>
    </Card>
  );
}
