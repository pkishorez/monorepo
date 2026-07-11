import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { XIcon } from '#lib/lucide';
import { cn } from '#lib/utils';
import { useInspectorData } from './use-inspector-data';
import { CalmDashboard } from './calm-kit';
import { useDevtoolsStore } from './internal/store';

const MIN_HEIGHT = 200;

function clampHeight(px: number): number {
  return Math.min(
    Math.max(px, MIN_HEIGHT),
    Math.round(window.innerHeight * 0.92),
  );
}

function DevtoolsTray({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const data = useInspectorData();
  const height = useDevtoolsStore((s) => s.height);
  const setHeight = useDevtoolsStore((s) => s.setHeight);
  const draggingRef = useRef(false);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      setHeight(clampHeight(window.innerHeight - e.clientY));
    },
    [setHeight],
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setHeight(clampHeight(window.innerHeight - e.clientY));
    },
    [setHeight],
  );

  return (
    <div
      role="dialog"
      aria-label="Devtools"
      aria-hidden={!open}
      inert={!open}
      style={{ height }}
      className={cn(
        'text-foreground border-border bg-background',
        'flex w-full flex-col overflow-hidden border-t shadow-2xl shadow-black/30',
        'transform-gpu transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[translate,opacity]',
        open
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-full opacity-0',
      )}
    >
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        className="hover:bg-border h-1.5 w-full shrink-0 cursor-row-resize"
        aria-label="Resize devtools"
      />
      <Tabs value="sync" className="flex min-h-0 flex-1 flex-col gap-0">
        <header className="border-border flex h-11 shrink-0 items-center gap-3 border-b px-3">
          <TabsList variant="line" className="h-11">
            <TabsTrigger value="sync">TanStack Sync</TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close devtools"
          >
            <XIcon className="size-4" />
          </Button>
        </header>
        <TabsContent value="sync" className="min-h-0 flex-1">
          {open ? <CalmDashboard data={data} active /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function DevtoolsOverlay() {
  const open = useDevtoolsStore((s) => s.open);
  const setOpen = useDevtoolsStore((s) => s.setOpen);
  const toggleOpen = useDevtoolsStore((s) => s.toggleOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        toggleOpen();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-devtools', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-devtools', onOpen);
    };
  }, [setOpen, toggleOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <DevtoolsTray open={open} onClose={() => setOpen(false)} />
    </div>,
    document.body,
  );
}
