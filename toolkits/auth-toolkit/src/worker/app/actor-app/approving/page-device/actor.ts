import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  Api,
  DeviceData,
  deviceCodeFailure,
  deviceHref,
} from '../../../api/index.ts';
import { titled } from '../../metadata.ts';
import { router } from '../../routes.ts';
import { followPageAccounts, readyData } from '../../shown.ts';

/*
 * The Device Screen. With the code in the link it arrives with the code
 * looked up, so it goes straight to the question, "Sign in to {app}?",
 * showing the code to compare and the Approving Account, which switches
 * nothing. Typing a code is only for a visit by hand: it moves to the same
 * page with the code, which its Loader looks up. A hinted Account not
 * signed in here is offered as a Google sign-in that comes back to this
 * approval with it chosen.
 */

const answer = Command.make('answer', {
  args: Schema.Struct({
    /** The code as the page's address gives it: what the answer is for. */
    asked: Schema.String,
    userCode: Schema.String,
    app: Schema.String,
    userId: Schema.String,
    approve: Schema.Boolean,
  }),
  run: ({ asked, app, ...args }) =>
    Effect.gen(function* () {
      const status = yield* (yield* Api).deviceAnswer(args);
      return {
        _tag: 'Answered' as const,
        asked,
        app,
        approved: status === 'approved',
      };
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'AnswerFailed' as const,
          asked,
          code: error.code,
          message: deviceCodeFailure(error.code, error.message),
        }),
      ),
    ),
});

const signInAs = Command.make('signInAs', {
  args: Schema.Struct({ userCode: Schema.String, email: Schema.String }),
  run: ({ userCode, email }) =>
    Effect.gen(function* () {
      const api = yield* Api;
      const here = yield* api.location;
      const back = new URL(
        deviceHref(userCode, email || undefined),
        here.origin,
      ).href;
      const url = yield* api.google({
        returnTo: back,
        errorTo: back,
        loginHint: email || undefined,
      });
      yield* api.leave(url);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'SignInFailed' as const,
          message: error.message,
        }),
      ),
    ),
});

/** Codes that end the question: the device must start again. */
const ENDS = new Set(['invalid_code', 'expired_code', 'already_answered']);

/** The code the page's data found still waiting for an answer. */
export const pendingRequest = (data: DeviceData | undefined) =>
  data?.lookup?._tag === 'Found' && data.lookup.status === 'pending'
    ? data.lookup
    : undefined;

/** The code the page's address is about; `''` for none. */
const codeOf = (query: {
  readonly code?: string;
  readonly user_code?: string;
}) => (query.code ?? query.user_code ?? '').trim();

export const Device = Page.define({
  path: '/device',
  query: {
    code: Schema.optionalKey(Schema.String),
    user_code: Schema.optionalKey(Schema.String),
    /** The Account the Device asks to be approved as: an email. */
    account: Schema.optionalKey(Schema.String),
  },
  render: 'dynamic',
  // A code's answer can change at any moment: looked up on every visit.
  staleTime: 0,
  data: DeviceData,
  metadata: (_, data) => titled('Approve a sign-in')(data),
  requires: [Api],
  state: Schema.TaggedUnion({
    /** What the data says: the question, or the code to enter. */
    Asking: { failure: Schema.NullOr(Schema.String) },
    /** Each of these is for `code`, the one the address gave: a move to
     * another code, or to none, asks again. */
    Answering: { code: Schema.String, approve: Schema.Boolean },
    SigningIn: {},
    Done: { code: Schema.String, app: Schema.String, approved: Schema.Boolean },
    /** The code can't be answered any more: enter another. */
    Ended: { code: Schema.String, failure: Schema.String },
  }),
  model: Schema.Struct({
    /** The Approving Account picked here, if one was. */
    chosen: Schema.NullOr(Schema.String),
    /** Approving as another Account than the hinted one, which is not here. */
    overrode: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    CodeEntered: { code: Schema.String },
    Chosen: { userId: Schema.String },
    Overrode: { userId: Schema.String },
    Approved: { userId: Schema.String },
    Denied: { userId: Schema.String },
    Answered: {
      asked: Schema.String,
      app: Schema.String,
      approved: Schema.Boolean,
    },
    AnswerFailed: {
      asked: Schema.String,
      code: Schema.String,
      message: Schema.String,
    },
    CodeChanged: {},
    SignInAsChosen: { email: Schema.String },
    SignInFailed: { message: Schema.String },
  }),
});

interface Props {
  readonly status: { readonly _tag: string; readonly data?: DeviceData };
  readonly query: {
    readonly code?: string;
    readonly user_code?: string;
    readonly account?: string;
  };
}

/** Answers the code the data found, as `userId`. */
const answering = (props: Props, userId: string, approve: boolean) => {
  const found = pendingRequest(readyData(props.status));
  const code = codeOf(props.query);
  return found
    ? {
        state: { _tag: 'Answering' as const, code, approve },
        command: answer({
          asked: code,
          userCode: found.userCode,
          app: found.app ?? 'your device',
          userId,
          approve,
        }),
      }
    : {};
};

const entered = (code: string, props: Props) =>
  code.trim()
    ? {
        state: { _tag: 'Asking' as const, failure: null },
        command: Router.push(
          router.Device({
            code: code.trim(),
            ...(props.query.account ? { account: props.query.account } : {}),
          }),
          { resetScroll: false },
        ),
      }
    : {
        state: {
          _tag: 'Asking' as const,
          failure: 'Enter the code your device shows.',
        },
      };

export const DeviceLive = Page.build(Device, {
  init: () => ({
    state: { _tag: 'Asking', failure: null },
    model: { chosen: null, overrode: false },
  }),
  workers: {
    // Another tab changed who is signed in: loaded anew once shown again.
    accounts: {
      run: (self) => followPageAccounts(self),
    },
    // An answer, or an ended code, is for the code it came from: Back to
    // the page with another code, or none, asks again.
    restart: {
      while: ({ state, props }) =>
        'code' in state && state.code !== codeOf(props.query),
      run: (self) => self.send({ _tag: 'CodeChanged' }),
    },
  },
  on: {
    CodeChanged: () => ({ state: { _tag: 'Asking', failure: null } }),
  },
  state: {
    Asking: {
      on: {
        CodeEntered: ({ code }, { props }) => entered(code, props),
        Chosen: ({ userId }, { model }) => ({
          model: { ...model, chosen: userId },
        }),
        Overrode: ({ userId }, { model }) => ({
          model: { ...model, chosen: userId, overrode: true },
        }),
        Approved: ({ userId }, { props }) => answering(props, userId, true),
        Denied: ({ userId }, { props }) => answering(props, userId, false),
        SignInAsChosen: ({ email }, { props }) => {
          const found = pendingRequest(readyData(props.status));
          return found
            ? {
                state: { _tag: 'SigningIn' },
                command: signInAs({ userCode: found.userCode, email }),
              }
            : {};
        },
      },
    },
    Ended: {
      on: {
        CodeEntered: ({ code }, { props }) => entered(code, props),
      },
    },
    Answering: {
      on: {
        Answered: ({ asked, app, approved }, { state }) =>
          asked === state.code
            ? { state: { _tag: 'Done', code: asked, app, approved } }
            : {},
        AnswerFailed: ({ asked, code, message }, { state }) =>
          asked !== state.code
            ? {}
            : ENDS.has(code)
              ? { state: { _tag: 'Ended', code: asked, failure: message } }
              : {
                  state: { _tag: 'Asking', failure: message },
                  // That Account left this browser: the Accounts are read again.
                  ...(code === 'account_not_signed_in'
                    ? { command: Router.reload() }
                    : {}),
                },
      },
    },
    SigningIn: {
      on: {
        SignInFailed: ({ message }) => ({
          state: { _tag: 'Asking', failure: message },
        }),
      },
    },
  },
});
