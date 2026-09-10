import type { ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Badge } from 'kui-toolkit/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from 'kui-toolkit/components/ui/sheet';
import { RefreshCw, X } from 'kui-toolkit/lucide';
import { JsonTree } from 'kui-toolkit/components/blocks/json';
import type { resourceStateView } from '../../../../shared/contracts/resource-browser/index.ts';
import { QueryError, ListSkeleton } from '../../query-feedback/index.ts';
import { Status, Value, type NavigationLink } from '../state-view/index.ts';

export function ResourcePanel({
  NavigationLink,
  onClose,
  query,
  isMobile,
  ...input
}: {
  storeId: string;
  stack: string;
  stage: string;
  resource: string;
  NavigationLink: NavigationLink;
  onClose: () => void;
  query: {
    data: typeof resourceStateView.Type | null;
    pending: boolean;
    error: string | null;
    refresh: () => void;
  };
  isMobile: boolean;
}) {
  const state = query.data?.data;
  const closeLink = (
    <NavigationLink
      stack={input.stack}
      stage={input.stage}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      aria-label="Close resource"
      title="Close"
    >
      <X className="size-4" />
    </NavigationLink>
  );
  const refresh = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={query.refresh}
      disabled={query.pending}
      aria-label="Refresh resource state"
      title="Refresh resource state"
    >
      <RefreshCw className={query.pending ? 'motion-safe:animate-spin' : ''} />
    </Button>
  );
  const body = (
    <>
      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && (
        <ListSkeleton label="Loading resource state" />
      )}
      {query.data && state === null && (
        <p className="text-sm text-muted-foreground">
          This resource is no longer in the store. A deployment may have removed
          it. Refresh the stage to update the list.
        </p>
      )}
      {state && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Status status={state.status} />
            <Badge variant="outline" className="font-mono text-[11px]">
              {String(
                state.kind === 'action' ? state.actionType : state.resourceType,
              )}
            </Badge>
          </div>
          <Value
            title={state.kind === 'action' ? 'Input' : 'Properties'}
            value={state.kind === 'action' ? state.input : state.props}
          />
          <Value
            title="Outputs"
            value={state.kind === 'action' ? state.output : state.attr}
          />
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              All state
            </summary>
            <div className="mt-3 overflow-auto">
              <JsonTree value={state} collapsed={2} />
            </div>
          </details>
        </div>
      )}
    </>
  );
  const heading = (
    <span className="break-all font-mono text-sm font-medium">
      {input.resource}
    </span>
  );
  const subheading: ReactNode = `${input.stack} / ${input.stage}`;

  if (isMobile)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] [&>button]:hidden"
        >
          <SheetHeader className="flex-row items-start justify-between gap-3 text-left">
            <div className="min-w-0 space-y-1">
              <SheetTitle>{heading}</SheetTitle>
              <SheetDescription>{subheading}</SheetDescription>
            </div>
            <div className="flex shrink-0 items-center">
              {refresh}
              {closeLink}
            </div>
          </SheetHeader>
          <div className="px-4 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );

  // Before hydration reports a narrow viewport, the aside stays CSS-hidden so phones never flash it.
  return (
    <div className="hidden w-[26rem] shrink-0 md:block xl:w-[30rem]">
      <aside
        aria-label="Resource state"
        className="sticky top-12 flex h-[calc(100svh-3rem)] w-full flex-col border-l bg-background"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <h2 className="min-w-0">{heading}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {subheading}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            {refresh}
            {closeLink}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
      </aside>
    </div>
  );
}
