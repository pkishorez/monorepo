import { Context, Layer } from 'effect';
import {
  makeVoiceSession,
  type VoiceSessionService,
} from '../../../../engine/session/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';

/** The engine session specialised to this demo's payload. */
export class StudioSession extends Context.Service<
  StudioSession,
  VoiceSessionService<ContextPayload>
>()('stt/StudioSession') {}

export const studioLayer = Layer.effect(
  StudioSession,
  makeVoiceSession<ContextPayload>(),
);
