import { View, useChild } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { ViewProps } from '@kestack/kabuki/react/view';
import { Button } from '@kestack/web-platform/ui/components/button';
import { FolderXIcon, Trash2Icon } from 'lucide-react';
import {
  type ComponentProps,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { keys } from '../../frame/commands.ts';
import * as routes from '../../../app.ts';
import * as Notice from '../../../../ui/controls/notice/index.ts';
import { GUTTERED, useGutter } from '../../../../ui/page/gutter/index.ts';
import { Path, tilde } from '../../../../ui/labels/path/index.ts';
import { PageConnection } from '../../connection/link/index.ts';
import { placeIn, ProjectLive, readyOf } from './actor.ts';
import { Draft } from './draft/index.ts';
import { Session as SessionPage } from './session/index.ts';
import { useHeld } from './held.ts';

/*
 * A project: the session open in it (`session/`), or, with none open, a
 * new one (`NewSession`, below), its Draft (`draft/`) where the first
 * message goes. Its sessions are in the
 * sidebar and the Session Switcher, not here.
 * Its name and path head a new session, and are in the header. A project
 * whose folder is missing says so above the Draft, with Remove beside it,
 * the one place a project is removed, asked first, and starts no new
 * session; its
 * sessions stay readable. Its words and its Draft are drawn in one step,
 * once its row and the Saved Draft are read (`readyOf`); `ProjectReady`
 * says so once, before the frame is first drawn. A session its Draft started
 * is drawn once it can be drawn whole, or waited for long enough, its
 * Draft and Starting until then (`HandingOver`). A move to another Session,
 * as by `[` and `]`, keeps the one before on screen until the next can be
 * drawn whole, never a blank page between (`held.ts`).
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
          <Router.Link
            to={routes.home(routes.accountIn(self.props.route.params))}
            className={link}
          >
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
        <HeldSession
          session={children.Session}
          folder={project?.path ?? null}
        />
      </div>
    );
  // Until the Store is read, nothing; a project it does not hold is not
  // known until the server answers, so nothing then either: its words
  // and its folder are drawn in one step, never filled in later,
  // and with its Draft, once its Saved Draft is read back. Meanwhile it
  // says it is loading, once the wait is long enough to see.
  if (
    !readyOf({
      unlisted: false,
      found: found && { status: found.status, held: project !== undefined },
      session: undefined,
      restored,
    }) ||
    (project === undefined && !found?.caughtUp)
  )
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-4xl px-6 py-10">
          <Notice.Loading>Loading project…</Notice.Loading>
        </div>
      </div>
    );
  // A project missing is believed only once the server has answered.
  if (project === undefined)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <p className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-muted-foreground">
          It may have been removed.{' '}
          <Router.Link
            to={routes.home(routes.accountIn(props.route.params))}
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

/**
 * The Session open, drawn once it can be drawn whole: a move to another,
 * as by `[` and `]`, keeps the one before on screen until then (`held.ts`),
 * reading the next meanwhile.
 */
function HeldSession({
  session,
  folder,
}: {
  readonly session: NonNullable<Self['children']['Session']>;
  readonly folder: string | null;
}) {
  const ready = useChild(session, ({ model }) => model.ready) === true;
  const shown = useHeld(session, ready);
  return (
    <>
      {shown !== session && (
        <Suspense fallback={null}>
          <SessionPage.ready instance={session} />
        </Suspense>
      )}
      <SessionPage.Folder value={folder}>
        <SessionPage.view instance={shown} />
      </SessionPage.Folder>
    </>
  );
}

/** No Instance: what a Hook reads while a Child is absent. */
const NONE = { id: '' };

/**
 * Draws nothing: says, for the place in it the app first loads at, that
 * the project can be drawn whole there, read from this device, its row and
 * its new session's Saved Draft, or the Session open, so the frame is first
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
 * A new session (`NewSession`); a project whose folder is missing says
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
  const open = Notice.useOpen();
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
      <Notice.Dialog
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

/*
 * A new session on the project's page, while no session is open: where it
 * will work, over the Draft at its foot, which starts it. The project's
 * name heads it, its folder under it, then the place where the Draft
 * draws its branch and New Worktree switch; once sent, its Starting in
 * that same place, the heading staying, until the Session's page is drawn
 * instead. The place keeps their room while the branches are read, so
 * nothing moves as they come. The page is the content's default Focus
 * Spot. The project page adds why no session can start, which blocks the
 * Draft, in place of the branch.
 */

type Instance = ComponentProps<typeof Draft.view>['instance'];

/** No Draft: what a Hook reads while it is absent. */
const NO_DRAFT = NONE as Instance;

/** A new session: where it will work, over its Draft. */
export function NewSession({
  name,
  path,
  about,
  blocked,
  draft,
}: {
  /** The project's name and folder, once known. */
  readonly name: string | null;
  readonly path: string | null;
  /** In place of the branch, such as why no session can start; nothing given (or `false`), the branch. */
  readonly about?: ReactNode;
  /** Nothing can be sent, as `about` says. */
  readonly blocked: boolean;
  /** The project's new session Draft, while there is one. */
  readonly draft: Instance | undefined;
}) {
  const starting = useChild(draft ?? NO_DRAFT, ({ model }) => model.starting);
  const page = keys.useFocusSpot('content', 'page', { default: true });
  // Where the Draft draws the branch.
  const [where, setWhere] = useState<HTMLElement | null>(null);
  // The Draft sits under the words, inset by the room their scrollbar keeps.
  const gutter = useGutter();
  const shown = draft && starting;
  return (
    <>
      <div
        ref={page}
        tabIndex={-1}
        className={`relative flex min-h-0 flex-1 flex-col justify-end overflow-y-auto outline-none ${GUTTERED}`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-8 pb-6 sm:px-6">
          <header className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {name ?? 'New session'}
            </h2>
            {path !== null && (
              <p className="flex min-w-0 text-xs text-muted-foreground">
                <Path value={tilde(path)} />
              </p>
            )}
          </header>
          {about || (
            // One place: the branch, then Starting over it, the room of the
            // branch kept, so neither the heading nor the Draft moves.
            <div className="grid *:[grid-area:1/1]">
              <Reserve />
              <div
                ref={setWhere}
                inert={!!shown}
                data-starting={shown ? '' : undefined}
                className="transition-opacity duration-150 ease-in data-starting:opacity-0 motion-reduce:transition-none"
              />
              {shown && (
                <div className="animate-in duration-200 ease-out fade-in-0 motion-reduce:animate-none">
                  <Draft.Starting starting={shown} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <section
        aria-label="New session"
        style={{ paddingInline: gutter }}
        className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent has-[[data-slot=draft][data-touch]]:pb-0"
      >
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 has-[[data-slot=draft][data-touch]]:px-0">
          {draft && (
            <Draft.Slots value={{ blocked, where: blocked ? null : where }}>
              <Draft.view instance={draft} />
            </Draft.Slots>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * The room of the branch's two rows, drawn unseen, so the place is as tall
 * at every Text Size before the branches are read as after. The New
 * Worktree row keeps two lines for what it says, which wraps on a phone
 * once switched on, so switching it moves nothing either.
 */
function Reserve() {
  return (
    <div aria-hidden className="invisible -mx-3 flex flex-col gap-0.5">
      {[1, 2].map((lines) => (
        <div key={lines} className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-medium">·</span>
          <span className="text-sm">
            ·{lines === 2 && <br />}
            {lines === 2 && '·'}
          </span>
        </div>
      ))}
    </div>
  );
}
