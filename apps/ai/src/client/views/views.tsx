import type { Project, Session } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { AppShell } from '@kestack/web-platform/recipes/frame';
import { Pages, router, type Route } from '../../shared/pages/index.ts';
import { ThemeToggle } from '../components/index.ts';
import { HomeView } from './home/index.ts';
import { PageBar } from './page-bar/index.ts';
import { ProjectView } from './project/index.ts';
import { Reached } from './settled/index.ts';
import { Places } from './sidebar/index.ts';

/*
 * The root page's View: the sidebar with every project and the open one's
 * sessions, the connection when it is not up, and the page the URL names.
 */

const CONNECTION = {
  connecting: 'Connecting to the server…',
  reconnecting: 'Reconnecting to the server…',
} as const;

export const AppView = View.make(Pages.AppLive, ({ root, model, children }) => {
  const { route } = useRouter<Route>();
  const projects = useChild(children.projects, ({ model }) => model);
  const sessions = useChild(children.sessions, ({ model }) => model.rows);
  return (
    <Reached value={model.reached}>
      <div {...root}>
        <AppShell
          sidebar={{
            width: 260,
            header: (
              <Router.Link
                to={router.Home()}
                className="flex h-8 items-center rounded-md px-2 text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                AI
              </Router.Link>
            ),
            content: (
              <Places
                route={route}
                projects={{
                  status: projects?.status ?? 'loading',
                  rows: (projects?.rows ?? []).map(({ row }) => row as Project),
                }}
                sessions={(sessions ?? []).map(({ row }) => row as Session)}
                addProject={children.addProject}
              />
            ),
            footer: (
              <div className="flex items-center justify-between gap-2 pl-2">
                {model.connection === 'connected' ? (
                  <span />
                ) : (
                  <span
                    role="status"
                    className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" />
                    <span className="truncate">
                      {CONNECTION[model.connection]}
                    </span>
                  </span>
                )}
                <ThemeToggle />
              </div>
            ),
          }}
        >
          <div className="flex h-full min-h-0 flex-col">
            {children.Home ? (
              <HomeView instance={children.Home} />
            ) : children.Project ? (
              <ProjectView instance={children.Project} />
            ) : (
              <>
                <PageBar title="Nothing here" />
                <p className="p-6 text-sm text-muted-foreground">
                  No page at this address.{' '}
                  <Router.Link
                    to={router.Home()}
                    className="text-foreground underline underline-offset-4"
                  >
                    Go to your projects
                  </Router.Link>
                </p>
              </>
            )}
          </div>
        </AppShell>
      </div>
    </Reached>
  );
});
