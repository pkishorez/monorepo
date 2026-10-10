import { Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { AsyncData } from '../async-data/index.js';
import { Choice, Choices, Controls, FIRST_CHOICE } from './controls/index.js';
import { Telemetry, TelemetryData } from './telemetry/index.js';

/*
 * A dashboard of Foldkit's own numbers: the Telemetry as AsyncData, the
 * chart's choices as reported by the Controls Child, and the datum last
 * clicked. The chart is drawn by the View from all three, so there is no
 * chart instance to keep in step: Foldkit's SyncChart and MountChart
 * Commands have no counterpart.
 */

const fetchTelemetry = Effect.gen(function* () {
  const result = yield* AsyncData.attempt((yield* Telemetry).fetch);
  return { _tag: 'SettledFetchTelemetry' as const, result };
});

const Model = Schema.Struct({
  telemetry: AsyncData.schema(TelemetryData),
  choice: Choice,
  selectedDatumId: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

const refetch = (_: unknown, { model }: { readonly model: Model }) => {
  const telemetry = AsyncData.revalidateOrLoad(model.telemetry);
  return telemetry
    ? { model: { ...model, telemetry }, command: fetchTelemetry }
    : {};
};

export const Charting = Actor.make('Charting', {
  requires: { telemetry: Telemetry },
  model: Model,
  message: Schema.TaggedUnion({
    ClickedRefresh: {},
    ClickedRetry: {},
    ClickedChartDatum: { datumId: Schema.String },
    ReportedChoice: { choice: Choice },
    SettledFetchTelemetry: { result: AsyncData.result(TelemetryData) },
  }),
  provides: [Choices],
  children: { controls: Controls },
}).build({
  init: () => ({
    model: {
      telemetry: AsyncData.loading,
      choice: FIRST_CHOICE,
      selectedDatumId: null,
    },
  }),
  lifetime: (self) =>
    Effect.flatMap(fetchTelemetry, (message) => self.send(message)),
  provides: (self) =>
    Layer.succeed(Choices, {
      chose: (choice) => self.send({ _tag: 'ReportedChoice', choice }),
    }),
  update: {
    ClickedRefresh: refetch,
    ClickedRetry: refetch,
    ClickedChartDatum: ({ datumId }, { model }) => ({
      model: { ...model, selectedDatumId: datumId },
    }),
    ReportedChoice: ({ choice }, { model }) => ({
      model: { ...model, choice, selectedDatumId: null },
    }),
    SettledFetchTelemetry: ({ result }, { model }) => ({
      model: { ...model, telemetry: AsyncData.settle(model.telemetry, result) },
    }),
  },
});

export { NpmAndGitHub } from './telemetry/index.js';
