import { View } from 'effect-oak/react';
import { PATCH_ROW_COUNT, UPDATE_WORK_MS, VIEW_WORK_MS } from './burn.js';
import { ACCENT, THRESHOLD_MS } from './phases.js';
import type { Phase, SlowWarningReport } from './phases.js';
import { PatchSurface } from './patch-surface/index.js';
import { Scenarios } from './scenarios/index.js';
import { SlowLab } from './slow-warnings.js';
import { SlowDraw, Timed, timedSend } from './timing.js';
import { Warnings } from './warnings/index.js';

const TRIGGER = {
  Idle: '',
  Update: 'ClickedRunUpdateWork',
  View: 'ClickedRunViewWork',
  Patch: 'ClickedRunPatchWork',
};

export const SlowLabView = View.make(SlowLab, ({ model, send }) => {
  const onSlow = (report: SlowWarningReport) =>
    send({ _tag: 'RecordedSlowWarning', report });
  const run = timedSend(send, onSlow);
  const workload = model.activeWorkload;
  return (
    <div className="size-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Each workload blocks one part of handling a Message long enough to
          pass its threshold.
        </p>
        <Timed
          run={model.run}
          phase={workload === 'View' || workload === 'Patch' ? workload : null}
          trigger={TRIGGER[workload]}
          onSlow={onSlow}
        >
          <SlowDraw slow={workload === 'View'} />
          <Scenarios
            scenarios={[
              {
                title: 'Slow Update',
                body: `Burns ${UPDATE_WORK_MS}ms of CPU before returning the next Model.`,
                thresholdMs: THRESHOLD_MS.Update,
                button: 'Run update work',
                accent: ACCENT.Update,
                run: () => run({ _tag: 'ClickedRunUpdateWork' }),
              },
              {
                title: 'Slow View',
                body: `Burns ${VIEW_WORK_MS}ms of CPU while the View draws.`,
                thresholdMs: THRESHOLD_MS.View,
                button: 'Run view work',
                accent: ACCENT.View,
                run: () => run({ _tag: 'ClickedRunViewWork' }),
              },
              {
                title: 'Slow patch',
                body: `Mounts ${PATCH_ROW_COUNT.toLocaleString()} keyed rows into the DOM.`,
                thresholdMs: THRESHOLD_MS.Patch,
                button: 'Run patch work',
                accent: ACCENT.Patch,
                run: () => run({ _tag: 'ClickedRunPatchWork' }),
              },
            ]}
          />
          <Warnings
            warnings={model.warnings}
            accentOf={(phase) => ACCENT[phase as Phase]}
            onClear={() => send({ _tag: 'ClickedClearWarnings' })}
          />
          <PatchSurface rows={model.patchRows} run={model.patchRun} />
        </Timed>
      </div>
    </div>
  );
});
