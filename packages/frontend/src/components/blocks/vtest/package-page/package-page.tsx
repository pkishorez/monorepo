import { FolderIcon } from 'lucide-react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

import { Markdown } from '../markdown';
import { RevealMore } from '../reveal';
import type { VtestFolder, VtestSection } from '../types';
import { FolderRow } from './folder-row';

interface VtestPackagePageProps {
  packageName: string;
  /** Folders grouped by toc section, in reading order. */
  sections: readonly VtestSection[];
  /** Optional package overview from `home.md`. */
  overview?: string;
  onOpenFolder: (folder: VtestFolder) => void;
  onAddFolder?: () => void;
}

/**
 * Package screen: the package's folders (features) grouped by toc section, with
 * an optional `home.md` overview and an explicit empty state. Each section caps
 * its folders at 5 (5±2) with reveal-more.
 */
export function VtestPackagePage({
  packageName,
  sections,
  overview,
  onOpenFolder,
  onAddFolder,
}: VtestPackagePageProps) {
  const hasFolders = sections.some((s) => s.folders.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">{packageName}</h1>
      </header>

      {overview && (
        <section className="rounded-lg border border-border p-5">
          <Markdown source={overview} />
        </section>
      )}

      {hasFolders ? (
        sections
          .filter((section) => section.folders.length > 0)
          .map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h2>
              <RevealMore items={section.folders} itemKey={(f) => f.name}>
                {(folder) => (
                  <FolderRow folder={folder} onOpen={onOpenFolder} />
                )}
              </RevealMore>
            </section>
          ))
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>No folders yet. Add a folder.</EmptyTitle>
            <EmptyDescription>
              Document a feature folder under this package to see it here.
            </EmptyDescription>
          </EmptyHeader>
          {onAddFolder && (
            <button
              type="button"
              onClick={onAddFolder}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Add a folder
            </button>
          )}
        </Empty>
      )}
    </div>
  );
}
