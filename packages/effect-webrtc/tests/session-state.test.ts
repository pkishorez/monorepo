import { describe, expect, it } from 'vitest';
import { ConnectionAttemptId } from '../src/negotiation/index.js';
import { transition } from '../src/effect-webrtc/session-state.js';

describe('Peer Session state machine', () => {
  it('moves one attempt through negotiation, connection, and recovery', () => {
    const attemptId = ConnectionAttemptId.make('attempt-1');
    const connecting = transition(
      {
        _tag: 'Connecting',
        role: 'Initiator',
        phase: 'waiting-for-peer',
      },
      { _tag: 'AttemptStarted', role: 'Initiator', attemptId },
    );
    const negotiating = transition(connecting, { _tag: 'AnswerReceived' });
    const connected = transition(negotiating, { _tag: 'Connected' });
    const reconnecting = transition(connected, {
      _tag: 'Lost',
      reason: 'heartbeat-timeout',
    });

    expect(negotiating).toMatchObject({
      _tag: 'Connecting',
      phase: 'negotiating',
    });
    expect(connected).toEqual({
      _tag: 'Connected',
      role: 'Initiator',
      attemptId,
    });
    expect(reconnecting).toEqual({
      _tag: 'Reconnecting',
      role: 'Initiator',
      reason: 'heartbeat-timeout',
      attemptId,
    });
  });

  it('returns to Connected when the same attempt recovers from a transient loss', () => {
    const attemptId = ConnectionAttemptId.make('attempt-1');
    const lost = transition(
      { _tag: 'Connected', role: 'Initiator', attemptId },
      { _tag: 'Lost', reason: 'rtc-disconnected' },
    );

    expect(transition(lost, { _tag: 'Connected' })).toEqual({
      _tag: 'Connected',
      role: 'Initiator',
      attemptId,
    });
  });
});
