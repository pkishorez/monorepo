import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Trash2Icon } from '@kestack/web-platform/ui/components/lucide';
import { keys } from '../../../keys.ts';
import * as routes from '../../routes/index.ts';
import * as Confirm from '../../../ui/confirm/index.ts';
import { PageMachine } from '../../machines/index.ts';
import { ProjectLive } from './actor.ts';
import { Draft } from './draft/index.ts';
import { DraftFor, FolderMissing } from './missing.tsx';
import { Session as SessionPage } from './session/index.ts';
import { NewSessionBody } from './starter/index.ts';

/*
 * A project: the session open in it, or, with none open, a new one, its
 * Draft (`draft/`) where the first message goes. Its sessions are in the
 * sidebar and the Session Switcher, not here.
 * Removing the project sits quietly above, and asks first. Its name and
 * path are in the header. A project whose folder is missing says so above
 * the Draft, with Remove beside it, and starts no new session; its
 * sessions stay readable.
 */

const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

/**
 * The project on its Machine, with the Machine handed to every View under
 * it; a Machine Cloud Connect no longer lists says so in its place.
 */
export const ProjectView = View.make(ProjectLive, (self) => (
  <PageMachine value={self.props.params.machineId}>
    {self.model.gone ? (
      <div {...self.root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
          This Machine is not one of yours any more: it was forgotten, or you
          are signed in as someone else.{' '}
          <Router.Link to={routes.home()} className={link}>
            Go to your projects
          </Router.Link>
        </p>
      </div>
    ) : (
      <ProjectScreen {...self} />
    )}
  </PageMachine>
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
            to={routes.home()}
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
  readonly project: {
    readonly name: string;
    readonly path: string;
    readonly folder: 'present' | 'missing';
  } | null;
}) {
  const page = keys.useFocusSpot('content', 'page', { default: true });
  const missing = project?.folder === 'missing';
  const remove = project && (
    <RemoveProject
      name={project.name}
      missing={missing}
      removal={model.removal}
      onConfirm={(open) => send({ _tag: 'ConfirmToggled', open })}
      onRemove={() => send({ _tag: 'RemoveAsked' })}
    />
  );
  return (
    <NewSessionBody
      path={project?.path ?? null}
      page={page}
      about={missing && <FolderMissing path={project.path} remove={remove} />}
      extra={!missing && remove}
      draft={
        children.draft && (
          <DraftFor missing={missing}>
            <Draft.view instance={children.draft} />
          </DraftFor>
        )
      }
    />
  );
}

/**
 * Removing the project, asked first. The button is a Focus Spot of the
 * page, so leaving the question, kept, puts focus back on it.
 */
function RemoveProject({
  name,
  missing,
  removal,
  onConfirm,
  onRemove,
}: {
  readonly name: string;
  /** Its folder is missing: Remove is the way on, so it is not quiet. */
  readonly missing: boolean;
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
    <div className={missing ? 'shrink-0' : 'flex justify-end'}>
      <Button
        ref={spot}
        variant={missing ? 'outline' : 'ghost'}
        size={missing ? 'sm' : 'xs'}
        className={
          missing
            ? 'h-11 text-destructive keyboard:h-8'
            : 'text-muted-foreground hover:text-destructive'
        }
        onClick={() => open(() => onConfirm(true))}
      >
        <Trash2Icon aria-hidden />
        Remove project
      </Button>
      <Confirm.Dialog
        open={removal.confirming}
        title={`Remove ${name}?`}
        description={
          missing
            ? 'Its sessions leave this app.'
            : 'Its sessions leave this app. The folder and its files stay exactly as they are.'
        }
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
