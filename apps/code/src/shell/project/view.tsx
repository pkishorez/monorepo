import { useChild, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  ArrowUpIcon,
  CircleAlertIcon,
  Trash2Icon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { keys } from '../../keys.ts';
import * as places from '../../places/index.ts';
import * as Confirm from '../../ui/confirm/index.ts';
import { useOffline } from '../connection/index.ts';
import {
  current,
  pickedHarness,
  pickedModel,
  ProjectLive,
  skillsOf,
} from './actor.ts';
import * as Catalog from './catalog/index.ts';
import { Composer, SkillPicker } from './composer/index.ts';
import { ModelPicker, Triggers } from './model-picker/index.ts';
import * as SessionPage from './session/index.ts';

/*
 * A project: the session open in it, or, with none open, a new one: the
 * first message and its files, pinned at the bottom, and under it the
 * agent and its model, and the agent's own settings, each at its default
 * until picked in the model Picker. An agent whose binary does not run is
 * greyed out there, saying why. Enter starts it, once the server is in
 * reach; what went wrong shows over the composer. Its sessions are in the
 * sidebar and the Session Switcher, not here. Removing the project sits
 * quietly above, and asks first. Its name and path are in the header.
 */

export const ProjectView = View.make(
  ProjectLive,
  ({ root, model, children, send }) => {
    const found = useChild(children.project, ({ model }) => model);
    const project = found?.rows[0]?.row;
    const offline = useOffline();
    if (children.Session)
      return (
        <div {...root} className="flex min-h-0 flex-1 flex-col">
          <SessionPage.Folder value={project?.path ?? null}>
            <SessionPage.View instance={children.Session} />
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
    const { picking } = model;
    const { removal } = model;
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 pb-6 sm:px-6">
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
          </div>
        </div>
        <section
          aria-label="New session"
          className="shrink-0 pt-2 pb-4 sm:pb-5"
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
            <Composer
              label="First message"
              placeholder="What should the agent do? Type / for skills"
              text={model.text}
              onTextChange={(text) => send({ _tag: 'Typed', text })}
              attachments={model.attachments}
              onAttachmentsChange={(attachments) =>
                send({ _tag: 'Attach', attachments })
              }
              onSubmit={() => {
                if (offline === null) send({ _tag: 'Start' });
              }}
              known={SkillPicker.known(skills)}
              skills={{
                how: picking?._tag === 'Skills' ? picking.how : null,
                offered: SkillPicker.offers(skills),
                onOpen: (how, at, typed) =>
                  send({
                    _tag: 'Open',
                    picking: { _tag: 'Skills', how, at, typed },
                  }),
                picker: children.skills && (
                  <SkillPicker.View instance={children.skills} />
                ),
              }}
              disabled={model.starting}
              describedBy={offline === null ? undefined : 'new-session-offline'}
              toolbar={
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
              }
              actions={
                <Button
                  type="submit"
                  size="sm"
                  aria-label="Start session"
                  disabled={
                    offline !== null ||
                    model.starting ||
                    chosen === null ||
                    unavailable !== null ||
                    (model.text.trim() === '' && model.attachments.length === 0)
                  }
                >
                  {model.starting ? <Spinner /> : <ArrowUpIcon aria-hidden />}
                  <span className="hidden @sm/composer:inline">
                    Start session
                  </span>
                </Button>
              }
            />
            {project && (
              <RemoveProject
                name={project.name}
                removal={removal}
                onConfirm={(open) => send({ _tag: 'Confirm', open })}
                onRemove={() => send({ _tag: 'Remove' })}
              />
            )}
          </div>
        </section>
      </div>
    );
  },
);

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
