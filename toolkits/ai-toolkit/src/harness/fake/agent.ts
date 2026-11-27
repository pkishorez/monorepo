import { Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { HARNESS_NAMES } from '../../contract/raw/index.js';
import { agentOver, type AgentOptions } from './layer.js';
import { RECORDING_NAMES } from './recordings/index.js';

/*
 * The Agent fake: Claude Code and Codex as one computer has them. Its
 * state is what the fake harnesses replay (layer.ts) and every reply
 * replaying, so DevTools shows each.
 *
 * - Replies    what the next reply replays (`replyWith`: a recording by
 *              name, or `random`, one of its harness's at random), the one
 *              control. Each reply running is in `replies`, from its start
 *              to its end.
 * - Agents     the Agents open, each on the model and settings its latest
 *              Turn ran on.
 * - Context    the Context Usage every Agent reports, and its limits.
 *
 * It starts on a random recording with nothing open. Claude Code and Codex
 * are both installed and signed in, as on a computer Code runs on.
 */

const Harness = Schema.Literals(HARNESS_NAMES);

const RecordingName = Schema.Literals(RECORDING_NAMES);

const Settings = Schema.Record(Schema.String, Schema.String);

export const AgentState = Schema.Struct({
  /** What every reply from now on replays. */
  replyWith: RecordingName,
  /** The Agents open, each with the model and settings its latest Turn runs on. */
  agents: Schema.Array(
    Schema.Struct({
      /** Its Native Id. */
      id: Schema.String,
      harness: Harness,
      cwd: Schema.String,
      model: Schema.String,
      settings: Settings,
    }),
  ),
  /** The replies running. */
  replies: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      /** The Native Id of the Agent it runs in. */
      agent: Schema.String,
      harness: Harness,
      /** What it was asked. */
      prompt: Schema.String,
      /** The recording it replays. */
      recording: Schema.String,
    }),
  ),
  context: Schema.Struct({
    usedTokens: Schema.Int,
    maxTokens: Schema.Int,
    /** The plan's limits, in percent used. */
    sessionPercent: Schema.Finite,
    weeklyPercent: Schema.Finite,
  }),
});
export type AgentState = typeof AgentState.Type;

/** A random recording, nothing open. */
const initial: AgentState = {
  replyWith: 'random',
  agents: [],
  replies: [],
  context: {
    usedTokens: 24_000,
    maxTokens: 200_000,
    sessionPercent: 12,
    weeklyPercent: 31,
  },
};

/** The Agent fake. Its Layer gives `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models`. */
export const agent = (options: AgentOptions = {}) =>
  Fake.make({
    name: 'agent',
    state: AgentState,
    initial,
    controls: {
      ReplyWith: Fake.control(
        AgentState,
        Schema.Struct({ recording: RecordingName }).annotate({
          description:
            "Every agent's reply from now on replays this recording, or a random one of its harness's.",
        }),
        ({ recording }, state) =>
          SubscriptionRef.update(state, (s) => ({
            ...s,
            replyWith: recording,
          })),
      ),
    },
    layer: (state) => agentOver(state, options),
  });
