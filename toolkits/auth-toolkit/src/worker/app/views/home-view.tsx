import { CircleHelp, Monitor, SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import type { Grant, SignIn } from '../api/index.ts';
import { HomeLive, othersOf } from '../pages/index.ts';
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  Skeleton,
  SkeletonText,
} from '../ui/index.ts';
import { ClientMark } from './consent-view.tsx';
import { Frame } from './frame.tsx';
import { useRoot } from './root.ts';
import { TestLabel } from './test-label.tsx';
import { ago, onDay } from './time.ts';
import { Unready } from './unready.tsx';

/*
 * The Home Page: who is signed in, where, and which apps have access, each
 * removable on its own. Single column; it arrives with its lists, and while
 * a move or an Account Switch loads them, one placeholder of the page.
 */

const KIND = {
  browser: Monitor,
  device: SquareTerminal,
  unknown: CircleHelp,
} as const;

const SECTIONS = {
  signIns: {
    title: "Where you're signed in",
    lead: "Browsers and devices signed in to this account. Sign one out if you don't recognise it or no longer use it.",
  },
  apps: {
    title: 'Apps with access',
    lead: (brand: string) =>
      `Apps you allowed to use your ${brand} account. Removing access signs the app out.`,
  },
};

function Section({
  title,
  lead,
  loading = false,
  children,
}: {
  title: string;
  lead: string;
  /** Drawn as bars, words and all, while the page loads. */
  loading?: boolean;
  children: ReactNode;
}) {
  const words = (text: string) =>
    loading ? <SkeletonText>{text}</SkeletonText> : text;
  return (
    <section
      className="flex flex-col gap-5"
      aria-label={loading ? undefined : title}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">{words(title)}</h2>
        <p className="max-w-[65ch] text-sm text-muted-fg text-pretty">
          {words(lead)}
        </p>
      </div>
      {children}
    </section>
  );
}

/** A labelled group inside a Section: its caption, an optional action on the right, its rows. */
function Group({
  label,
  action,
  children,
}: {
  label: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium text-muted-fg">{label}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <Card className="w-full overflow-hidden">
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

function Row({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex min-h-[68px] items-center gap-3.5 py-3 pr-3 pl-4">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{title}</p>
        <p className="mt-0.5 text-sm text-muted-fg text-pretty">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/** A row's detail: its parts joined by " · ", a line breaking between them, inside one only when it is wider than the row. */
function Parts({ parts }: { parts: ReadonlyArray<ReactNode> }) {
  return parts.map((part, index) => (
    <span key={index}>
      <span className="inline-block max-w-full">
        {part}
        {index < parts.length - 1 ? ' ·' : ''}
      </span>
      {index < parts.length - 1 ? ' ' : ''}
    </span>
  ));
}

/** The quiet line a Group shows when it has no rows, as tall as one row. */
function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <Card className="flex min-h-[68px] items-center px-4 py-3 text-sm text-muted-fg text-pretty">
      {children}
    </Card>
  );
}

/** Rows still loading, each line where a Row puts its own. */
function SkeletonRows({ count }: { count: number }) {
  return (
    <Rows>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          aria-hidden="true"
          className="flex min-h-[68px] items-center gap-3.5 py-3 pr-3 pl-4"
        >
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              <SkeletonText>Chrome on macOS</SkeletonText>
            </span>
            <span className="mt-0.5 block text-sm">
              <SkeletonText>
                Active 5 minutes ago · Signed in Oct 3
              </SkeletonText>
            </span>
          </span>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </li>
      ))}
    </Rows>
  );
}

/**
 * The whole page while it loads, line for line where the page will be:
 * this browser's Sign-in, two others and one app, as most Accounts have.
 */
function HomePlaceholder() {
  const last = useRoot().last.current;
  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-[-0.01em]">
            <SkeletonText>Ada Lovelace</SkeletonText>
          </p>
          <p>
            <SkeletonText>ada.lovelace@example.com</SkeletonText>
          </p>
        </div>
      </div>
      <Section {...SECTIONS.signIns} loading>
        <Group label={<SkeletonText>This browser</SkeletonText>}>
          <SkeletonRows count={1} />
        </Group>
        <Group label={<SkeletonText>Other browsers and devices</SkeletonText>}>
          <SkeletonRows count={2} />
        </Group>
      </Section>
      {last?.scopes ? (
        <Section
          title={SECTIONS.apps.title}
          lead={SECTIONS.apps.lead(last.brand.name)}
          loading
        >
          <SkeletonRows count={1} />
        </Section>
      ) : null}
    </div>
  );
}

const SignInIcon = ({ signIn }: { signIn: SignIn }) => {
  const Icon = KIND[signIn.kind];
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-fg">
      <Icon aria-hidden="true" className="size-[18px]" />
    </span>
  );
};

/** What the app may do, without "know who you are" when it may do more. */
const scopeWords = (grant: Grant) => {
  const words = grant.scopes
    .filter((scope) => grant.scopes.length === 1 || scope.name !== 'openid')
    .map((scope) => scope.description);
  return words.length === 0 ? ['Know who you are'] : words;
};

export const HomeView = View.make(HomeLive, ({ props, model, send }) => {
  if (props.status._tag !== 'Ready')
    return (
      <Unready status={props.status} layout="account">
        <HomePlaceholder />
      </Unready>
    );
  const { data, waited } = props.status;
  const { brand, scopes } = data;
  const active = data.accounts.list.find(
    (account) => account.id === data.accounts.active,
  );
  const shown = <T extends { id: string }>(list: ReadonlyArray<T>) =>
    list.filter((each) => !model.removed.includes(each.id));
  const signIns = shown(data.signIns);
  const grants = shown(data.grants);
  const current = signIns.find((each) => each.current);
  const others = signIns.filter((each) => !each.current);
  const pending = (id: string) => model.pending.includes(id);

  const signInRow = (signIn: SignIn) => (
    <Row
      key={signIn.id}
      icon={<SignInIcon signIn={signIn} />}
      title={signIn.name}
      detail={
        <Parts
          parts={[
            signIn.current ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-success"
                />
                You're using it now
              </span>
            ) : (
              `Active ${ago(signIn.lastActiveAt)}`
            ),
            `Signed in ${onDay(signIn.createdAt)}`,
          ]}
        />
      }
      action={
        <Button
          tone="ghost"
          size="sm"
          busy={pending(signIn.id) && 'Signing out…'}
          aria-label={
            signIn.current
              ? 'Sign out of this browser'
              : `Sign out of ${signIn.name}`
          }
          onClick={() => send({ _tag: 'SignInRevokeChosen', id: signIn.id })}
        >
          Sign out
        </Button>
      }
    />
  );

  return (
    <Frame data={data} layout="account" waited={waited}>
      <div className="flex flex-col gap-10">
        {active ? (
          <div className="flex items-center gap-4">
            <Avatar {...active} size="lg" />
            <div className="min-w-0">
              <h1
                title={active.name || active.email}
                className="truncate text-2xl font-semibold tracking-[-0.01em]"
              >
                {active.name || active.email}
              </h1>
              <p className="flex items-center gap-2 text-muted-fg">
                <span title={active.email} className="truncate">
                  {active.email}
                </span>
                <TestLabel email={active.email} />
              </p>
            </div>
          </div>
        ) : null}

        <Section {...SECTIONS.signIns}>
          <Group label="This browser">
            {current ? (
              <Rows>{signInRow(current)}</Rows>
            ) : (
              <EmptyRow>
                This browser's sign-in isn't in the list. Reload the page to
                check it again.
              </EmptyRow>
            )}
          </Group>
          <Group
            label={
              <>
                Other browsers and devices
                {others.length > 0 ? (
                  <span className="ml-1.5 tabular-nums text-faint">
                    {others.length}
                  </span>
                ) : null}
              </>
            }
            action={
              others.length > 1 ? (
                <Button
                  size="sm"
                  onClick={() => send({ _tag: 'ConfirmOpened' })}
                >
                  Sign out everywhere else
                </Button>
              ) : null
            }
          >
            {others.length === 0 ? (
              <EmptyRow>
                No other browsers or devices are signed in to this account.
              </EmptyRow>
            ) : (
              <Rows>{others.map((signIn) => signInRow(signIn))}</Rows>
            )}
          </Group>
        </Section>

        {scopes ? (
          <Section
            title={SECTIONS.apps.title}
            lead={SECTIONS.apps.lead(brand.name)}
          >
            {grants.length === 0 ? (
              <EmptyRow>
                No apps have access yet. When you allow one to use your{' '}
                {brand.name} account, it shows up here.
              </EmptyRow>
            ) : (
              <Rows>
                {grants.map((grant) => (
                  <Row
                    key={grant.id}
                    icon={<ClientMark client={grant.client} size="sm" />}
                    title={grant.client.name}
                    detail={
                      <Parts
                        parts={[
                          ...scopeWords(grant),
                          <span key="day" className="text-faint">
                            Allowed {onDay(grant.grantedAt)}
                          </span>,
                        ]}
                      />
                    }
                    action={
                      <Button
                        tone="ghost"
                        size="sm"
                        busy={pending(grant.id) && 'Removing…'}
                        aria-label={`Remove access for ${grant.client.name}`}
                        onClick={() =>
                          send({ _tag: 'GrantRevokeChosen', id: grant.id })
                        }
                      >
                        Remove access
                      </Button>
                    }
                  />
                ))}
              </Rows>
            )}
          </Section>
        ) : null}
      </div>

      <ConfirmDialog
        open={model.confirming}
        onOpenChange={(open) =>
          send(open ? { _tag: 'ConfirmOpened' } : { _tag: 'ConfirmClosed' })
        }
        title="Sign out everywhere else?"
        description={`${others.length === 1 ? 'The other browser or device' : `The other ${others.length} browsers and devices`} signed in to ${active?.email ?? 'this account'} will need to sign in again. This browser stays signed in.`}
      >
        <Button
          tone="ghost"
          disabled={pending(othersOf(data.accounts.active))}
          onClick={() => send({ _tag: 'ConfirmClosed' })}
        >
          Keep them
        </Button>
        <Button
          tone="primary"
          busy={pending(othersOf(data.accounts.active)) && 'Signing out…'}
          onClick={() => send({ _tag: 'OthersRevokeConfirmed' })}
        >
          Sign out {others.length === 1 ? '1 other' : `${others.length} others`}
        </Button>
      </ConfirmDialog>
    </Frame>
  );
});
