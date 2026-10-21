import type { Project, Session } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kestack/web-platform/components/alert-dialog';
import { Button } from '@kestack/web-platform/components/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from '@kestack/web-platform/components/item';
import { Trash2Icon } from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages, router } from '../../../shared/pages/index.ts';
import { RunningDot } from '../running-dot/index.ts';
import { useSettled } from '../settled/index.ts';
import { ago } from '../time/index.ts';
import { NewSessionView } from './new-session/index.ts';
import { Folder, SessionView } from './session/index.ts';

/*
 * A project: the session open in it, or, with none open, the form that
 * starts one over its sessions, newest first. Removing it is last, set
 * apart, and asks first. Its name and path are in the header.
 */

export const ProjectView = View.make(
  Pages.ProjectLive,
  ({ root, model, props, children, send }) => {
    const found = useChild(children.project, ({ model }) => model);
    const rows = useChild(children.sessions, ({ model }) => model);
    const project = found?.rows[0]?.row as Project | undefined;
    const settled = useSettled();
    if (children.Session)
      return (
        <div {...root} className="flex min-h-0 flex-1 flex-col">
          <Folder value={project?.path ?? null}>
            <SessionView instance={children.Session} />
          </Folder>
        </div>
      );
    if (settled && found?.status === 'ready' && project === undefined)
      return (
        <div {...root} className="flex min-h-0 flex-1 flex-col">
          <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
            It may have been removed.{' '}
            <Router.Link
              to={router.Home()}
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Go to your projects
            </Router.Link>
          </p>
        </div>
      );
    const sessions = (rows?.rows ?? [])
      .map(({ row }) => row as Session)
      .sort((a, b) => b.createdAt - a.createdAt);
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 md:py-10">
            <section
              aria-labelledby="new-session"
              className="flex flex-col gap-3"
            >
              <h2 id="new-session" className="text-sm font-semibold">
                New session
              </h2>
              <NewSessionView instance={children.newSession} />
            </section>
            <section aria-labelledby="sessions" className="flex flex-col gap-3">
              <h2 id="sessions" className="text-sm font-semibold">
                Sessions
              </h2>
              {rows?.status !== 'ready' ||
              (sessions.length === 0 && !settled) ? (
                <div className="flex flex-col gap-2" aria-busy>
                  {['w-2/3', 'w-1/2', 'w-3/5'].map((width) => (
                    <div
                      key={width}
                      className="flex h-11 items-center rounded-lg border border-border px-3"
                    >
                      <Skeleton className={`h-3.5 ${width}`} />
                    </div>
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sessions yet. Write a first message above to start one.
                </p>
              ) : (
                <ItemGroup className="gap-2">
                  {sessions.map((session) => (
                    <Item
                      key={session.id}
                      role="listitem"
                      variant="outline"
                      size="sm"
                      render={
                        <Router.Link
                          to={router.Project.Session({
                            projectId: props.params.projectId,
                            sessionId: session.id,
                          })}
                        />
                      }
                    >
                      <ItemContent className="min-w-0">
                        <ItemTitle
                          className="w-full min-w-0"
                          title={session.title || undefined}
                        >
                          <span className="truncate">
                            {session.title || 'Untitled session'}
                          </span>
                          {session.status === 'running' && <RunningDot />}
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions className="text-xs text-muted-foreground tabular-nums">
                        {session.harness === 'claude' ? 'Claude' : 'Codex'} ·{' '}
                        {ago(session.createdAt)}
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </section>
            {project && (
              <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6">
                <p className="text-sm text-muted-foreground">
                  Removing the project keeps the folder and its files.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mx-2 text-muted-foreground hover:text-destructive sm:mx-0 sm:-mr-2"
                  onClick={() => send({ _tag: 'Confirm', open: true })}
                >
                  <Trash2Icon aria-hidden />
                  Remove project
                </Button>
              </section>
            )}
          </div>
        </div>
        <AlertDialog
          open={model.confirming}
          onOpenChange={(open) => send({ _tag: 'Confirm', open })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {project?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Its sessions leave this app. The folder and its files stay
                exactly as they are.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {model.problem && (
              <p role="alert" className="text-sm text-destructive">
                {model.problem}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={model.removing}>
                Keep it
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={model.removing}
                onClick={() => send({ _tag: 'Remove' })}
              >
                {model.removing && <Spinner />}
                Remove project
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);
