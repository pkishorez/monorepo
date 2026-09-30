import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@kstackz/ui-toolkit/components/ui/sheet';
import { ArrowLeftIcon, ListChecksIcon } from '@kstackz/ui-toolkit/lucide';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { CodeButton } from '../../../common/code.tsx';
import type { Feature } from '../feature.ts';

/**
 * A small pill floating over a Feature: back to every Feature, what to try
 * in it, and its code. Above the app, under dialogs, so no gesture of the app reaches it.
 */
export function Bar(props: { readonly feature: Feature }) {
  const { feature } = props;
  const [trying, setTrying] = useState(false);
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-popover/90 p-1 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
          <Link
            to="/features"
            aria-label="All features"
            className={buttonVariants({
              variant: 'ghost',
              size: 'icon',
              className: 'size-11 rounded-full md:size-8',
            })}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 md:min-h-8"
            onClick={() => setTrying(true)}
          >
            <ListChecksIcon aria-hidden="true" />
            Try
          </Button>
          <CodeButton title={feature.title} files={feature.files} />
        </div>
      </div>
      <Sheet open={trying} onOpenChange={setTrying}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Try in {feature.title}</SheetTitle>
          </SheetHeader>
          <ol className="flex list-decimal flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-9 text-sm">
            {feature.tries.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}
