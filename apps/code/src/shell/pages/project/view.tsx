import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Trash2Icon } from '@kestack/web-platform/components/lucide';
import { keys } from '../../../keys.ts';
import * as places from '../../places/index.ts';
import * as Confirm from '../../../ui/confirm/index.ts';
import { OnMachine } from '../../connection/index.ts';
import { ProjectLive } from './actor.ts';
import { Draft } from './draft/index.ts';
import { Session as SessionPage } from './session/index.ts';

/*
 * A project: the session open in it, or, with none open, a new one, its
 * Draft (`draft/`) where the first message goes. Its sessions are in the
 * sidebar and the Session Switcher, not here.
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

function ProjectScreen({ root, model, children, send }: Self) {
  const found = useChild(children.project, ({ model }) => model);
  const project = found?.rows[0]?.row;
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
      />
    </div>
  );
}

type Self = ViewProps<typeof ProjectLive>;

/**
 * A new session: the page over its Draft, with how to start one and
 * Remove; the Draft at its foot starts it.
 */
function NewSession({
  model,
  children,
  send,
  project,
}: Pick<Self, 'model' | 'children' | 'send'> & {
  readonly project: { readonly name: string; readonly path: string } | null;
}) {
  const page = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <>
      <div
        ref={page}
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
              removal={model.removal}
              onConfirm={(open) => send({ _tag: 'ConfirmToggled', open })}
              onRemove={() => send({ _tag: 'RemoveAsked' })}
            />
          )}
        </div>
      </div>
      <section
        aria-label="New session"
        className="relative shrink-0 bg-background pt-2 pb-3 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent"
      >
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          {children.draft && <Draft.view instance={children.draft} />}
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
