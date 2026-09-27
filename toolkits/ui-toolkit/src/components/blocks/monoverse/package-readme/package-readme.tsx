import type { ReactNode } from 'react';
import type { Package } from '../analysis';

import { BookOpen, FileQuestion, TriangleAlert } from '#lib/lucide';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { MarkdownViewer } from '../../markdown-viewer';

export type PackageReadmeDocument =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'ready'; readonly markdown: string };

// Keyed by the relative path inside the Package folder.
export type PackageReadmeDocuments = Readonly<
  Record<string, PackageReadmeDocument>
>;

type ReadmeLinkTarget =
  | { readonly kind: 'anchor' }
  | { readonly kind: 'markdown'; readonly path: string }
  | { readonly kind: 'external'; readonly href: string };

interface PackageReadmeStackProps {
  readonly pkg: Package;
  // Relative paths inside the Package, bottom dialog first.
  readonly stack: readonly string[];
  readonly documents: PackageReadmeDocuments;
  readonly onPush: (path: string) => void;
  readonly onPop: () => void;
}

// One markdown file of a Package read inline, such as the Package README in a
// Documentation tab. Links to other markdown files in the Package open through
// `onOpenMarkdown`; other links open elsewhere.
export function PackageReadmeView({
  path,
  document,
  onOpenMarkdown,
}: {
  readonly path: string;
  readonly document: PackageReadmeDocument;
  readonly onOpenMarkdown: (path: string) => void;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6',
        scrollbarStyles,
      )}
    >
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 font-mono text-xs text-muted-foreground">{path}</p>
        <ReadmeBody
          document={document}
          onLinkClick={(href) => followLink(path, href, onOpenMarkdown)}
        />
      </div>
    </div>
  );
}

// Markdown files reached from a Package README, one dialog per file, stacked
// so closing the top one returns to the one below.
export function PackageReadmeStack({
  pkg,
  stack,
  documents,
  onPush,
  onPop,
}: PackageReadmeStackProps) {
  return renderFrom(0);

  function renderFrom(index: number): ReactNode {
    const path = stack[index];
    if (path === undefined) return null;
    const top = index === stack.length - 1;
    return (
      <ReadmeDialog
        pkg={pkg}
        path={path}
        document={documents[path] ?? { kind: 'loading' }}
        onClose={top ? onPop : undefined}
        onLinkClick={(href) => followLink(path, href, onPush)}
      >
        {renderFrom(index + 1)}
      </ReadmeDialog>
    );
  }
}

function ReadmeDialog({
  pkg,
  path,
  document,
  onClose,
  onLinkClick,
  children,
}: {
  readonly pkg: Package;
  readonly path: string;
  readonly document: PackageReadmeDocument;
  // Only the top dialog closes; the ones below wait for it to go first.
  readonly onClose: (() => void) | undefined;
  readonly onLinkClick: (href: string) => boolean;
  readonly children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        className="flex max-h-[85dvh] w-[min(56rem,calc(100%-2rem))] flex-col gap-4 sm:max-w-4xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="pe-8">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <BookOpen className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono">{pkg.name}</span>
          </DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {path}
          </DialogDescription>
        </DialogHeader>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}>
          <ReadmeBody document={document} onLinkClick={onLinkClick} />
        </div>
      </DialogContent>
      {children}
    </Dialog>
  );
}

function ReadmeBody({
  document,
  onLinkClick,
}: {
  readonly document: PackageReadmeDocument;
  readonly onLinkClick: (href: string) => boolean;
}) {
  switch (document.kind) {
    case 'loading':
      return (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>Reading markdown</EmptyTitle>
          </EmptyHeader>
        </Empty>
      );
    case 'missing':
      return (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion />
            </EmptyMedia>
            <EmptyTitle>This Package has no README</EmptyTitle>
            <EmptyDescription>
              Add a README.md at the Package folder root to show it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    case 'failure':
      return (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Could not read this file</EmptyTitle>
            <EmptyDescription>{document.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    case 'ready':
      return (
        <MarkdownViewer className="prose-sm" onLinkClick={onLinkClick}>
          {document.markdown}
        </MarkdownViewer>
      );
  }
}

function followLink(
  currentPath: string,
  href: string,
  onOpenMarkdown: (path: string) => void,
): boolean {
  const target = resolveReadmeLink(currentPath, href);
  if (target.kind === 'anchor') return false;
  if (target.kind === 'markdown') onOpenMarkdown(target.path);
  else window.open(target.href, '_blank', 'noopener,noreferrer');
  return true;
}

const schemeOrProtocolRelative = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Decides what a link inside one markdown file points at. Relative `.md`
 * links resolve against the file's folder and open as another dialog when
 * they stay inside the Package; everything else opens elsewhere.
 */
export function resolveReadmeLink(
  currentPath: string,
  href: string,
): ReadmeLinkTarget {
  if (href.startsWith('#')) return { kind: 'anchor' };
  if (schemeOrProtocolRelative.test(href) || href.startsWith('/')) {
    return { kind: 'external', href };
  }
  const pathPart = href.split(/[?#]/, 1)[0] ?? '';
  if (pathPart === '') return { kind: 'anchor' };
  const resolved = resolveRelative(currentPath, pathPart);
  if (resolved === null || !/\.md$/i.test(resolved)) {
    return { kind: 'external', href };
  }
  return { kind: 'markdown', path: resolved };
}

// Posix-style resolution of `href` against the folder holding `currentPath`;
// null when the result climbs above the Package folder.
function resolveRelative(currentPath: string, href: string): string | null {
  const segments = currentPath.split('/').slice(0, -1);
  for (const segment of href.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}
