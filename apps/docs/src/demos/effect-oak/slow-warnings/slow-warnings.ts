import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { burnCpu, PATCH_ROW_COUNT, UPDATE_WORK_MS } from './burn.js';
import { SlowWarningReport } from './phases.js';

/*
 * A lab of slow work: each button makes one part of handling a Message slow
 * on purpose, and each slow part is recorded as a warning.
 *
 * Effect Oak has no slow callback, so nothing here is told about slow work by
 * the Runtime. The View times it instead (see timing.tsx) and sends what it
 * saw as RecordedSlowWarning. Update work burns CPU in Update itself, View
 * work in the View's draw, and Patch work mounts thousands of rows.
 */

const MAX_WARNING_COUNT = 8;

const Workload = Schema.Literals(['Idle', 'Update', 'View', 'Patch']);

export const SlowLab = Actor.make('SlowLab', {
  model: Schema.Struct({
    activeWorkload: Workload,
    /** Counts every run, so the View knows a new one has started. */
    run: Schema.Number,
    nextWarningId: Schema.Number,
    warnings: Schema.Array(
      Schema.Struct({ id: Schema.Number, ...SlowWarningReport.fields }),
    ),
    patchRows: Schema.Number,
    patchRun: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    ClickedRunUpdateWork: {},
    ClickedRunViewWork: {},
    ClickedRunPatchWork: {},
    ClickedClearWarnings: {},
    RecordedSlowWarning: { report: SlowWarningReport },
  }),
}).build({
  init: () => ({
    model: {
      activeWorkload: 'Idle',
      run: 0,
      nextWarningId: 1,
      warnings: [],
      patchRows: 0,
      patchRun: 0,
    },
  }),
  update: {
    ClickedRunUpdateWork: (_, { model }) => {
      burnCpu(UPDATE_WORK_MS);
      return {
        model: { ...model, activeWorkload: 'Update', run: model.run + 1 },
      };
    },
    ClickedRunViewWork: (_, { model }) => ({
      model: { ...model, activeWorkload: 'View', run: model.run + 1 },
    }),
    ClickedRunPatchWork: (_, { model }) => ({
      model: {
        ...model,
        activeWorkload: 'Patch',
        run: model.run + 1,
        patchRows: PATCH_ROW_COUNT,
        patchRun: model.patchRun + 1,
      },
    }),
    ClickedClearWarnings: (_, { model }) => ({
      model: { ...model, activeWorkload: 'Idle', warnings: [] },
    }),
    RecordedSlowWarning: ({ report }, { model }) => ({
      model: {
        ...model,
        activeWorkload: 'Idle',
        nextWarningId: model.nextWarningId + 1,
        warnings: [
          { id: model.nextWarningId, ...report },
          ...model.warnings,
        ].slice(0, MAX_WARNING_COUNT),
      },
    }),
  },
});
