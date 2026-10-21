import type { Project, Session } from '@kestack/ai-toolkit/api';
import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { AppShell } from '@kestack/web-platform/recipes/frame';
import { Pages, router, type Route } from '../../shared/pages/index.ts';
import { ThemeToggle } from '../components/index.ts';
import {
  BackgroundJobsBubble,
  jobsBySession,
  Known,
} from './background-jobs/index.ts';
import { Brand, Model, Offline, SessionMenu, Title } from './header/index.ts';
import { HomeView } from './home/index.ts';
import { ProjectView } from './project/index.ts';
import { SettingsView } from './settings/index.ts';
import { Connection, Reached, useSettled } from './settled/index.ts';
import { Places, SettingsLink } from './sidebar/index.ts';

/*
 * The root page's View, in the Web Platform's App Shell: the sidebar with
 * every project and the open one's sessions, and Settings at its foot; the
 * header with where you are, the session's menu, the connection while it
 * is down, and the theme; the page the URL names; and over its top right,
 * the Background Jobs running, while any are.
 */

export const AppView = View.make(Pages.AppLive, ({ root, model, children }) => (
  <Reached value={model.reached}>
    <Connection value={model.connection}>
      <div {...root}>
        <Shell actors={children} />
      </div>
    </Connection>
  </Reached>
));

/** Inside the providers, so it can tell when the server has been reached. */
function Shell({
  actors: children,
}: {
  readonly actors: ViewProps<typeof Pages.AppLive>['children'];
}) {
  const { route } = useRouter<Route>();
  const settled = useSettled();
  const projects = useChild(children.projects, ({ model }) => model);
  const rows = useChild(children.sessions, ({ model }) => model.rows);
  const running = useChild(
    children.backgroundJobs,
    ({ model }) => model.sessions,
  );
  const sessions = (rows ?? []).map(({ row }) => row as Session);
  const projectRows =
    projects?.status === 'ready'
      ? projects.rows.map(({ row }) => row as Project)
      : null;
  const sessionId =
    route._tag === 'Project' ? route.page?.sessionId : undefined;
  return (
    <AppShell
      sidebar={{
        width: 260,
        header: <Brand />,
        content: (
          <Places
            route={route}
            projects={{
              status: projects?.status ?? 'loading',
              rows: projectRows ?? [],
            }}
            sessions={sessions}
            jobs={jobsBySession(running ?? [])}
            addProject={children.addProject}
          />
        ),
        footer: <SettingsLink route={route} />,
      }}
      header={{
        title: (
          <Title
            route={route}
            projects={projectRows}
            sessions={sessions}
            settled={settled}
          />
        ),
        actions: (
          <>
            <Model session={sessions.find(({ id }) => id === sessionId)} />
            <SessionMenu instance={children.sessionActions} />
            <Offline />
            <ThemeToggle />
          </>
        ),
      }}
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <Known value={{ projects: projectRows ?? [], sessions }}>
          <BackgroundJobsBubble instance={children.backgroundJobs} />
        </Known>
        {children.Home ? (
          <HomeView instance={children.Home} />
        ) : children.Project ? (
          <ProjectView instance={children.Project} />
        ) : children.Settings ? (
          <SettingsView instance={children.Settings} />
        ) : (
          <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
            Nothing lives at this address.{' '}
            <Router.Link
              to={router.Home()}
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Go to your projects
            </Router.Link>
          </p>
        )}
      </div>
    </AppShell>
  );
}
