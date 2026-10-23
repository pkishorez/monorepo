import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  ArrowUpIcon,
  CircleAlertIcon,
  Trash2Icon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { keys, useBound } from '../../../keys.ts';
import * as places from '../../places/index.ts';
import * as Confirm from '../../../ui/confirm/index.ts';
import { OnMachine, useMachineId, useOffline } from '../../connection/index.ts';
import { Dictation } from '../../actors/dictation/index.ts';
import {
  current,
  pickedHarness,
  pickedModel,
  ProjectLive,
  skillsOf,
} from './actor.ts';
import * as Catalog from './catalog/index.ts';
import { Draft, SkillPicker, StatusLine, useDraft } from './draft/index.ts';
import { ModelPicker, Triggers } from './model-picker/index.ts';
import { Session as SessionPage } from './session/index.ts';

/*
 * A project: the session open in it, or, with none open, a new one: its
 * Draft where the first message goes, and in the Status Line under it the
 * agent and its model, and the agent's own settings, each at its default
 * until picked in the model Picker. An agent whose binary does not run is
 * greyed out there, saying why. Sending the Draft starts it, once the
 * server is in reach; what went wrong shows over the Status Line. Its
 * sessions are in the sidebar and the Session Switcher, not here.
 * Removing the project sits quietly above, and asks first. Its name and
 * path are in the header.
 */

const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

/**
 * The project on its Machine, with the Machine handed to every View under
 * it; a Machine the Backend no longer lists says so in its place.
 */
export const ProjectView = View.make(ProjectLive, (self) => (
  <OnMachine value={self.props.params.machineId}>
    {self.model.gone ? (
      <div {...self.root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
          This Machine is not one of yours any more: it was forgotten, or you
          are signed in as someone else.{' '}
          <Router.Link to={places.home()} className={link}>
            Go to your projects
          </Router.Link>
        </p>
      </div>
    ) : (
      <ProjectScreen {...self} />
    )}
  </OnMachine>
));

function ProjectScreen({ root, model, props, children, send }: Self) {
  const machineId = useMachineId();
  const found = useChild(children.project, ({ model }) => model);
  const project = found?.rows[0]?.row;
  const offline = useOffline(machineId);
  if (children.Session)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <SessionPage.Folder value={project?.path ?? null}>
          <SessionPage.view instance={children.Session} />
        </SessionPage.Folder>
      </div>
    );
  // A project missing is believed only once the server has answered.
  if (found?.caughtUp === true && project === undefined)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
          It may have been removed.{' '}
          <Router.Link
            to={places.home()}
            className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Go to your projects
          </Router.Link>
        </p>
      </div>
    );
  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col">
      <NewSession
        model={model}
        children={children}
        send={send}
        project={project ?? null}
        offline={offline}
        target={{
          machineId,
          projectId: props.params.projectId,
          sessionId: null,
        }}
      />
    </div>
  );
}

type Self = ViewProps<typeof ProjectLive>;

/**
 * A new session: its own component, so its Draft's keys are given only
 * while no session is open over it.
 */
function NewSession({
  model,
  children,
  send,
  project,
  offline,
  target,
}: Pick<Self, 'model' | 'children' | 'send'> & {
  readonly project: { readonly name: string; readonly path: string } | null;
  readonly offline: string | null;
  /** This Draft, as a Dictation names where its text goes. */
  readonly target: Parameters<typeof Dictation.useDictation>[0];
}) {
  const dictation = Dictation.useDictation(target);
  const harness = pickedHarness(model);
  const chosen = pickedModel(model);
  const models = Catalog.modelsOf(model.catalog, harness?.name ?? null);
  const skills = skillsOf(model);
  const unavailable =
    harness?.available === false
      ? (harness.unavailableReason ?? 'This agent cannot run on this machine')
      : null;
  const problem =
    model.problem ??
    model.catalog.problem ??
    models?.problem ??
    unavailable ??
    null;
  const { picking, removal } = model;
  const draft = useDraft({
    label: 'First message',
    placeholder: 'What should the agent do? Type / for skills',
    text: model.text,
    onTextChange: (text) => send({ _tag: 'Typed', text }),
    attachments: model.attachments,
    onAttachmentsChange: (attachments) => send({ _tag: 'Attach', attachments }),
    insert: model.insert,
    onInsert: (what) => send({ _tag: 'Insert', what }),
    onSend: () => {
      if (offline === null) send({ _tag: 'Start' });
    },
    known: SkillPicker.known(skills),
    skills: {
      how: picking?._tag === 'Skills' ? picking.how : null,
      offered: SkillPicker.offers(skills),
      onOpen: (how, typed) =>
        send({ _tag: 'Open', picking: { _tag: 'Skills', how, typed } }),
      picker: children.skills && (
        <SkillPicker.View instance={children.skills} />
      ),
    },
    dictation,
    disabled: model.starting,
    ...(offline === null ? {} : { describedBy: 'new-session-offline' }),
  });
  const startKeys = useBound('content.send');
  return (
    <>
      <div
        ref={draft.page}
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto outline-none"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 pt-8 pb-6 sm:px-6">
          <h2 className="text-lg font-semibold">New session</h2>
          <p className="text-sm text-muted-foreground">
            Write the first message to start one
            {project ? (
              <>
                {' '}
                in <span className="font-mono text-xs">{project.path}</span>
              </>
            ) : null}
            .
          </p>
          {project && (
            <RemoveProject
              name={project.name}
              removal={removal}
              onConfirm={(open) => send({ _tag: 'Confirm', open })}
              onRemove={() => send({ _tag: 'Remove' })}
            />
          )}
        </div>
      </div>
      <section
        aria-label="New session"
        className="relative shrink-0 bg-background pt-2 pb-3 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 sm:px-6">
          {offline !== null && (
            <p
              id="new-session-offline"
              className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
            >
              <WifiOffIcon
                aria-hidden
                className="size-3.5 shrink-0 text-warning"
              />
              {offline} to the server. You can start once it is back.
            </p>
          )}
          {problem !== null && (
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
              {(model.catalog.problem !== null || models?.problem) && (
                <Button
                  variant="link"
                  size="xs"
                  type="button"
                  onClick={() => send({ _tag: 'Retry' })}
                >
                  Try again
                </Button>
              )}
            </p>
          )}
          <Draft draft={draft}>
            <StatusLine
              draft={draft}
              actions={
                <Button
                  type="button"
                  size="sm"
                  aria-label="Start session"
                  title={
                    startKeys === null
                      ? 'Start session'
                      : `Start session (${startKeys})`
                  }
                  disabled={
                    offline !== null ||
                    model.starting ||
                    chosen === null ||
                    unavailable !== null ||
                    !draft.filled
                  }
                  onClick={draft.send}
                >
                  {model.starting ? <Spinner /> : <ArrowUpIcon aria-hidden />}
                  <span className="hidden @sm/status:inline">
                    Start session
                  </span>
                </Button>
              }
            >
              <Triggers
                catalog={model.catalog}
                current={current(model)}
                started={false}
                how={picking?._tag === 'Model' ? picking : null}
                onOpen={(at, how) =>
                  send({ _tag: 'Open', picking: { _tag: 'Model', how, at } })
                }
              >
                {children.models && (
                  <ModelPicker.View instance={children.models} />
                )}
              </Triggers>
            </StatusLine>
          </Draft>
        </div>
      </section>
    </>
  );
}

/**
 * Removing the project, asked first. The button is a Focus Spot of the
 * page, so leaving the question, kept, puts focus back on it.
 */
function RemoveProject({
  name,
  removal,
  onConfirm,
  onRemove,
}: {
  readonly name: string;
  readonly removal: {
    readonly confirming: boolean;
    readonly removing: boolean;
    readonly problem: string | null;
  };
  readonly onConfirm: (open: boolean) => void;
  readonly onRemove: () => void;
}) {
  const open = Confirm.useOpen();
  const spot = keys.useFocusSpot('content', 'remove project');
  return (
    <div className="flex justify-end">
      <Button
        ref={spot}
        variant="ghost"
        size="xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => open(() => onConfirm(true))}
      >
        <Trash2Icon aria-hidden />
        Remove project
      </Button>
      <Confirm.Dialog
        open={removal.confirming}
        title={`Remove ${name}?`}
        description="Its sessions leave this app. The folder and its files stay exactly as they are."
        problem={removal.problem}
        busy={removal.removing}
        keep="Keep it"
        confirm="Remove project"
        onClose={() => onConfirm(false)}
        onConfirm={onRemove}
      />
    </div>
  );
}
