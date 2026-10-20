import { Effect } from 'effect';
import { ConnectionIndex } from '../../connection-index/index.ts';
import {
  type ConnectOutcome,
  owning,
  reach,
  type UserSpace,
} from '../../user-space/index.ts';
import { visitorOf } from '../visitor/index.ts';
import { signedBy } from './signature.ts';

/*
 * `/github/*`: the GitHub App's doors into Console.
 *
 * - connected   GitHub's Setup URL, a top-level navigation back from
 *               installing the App, carrying the visitor's own session.
 *               An invited member's return goes to their User Space, which
 *               checks its state, then sends the browser to GitHub to say
 *               who the member is there;
 * - authorized  the App's OAuth callback, GitHub's answer to that: the User
 *               Space keeps the connection only for an installation the
 *               member's GitHub user can reach. The browser lands where the
 *               install began, `?github=` saying how it went;
 * - webhook     GitHub's deliveries. Only a body signed with the webhook
 *              secret is read; its installation's owner, from the
 *              connection index, gets it. One no one owns is dropped.
 */

export interface GitHubEnv {
  readonly USER_SPACE: DurableObjectNamespace<UserSpace>;
  readonly CONSOLE_INVITES: string;
  readonly CONSOLE_INDEX: D1Database;
  readonly GH_APP_WEBHOOK_SECRET?: string;
}

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

/** A redirect to `location`, setting `cookies`. */
const seeOther = (location: string, cookies: ReadonlyArray<string>) => {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
};

const landing = ({ returnTo, github }: ConnectOutcome) =>
  `${returnTo}?github=${github}`;

/** Where GitHub answers who the member is: the App's OAuth callback on this host. */
const authorizedUrl = (url: URL) => `${url.origin}/github/authorized`;

export const connected = async (
  request: Request,
  env: GitHubEnv,
): Promise<Response> => {
  const url = new URL(request.url);
  const { visit, cookies } = await visitorOf(request, env.CONSOLE_INVITES);
  // Console's gate answers anyone else, at its own door.
  if (visit._tag !== 'Admitted') return seeOther('/', cookies);
  if (url.searchParams.get('setup_action') === 'request')
    return seeOther(landing({ returnTo: '/', github: 'requested' }), cookies);
  const installationId = url.searchParams.get('installation_id') ?? '';
  if (!/^[0-9]{1,15}$/.test(installationId))
    return seeOther(landing({ returnTo: '/', github: 'not-found' }), cookies);
  const step = await reach(env.USER_SPACE, visit).connectGitHub({
    installationId: Number(installationId),
    state: url.searchParams.get('state'),
    authorizedUrl: authorizedUrl(url),
  });
  return seeOther(
    step._tag === 'Authorize' ? step.url : landing(step),
    cookies,
  );
};

export const authorized = async (
  request: Request,
  env: GitHubEnv,
): Promise<Response> => {
  const url = new URL(request.url);
  const { visit, cookies } = await visitorOf(request, env.CONSOLE_INVITES);
  if (visit._tag !== 'Admitted') return seeOther('/', cookies);
  const outcome = await reach(env.USER_SPACE, visit).authorizeGitHub({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    authorizedUrl: authorizedUrl(url),
  });
  return seeOther(landing(outcome), cookies);
};

const installationOf = (payload: unknown) => {
  const id = (payload as { installation?: { id?: unknown } } | null)
    ?.installation?.id;
  return typeof id === 'number' ? id : null;
};

export const webhook = async (
  request: Request,
  env: GitHubEnv,
): Promise<Response> => {
  if (request.method !== 'POST') return text(405, 'POST deliveries only');
  const body = new Uint8Array(await request.arrayBuffer());
  const signed = await signedBy(
    env.GH_APP_WEBHOOK_SECRET,
    request.headers.get('x-hub-signature-256'),
    body,
  );
  if (!signed) return text(401, 'Bad signature');
  const event = request.headers.get('x-github-event') ?? '';
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return text(400, 'Not JSON');
  }
  const installationId = installationOf(payload);
  if (event === 'ping' || installationId === null) return text(200, 'OK');
  const owner = await Effect.runPromise(
    ConnectionIndex.make(env.CONSOLE_INDEX).owner(installationId),
  );
  if (owner === null) return text(202, 'No one connected this installation');
  await owning(env.USER_SPACE, owner).receive({ event, payload });
  return text(202, 'Accepted');
};
