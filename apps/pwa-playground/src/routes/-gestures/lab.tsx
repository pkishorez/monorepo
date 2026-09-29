import { GestureProvider } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kstackz/ui-toolkit/components/ui/select';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HandIcon,
} from '@kstackz/ui-toolkit/lucide';
import { type ReactNode, useEffect, useState } from 'react';
import { CASES, type CaseId, caseOf } from './cases.tsx';
import { Overlay, useStrays } from './overlay.tsx';
import { Panel } from './panel.tsx';
import { createLabStore, LabStoreContext, useLabStore } from './store.ts';

const LABELS: Record<CaseId, string> = Object.fromEntries(
  CASES.map((c, i) => [c.id, `${i + 1}. ${c.title}`]),
);

function Picker(props: {
  readonly id: CaseId;
  readonly onCase: (id: CaseId) => void;
}) {
  const index = CASES.findIndex((c) => c.id === props.id);
  const step = (by: number) => {
    const next = CASES[(index + by + CASES.length) % CASES.length];
    if (next !== undefined) props.onCase(next.id);
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous case"
        className="size-9 shrink-0"
        onClick={() => step(-1)}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <Select
        value={props.id}
        items={LABELS}
        onValueChange={(next) => {
          if (next !== null) props.onCase(next);
        }}
      >
        <SelectTrigger
          aria-label="Case"
          data-testid="gestures-case"
          className="min-w-0 flex-1 font-medium"
        >
          <SelectValue className="min-w-0 truncate" />
        </SelectTrigger>
        {/* In a portal, outside the header: marked disabled like it, so it
            works while a Gesture runs. */}
        <SelectContent
          data-zone-gesture="disabled"
          alignItemWithTrigger={false}
        >
          {CASES.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {LABELS[c.id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next case"
        className="size-9 shrink-0"
        onClick={() => step(1)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function Stage(props: { readonly id: CaseId }) {
  const store = useLabStore();
  const current = caseOf(props.id);
  const { Stage: Zones } = current;
  useStrays();
  // A new Case starts with a clean slate.
  useEffect(() => store.reset, [store, props.id]);
  return (
    <>
      <div className="flex shrink-0 items-start gap-2 px-3 pt-2 pb-1">
        <p className="line-clamp-2 h-[2lh] flex-1 text-[13px] leading-snug text-pretty text-muted-foreground">
          {current.blurb}
        </p>
        {current.touch ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <HandIcon aria-hidden="true" className="size-3" />
            best on touch
          </span>
        ) : null}
      </div>
      <main
        data-lab-stage=""
        data-testid="gestures-stage"
        data-case={current.id}
        className="flex min-h-0 flex-1 flex-col gap-2 p-2"
      >
        <Zones key={current.id} />
      </main>
      <Panel key={current.id} guide={current.guide} />
      <Overlay />
    </>
  );
}

/**
 * The Gesture Lab: pick a Case, touch its zones, and read what happened.
 * One Gesture Provider holds the whole Lab; only the stage is zones. The
 * header and panel are marked disabled, so they work while a Gesture runs.
 */
export function GestureLab(props: {
  readonly id: CaseId;
  readonly onCase: (id: CaseId) => void;
  /** The Lab's own buttons, such as Home and the theme. */
  readonly start: ReactNode;
  readonly end: ReactNode;
}) {
  const [store] = useState(createLabStore);
  return (
    <LabStoreContext value={store}>
      <GestureProvider>
        <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <header
            data-zone-gesture="disabled"
            className="box-content flex h-12 shrink-0 items-center gap-1 border-b border-border pt-[max(12px,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]"
          >
            {props.start}
            <Picker id={props.id} onCase={props.onCase} />
            {props.end}
          </header>
          <Stage id={props.id} />
        </div>
      </GestureProvider>
    </LabStoreContext>
  );
}
