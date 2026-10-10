import { instanceAt } from 'effect-oak';
import { X } from '#lib/lucide';
import { JsonTree } from '../../../components/viewers/json/index.ts';
import type { Detail, Inspection } from '../inspection/index.ts';
import { Segmented } from '../segmented/index.ts';
import { describe, kindOf, rowsOf, shortId } from '../step/index.ts';
import { Happened } from './happened.tsx';
import type { NameOf } from './happened.tsx';
import { Snapshot } from './snapshot.tsx';

/*
 * The Step shown, told the same way below the Timeline and the Inspector.
 *
 * 1. Narrow  the Instance picked on the map, or the whole app.
 * 2. Name    every Instance by its Actor and key, never its ID.
 * 3. Tell    What happened (the Message, what it did, what it carried, every
 *            change), Snapshot (the app right after, changes lit), or JSON.
 */

const DETAILS: ReadonlyArray<{
  readonly value: Detail;
  readonly label: string;
}> = [
  { value: 'happened', label: 'What happened' },
  { value: 'snapshot', label: 'Snapshot' },
  { value: 'json', label: 'JSON' },
];

export const StepDetails = ({
  inspection,
}: {
  readonly inspection: Inspection;
}) => {
  const { step, picked, detail } = inspection;
  const around = inspection.around(step);
  if (!around) return null;
  // 1. Narrow
  const all = rowsOf(around);
  const rows =
    picked === null ? all : all.filter((row) => row.instance.id === picked);
  const one = picked === null ? undefined : rows[0];
  // 2. Name
  const nameOf: NameOf = (id) => {
    const instance =
      instanceAt(around.after, id) ??
      (around.before && instanceAt(around.before, id));
    if (!instance) return shortId(id);
    return instance.key === undefined
      ? instance.actor
      : `${instance.actor} ${instance.key}`;
  };

  return (
    <div className="flex h-full flex-col border-t">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Segmented
          id="oak-detail-tab"
          label="Step"
          value={detail}
          options={DETAILS}
          onChange={inspection.setDetail}
        />
        <span className="flex-1" />
        {picked !== null && (
          <span className="flex min-w-0 items-center gap-1 rounded-full border bg-background py-0.5 pr-0.5 pl-2 text-[11px]">
            <span className="text-muted-foreground">Only</span>
            <span className="truncate font-medium" title={picked}>
              {nameOf(picked)}
            </span>
            <button
              type="button"
              aria-label="Show the whole app"
              title="Show the whole app"
              onClick={() => inspection.pick(null)}
              className="flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* 3. Tell */}
        {picked !== null && !one ? (
          <p className="text-xs text-muted-foreground">
            {nameOf(picked)} isn’t running at this Step.
          </p>
        ) : detail === 'happened' ? (
          <Happened
            step={step}
            kind={kindOf(step, around)}
            rows={rows}
            nameOf={nameOf}
          />
        ) : detail === 'snapshot' ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              The app right after {step === 'init' ? 'init' : step.message._tag}
              . What it changed is highlighted.
            </p>
            <Snapshot rows={rows.filter((row) => row.life !== 'stopped')} />
          </div>
        ) : (
          <div className="text-xs">
            <JsonTree
              key={one ? one.instance.id : 'snapshot'}
              value={describe(one ? one.instance : around.after)}
              collapsed={false}
              tone="syntax"
            />
          </div>
        )}
      </div>
    </div>
  );
};
