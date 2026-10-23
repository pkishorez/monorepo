import { Effect, Schema } from 'effect';
import { AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { HarnessBinary, HarnessInfo } from '@kestack/ai-toolkit/api';
import { Refused } from '../../../../refusal/index.ts';
import { loadBinaries, setHarnessBinary } from './api.ts';

/*
 * One Machine's Harness Binaries: the program each agent runs as there,
 * read and set over that Machine's own socket, each Machine on its own.
 *
 * 1. Read    every agent's binary once: the path set, or none for its
 *            default, and what it resolved to. A Machine that does not
 *            answer is asked until it does.
 * 2. Set     a path typed is saved only once the Machine finds it runs;
 *            refused, the field keeps it and says why.
 * 3. Default forgets the path set, so the agent runs its default again.
 * A binary saved applies to agents started from then on.
 */

const Name = HarnessInfo.fields.name;

const HarnessBinaries = Actor.define('HarnessBinaries', {
  requires: [AiClients],
  input: Schema.Struct({ machineId: Schema.String }),
  model: Schema.Struct({
    machineId: Schema.String,
    binaries: Schema.NullOr(Schema.Array(HarnessBinary)),
    loadProblem: Schema.NullOr(Schema.String),
    /** What is typed in each agent's field, by agent; absent, its path set. */
    drafts: Schema.Record(Schema.String, Schema.String),
    saving: Schema.NullOr(Name),
    /** Why the server refused each agent's path, by agent. */
    problems: Schema.Record(Schema.String, Schema.String),
  }),
  message: Schema.TaggedUnion({
    BinariesLoaded: { binaries: Schema.Array(HarnessBinary) },
    Refused,
    Retry: {},
    Typed: { harness: Name, path: Schema.String },
    Save: { harness: Name },
    UseDefault: { harness: Name },
    BinarySaved: { binary: HarnessBinary },
    BinaryRefused: { harness: Name, reason: Schema.String },
  }),
});

const without = (record: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));

export const HarnessBinariesLive = Actor.build(HarnessBinaries, {
  init: ({ machineId }) => ({
    model: {
      machineId,
      binaries: null,
      loadProblem: null,
      drafts: {},
      saving: null,
      problems: {},
    },
  }),
  workers: {
    // 1. Read
    binaries: {
      while: ({ model }) =>
        model.binaries === null && model.loadProblem === null,
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.flatMap(loadBinaries(model.machineId), self.send),
        ),
    },
  },
  on: {
    BinariesLoaded: ({ binaries }, { model }) => ({
      model: { ...model, binaries },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, loadProblem: reason },
    }),
    Retry: (_, { model }) => ({ model: { ...model, loadProblem: null } }),
    Typed: ({ harness, path }, { model }) => ({
      model: {
        ...model,
        drafts: { ...model.drafts, [harness]: path },
        problems: without(model.problems, harness),
      },
    }),
    // 2. Set
    Save: ({ harness }, { model }) => {
      if (model.saving !== null) return {};
      const path = model.drafts[harness]?.trim() ?? '';
      if (path === '')
        return {
          model: {
            ...model,
            problems: {
              ...model.problems,
              [harness]: 'Type the path of the binary, or use the default',
            },
          },
        };
      return {
        model: { ...model, saving: harness },
        command: setHarnessBinary({
          machineId: model.machineId,
          harness,
          path,
        }),
      };
    },
    // 3. Default
    UseDefault: ({ harness }, { model }) =>
      model.saving !== null
        ? {}
        : {
            model: {
              ...model,
              saving: harness,
              drafts: without(model.drafts, harness),
              problems: without(model.problems, harness),
            },
            command: setHarnessBinary({
              machineId: model.machineId,
              harness,
              path: null,
            }),
          },
    BinarySaved: ({ binary }, { model }) => ({
      model: {
        ...model,
        saving: null,
        binaries: (model.binaries ?? []).map((each) =>
          each.harness === binary.harness ? binary : each,
        ),
        drafts: without(model.drafts, binary.harness),
        problems: without(model.problems, binary.harness),
      },
    }),
    BinaryRefused: ({ harness, reason }, { model }) => ({
      model: {
        ...model,
        saving: null,
        problems: { ...model.problems, [harness]: reason },
      },
    }),
  },
});
