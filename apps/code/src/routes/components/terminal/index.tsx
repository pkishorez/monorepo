import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  TerminalCore,
  type TerminalCoreHandle,
  type TerminalConfig,
} from './terminal-core';
import { MobileControls } from './mobile/mobile-controls';
import { useIsMobile } from './use-is-mobile';

const MIN_ROWS = 10;
const MAX_ROWS = 50;
const ROW_STEP = 1;

interface TerminalProps {
  sessionId: number;
  readOnly?: boolean;
  config?: TerminalConfig;
  onBack: () => void;
}

export type { TerminalConfig };

export function Terminal({
  sessionId,
  readOnly,
  config,
  onBack,
}: TerminalProps) {
  const isMobile = useIsMobile();
  const coreRef = useRef<TerminalCoreHandle>(null);
  const [rows, setRows] = useState(config?.rows ?? 25);

  useEffect(() => {
    if (config?.rows != null && config.rows !== rows) {
      setRows(config.rows);
    }
  }, [config?.rows]);

  const mergedConfig = useMemo(() => ({ ...config, rows }), [config, rows]);

  const handleInput = useCallback((data: string) => {
    coreRef.current?.write(data);
  }, []);

  const handleRowsUp = useCallback(() => {
    setRows((r) => Math.min(r + ROW_STEP, MAX_ROWS));
  }, []);

  const handleRowsDown = useCallback(() => {
    setRows((r) => Math.max(r - ROW_STEP, MIN_ROWS));
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#09090b]">
      <button
        onClick={onBack}
        className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
        aria-label="Back to sessions"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div className="min-h-0 flex-1 overflow-auto">
        <TerminalCore
          ref={coreRef}
          sessionId={sessionId}
          readOnly={readOnly}
          config={mergedConfig}
          isMobile={isMobile}
        />
      </div>
      {isMobile && !readOnly && (
        <MobileControls
          onInput={handleInput}
          onRowsUp={handleRowsUp}
          onRowsDown={handleRowsDown}
          rows={rows}
          cols={mergedConfig.cols ?? 50}
        />
      )}
    </div>
  );
}
