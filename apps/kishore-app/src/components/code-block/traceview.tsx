import { Effect } from 'effect';
import {
  createTracerWatcher,
  GlobalConfig,
  Timeline,
} from '@monorepo/trace-viewer';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { ResourceOptions, ResourceResult, useResourceMap } from './resource';

export function CodeBlockTraceRun({
  effect,
  children,
  config,
  enableConfigChanges = [],
}: {
  effect:
    | Effect.Effect<unknown, unknown>
    | ((options: ResourceOptions) => Effect.Effect<unknown, unknown>);
  children?: (state: ResourceResult) => React.ReactNode;
  config?: Partial<GlobalConfig>;
  enableConfigChanges?: (keyof GlobalConfig)[];
}) {
  const resourceResult = useResourceMap();
  const { aquire: resource } = resourceResult;
  const [{ ref, TracerLayer }] = useState(() => createTracerWatcher());
  const finalConfig: GlobalConfig = {
    maxGapInPxs: 60,
    minSpanDurationInPxs: 0,
    layoutType: 'compact',
    enableHover: true,
    enableTooltip: true,
    enableLiveGap: false,
    enableLiveBar: true,
    enableEvents: false,
    enableSelect: false,
    enableMeta: true,
    secondInPxs: 500,
    isLive: false,
    ...config,
  };
  for (let enableKey of enableConfigChanges) {
    delete finalConfig[enableKey];
  }

  useComponentLifecycle(
    (Effect.isEffect(effect)
      ? effect
      : effect({ aquireResource: resource })
    ).pipe(Effect.provide(TracerLayer)),
  );

  return (
    <Timeline tracerRef={ref} forceOptions={finalConfig}>
      {children?.(resourceResult)}
    </Timeline>
  );
}
