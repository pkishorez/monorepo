import { Check, TriangleAlert } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import type { Client } from '../api/index.ts';
import { ConsentLive, approving, signInToContinue } from '../pages/index.ts';
import { Button, LinkButton, Notice, Skeleton, cx } from '../ui/index.ts';
import { AccountPicker, PickerPlaceholder } from './account-picker.tsx';
import { TaskHeading, TaskHeadingPlaceholder } from './heading.tsx';
import { Frame } from './frame.tsx';
import { useRoot } from './root.ts';
import { Unready } from './unready.tsx';

/*
 * The Consent Screen: "{Client} wants to use your {App} account", what it
 * may do, in words, and which Account answers. Allow sends the browser
 * back to the Client; so does Cancel, with a refusal.
 */

const hostOf = (uri: string | null) => {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
};

export function ClientMark({
  client,
  size = 'lg',
}: {
  client: Client;
  size?: 'sm' | 'lg';
}) {
  const box =
    size === 'lg' ? 'size-11 rounded-xl text-lg' : 'size-9 rounded-lg text-sm';
  return client.icon ? (
    <img
      src={client.icon}
      alt=""
      width={size === 'lg' ? 44 : 36}
      height={size === 'lg' ? 44 : 36}
      className={cx(box, 'shrink-0 object-contain')}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cx(
        box,
        'grid shrink-0 select-none place-items-center bg-muted font-semibold',
      )}
    >
      {client.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The request while it loads: who asks, what it may do, who answers. */
function ConsentPlaceholder() {
  const last = useRoot().last.current;
  return (
    <div className="flex flex-col">
      <TaskHeadingPlaceholder
        title={`An app wants to use your ${last?.brand.name ?? ''} account`}
        lead="From app.example.com"
      />
      <div className="mt-8 flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <PickerPlaceholder count={last?.accounts.list.length ?? 1} />
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export const ConsentView = View.make(ConsentLive, (self) => {
  const { props, model, send } = self;
  if (props.status._tag !== 'Ready')
    return (
      <Unready status={props.status}>
        <ConsentPlaceholder />
      </Unready>
    );
  const { data, waited } = props.status;
  const { brand, request } = data;

  const body = (() => {
    if (request._tag === 'Invalid')
      return (
        <div className="flex flex-col">
          <TaskHeading
            mark={<TriangleAlert aria-hidden="true" className="size-5" />}
            tone="warning"
            title="This request can't be answered"
            lead={`${request.message} Go back to the app that sent you here and connect it again.`}
          />
          <LinkButton href="/" tone="secondary" size="lg" className="mt-8">
            Go to your account
          </LinkButton>
        </div>
      );
    switch (self._tag) {
      case 'Asking':
      case 'Answering': {
        const { client, scopes } = request;
        const { chosen } = approving({
          accounts: data.accounts.list,
          active: data.accounts.active,
          chosen: model.chosen,
        });
        const answering = self._tag === 'Answering' ? self.state.accept : null;
        const failure = self._tag === 'Asking' ? self.state.failure : null;
        const host = hostOf(client.uri);
        const none = data.accounts.list.length === 0;
        const signIn = signInToContinue(request.query);
        return (
          <div className="flex flex-col">
            <TaskHeading
              mark={<ClientMark client={client} />}
              tone="none"
              title={`${client.name} wants to use your ${brand.name} account`}
              lead={
                host ? (
                  <>
                    From{' '}
                    <span className="font-medium text-foreground">{host}</span>
                  </>
                ) : undefined
              }
            />
            {scopes.length > 0 ? (
              <div className="mt-8">
                <p className="text-sm font-medium text-muted-foreground">
                  {client.name} will be able to
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {scopes.map((scope) => (
                    <li key={scope.name} className="flex gap-2.5">
                      <Check
                        aria-hidden="true"
                        className="mt-[3px] size-4 shrink-0 text-positive"
                      />
                      <span>{scope.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-3">
              {failure ? <Notice>{failure}</Notice> : null}
              {none ? (
                <LinkButton tone="primary" size="lg" href={signIn}>
                  Sign in to continue
                </LinkButton>
              ) : (
                <>
                  <AccountPicker
                    label="Allow as"
                    accounts={data.accounts.list}
                    chosen={chosen}
                    disabled={answering !== null}
                    onChoose={(userId) => send({ _tag: 'Chosen', userId })}
                  />
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      tone="primary"
                      size="lg"
                      disabled={!chosen || answering === false}
                      busy={answering === true && 'Allowing…'}
                      onClick={() =>
                        chosen &&
                        send({
                          _tag: 'Answered',
                          userId: chosen.id,
                          accept: true,
                        })
                      }
                    >
                      Allow
                    </Button>
                    <Button
                      tone="secondary"
                      size="lg"
                      disabled={!chosen || answering === true}
                      busy={answering === false && 'Cancelling…'}
                      onClick={() =>
                        chosen &&
                        send({
                          _tag: 'Answered',
                          userId: chosen.id,
                          accept: false,
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-faint text-pretty">
                    You can remove its access any time from your{' '}
                    <a
                      href="/"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {brand.name} account
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
          </div>
        );
      }
    }
  })();

  return (
    <Frame data={data} waited={waited}>
      {body}
    </Frame>
  );
});
