import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kstackz/ui-toolkit/components/ui/dialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/ui-toolkit/components/ui/tabs';
import { CodeIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { lazy, Suspense, useState } from 'react';

/** One file a Showcase shows as its code: its name, and exactly what it says. */
export interface CodeFile {
  readonly path: string;
  /** The file itself, imported with `?raw`, so it never drifts from what runs. */
  readonly content: string;
}

// Shiki and its grammars load only once someone opens the code.
const SourceViewer = lazy(() =>
  import('@kstackz/ui-toolkit/components/blocks/source-viewer').then((m) => ({
    default: m.SourceViewer,
  })),
);

/**
 * A "Code" button that opens the files behind what's on screen in a dialog,
 * one tab each. Every Showcase shows its code this way.
 */
export function CodeButton(props: {
  readonly title: string;
  readonly files: ReadonlyArray<CodeFile>;
  /** Only the icon, for a header's right edge. */
  readonly iconOnly?: boolean;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(props.files[0]?.path);
  const file =
    props.files.find((f) => f.path === path) ?? props.files[0] ?? undefined;
  return (
    <>
      <Button
        variant="ghost"
        size={props.iconOnly ? 'icon' : 'sm'}
        className={cn(
          props.iconOnly
            ? 'size-11 rounded-full md:size-8'
            : 'min-h-11 text-muted-foreground md:min-h-8',
          props.className,
        )}
        aria-label={props.iconOnly ? `Code: ${props.title}` : undefined}
        onClick={() => setOpen(true)}
      >
        <CodeIcon aria-hidden="true" />
        {props.iconOnly ? null : 'Code'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="flex min-h-14 items-center gap-3 border-b border-border py-2 pr-14 pl-4">
            <DialogTitle className="truncate">{props.title}</DialogTitle>
          </div>
          {props.files.length > 1 ? (
            <Tabs
              value={file?.path}
              onValueChange={(value) => setPath(value as string)}
              className="border-b border-border px-2 py-1.5"
            >
              <TabsList className="max-w-full justify-start overflow-x-auto">
                {props.files.map((f) => (
                  <TabsTrigger
                    key={f.path}
                    value={f.path}
                    className="flex-none"
                  >
                    {f.path.split('/').at(-1)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          <div className="min-h-0 flex-1">
            {file === undefined ? null : (
              <Suspense fallback={null}>
                <SourceViewer
                  filePath={file.path}
                  content={file.content}
                  showHeader={props.files.length === 1}
                  wrap
                />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
