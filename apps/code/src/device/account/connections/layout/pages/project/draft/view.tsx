import { View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ArrowUpIcon, CircleAlertIcon, WifiOffIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useDevice } from '@kestack/web-platform/ui/input';
import { type RefObject, use, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { keys, useBound } from '../../../commands.ts';
import { Voice } from '../../../../voice/index.ts';
import {
  useOffline,
  useOfflineSaid,
} from '../../../../connection/link/index.ts';
import * as routes from '../../../../../../routes/index.ts';
import * as Catalog from '../store.ts';
import { DraftLive, modesOf } from './actor.ts';
import { AttachmentStrip } from './write/attachments/index.ts';
import { Card, PRIMARY, StatusLine, useDraft } from './write/write.tsx';
import type { Held } from './write/editor/index.ts';
import { DraftMode, type Composing, type Mode } from './write/view.tsx';
import { SideQuestion, SideQuestionToggle } from './send/side-question.tsx';
import { Chip, ModelPicker, Triggers } from './pick/model/index.ts';
import {
  current,
  pickedBranch,
  pickedHarness,
  pickedModel,
  skillsOf,
} from './pick/pick.ts';
import { SkillPicker } from './pick/skills.ts';
import { BranchPicker, BranchTrigger } from './pick/branch/index.ts';
import { Slots } from './draft.ts';

/*
 * The Draft at the page's foot: the line that says why nothing can be
 * sent or what went wrong, the Draft's card, and under it the Status Line
 * with the model Picker's triggers and the send button, which takes the
 * mic's place once there is something to send. A new session's has the
 * Branch Picker's trigger and the New Worktree toggle beside the model,
 * for a Project that is a git repository, and says Start session; a
 * Session's says Send, or Steer while the agent runs. The card is drawn
 * by the Draft Mode open (`write/`), around its own text, which its edits
 * and sends go to; switched to, it takes focus as the one before had it. In a Session, the Side Question toggle beside
 * the model, or its keys, switches to Side Question mode and back, as do
 * Escape and the "Back to session" over it: text only, no model Picker,
 * and its send says Ask. The
 * question and its answer take the transcript's place, drawn where the
 * page says through `Slots`. What the page adds, such as a Session's
 * Stop, or that nothing can be sent, comes through `Slots` too. On a
 * device with no keyboard it is the Touch Draft (`write/touch/`), with
 * the toggle and the model chip in place of the triggers, and every send
 * goes through it.
 */

/**
 * Nothing until its Saved Draft is read back, so it never shows empty
 * before its text comes; then the Draft, drawn by `Drafting`.
 */
export const DraftView = View.make(DraftLive, (self) =>
  self.model.restored ? <Drafting {...self} /> : <div {...self.root} />,
);

/** The mode last drawn, and whether it was being written in, with focus. */
type LastMode = RefObject<{
  readonly mode: Mode;
  readonly writing: boolean;
} | null>;

/**
 * What the Draft is called, says while empty, and what its send says: a
 * new session's, a Side Question's, a running Session's, or a Session's.
 */
const wordingOf = (fresh: boolean, side: boolean, running: boolean) =>
  fresh
    ? {
        label: 'First message',
        placeholder: 'What should the agent do?',
        send: 'Start session',
      }
    : side
      ? {
          label: 'Side question',
          placeholder: 'Ask about this session',
          send: 'Ask',
        }
      : running
        ? {
            label: 'Steer the agent',
            placeholder: 'Steer the agent while it works',
            send: 'Steer',
          }
        : { label: 'Message', placeholder: 'Reply to the agent', send: 'Send' };

/**
 * Switched to with a keyboard, the mode takes focus, and is written in if
 * the one before was; as it goes, it says so in `last`, while its editor
 * is still on the page.
 */
function useHandOn(
  draft: ReturnType<typeof useDraft>,
  mode: Mode,
  last: LastMode,
  keyboard: boolean,
) {
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const before = last.current;
    if (!keyboard || before === null || before.mode === mode) return;
    if (before.writing || !draft.vim) draft.write();
    else draft.view.current?.focus();
  }, []);
  useLayoutEffect(
    () => () => {
      const { view, writing } = latest.current;
      last.current = {
        mode,
        writing: writing && (view.current?.hasFocus ?? false),
      };
    },
    [],
  );
}

function Drafting(self: ViewProps<typeof DraftLive>) {
  const { root, model, props, children, send } = self;
  const { connectionId, to } = props;
  const slots = use(Slots);
  const offline = useOffline(connectionId);
  // Said only once out of reach, never as its line first comes up, so
  // nothing moves as it does; nothing is sent meanwhile all the same.
  const said = useOfflineSaid(connectionId) && offline !== null;
  const fresh = to._tag === 'NewSession';
  const side = model.mode === 'SideQuestion';
  const asking = modesOf(props).includes('SideQuestion');
  const toggle = () =>
    send({ _tag: 'ModeAsked', mode: side ? 'Message' : 'SideQuestion' });
  const back = () => send({ _tag: 'ModeAsked', mode: 'Message' });
  keys.useAction('content.side', toggle, { enabled: asking });
  keys.useAction('content.sideAnywhere', toggle, { enabled: asking });
  keys.useAction('content.close', back, { enabled: side });
  const last: LastMode = useRef(null);
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
      ? (harness.unavailableReason ??
        'This agent cannot run on this connection')
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
    slots.blocked === true ||
    (fresh &&
      (model.starting !== null ||
        pickedModel(model) === null ||
        pickedBranch(model) === null ||
        unavailable !== null));
  const open = children.modes.find((each) => each.key === model.mode);

  return (
    <div {...root} className="relative flex flex-col gap-2">
      {side &&
        slots.sideQuestion &&
        createPortal(
          <SideQuestion asked={model.asked} onBack={back} />,
          slots.sideQuestion,
        )}
      {said ? (
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
                onClick={() => routes.openSettingsOn('Connections')}
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
            offline={offline !== null}
            describedBy={said ? describedBy : null}
            unsendable={unsendable}
            onBack={back}
            onSide={asking ? toggle : null}
            last={last}
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
  describedBy,
  unsendable,
  onBack,
  onSide,
  last,
  held,
}: {
  readonly self: ViewProps<typeof DraftLive>;
  readonly composing: Composing;
  /** Its Connection is out of reach: nothing is sent. */
  readonly offline: boolean;
  /** The id of the line that says it is offline, while it says so. */
  readonly describedBy: string | null;
  readonly unsendable: boolean;
  readonly onBack: () => void;
  /** Switches Side Question mode on and off, in a Session's Draft only. */
  readonly onSide: (() => void) | null;
  readonly last: LastMode;
  readonly held: Held;
}) {
  const { connectionId, to } = props;
  const { mode, written } = composing;
  const slots = use(Slots);
  const dictation = Voice.useDictation(connectionId);
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
  const wording = wordingOf(fresh, side, running);
  const draft = useDraft({
    label: wording.label,
    placeholder: wording.placeholder,
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
      if (offline || slots.blocked === true) return;
      if (!keyboard && touchSend.current !== null) touchSend.current();
      else composing.onSend();
    },
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
    disabled: model.starting !== null,
    editing: composing.editing,
    ...(describedBy === null ? {} : { describedBy }),
  });
  const sendKeys = useBound('content.send');
  useHandOn(draft, mode, last, keyboard);

  const sideToggle = onSide !== null && (
    <SideQuestionToggle on={side} onToggle={onSide} />
  );
  // A new session's branch, beside its model.
  const branch = fresh && takes.picks && (
    <BranchTrigger
      branches={model.branches}
      picked={model.branch}
      newWorktree={model.newWorktree}
      how={picking?._tag === 'Branch' ? picking.how : null}
      onOpen={(how) =>
        send({ _tag: 'PickerOpened', picking: { _tag: 'Branch', how } })
      }
      onToggle={() => send({ _tag: 'NewWorktreeToggled' })}
    >
      {children.branches && <BranchPicker.View instance={children.branches} />}
    </BranchTrigger>
  );
  const label = wording.send;
  const title = sendKeys === null ? label : `${label} (${sendKeys})`;
  const blocked = unsendable || !draft.filled;

  return draft.touch ? (
    composing.touch({
      draft,
      label,
      blocked: unsendable,
      starting: model.starting !== null,
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
      onPaste: (text) =>
        send({ _tag: 'InsertAsked', what: { _tag: 'Text', text } }),
      sending: touchSend,
      chip: (
        <>
          {sideToggle}
          {takes.picks && (
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
          )}
          {branch}
        </>
      ),
    })
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
            {model.starting !== null ? (
              <Spinner />
            ) : (
              <ArrowUpIcon aria-hidden />
            )}
            <span className="hidden @sm/status:inline">{label}</span>
          </Button>
        }
      >
        {sideToggle}
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
        {branch}
      </StatusLine>
    </Card>
  );
}

export default DraftView;
