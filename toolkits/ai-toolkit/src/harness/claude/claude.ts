import { Effect, Stream } from 'effect';
import type {
  Harness,
  Agent,
  TurnHandle,
  TurnInput,
} from '../contract/index.js';
import {
  availableModels,
  binary,
  executable,
  skills,
} from './catalog/index.js';
import { project } from './project/index.js';
import {
  openSdkAgent,
  type SdkTurn,
  type SdkTurnHandle,
} from './agent/index.js';
import { ask, fork } from './fork/index.js';
import { readSettings, SETTINGS } from './settings.js';

/** A dated snapshot such as `claude-opus-4-5-20251101` repeats its alias. */
const DATED = /-\d{8}$/;

/**
 * Claude Code through the Agent SDK: one streaming-input `query` per open
 * session, steered by pushing more user messages into it. Every process it
 * starts runs the Harness Account's Claude Code, never one of the SDK's.
 */
export const claude: Harness = {
  name: 'claude',
  label: 'Claude',
  modelsProvider: 'anthropic',
  acceptsModel: (modelId) =>
    modelId.startsWith('claude-') && !DATED.test(modelId),
  defaultModel: 'claude-opus-5-5',
  availableModels,
  settings: SETTINGS,
  open: (config) =>
    Effect.gen(function* () {
      // Setting values a Turn leaves out keep their current value.
      let values = config.settings;
      const toSdkTurn = (input: TurnInput): SdkTurn => {
        if (input.settings !== undefined) {
          values = { ...values, ...input.settings };
        }
        return {
          text: input.text,
          images: input.images,
          options: {
            ...(input.model === undefined ? {} : { model: input.model }),
            ...(input.settings === undefined ? {} : readSettings(values)),
          },
        };
      };
      const session = yield* openSdkAgent({
        cwd: config.cwd,
        model: config.model,
        executable: yield* executable,
        ...readSettings(config.settings),
        ...(config.nativeId === undefined ? {} : { nativeId: config.nativeId }),
      });
      const handleOf = (handle: SdkTurnHandle): TurnHandle => ({
        out: handle.out,
        steer: (id, input) => handle.steer(id, toSdkTurn(input)),
      });
      const agent: Agent = {
        ...session,
        turn: (input) => handleOf(session.turn(toSdkTurn(input))),
        agentTurns: Stream.map(session.agentTurns, handleOf),
      };
      return agent;
    }),
  skills,
  fork: (input) => Effect.flatMap(executable, (found) => fork(input, found)),
  ask: (input) => Effect.flatMap(executable, (found) => ask(input, found)),
  binary,
  project,
};
