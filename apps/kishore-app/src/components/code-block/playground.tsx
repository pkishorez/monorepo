import { Button } from '@monorepo/frontend/components/ui/button';
import { Play, RefreshCcwIcon } from '@monorepo/frontend/lucide';
import { CodeHighlight } from './highlight';
import { CodeBlockTraceRun } from './traceview';
import { useState } from 'react';
import { GlobalConfig, LiveToggle, Timeline } from '@monorepo/trace-viewer';
import { Effect } from 'effect';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/utils';
import { AnimateHeight } from '../animate-height';
import { ResourceOptions, ResourceUI } from './resource';

export function CodeBlockPlayground({
  effect,
  code,
  config,
  noTrace = false,
  showResources = false,
  animateHeightAlways = false,
  onPlay,
}: {
  effect?:
    | Effect.Effect<unknown, unknown>
    | ((options: ResourceOptions) => Effect.Effect<unknown, unknown>)
    | null;
  code: string;
  config: Partial<GlobalConfig>;
  noTrace?: boolean;
  showResources?: boolean;
  animateHeightAlways?: boolean;
  onPlay?: () => void;
}) {
  const [playCount, setPlayCount] = useState(0);

  return (
    <div className="not-prose my-8">
      <CodeHighlight code={code} fileName={``} fileType="typescript">
        {!noTrace && (
          <AnimateHeight
            className="bg-foreground/5"
            alwaysIncreasing={!animateHeightAlways}
          >
            <CodeBlockTraceRun
              effect={playCount === 0 || !effect ? Effect.void : effect}
              config={config}
              enableConfigChanges={showResources ? ['isLive'] : []}
              key={playCount}
            >
              {(result) => (
                <div
                  className={cn(
                    'relative flex h-full items-stretch',
                    'self-stretch',
                  )}
                >
                  <div className={cn('flex flex-col gap-2 p-2 h-min')}>
                    <Button
                      onClick={() => {
                        onPlay?.();
                        setPlayCount((c) => c + 1);
                      }}
                      style={{ gridRow: 1, gridColumn: 1 }}
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                    >
                      {playCount === 0 ? <Play /> : <RefreshCcwIcon />}
                    </Button>
                    {/* {playCount > 0 && <Timeline.DropdownConfig className="" />} */}
                  </div>
                  {playCount === 0 ? (
                    <div className={cn('grow self-center text-left')}>
                      Play to see execution
                    </div>
                  ) : (
                    <div className="w-[calc(100%-50px)] pr-4">
                      {showResources && (
                        <div className="flex items-center gap-3 py-2.5">
                          <LiveToggle />
                          <ResourceUI result={result} className="grow" />
                        </div>
                      )}
                      <Timeline.Content
                        className={cn(
                          'w-full overflow-x-auto overflow-y-hidden grow pl-1 pr-12 py-2',
                          scrollbarStyles,
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
            </CodeBlockTraceRun>
          </AnimateHeight>
        )}
      </CodeHighlight>
    </div>
  );
}
