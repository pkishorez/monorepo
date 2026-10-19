import { Effect, Schema } from 'effect';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kestack/web-platform/components/alert';
import { CircleAlertIcon } from '@kestack/web-platform/components/lucide';
import {
  GitHubReturn,
  type ReturnTo,
} from '../../shared/contracts/github/index.ts';
import { Api, Browser } from '../../shared/pages/index.ts';

/*
 * Connecting GitHub, as any screen starts it and hears how it went.
 *
 * - `goInstall`         asks the User Space for the App's install URL, with
 *                       a one-time state for this member, and leaves for it;
 *                       GitHub sends the browser back to `returnTo`;
 * - `GitHubReturnNotice` says what went wrong on the way back, from the
 *                       page's `?github=`, with what to do about it.
 */

/** Leaves for GitHub's install page; fails with words for the screen. */
export const goInstall = (returnTo: ReturnTo) =>
  Effect.gen(function* () {
    const url = yield* (yield* Api).call((client) =>
      client['Connections.installUrl']({ returnTo }),
    );
    yield* (yield* Browser).open(url);
  }).pipe(
    Effect.mapError(() => ({
      message:
        'Console couldn’t start connecting GitHub. Check your connection and try again.',
    })),
  );

const NOTICES: Record<
  Exclude<GitHubReturn, 'connected'>,
  { readonly title: string; readonly description: string }
> = {
  expired: {
    title: 'That GitHub connection wasn’t started here',
    description:
      'Start again from Connect GitHub, and finish on GitHub within the hour.',
  },
  taken: {
    title: 'Someone else connected that GitHub account',
    description:
      'Another Console user already connected it. Ask them to remove it from their Settings, then connect it again.',
  },
  'not-found': {
    title: 'GitHub didn’t find that installation',
    description:
      'It may have been uninstalled on the way. Connect GitHub again.',
  },
  unreachable: {
    title: 'Console couldn’t reach GitHub',
    description:
      'GitHub may be having trouble. Connect GitHub again in a moment.',
  },
  requested: {
    title: 'Waiting for an organization owner',
    description:
      'GitHub asked an owner to approve the install. Once they do, connect GitHub again.',
  },
};

const known = Schema.is(GitHubReturn);

/** What went wrong coming back from GitHub, when `github` says something did. */
export function GitHubReturnNotice({
  github,
}: {
  readonly github: string | undefined;
}) {
  if (github === undefined || !known(github) || github === 'connected')
    return null;
  const { title, description } = NOTICES[github];
  return (
    <Alert variant={github === 'requested' ? 'default' : 'destructive'}>
      <CircleAlertIcon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
