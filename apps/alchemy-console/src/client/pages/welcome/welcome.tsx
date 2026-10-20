import { Effect, Schedule, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Api, Welcome } from '../../../shared/pages/index.ts';
import { GitHubReturnNotice, goInstall } from '../../connect-github/index.ts';
import { Projects, ProjectsSkeleton } from './projects.tsx';

/*
 * Welcome, as it behaves. It shows the pattern every page reuses for live
 * data: Workers, written at the top so they run for as long as the page is
 * on screen, follow Console API streams through `Api.follow` and send each
 * emission as a Message; the Model keeps the latest, and the View draws it.
 * Leaving the page stops the Workers, which closes the streams; an Account
 * Switch begins them again as the new member. A dropped stream is followed
 * again after a pause, so a page never silently stops updating.
 *
 * With no GitHub connection the one next step is Connect GitHub, which
 * leaves for GitHub's install page; with one, it is the member's projects,
 * each with its Production stage, or New project when there are none.
 */

const retried = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie);

const connect = Command.make('connect', {
  run: () =>
    goInstall('/').pipe(
      // The page is on its way to GitHub: nothing more to say.
      Effect.andThen(Effect.never),
      Effect.catch(({ message }) =>
        Effect.succeed({ _tag: 'ConnectFailed' as const, message }),
      ),
    ),
});

export const WelcomeLive = Page.build(Welcome, {
  init: () => ({
    model: {
      member: null,
      connections: null,
      projects: null,
      connecting: false,
      problem: null,
    },
  }),
  workers: {
    member: {
      run: (self) =>
        retried(
          Effect.gen(function* () {
            const api = yield* Api;
            yield* api
              .follow((client) => client['Session.watch']())
              .pipe(
                Stream.runForEach((member) =>
                  self.send({ _tag: 'MemberSeen', member }),
                ),
              );
          }),
        ),
    },
    projects: {
      run: (self) =>
        retried(
          Effect.gen(function* () {
            const api = yield* Api;
            yield* api
              .follow((client) => client['Projects.list']())
              .pipe(
                Stream.runForEach((projects) =>
                  self.send({ _tag: 'ProjectsSeen', projects }),
                ),
              );
          }),
        ),
    },
    connections: {
      run: (self) =>
        retried(
          Effect.gen(function* () {
            const api = yield* Api;
            yield* api
              .follow((client) => client['Connections.list']())
              .pipe(
                Stream.runForEach((connections) =>
                  self.send({ _tag: 'ConnectionsSeen', connections }),
                ),
              );
          }),
        ),
    },
  },
  on: {
    MemberSeen: ({ member }, { model }) => ({ model: { ...model, member } }),
    ProjectsSeen: ({ projects }, { model }) => ({
      model: { ...model, projects },
    }),
    ConnectionsSeen: ({ connections }, { model }) => ({
      model: { ...model, connections },
    }),
    ConnectChosen: (_, { model }) =>
      model.connecting
        ? {}
        : {
            model: { ...model, connecting: true, problem: null },
            command: connect(),
          },
    ConnectFailed: ({ message }, { model }) => ({
      model: { ...model, connecting: false, problem: message },
    }),
  },
});

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The page while its data is on the way: shaped like it, so nothing moves when it comes. */
function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-56 sm:h-10" />
        <Skeleton className="h-6 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

function ConnectGitHub({
  name,
  connecting,
  problem,
  onConnect,
}: {
  readonly name: string;
  readonly connecting: boolean;
  readonly problem: string | null;
  readonly onConnect: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1
          id="welcome-title"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          Welcome, {firstName(name)}
        </h1>
        <p className="text-base text-pretty text-muted-foreground">
          Connect a GitHub account to deploy its Alchemy apps. Every push to
          your production branch redeploys, and every pull request gets a
          preview of its own.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button
          size="lg"
          onClick={onConnect}
          disabled={connecting}
          aria-describedby={problem === null ? undefined : 'connect-problem'}
        >
          {connecting && <Spinner aria-hidden />}
          Connect GitHub
        </Button>
        {problem !== null && (
          <p
            id="connect-problem"
            role="alert"
            className="text-sm text-destructive"
          >
            {problem}
          </p>
        )}
      </div>
    </>
  );
}

export const WelcomeView = View.make(
  WelcomeLive,
  ({ props, model, send, root }) => {
    const drawn = props.status._tag === 'Ready' ? props.status.data : null;
    // The live word once the User Space has spoken, as drawn until then.
    const member = model.member ?? drawn?.member ?? null;
    const connections = model.connections ?? drawn?.connections ?? null;
    const projects = model.projects ?? drawn?.projects ?? null;
    return (
      <section
        {...root}
        aria-labelledby="welcome-title"
        className={`flex flex-col gap-6 ${connections?.length ? 'max-w-3xl py-10 sm:py-16' : 'max-w-xl py-16 sm:py-24'}`}
      >
        <GitHubReturnNotice github={props.query.github} />
        {member === null || connections === null ? (
          <WelcomeSkeleton />
        ) : connections.length > 0 && projects === null ? (
          <ProjectsSkeleton />
        ) : connections.length === 0 ? (
          <ConnectGitHub
            name={member.name}
            connecting={model.connecting}
            problem={model.problem}
            onConnect={() => send({ _tag: 'ConnectChosen' })}
          />
        ) : (
          <Projects projects={projects ?? []} />
        )}
      </section>
    );
  },
);
