import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { FolderXIcon, Trash2Icon } from 'lucide-react';
import { Suspense, useEffect, type ReactNode } from 'react';
import { keys } from '../../commands.ts';
import * as routes from '../../../../../routes/index.ts';
import * as Confirm from '../../../../../../ui/controls/notice/index.ts';
import { PageConnection } from '../../../connection/link/index.ts';
import { placeIn, ProjectLive, readyOf } from './actor.ts';
import { Draft } from './draft/index.ts';
import { NewSession } from './new-session/index.ts';
import { Session as SessionPage } from './session/index.ts';

/*
 * A project: the session open in it (`session/`), or, with none open, a
 * new one (`new-session/`), its Draft (`draft/`) where the first message
 * goes. Its sessions are in the
 * sidebar and the Session Switcher, not here.
 * Removing the project sits quietly above, and asks first. Its name and
 * path are in the header. A project whose folder is missing says so above
 * the Draft, with Remove beside it, and starts no new session; its
 * sessions stay readable. Its words and its Draft are drawn in one step,
 * once its row and the Saved Draft are read (`readyOf`); `ProjectReady`
 * says so once, before Layout is first drawn.
 */

const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

/**
 * The project on its Connection, with the Connection handed to every View under
 * it; a Connection Cloud Connect no longer lists says so in its place.
 */
export const ProjectView = View.make(ProjectLive, (self) => (
  <PageConnection value={self.props.params.connectionId}>
    {self.model.gone ? (
      <div {...self.root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-muted-foreground">
          This Connection is not one of yours any more: it was forgotten, or you
          are signed in as someone else.{' '}
          <Router.Link to={routes.home()} className={link}>
            Go to your projects
          </Router.Link>
        </p>
      </div>
    ) : (
      <ProjectScreen {...self} />
    )}
  </PageConnection>
));

function ProjectScreen({ root, model, children, send }: Self) {
  const found = useChild(children.project, ({ model }) => model);
  const project = found?.rows[0]?.row;
  const restored = useChild(
    children.draft ?? (NONE as NonNullable<Self['children']['draft']>),
    ({ model }) => model.restored,
  );
  if (children.Session)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <SessionPage.Folder value={project?.path ?? null}>
          <SessionPage.view instance={children.Session} />
        </SessionPage.Folder>
      </div>
    );
  // Until the Store is read, nothing; a project it does not hold is not
  // known until the server answers, so nothing then either: its words,
  // its folder and Remove are drawn in one step, never filled in later,
  // and with its Draft, once its Saved Draft is read back.
  if (
    !readyOf({
      unlisted: false,
      found: found && { status: found.status, held: project !== undefined },
      session: undefined,
      restored,
    }) ||
    (project === undefined && !found?.caughtUp)
  )
    return <div {...root} className="flex min-h-0 flex-1 flex-col" />;
  // A project missing is believed only once the server has answered.
  if (project === undefined)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-muted-foreground">
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
      <NewSessionOf
        model={model}
        children={children}
        send={send}
        project={project ?? null}
      />
    </div>
  );
}

type Self = ViewProps<typeof ProjectLive>;

/** No Instance: what a Hook reads while a Child is absent. */
const NONE = { id: '' };

/**
 * Draws nothing: says, for the place in it the app first loads at, that
 * the project can be drawn whole there, read from this device, its row and
 * its new session's Saved Draft, or the Session open, so Layout is first
 * drawn whole.
 */
export const ProjectReady = View.make(
  ProjectLive,
  ({ model, props, children, send }) => {
    const found = useChild(children.project, ({ model }) => ({
      status: model.status,
      held: model.rows.length > 0,
    }));
    const restored = useChild(
      children.draft ?? (NONE as NonNullable<Self['children']['draft']>),
      ({ model }) => model.restored,
    );
    const session = useChild(
      children.Session ?? (NONE as NonNullable<Self['children']['Session']>),
      ({ model }) => model.ready,
    );
    const ready = readyOf({
      unlisted: model.unlisted,
      found,
      session: children.Session === undefined ? undefined : session === true,
      restored,
    });
    const at = placeIn(props.route.page);
    useEffect(() => {
      if (ready && model.ready !== at) send({ _tag: 'Ready', at });
    }, [ready, at, model.ready]);
    return (
      children.Session && (
        <Suspense fallback={null}>
          <SessionPage.ready instance={children.Session} />
        </Suspense>
      )
    );
  },
);

/**
 * A new session (`new-session/`), with Remove under its words; a project
 * whose folder is missing says so in their place, with Remove beside it,
 * and blocks its Draft.
 */
function NewSessionOf({
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
    <NewSession
      path={project?.path ?? null}
      about={missing && <FolderMissing path={project.path} remove={remove} />}
      extra={!missing && remove}
      blocked={missing}
      draft={children.draft}
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

/**
 * Why no new session can start here, with Remove beside it: the folder is
 * missing, as its Connection last found it. Its sessions stay readable.
 */
export function FolderMissing({
  path,
  remove,
}: {
  readonly path: string;
  readonly remove: ReactNode;
}) {
  return (
    <div
      role="status"
      className="mt-2 flex flex-col items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
        <FolderXIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          The folder <span className="font-mono text-xs">{path}</span> no longer
          exists. Put it back to start a new session here; its sessions stay
          readable.
        </span>
      </p>
      {remove}
    </div>
  );
}

export default ProjectView;
