import type { ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@kestack/web-platform/components/avatar';
import { Badge } from '@kestack/web-platform/components/badge';
import { Button } from '@kestack/web-platform/components/button';
import {
  CircleCheckIcon,
  CircleXIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { OWNER, type Level, LEVELS } from '../../apis/access/index.ts';
import { HelloHttp } from '../../apis/hello-http/index.ts';
import { HelloRpc } from '../../apis/hello-rpc/index.ts';
import { Pages } from '../../shared/pages/index.ts';
import { PageIntro } from '../components/index.ts';

/*
 * Who is signed in, then one panel per API Worker: what it is and where it
 * is (the URL its client calls), then its three calls, one per level of
 * access, each with who may make it, the request a click sends, and what
 * came back, the refusal too. Both Workers check the same session cookie
 * with the same Auth Worker, and apply the same rule.
 */

type Self = ViewProps<typeof Pages.ApisLive>;
type Model = Self['model'];
type Call = Model['http']['public'];

const WORKERS = [
  {
    api: 'http',
    name: 'HTTP Worker',
    kind: 'Effect HttpApi',
    url: HelloHttp.url,
    request: {
      public: 'GET /public',
      authenticated: 'GET /authenticated',
      authorized: 'GET /authorized',
    },
  },
  {
    api: 'rpc',
    name: 'RPC Worker',
    kind: 'Effect RPC',
    url: HelloRpc.url,
    request: {
      public: 'POST /  Public()',
      authenticated: 'POST /  Authenticated()',
      authorized: 'POST /  Authorized()',
    },
  },
] as const;

/** What each level is called, and who may make its call. */
const LEVEL: Readonly<
  Record<Level, { readonly title: string; readonly who: ReactNode }>
> = {
  public: { title: 'Public', who: 'Anyone, signed in or not.' },
  authenticated: {
    title: 'Authenticated',
    who: 'Any signed-in Account.',
  },
  authorized: {
    title: 'Authorized',
    who: (
      <>
        Only <span className="font-mono text-[13px]">{OWNER}</span>.
      </>
    ),
  },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

function Label({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function Response({ call }: { readonly call: Call }) {
  if (call._tag === 'Idle')
    return <p className="text-sm text-muted-foreground">Not sent yet.</p>;
  if (call._tag === 'Sending')
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Waiting for the Worker…
      </p>
    );
  const { ok, sent, status, body, ms } = call.answer;
  return (
    <div className="space-y-2">
      <p
        className={`flex items-center gap-2 text-sm font-medium ${ok ? '' : 'text-destructive'}`}
      >
        {ok ? (
          <CircleCheckIcon className="size-4 text-positive" />
        ) : (
          <CircleXIcon className="size-4" />
        )}
        <span className="font-mono">
          {sent ? status : 'Refused before sending'}
        </span>
        {sent && (
          <span className="font-normal text-muted-foreground tabular-nums">
            · {ms} ms
          </span>
        )}
      </p>
      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[13px] whitespace-pre-wrap">
        {body}
      </pre>
      {!sent && (
        <p className="text-sm text-muted-foreground">
          With no Account, the client never sends a guarded call; one that
          reached the Worker without a session would get 401.
        </p>
      )}
    </div>
  );
}

function Account({
  model,
  send,
}: {
  readonly model: Model;
  readonly send: Self['send'];
}) {
  const { account } = model;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
      {account._tag === 'Checking' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Checking who is signed in…
        </p>
      )}
      {account._tag === 'SignedOut' && (
        <>
          <div className="space-y-0.5">
            <p className="font-medium">You are signed out</p>
            <p className="text-sm text-muted-foreground">
              The public calls answer you; the others refuse until you sign in.
            </p>
          </div>
          <Button onClick={() => send({ _tag: 'SignIn' })}>Sign in</Button>
        </>
      )}
      {account._tag === 'SignedIn' && (
        <>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {account.active.image && (
                <AvatarImage src={account.active.image} alt="" />
              )}
              <AvatarFallback>{initials(account.active.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{account.active.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {account.active.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {account.others.map((other) => (
              <Button
                key={other.id}
                variant="ghost"
                size="sm"
                onClick={() => send({ _tag: 'SwitchTo', id: other.id })}
              >
                Switch to {other.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ _tag: 'SignIn' })}
            >
              Add an account
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => send({ _tag: 'SignOut' })}
            >
              Sign out
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export const ApisView = View.make(Pages.ApisLive, ({ root, model, send }) => (
  <div {...root} className="space-y-6">
    <PageIntro title="APIs">
      Two Workers at two URLs, each with a public call, an authenticated one and
      an authorized one. Send them signed out, then sign in and send again: only{' '}
      {OWNER} gets the authorized answer.
    </PageIntro>
    <Account model={model} send={send} />
    {WORKERS.map(({ api, name, kind, url, request }) => (
      <section
        key={api}
        aria-label={name}
        className="rounded-xl border border-border bg-card"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">{name}</h2>
            <Badge variant="outline">{kind}</Badge>
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {url}
          </p>
        </header>
        <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {LEVELS.map((level) => {
            const call = model[api][level];
            return (
              <div key={level} className="flex flex-col gap-4 p-5">
                <div className="space-y-1">
                  <Label>{LEVEL[level].title}</Label>
                  <p className="text-sm text-muted-foreground">
                    {LEVEL[level].who}
                  </p>
                </div>
                <p className="font-mono text-[13px]">{request[level]}</p>
                <Response call={call} />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start"
                  disabled={call._tag === 'Sending'}
                  onClick={() => send({ _tag: 'Send', api, level })}
                >
                  Send request
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    ))}
    <p className="text-sm text-muted-foreground">
      Each Worker checks the session with the Auth Worker at{' '}
      <span className="font-mono text-[13px]">
        {import.meta.env.VITE_AUTH_URL}
      </span>
      .
    </p>
  </div>
));
