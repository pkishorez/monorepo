import { Clock, Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { ChatServer } from './chat-server/index.js';
import { Composer, Conversation } from './composer/index.js';

/*
 * A chat with an echo server: Disconnected → Online → Disconnected or Error.
 *
 * Online's Lifetime holds the socket open for as long as the State lasts,
 * and turns what happens to it into Messages. Connecting and Connected are
 * one State, Online, told apart by `connected`: two States would mean two
 * Lifetimes, and the socket would close between them. Online Provides Conversation
 * to its Composer Child; a send that works or fails comes back here. The
 * conversation lives in Online, so leaving it clears the messages.
 */

const ChatMessage = Schema.Struct({
  text: Schema.String,
  sentAt: Schema.Number,
  isSent: Schema.Boolean,
});

/** Wall-clock time, for the time shown under each message. */
const wallClock = Clock.currentTimeMillis;

export const Chat = Actor.make('Chat', {
  requires: { server: ChatServer },
  state: Schema.TaggedUnion({
    Disconnected: {},
    Online: { connected: Schema.Boolean, messages: Schema.Array(ChatMessage) },
    Error: { error: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ClickedConnect: {},
    ConnectedChatSocket: {},
    DisconnectedChatSocket: {},
    FailedChatSocket: { error: Schema.String },
    ReceivedMessage: { text: Schema.String, sentAt: Schema.Number },
    SucceededSendMessage: { text: Schema.String, sentAt: Schema.Number },
    FailedSendMessage: { error: Schema.String },
  }),
  provides: { Online: [Conversation] },
  children: { Online: { composer: Composer } },
}).build({
  init: () => ({ state: { _tag: 'Disconnected' } }),
  lifetime: {
    Online: (self) =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* ChatServer).connect;
        }),
      ).pipe(
        Stream.mapEffect((event) =>
          Effect.map(wallClock, (sentAt) => {
            switch (event._tag) {
              case 'Opened':
                return { _tag: 'ConnectedChatSocket' as const };
              case 'Received':
                return {
                  _tag: 'ReceivedMessage' as const,
                  text: event.text,
                  sentAt,
                };
              case 'Closed':
                return { _tag: 'DisconnectedChatSocket' as const };
              case 'Failed':
                return {
                  _tag: 'FailedChatSocket' as const,
                  error: event.error,
                };
            }
          }),
        ),
        Stream.runForEach(self.send),
      ),
  },
  provides: {
    Online: (self) =>
      Layer.effect(
        Conversation,
        Effect.gen(function* () {
          const server = yield* ChatServer;
          return {
            send: (text) =>
              server.send(text).pipe(
                Effect.andThen(wallClock),
                Effect.matchEffect({
                  onSuccess: (sentAt) =>
                    self.send({ _tag: 'SucceededSendMessage', text, sentAt }),
                  onFailure: (error) =>
                    self.send({ _tag: 'FailedSendMessage', error }),
                }),
              ),
          };
        }),
      ),
  },
  update: {
    Disconnected: {
      ClickedConnect: () => ({
        state: { _tag: 'Online', connected: false, messages: [] },
      }),
    },
    Error: {
      ClickedConnect: () => ({
        state: { _tag: 'Online', connected: false, messages: [] },
      }),
    },
    Online: {
      ConnectedChatSocket: (_, { state }) => ({
        state: { ...state, connected: true },
      }),
      ReceivedMessage: ({ text, sentAt }, { state }) => ({
        state: {
          ...state,
          messages: [...state.messages, { text, sentAt, isSent: false }],
        },
      }),
      SucceededSendMessage: ({ text, sentAt }, { state }) => ({
        state: {
          ...state,
          messages: [...state.messages, { text, sentAt, isSent: true }],
        },
      }),
      DisconnectedChatSocket: () => ({ state: { _tag: 'Disconnected' } }),
      FailedChatSocket: ({ error }) => ({ state: { _tag: 'Error', error } }),
      FailedSendMessage: ({ error }) => ({ state: { _tag: 'Error', error } }),
    },
  },
});

export { ChatServerLive } from './chat-server/index.js';
