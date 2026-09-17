import type { ConnectionAttemptId } from '../negotiation/index.js';

export type NegotiationRole = 'Initiator' | 'Responder';
export type ConnectionPhase =
  | 'waiting-for-peer'
  | 'negotiating'
  | 'opening-data-channel';
export type RecoveryReason =
  | 'answer-timeout'
  | 'establishment-timeout'
  | 'heartbeat-timeout'
  | 'rtc-disconnected'
  | 'rtc-failed';

export type SessionState =
  | {
      readonly _tag: 'Connecting';
      readonly role: NegotiationRole;
      readonly phase: ConnectionPhase;
      readonly attemptId?: ConnectionAttemptId;
    }
  | {
      readonly _tag: 'Connected';
      readonly role: NegotiationRole;
      readonly attemptId: ConnectionAttemptId;
    }
  | {
      readonly _tag: 'Reconnecting';
      readonly role: NegotiationRole;
      readonly reason: RecoveryReason;
      readonly phase?: ConnectionPhase;
      readonly attemptId?: ConnectionAttemptId;
    };

export type SessionTransition =
  | {
      readonly _tag: 'AttemptStarted';
      readonly attemptId: ConnectionAttemptId;
      readonly role: NegotiationRole;
    }
  | { readonly _tag: 'AnswerReceived' }
  | { readonly _tag: 'DataChannelOpening' }
  | { readonly _tag: 'Connected' }
  | { readonly _tag: 'Lost'; readonly reason: RecoveryReason }
  | {
      readonly _tag: 'BecameResponder';
      readonly attemptId: ConnectionAttemptId;
    };

export const transition = (
  state: SessionState,
  event: SessionTransition,
): SessionState => {
  switch (event._tag) {
    case 'AttemptStarted':
      return state._tag === 'Reconnecting'
        ? {
            ...state,
            role: event.role,
            attemptId: event.attemptId,
            phase: 'waiting-for-peer',
          }
        : {
            _tag: 'Connecting',
            role: event.role,
            attemptId: event.attemptId,
            phase: 'waiting-for-peer',
          };
    case 'BecameResponder':
      return state._tag === 'Reconnecting'
        ? {
            ...state,
            role: 'Responder',
            attemptId: event.attemptId,
            phase: 'negotiating',
          }
        : {
            _tag: 'Connecting',
            role: 'Responder',
            attemptId: event.attemptId,
            phase: 'negotiating',
          };
    case 'AnswerReceived':
      return state._tag === 'Connected'
        ? state
        : { ...state, phase: 'negotiating' };
    case 'DataChannelOpening':
      return state._tag === 'Connected'
        ? state
        : { ...state, phase: 'opening-data-channel' };
    case 'Connected':
      if (state.attemptId === undefined) return state;
      return {
        _tag: 'Connected',
        role: state.role,
        attemptId: state.attemptId,
      };
    case 'Lost':
      return {
        _tag: 'Reconnecting',
        role: state.role,
        reason: event.reason,
        ...(state.attemptId === undefined
          ? {}
          : { attemptId: state.attemptId }),
      };
  }
};
