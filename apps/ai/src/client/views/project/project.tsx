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
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages, router } from '../../../shared/pages/index.ts';
import { PageBar } from '../page-bar/index.ts';
import { RunningDot } from '../running-dot/index.ts';
import { useSettled } from '../settled/index.ts';
import { ago } from '../time/index.ts';
import { NewSessionView } from './new-session/index.ts';
import { SessionView } from './session/index.ts';

/*
 * A project: the session open in it, or, with none open, the form that
 * starts one over its sessions, newest first. Removing it asks first.
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
          <SessionView instance={children.Session} />
        </div>
      );
    if (settled && found?.status === 'ready' && project === undefined)
      return (
        <div {...root} className="flex min-h-0 flex-1 flex-col">
          <PageBar title="Project not found" />
          <p className="p-6 text-sm text-muted-foreground">
            It may have been removed.{' '}
            <Router.Link
              to={router.Home()}
              className="text-foreground underline underline-offset-4"
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
        <PageBar
          title={project?.name ?? <Skeleton className="h-4 w-32" />}
          detail={project && <span className="font-mono">{project.path}</span>}
          actions={
            project && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => send({ _tag: 'Confirm', open: true })}
              >
                Remove
              </Button>
            )
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 py-10">
            <section
              aria-labelledby="new-session"
              className="flex flex-col gap-3"
            >
              <h2
                id="new-session"
                className="text-lg font-semibold tracking-tight"
              >
                New session
              </h2>
              <NewSessionView instance={children.newSession} />
            </section>
            <section aria-labelledby="sessions" className="flex flex-col gap-2">
              <h2
                id="sessions"
                className="text-sm font-medium text-muted-foreground"
              >
                Sessions
              </h2>
              {rows?.status !== 'ready' ||
              (sessions.length === 0 && !settled) ? (
                [0, 1, 2].map((key) => (
                  <Skeleton key={key} className="my-2 h-4 w-2/3" />
                ))
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sessions yet. Write a first message above to start one.
                </p>
              ) : (
                <ul className="-mx-3 flex flex-col">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <Router.Link
                        to={router.Project.Session({
                          projectId: props.params.projectId,
                          sessionId: session.id,
                        })}
                        className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {session.title || 'Untitled session'}
                        </span>
                        {session.status === 'running' && <RunningDot />}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {session.harness === 'claude' ? 'Claude' : 'Codex'} ·{' '}
                          {ago(session.createdAt)}
                        </span>
                      </Router.Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
