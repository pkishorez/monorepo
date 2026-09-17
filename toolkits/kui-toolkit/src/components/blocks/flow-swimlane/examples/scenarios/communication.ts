import { Effect } from 'effect';
import { Activation, Flow } from '@pkishorez/flow';
import type { FlowScenario } from './scenarios';

const webrtc = (): FlowScenario => ({
  id: 'webrtc-call-123',
  title: 'WebRTC offer and answer',
  program: () => {
    const flow = Flow.make({ id: 'webrtc-call-123' });
    const clientA = flow.participant('client-a');
    const server = flow.participant('signaling-server');
    const clientB = flow.participant('client-b');
    return Effect.gen(function* () {
      const activation = yield* clientA.activation.start('Peer call');
      yield* Effect.sleep('4 millis').pipe(
        Effect.withSpan('peer-connection.create'),
        Effect.andThen(clientA.event('Create offer')),
      );
      const offer = yield* clientA.send(server, 'Send SDP offer');
      yield* server.activated('Authorize call')(Effect.sleep('3 millis'));
      yield* server.reply(offer, 'Offer acknowledged');
      yield* server.send(clientB, 'Forward SDP offer');
      yield* clientB.waiting('user accepts the call')(Effect.sleep('5 millis'));
      yield* clientB.send(server, 'Send SDP answer');
      yield* server.send(clientA, 'Forward SDP answer');
      yield* clientA.event('Remote description installed');
      yield* clientB.check('ICE connection established', true);
      yield* activation.end(Activation.completed());
    });
  },
});

const chatModeration = (): FlowScenario => ({
  id: 'chat-message-204',
  title: 'Chat message moderation',
  program: () => {
    const flow = Flow.make({ id: 'chat-message-204' });
    const alice = flow.participant('alice');
    const chat = flow.participant('chat-server');
    const moderator = flow.participant('moderator');
    const bob = flow.participant('bob');
    return Effect.gen(function* () {
      const activation = yield* chat.activation.start('Chat session');
      yield* alice.event('Compose message');
      yield* alice.send(chat, 'Publish message');
      yield* chat.event('Persist message');
      const review = yield* chat.send(moderator, 'Request content review');
      yield* moderator.activated('Classify content')(Effect.sleep('4 millis'));
      yield* moderator.reply(review, 'Content approved');
      yield* chat.send(bob, 'Deliver message');
      yield* bob.event('Unread count incremented');
      yield* activation.end(Activation.completed());
    });
  },
});

const tokenRefresh = (): FlowScenario => ({
  id: 'token-refresh-88',
  title: 'Expired token refresh',
  program: () => {
    const flow = Flow.make({ id: 'token-refresh-88' });
    const browser = flow.participant('browser');
    const api = flow.participant('api');
    const identity = flow.participant('identity-provider');
    return Effect.gen(function* () {
      const activation = yield* browser.activation.start('Browser session');
      yield* browser.send(api, 'Request protected resource');
      yield* api.check('access token valid', false);
      yield* api.send(browser, '401 token expired');
      yield* browser.event('Refresh required', { severity: 'warning' });
      const exchange = yield* browser.send(identity, 'Exchange refresh token');
      yield* identity.activated('Rotate tokens')(Effect.sleep('4 millis'));
      yield* identity.reply(exchange, 'Issue new access token');
      yield* browser.send(api, 'Retry protected request');
      yield* api.event('Load profile');
      yield* activation.end(Activation.completed());
    });
  },
});

export const communicationScenarios = [
  webrtc(),
  chatModeration(),
  tokenRefresh(),
] as const;
