import { cn } from '@monorepo/frontend/utils';
import { ReactNode } from 'react';

interface QuestionProps {
  children: ReactNode;
  className?: string;
}

export function Question({ children, className }: QuestionProps) {
  return (
    <div
      className={cn(
        'my-10 p-6 bg-foreground/5 border-y border-border flex gap-4 items-start',
        className,
      )}
    >
      {/* Big Question Mark */}
      <span
        className={cn(
          'not-prose text-8xl font-serif font-bold leading-none select-none',
          'text-muted-foreground/60',
        )}
      >
        ?
      </span>

      {/* Question Text */}
      <div
        className={cn(
          'text-lg leading-relaxed py-1 prose-p:my-0',
          'text-foreground/90 dark:text-foreground/90',
          'font-medium italic',
        )}
      >
        {children}
      </div>
    </div>
  );
}
