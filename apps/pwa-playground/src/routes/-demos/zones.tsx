import { GestureZone } from '@kstackz/use-gesture';
import { type Pointers, useGesture } from '@kstackz/use-gesture/core';
import { LockIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Controls,
  Stage,
  Toggle,
  Value,
  Values,
} from '../../components/index.ts';
import { Fingers } from './kit.tsx';

export type ZoneOptions = {
  readonly trapList: boolean;
  readonly trapRow: boolean;
};

export const ZONE_DEFAULTS: ZoneOptions = { trapList: false, trapRow: false };

// Pads each tag so the zone names line up in a column.
const tag = (text: string, name: string) => `${text.padEnd(36)}{/* ${name} */}`;

export const zonesCode = (
  o: ZoneOptions,
) => `import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';

<GestureProvider>
${tag('  <GestureZone>', 'Screen')}
    <Listener name="Screen" />
${tag(`    <GestureZone${o.trapList ? ' trapped' : ''}>`, 'List')}
      <Listener name="List" />
${tag(`      <GestureZone${o.trapRow ? ' trapped' : ''}>`, 'Row')}
        <Listener name="Row" />
      </GestureZone>
    </GestureZone>
  </GestureZone>
</GestureProvider>

function Listener({ name }) {
  // Hears what its nearest zone hears, as every finger's motion values.
  const { active, pointers } = useGesture({
    onStart: (pointers) => {},
    onEnd: (pointers, { interrupted, preventClick }) => {},
  });
}`;

type Heard = {
  readonly zones: ReadonlyArray<string>;
  readonly fingers: number;
  readonly interrupted: boolean;
};

type Report = {
  readonly start: (name: string) => void;
  readonly end: (pointers: Pointers, interrupted: boolean) => void;
};

const ReportContext = createContext<Report | undefined>(undefined);

const DEPTH: Record<string, number> = { Row: 0, List: 1, Screen: 2 };

/** One zone's listener, drawn as the zone: lit while it hears a Gesture. */
function Zone(props: {
  readonly name: string;
  readonly trapped?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <GestureZone
      trapped={props.trapped ?? false}
      className={cn('flex min-h-0 flex-col', props.className)}
    >
      <Ear name={props.name} trapped={props.trapped ?? false}>
        {props.children}
      </Ear>
    </GestureZone>
  );
}

function Ear(props: {
  readonly name: string;
  readonly trapped: boolean;
  readonly children?: ReactNode;
}) {
  const report = useContext(ReportContext);
  const { active } = useGesture({
    onStart: () => report?.start(props.name),
    // Every zone that heard it reports the same end; the last one wins.
    onEnd: (pointers, end) => report?.end(pointers, end.interrupted),
  });
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border-2 p-2.5 transition-colors duration-100',
        active
          ? 'border-foreground bg-foreground/[0.07]'
          : 'border-dashed border-foreground/20',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 font-mono text-xs transition-colors duration-100',
          active
            ? 'bg-foreground text-background'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {props.trapped ? (
          <LockIcon aria-hidden="true" className="size-3" />
        ) : null}
        {props.name}
        {active ? ' · hears' : ''}
      </span>
      {props.children}
    </div>
  );
}

function Screen(props: {
  readonly options: ZoneOptions;
  readonly controls: ReactNode;
}) {
  const [heard, setHeard] = useState<Heard | null>(null);
  // Zones report as the first finger lands, all in the same moment.
  const current = useRef<{ zones: string[]; at: number }>({ zones: [], at: 0 });
  const report: Report = {
    start: (name) => {
      const now = performance.now();
      if (now - current.current.at > 50) current.current.zones = [];
      current.current.at = now;
      current.current.zones.push(name);
    },
    end: (pointers, interrupted) =>
      setHeard({
        zones: [...current.current.zones].sort(
          (a, b) => (DEPTH[a] ?? 0) - (DEPTH[b] ?? 0),
        ),
        fingers: pointers.size,
        interrupted,
      }),
  };

  return (
    <>
      <Stage className="h-[26rem] max-h-[64svh] items-stretch">
        <ReportContext value={report}>
          {/* The Playground itself is the trapped zone around these. */}
          <Ear name="Screen" trapped={false}>
            <Zone
              name="List"
              trapped={props.options.trapList}
              className="flex-1"
            >
              <p className="px-1 text-xs text-muted-foreground">
                Touch here: List and Screen hear it.
              </p>
              <Zone
                name="Row"
                trapped={props.options.trapRow}
                className="flex-1"
              >
                <p className="px-1 text-xs text-muted-foreground">
                  Touch here: all three, up to the first trapped one.
                </p>
              </Zone>
            </Zone>
          </Ear>
        </ReportContext>
        <Fingers />
      </Stage>
      {props.controls}
      <Values>
        <Value label="heard by" testId="zones-heard">
          {heard === null ? '—' : heard.zones.join(' → ')}
        </Value>
        <Value label="fingers" testId="zones-fingers">
          {heard?.fingers ?? '—'}
        </Value>
        <Value label="interrupted">
          {heard === null ? '—' : String(heard.interrupted)}
        </Value>
      </Values>
    </>
  );
}

/** Three nested zones, each lit while it hears the touch under way. */
export function ZonesDemo(props: {
  readonly options: ZoneOptions;
  readonly onOptions: (options: ZoneOptions) => void;
}) {
  const { options } = props;
  const set = (patch: Partial<ZoneOptions>) =>
    props.onOptions({ ...options, ...patch });
  return (
    <Screen
      options={options}
      controls={
        <Controls>
          <Toggle
            label="Trap List"
            checked={options.trapList}
            onChange={(trapList) => set({ trapList })}
          />
          <Toggle
            label="Trap Row"
            checked={options.trapRow}
            onChange={(trapRow) => set({ trapRow })}
          />
          <p className="text-sm text-pretty text-muted-foreground">
            A trapped zone still hears its own touches; the zones around it
            don’t. Put a second finger down anywhere: it joins the same Gesture.
          </p>
        </Controls>
      }
    />
  );
}
