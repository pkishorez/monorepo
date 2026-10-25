import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import type { Route } from '../../routes/index.ts';
import { HeaderLive } from './actor.ts';
import { Model, Title } from './header.tsx';

/*
 * Where you are, as the header's title, and the open session's model:
 * drawn again only as the rows of the project and session open change.
 */

type Children = ViewProps<typeof HeaderLive>['children'];
type ProjectHandle = NonNullable<Children['project']>;
type SessionHandle = NonNullable<Children['session']>;

export const HeaderView = View.make(HeaderLive, ({ children }) => {
  const route = useRouter<Route>().route;
  if (children.project === undefined)
    return (
      <Title
        route={route}
        project={undefined}
        session={undefined}
        unknown={false}
      />
    );
  return (
    <ProjectTitle
      route={route}
      project={children.project}
      session={children.session}
    />
  );
});

function ProjectTitle({
  route,
  project,
  session,
}: {
  readonly route: Route;
  readonly project: ProjectHandle;
  readonly session: SessionHandle | undefined;
}) {
  const found = useChild(project, ({ model }) => model);
  const row = found?.rows[0]?.row;
  const unknown = (found?.neverSynced.length ?? 0) > 0;
  if (session === undefined)
    return (
      <Title
        route={route}
        project={row}
        session={undefined}
        unknown={unknown}
      />
    );
  return (
    <SessionTitle
      route={route}
      project={row}
      unknown={unknown}
      session={session}
    />
  );
}

function SessionTitle({
  route,
  project,
  unknown,
  session,
}: {
  readonly route: Route;
  readonly project: Parameters<typeof Title>[0]['project'];
  readonly unknown: boolean;
  readonly session: SessionHandle;
}) {
  const found = useChild(session, ({ model }) => model);
  return (
    <Title
      route={route}
      project={project}
      session={found?.rows[0]?.row}
      unknown={unknown || (found?.neverSynced.length ?? 0) > 0}
    />
  );
}

/** The open session's agent and model, beside the header's actions. */
export const HeaderModelView = View.make(HeaderLive, ({ children }) =>
  children.session === undefined ? null : (
    <SessionModel session={children.session} />
  ),
);

function SessionModel({ session }: { readonly session: SessionHandle }) {
  const found = useChild(session, ({ model }) => model);
  return <Model session={found?.rows[0]?.row} />;
}
