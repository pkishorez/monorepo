import { Effect, Layer, Stream } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  type Account,
  Console,
  type ConsoleModel,
  type ConsoleState,
  NotSignedIn,
  Session,
  type Visitor,
} from '../../shared/pages/index.ts';
import { NewProjectLive, NewProjectView } from '../pages/new-project/index.ts';
import { ProjectLive, ProjectView } from '../pages/project/index.ts';
import { SettingsLive, SettingsView } from '../pages/settings/index.ts';
import { WelcomeLive, WelcomeView } from '../pages/welcome/index.ts';
import { apiLayer } from './api.ts';
import { googleBrowser, localBrowser, signInMode } from './browser.ts';
import { recheck, signIn, signOut, switchTo } from './commands.ts';
import { settle, stateOf, type Word } from './settle.ts';
import { AddAccountDialog } from './views/add-account.tsx';
import { NoticeScreen, SignInScreen } from './views/screens.tsx';
import { Shell, ShellSkeleton } from './views/shell.tsx';

/*
 * Console, the root of everything a visitor sees: the sign-in gate, the
 * Account menu, and the pages under it.
 *
 * 1. Witness  a Worker follows this browser's Accounts; another hears the
 *             Worker's word on the visitor each time the page's data comes.
 * 2. Settle   each Message settles who is signed in (`settle.ts`), asking
 *             the Worker again when the two disagree.
 * 3. Provide  `Api` and `Session` to every page, bound to whoever is signed
 *             in now: a switch moves them to the new member.
 * 4. Act      the Account menu's intents are Commands on the Accounts.
 * 5. Draw     the screen the State names; while Checking, the one the
 *             Worker's word names, so the first paint is never a spinner.
 *
 * Pages are the Router's Children of Console, there whatever its State, so
 * Console Provides at its top; its `scope` is the signed-in member, so an
 * Account Switch starts every page under it again, as the new member.
 */

/** Accounts and the `Browser` Console Requires, for the app's Layer; built only in the browser. */
export const browserLayer = Layer.suspend(() =>
  signInMode === 'local' ? localBrowser() : googleBrowser(),
);

type Model = typeof ConsoleModel.Type;
type VisitorData = typeof Visitor.Type;

type Status = {
  readonly _tag: string;
  readonly data?: VisitorData;
  readonly info?: object;
};

/** The Worker's word on the visitor, and when it arrived, once the page's data is there. */
const wordOf = (status: Status): Word | undefined =>
  status._tag === 'Ready' && status.data !== undefined
    ? {
        visitor: status.data,
        arrivedAt:
          (status.info as { readonly arrivedAt?: number } | undefined)
            ?.arrivedAt ?? 0,
      }
    : undefined;

const settled = (model: Model, word: Word | undefined) => {
  const { state, ask } = settle(model.accounts, word, model.asked);
  return ask === null
    ? { model, state }
    : {
        model: { ...model, asked: ask },
        state,
        command: Router.reload({ anew: true }),
      };
};

const accountOf = ({ id, email, name }: typeof Account.Type) => ({
  id,
  email,
  name,
});

const seenOf = (state: Exclude<AccountsState, { _tag: 'Checking' }>) =>
  state._tag === 'SignedIn'
    ? {
        _tag: 'AccountsSeen' as const,
        active: accountOf(state.active),
        all: state.accounts.map(accountOf),
      }
    : { _tag: 'AccountsSeen' as const, active: null, all: [] };

const idle = (model: Model) => model.busy === null;

export const ConsoleLive = Page.build(Console, {
  pages: {
    Welcome: WelcomeLive,
    Settings: SettingsLive,
    NewProject: NewProjectLive,
    Project: ProjectLive,
  },
  // The pages are the signed-in member's: another member, after an Account
  // Switch, starts every one of them again.
  scope: ({ model, state, props }) => {
    const shown = shownOf(state, props.status, model.asked !== null);
    return shown._tag === 'SignedIn' ? shown.member.userId : '';
  },
  init: () => ({
    model: {
      accounts: null,
      busy: null,
      adding: false,
      failure: null,
      asked: null,
    },
    state: { _tag: 'Checking' },
  }),

  // 3. Provide
  provides: (self) => {
    const memberOf = ({
      state,
    }: {
      readonly state: typeof ConsoleState.Type;
    }) => (state._tag === 'SignedIn' ? state.member : null);
    return Layer.merge(
      apiLayer({
        now: Effect.map(self.get, memberOf),
        changes: Stream.map(self.changes, memberOf),
      }),
      Layer.succeed(
        Session,
        Session.of({
          member: Effect.flatMap(self.get, (data) => {
            const member = memberOf(data);
            return member === null
              ? Effect.fail(new NotSignedIn())
              : Effect.succeed(member);
          }),
          switchTo: (userId) => self.send({ _tag: 'SwitchChosen', userId }),
          addAccount: self.send({ _tag: 'AddAccountChosen' }),
          signOut: self.send({ _tag: 'SignOutChosen' }),
        }),
      ),
    );
  },

  // 1. Witness
  workers: {
    accounts: {
      run: (self) =>
        Effect.gen(function* () {
          const accounts = yield* Accounts;
          yield* Effect.forkChild(
            accounts.check.pipe(
              Effect.catch(() => self.send({ _tag: 'AccountsUnreachable' })),
            ),
          );
          yield* Stream.runForEach(accounts.state, (state) =>
            state._tag === 'Checking' ? Effect.void : self.send(seenOf(state)),
          );
        }),
    },
    visit: {
      // Once for each word that arrives, a repeated one too.
      each: ({ props }) => {
        const word = wordOf(props.status);
        return word === undefined ? [] : [JSON.stringify(word)];
      },
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) => {
          const word = wordOf(props.status);
          return word === undefined
            ? Effect.void
            : self.send({ _tag: 'Visited', ...word });
        }),
    },
  },

  // 2. Settle, and 4. Act
  on: {
    AccountsSeen: ({ active, all }, { model, props }) =>
      settled({ ...model, accounts: { active, all } }, wordOf(props.status)),
    AccountsUnreachable: (_, { model }) => ({
      model: { ...model, busy: null },
      state: { _tag: 'Unreachable' },
    }),
    Visited: ({ visitor, arrivedAt }, { model }) =>
      settled(model, { visitor, arrivedAt }),
    RetryChosen: (_, { model }) => ({
      model: { ...model, asked: null, failure: null },
      state: { _tag: 'Checking' },
      command: [recheck({}), Router.reload({ anew: true })],
    }),
    SignInChosen: ({ email, name }, { model }) =>
      idle(model)
        ? {
            model: { ...model, busy: 'sign-in', failure: null },
            command: signIn({ email, name }),
          }
        : {},
    AddAccountChosen: (_, { model }) =>
      !idle(model)
        ? {}
        : signInMode === 'local'
          ? { model: { ...model, adding: true, failure: null } }
          : {
              model: { ...model, busy: 'sign-in', failure: null },
              command: signIn({ email: null, name: null }),
            },
    AddAccountClosed: (_, { model }) => ({
      model: { ...model, adding: false },
    }),
    SwitchChosen: ({ userId }, { model }) =>
      idle(model)
        ? {
            model: { ...model, busy: userId, failure: null },
            command: switchTo({ userId }),
          }
        : {},
    SignOutChosen: (_, { model }) =>
      idle(model)
        ? {
            model: { ...model, busy: 'sign-out', failure: null },
            command: signOut({}),
          }
        : {},
    ActionDone: (_, { model }) => ({
      model: { ...model, busy: null, adding: false },
    }),
    ActionFailed: ({ message }, { model }) => ({
      model: { ...model, busy: null, failure: message },
    }),
  },
});

// 5. Draw

type Shown =
  | typeof ConsoleState.Type
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Broken' };

/** The screen to draw: the State's; while Checking, the one the Worker's
 * word names, unless the Worker has been asked again and not answered. */
const shownOf = (
  state: typeof ConsoleState.Type,
  status: { readonly _tag: string; readonly data?: VisitorData },
  asking: boolean,
): Shown => {
  if (state._tag !== 'Checking') return state;
  if (status._tag === 'Loading') return { _tag: 'Loading' };
  if (status.data === undefined) return { _tag: 'Broken' };
  return asking ? { _tag: 'Loading' } : stateOf(status.data);
};

export const ConsoleView = View.make(ConsoleLive, (self) => {
  const { model, props, send, children } = self;
  const shown = shownOf(self.state, props.status, model.asked !== null);
  const busy = model.busy !== null;
  const signInAs = (email: string | null, name: string | null) =>
    send({ _tag: 'SignInChosen', email, name });
  const retry = () => send({ _tag: 'RetryChosen' });
  return (
    <div {...self.root}>
      {shown._tag === 'Loading' || shown._tag === 'Checking' ? (
        <ShellSkeleton />
      ) : shown._tag === 'Broken' ? (
        <NoticeScreen
          title="Console didn't load."
          description="Something went wrong on our side while opening Console. Try again in a moment."
          action="Try again"
          busy={busy}
          failure={model.failure}
          onAction={retry}
        />
      ) : shown._tag === 'SignedOut' ? (
        <SignInScreen
          mode={signInMode}
          busy={busy}
          failure={model.failure}
          onSignIn={signInAs}
        />
      ) : shown._tag === 'Unreachable' ? (
        <NoticeScreen
          title="The sign-in service didn't respond."
          description="Check your connection, then try again."
          action="Retry"
          busy={busy}
          failure={model.failure}
          onAction={retry}
        />
      ) : shown._tag === 'NotInvited' ? (
        <NoticeScreen
          title="Console is invite-only for now."
          description={`You're signed in as ${shown.email}, which isn't on the invite list. Sign out to use another account.`}
          action="Sign out"
          busy={busy}
          failure={model.failure}
          onAction={() => send({ _tag: 'SignOutChosen' })}
        />
      ) : (
        <Shell
          menu={{
            member: shown.member,
            others: (model.accounts?.all ?? []).filter(
              ({ id }) => id !== shown.member.userId,
            ),
            busy,
            onSwitch: (userId) => send({ _tag: 'SwitchChosen', userId }),
            onAdd: () => send({ _tag: 'AddAccountChosen' }),
            onSignOut: () => send({ _tag: 'SignOutChosen' }),
          }}
        >
          {model.failure !== null && (
            <p role="alert" className="pt-4 text-sm text-destructive">
              {model.failure}
            </p>
          )}
          {children.Welcome && <WelcomeView instance={children.Welcome} />}
          {children.Settings && <SettingsView instance={children.Settings} />}
          {children.NewProject && (
            <NewProjectView instance={children.NewProject} />
          )}
          {children.Project && <ProjectView instance={children.Project} />}
          {signInMode === 'local' && (
            <AddAccountDialog
              open={model.adding}
              busy={busy}
              onSignIn={signInAs}
              onClose={() => send({ _tag: 'AddAccountClosed' })}
            />
          )}
        </Shell>
      )}
    </div>
  );
});
