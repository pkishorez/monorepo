import { cn } from '@monorepo/frontend/utils';
import { CSSProperties } from 'react';
import { Maximize2 } from '@monorepo/frontend/lucide';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@monorepo/frontend/components/ui/dialog';

interface SvgImageProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  minHeight?: string | number;
}

export function SvgImage({
  children,
  className,
  title,
  minHeight,
}: SvgImageProps) {
  if (!minHeight) {
    return (
      <div
        className={cn('my-8 not-prose group relative', className)}
        role="img"
        aria-label={title}
      >
        <div className="w-full border border-border rounded-lg p-4 bg-background">
          {children}
        </div>
        {title && (
          <figcaption className="text-sm text-muted-foreground mt-2">
            {title}
          </figcaption>
        )}
      </div>
    );
  }

  const minHeightStyle = {
    '--min-height':
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
  } as CSSProperties;

  return (
    <div
      className={cn('my-8 not-prose group relative', className)}
      role="img"
      aria-label={title}
    >
      <Dialog>
        <DialogTrigger
          className={cn(
            'w-full border border-border rounded-lg p-4 bg-background transition-all duration-200',
            'select-none cursor-pointer hover:border-primary/50 relative',
          )}
        >
          {children}
          <div className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-hidden flex flex-col p-0 sm:max-w-[90vw]">
          <DialogTitle className={cn('p-6 pb-0', !title && 'sr-only')}>
            {title || 'Image Preview'}
          </DialogTitle>

          <div
            className="overflow-auto p-6 pt-4 flex-1 [&>svg]:w-auto [&>svg]:min-w-full [&>svg]:min-h-(--min-height)"
            style={minHeightStyle}
          >
            {children}
          </div>
        </DialogContent>
      </Dialog>

      {title && (
        <figcaption className="text-sm text-muted-foreground mt-2">
          {title}
        </figcaption>
      )}
    </div>
  );
}
