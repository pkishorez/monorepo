import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { Api, ConsentData } from '../../../api/index.ts';
import { titled } from '../../metadata.ts';
import { followPageAccounts, readyData } from '../../shown.ts';

/*
 * The Consent Screen: an OAuth Client asks to use the User's account. Its
 * request is in the signed query the authorization sent here, which the
 * page's Loader reads; the answer, as the Approving Account, sends the
 * browser back to the Client.
 */

/** The Login Screen, continuing this request: its signed query, whole. */
export const signInToContinue = (query: string) => `/login?${query}`;

const answer = Command.make('answer', {
  args: Schema.Struct({
    query: Schema.String,
    userId: Schema.String,
    accept: Schema.Boolean,
  }),
  run: (args) =>
    Effect.gen(function* () {
      const api = yield* Api;
      yield* api.leave(yield* api.consentAnswer(args));
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'AnswerFailed' as const,
          message: error.message,
        }),
      ),
    ),
});

export const Consent = Page.define({
  path: '/consent',
  // The request is the whole signed query, carried as it came: its Loader
  // reads it from the address, and the Data cache keeps each request apart.
  query: { search: Page.wholeQuery },
  render: 'dynamic',
  // A signed request expires: read again on every visit.
  staleTime: 0,
  data: ConsentData,
  metadata: (_, data) => titled('Allow access')(data),
  requires: [Api],
  state: Schema.TaggedUnion({
    Asking: { failure: Schema.NullOr(Schema.String) },
    Answering: { accept: Schema.Boolean },
  }),
  model: Schema.Struct({ chosen: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({
    Chosen: { userId: Schema.String },
    Answered: { userId: Schema.String, accept: Schema.Boolean },
    AnswerFailed: { message: Schema.String },
  }),
});

export const ConsentLive = Consent.build({
  init: () => ({
    state: { _tag: 'Asking', failure: null },
    model: { chosen: null },
  }),
  workers: {
    // Another tab changed who is signed in: loaded anew once shown again.
    accounts: {
      run: (self) => followPageAccounts(self),
    },
  },
  states: {
    Asking: {
      on: {
        Chosen: ({ userId }) => ({ model: { chosen: userId } }),
        Answered: ({ userId, accept }, { props }) => {
          const request = readyData(props.status)?.request;
          return request?._tag === 'Found'
            ? {
                state: { _tag: 'Answering', accept },
                command: answer({ query: request.query, userId, accept }),
              }
            : {};
        },
      },
    },
    Answering: {
      on: {
        AnswerFailed: ({ message }) => ({
          state: { _tag: 'Asking', failure: message },
        }),
      },
    },
  },
});
