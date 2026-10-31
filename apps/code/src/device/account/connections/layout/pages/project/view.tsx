import { View, useChild } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { FolderXIcon, Trash2Icon } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
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
 * Its name and path head a new session, and are in the header. A project
 * whose folder is missing says so above the Draft, with Remove beside it,
 * the one place a project is removed, asked first, and starts no new
 * session; its
 * sessions stay readable. Its words and its Draft are drawn in one step,
 * once its row and the Saved Draft are read (`readyOf`); `ProjectReady`
 * says so once, before Layout is first drawn. A session its Draft started
 * is drawn once it can be drawn whole, or waited for long enough, its
 * Draft and Starting until then (`HandingOver`).
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

function ProjectScreen({ root, model, props, children, send }: Self) {
  const found = useChild(children.project, ({ model }) => model);
  const project = found?.rows[0]?.row;
  const restored = useChild(
    children.draft ?? (NONE as NonNullable<Self['children']['draft']>),
    ({ model }) => model.restored,
  );
  // A Session the Draft started: the Draft, and its Starting, until the
  // Session's page can be drawn whole.
  if (children.Session && children.draft)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <NewSessionOf
          model={model}
          children={children}
          send={send}
          project={project ?? null}
        />
        <HandingOver
          session={children.Session}
          at={placeIn(props.route.page)}
          send={send}
        />
      </div>
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
  // known until the server answers, so nothing then either: its words
  // and its folder are drawn in one step, never filled in later,
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

type Self = View.Props<typeof ProjectLive>;

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
 * Draws nothing: the Session a Draft started, read until it can be drawn
 * whole with its row held here, then said so, so the project page draws it
 * in the Draft's place: its row not synced yet is not drawn as missing.
 * A row that has not synced in `HANDOVER_WAIT` is waited for no more: the
 * Session's page takes over all the same, and says how its row stands.
 */
function HandingOver({
  session,
  at,
  send,
}: {
  readonly session: NonNullable<Self['children']['Session']>;
  readonly at: string;
  readonly send: Self['send'];
}) {
  const ready = useChild(session, ({ model }) => model.ready && model.held);
  useHandover(ready === true, () => send({ _tag: 'Ready', at }));
  return (
    <Suspense fallback={null}>
      <SessionPage.ready instance={session} />
    </Suspense>
  );
}

/** How long a Session handed over is waited for to be drawn whole, in ms. */
export const HANDOVER_WAIT = 10_000;

/**
 * Calls `drawn` once the Session handed over is `ready`, or once it has
 * been waited for `wait` ms, whichever comes first.
 */
export function useHandover(
  ready: boolean,
  drawn: () => void,
  wait = HANDOVER_WAIT,
) {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), wait);
    return () => clearTimeout(timer);
  }, [wait]);
  const due = ready || waited;
  useEffect(() => {
    if (due) drawn();
  }, [due]);
}

/**
 * A new session (`new-session/`); a project whose folder is missing says
 * so in place of its branch, with Remove beside it, and blocks its Draft.
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
  return (
    <NewSession
      name={project?.name ?? null}
      path={project?.path ?? null}
      about={
        missing && (
          <FolderMissing
            path={project.path}
            remove={
              <RemoveProject
                name={project.name}
                removal={model.removal}
                onConfirm={(open) => send({ _tag: 'ConfirmToggled', open })}
                onRemove={() => send({ _tag: 'RemoveAsked' })}
              />
            }
          />
        )
      }
      blocked={missing}
      draft={children.draft}
    />
  );
}

/**
 * Removing a project whose folder is missing, asked first. The button is
 * a Focus Spot of the page, so leaving the question, kept, puts focus
 * back on it.
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
    <div className="shrink-0">
      <Button
        ref={spot}
        variant="outline"
        size="sm"
        className="h-11 text-destructive keyboard:h-8"
        onClick={() => open(() => onConfirm(true))}
      >
        <Trash2Icon aria-hidden />
        Remove project
      </Button>
      <Confirm.Dialog
        open={removal.confirming}
        title={`Remove ${name}?`}
        description="Its sessions leave this app."
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
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center"
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
