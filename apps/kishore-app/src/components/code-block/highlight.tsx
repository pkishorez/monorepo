import { Effect, Layer } from 'effect';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/utils';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { createHighlighter } from 'shiki/bundle/web';
import {
  transformerNotationHighlight,
  transformerNotationMap,
} from '@shikijs/transformers';
import { runtime } from '@/services/runtime';
import { AnimateHeight } from '../animate-height';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Maximize2, Minimize2 } from '@monorepo/frontend/lucide';

const runtimeLayer = Layer.effectContext(runtime.contextEffect);

const highlighter = Effect.runSync(
  Effect.cached(
    Effect.promise(() =>
      createHighlighter({
        langs: ['typescript'],
        themes: ['github-dark', 'github-light'],
      }),
    ),
  ),
);

export function CodeHighlight({
  code,
  className,
  fileName = '',
  fileType,
  children,
}: {
  code: string;
  className?: string;
  fileName?: string;
  fileType?: string;
  children?: React.ReactNode;
}) {
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useComponentLifecycle(
    Effect.gen(function* () {
      const highlighterResolved = yield* highlighter.pipe(
        Effect.onError(Effect.logError),
      );
      const highlighted = highlighterResolved.codeToHtml(code, {
        lang: 'typescript',
        themes: { dark: 'github-dark', light: 'github-light' },
        rootStyle: 'width: max-content; margin: 0; padding: 0;',
        transformers: [
          transformerNotationHighlight({ matchAlgorithm: 'v3' }),
          transformerNotationMap(
            { classMap: { a: 'class-a', b: 'class-b' } },
            '',
          ),
        ],
      });
      setHighlightedCode(highlighted);
    }).pipe(Effect.withSpan('highlight'), Effect.provide(runtimeLayer)),
    { deps: [code] },
  );
  const [maximize, setMaximize] = useState(false);

  return (
    <div
      className={cn(
        'not-prose',
        'rounded-lg border border-border',
        'bg-foreground/5',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border',
          'hidden',
          { hidden: !fileName && !fileType },
        )}
      >
        <span className="text-sm font-medium text-foreground">{fileName}</span>
        {fileType && (
          <span className="text-xs text-muted-foreground font-mono">
            {fileType}
          </span>
        )}
      </div>
      <AnimateHeight className="relative">
        <div
          className={cn(
            'overflow-auto',
            {
              'max-h-120': !maximize,
            },
            scrollbarStyles,
          )}
        >
          <pre
            dangerouslySetInnerHTML={{
              __html:
                highlightedCode ??
                code
                  .split('\n')
                  .filter((line) => !line.startsWith('// '))
                  .join('\n'),
            }}
            className={cn('leading-loose! font-medium text-sm p-4 w-max')}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMaximize(!maximize)}
          className="absolute top-2 right-2"
        >
          {maximize ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </AnimateHeight>
      {children}
    </div>
  );
}

export function InlineCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useComponentLifecycle(
    Effect.gen(function* () {
      const highlighterResolved = yield* highlighter.pipe(
        Effect.onError(Effect.logError),
      );
      const highlighted = highlighterResolved.codeToHtml(code, {
        lang: 'typescript',
        themes: { dark: 'github-dark', light: 'github-light' },
        structure: 'inline',
        transformers: [
          transformerNotationHighlight({ matchAlgorithm: 'v3' }),
          transformerNotationMap(
            { classMap: { a: 'class-a', b: 'class-b' } },
            '',
          ),
        ],
      });
      setHighlightedCode(highlighted);
    }).pipe(Effect.withSpan('highlight'), Effect.provide(runtimeLayer)),
    { deps: [code] },
  );

  return (
    <code
      dangerouslySetInnerHTML={{
        __html: highlightedCode ?? code,
      }}
      className={cn(
        'not-prose shiki p-1 border border-foreground/20 bg-foreground/10 rounded-xs text-xs font-mono',
        className,
      )}
    />
  );
}
