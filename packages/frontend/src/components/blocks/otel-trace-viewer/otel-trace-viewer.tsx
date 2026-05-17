import { useCallback, useEffect, useState } from 'react';

import { CommandPalette } from './command-palette';
import { TraceList } from './trace-list';
import type { OtelEvent, OtelSpan, OtelStatus } from './types';
import {
  formatDuration,
  formatSpanName,
  groupByTrace,
  type SpanNode,
  type TraceGroup,
} from './utils';

export type { OtelEvent, OtelSpan, OtelStatus, SpanNode, TraceGroup };
export { formatDuration, formatSpanName, groupByTrace };

interface OtelTraceViewerProps {
  traces: TraceGroup[];
  selectedTraceId?: string | null;
  onSelectTrace?: (trace: TraceGroup) => void;
  paletteOpen?: boolean;
  onPaletteOpenChange?: (open: boolean) => void;
  showListHeader?: boolean;
}

export function OtelTraceViewer({
  traces,
  selectedTraceId,
  onSelectTrace,
  paletteOpen: paletteOpenProp,
  onPaletteOpenChange,
  showListHeader = true,
}: OtelTraceViewerProps) {
  const [paletteOpenInternal, setPaletteOpenInternal] = useState(false);
  const paletteOpen = paletteOpenProp ?? paletteOpenInternal;
  const setPaletteOpen = onPaletteOpenChange ?? setPaletteOpenInternal;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setPaletteOpen]);

  const handleSelect = useCallback(
    (trace: TraceGroup) => {
      onSelectTrace?.(trace);
    },
    [onSelectTrace],
  );

  return (
    <>
      <TraceList
        traces={traces}
        selectedTraceId={selectedTraceId}
        showHeader={showListHeader}
        onSelectTrace={handleSelect}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <CommandPalette
        traces={traces}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelect={handleSelect}
      />
    </>
  );
}
