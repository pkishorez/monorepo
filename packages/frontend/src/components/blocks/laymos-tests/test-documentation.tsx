import { BookOpen, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import { cn } from '#lib/utils';
import { MarkdownDocumentation } from './markdown-documentation';

/** Renders case-level Markdown behind an initially open disclosure. */
export function TestDocumentation({ markdown }: { readonly markdown: string }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-md border border-border/70 bg-muted/10"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/30">
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        <BookOpen className="size-3.5" aria-hidden />
        About this test
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
          {open ? 'Hide' : 'Show'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden border-t">
        <div className="prose prose-sm max-w-none px-4 py-3 text-foreground dark:prose-invert prose-headings:mb-2 prose-headings:mt-3 prose-p:my-2 prose-li:my-0.5 prose-pre:border prose-pre:border-border prose-pre:bg-muted/45">
          <MarkdownDocumentation markdown={markdown} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
