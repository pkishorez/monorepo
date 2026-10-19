import { Effect, Schedule, Stream } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Api, Welcome } from '../../../shared/pages/index.ts';

/*
 * Welcome, as it behaves. It shows the pattern every page reuses for live
 * data: one Worker, written at the top so it runs for as long as the page
 * is on screen, follows a Console API stream through `Api.follow` and sends
 * each emission as a Message; the Model keeps the latest, and the View
 * draws it. Leaving the page stops the Worker, which closes the stream; an
 * Account Switch begins it again as the new member. A dropped stream is
 * followed again after a pause, so a page never silently stops updating.
 */

export const WelcomeLive = Page.build(Welcome, {
  init: () => ({ model: { member: null } }),
  workers: {
    member: {
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          yield* api
            .follow((client) => client['Session.watch']())
            .pipe(
              Stream.runForEach((member) =>
                self.send({ _tag: 'MemberSeen', member }),
              ),
            );
        }).pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie),
    },
  },
  on: {
    MemberSeen: ({ member }) => ({ model: { member } }),
  },
});

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The page while its member is on the way: shaped like it, so nothing moves when it comes. */
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

export const WelcomeView = View.make(WelcomeLive, ({ props, model, root }) => {
  // The live member once their User Space has spoken, as drawn until then.
  const member =
    model.member ??
    (props.status._tag === 'Ready' ? props.status.data.member : null);
  return (
    <section
      {...root}
      aria-labelledby="welcome-title"
      className="flex max-w-xl flex-col gap-6 py-16 sm:py-24"
    >
      {member === null ? (
        <WelcomeSkeleton />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h1
              id="welcome-title"
              className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Welcome, {firstName(member.name)}
            </h1>
            <p className="text-base text-pretty text-muted-foreground">
              Connect a GitHub account to deploy its Alchemy apps. Every push to
              your production branch redeploys, and every pull request gets a
              preview of its own.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Button size="lg" disabled aria-describedby="connect-github-soon">
              Connect GitHub
            </Button>
            <p
              id="connect-github-soon"
              className="text-sm text-muted-foreground"
            >
              Connecting GitHub arrives in the next release.
            </p>
          </div>
        </>
      )}
    </section>
  );
});
