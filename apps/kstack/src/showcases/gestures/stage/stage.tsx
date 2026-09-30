import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import { Maximize2Icon, XIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { Link } from '@tanstack/react-router';
import { useContext, useEffect } from 'react';
import { CodeButton } from '../../../common/code.tsx';
import { appTheme } from '../../../common/theme.ts';
import type { Scenario } from '../topic.ts';
import { Fingers } from './fingers.tsx';
import { StatusContext, StatusProvider } from './status.tsx';

/** Says, in a few words, what the demo is doing now, under it. */
export function useStageStatus(text: string | undefined) {
  const setStatus = useContext(StatusContext);
  useEffect(() => setStatus(text), [setStatus, text]);
}

const codeOf = (scenario: Scenario) => (
  <CodeButton
    title={scenario.sentence}
    files={[{ path: scenario.file, content: scenario.source }]}
  />
);

/**
 * A Scenario on its Topic's page: its sentence, then its demo in a card that
 * is a trapped Gesture Zone, so the Showcase's own sidebar never hears it.
 * A Scenario that needs the whole screen shows a way to open it instead.
 */
export function Stage(props: {
  readonly topic: string;
  readonly scenario: Scenario;
}) {
  const { scenario } = props;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 pt-1.5 text-sm text-pretty">
          {scenario.sentence}
          {scenario.touchOnly ? (
            <Badge variant="secondary" className="ml-2 align-middle">
              Needs touch
            </Badge>
          ) : null}
        </p>
        {codeOf(scenario)}
      </div>
      {scenario.fullScreen ? (
        <Link
          to="/gestures/$topic/$scenario"
          params={{ topic: props.topic, scenario: scenario.slug }}
          className={buttonVariants({
            variant: 'outline',
            className: 'h-24 w-full rounded-xl border-dashed',
          })}
        >
          <Maximize2Icon aria-hidden="true" />
          Try it full screen
        </Link>
      ) : (
        <StatusProvider>
          {(status) => (
            <>
              <GestureZone
                trapped
                className="relative h-80 overflow-hidden rounded-xl bg-card ring-1 ring-edge"
              >
                <scenario.Demo />
                <Fingers />
              </GestureZone>
              <p
                role="status"
                className="min-h-5 font-mono text-xs text-muted-foreground"
              >
                {status}
              </p>
            </>
          )}
        </StatusProvider>
      )}
    </section>
  );
}

/**
 * A Scenario that needs the whole screen, with its own Gesture Provider. A
 * bar at the foot says what it's doing, shows its code and closes it.
 */
export function StageScreen(props: {
  readonly topic: string;
  readonly scenario: Scenario;
}) {
  const { scenario } = props;
  return (
    <GestureProvider>
      <appTheme.StatusBar />
      <StatusProvider>
        {(status) => (
          <>
            <GestureZone className="fixed inset-0 overflow-hidden bg-background">
              <scenario.Demo />
              <Fingers />
            </GestureZone>
            <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-popover/90 p-1 pl-4 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
                <p
                  role="status"
                  className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                >
                  {status ?? scenario.sentence}
                </p>
                {codeOf(scenario)}
                <Link
                  to="/gestures/$topic"
                  params={{ topic: props.topic }}
                  aria-label="Close"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    className: 'size-11 rounded-full md:size-8',
                  })}
                >
                  <XIcon aria-hidden="true" />
                </Link>
              </div>
            </div>
          </>
        )}
      </StatusProvider>
    </GestureProvider>
  );
}
