import { useMemo, useState } from 'react';
import type { Effect } from 'effect';
import type {
  ArchitectureAnalysis,
  Branch,
  ChangeSet,
  FileContent,
  FileList as FileListData,
} from 'laymos';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kstackz/web-platform/components/tabs';
import { cn } from '@kstackz/web-platform/components/utils';
import {
  ChangesMenu,
  defaultGitOptions,
  uncommittedBaseRef,
  type GitOptions,
} from '@kstackz/web-platform/components/viewers/git-changes';
import type { LoadFileDiff } from '@kstackz/web-platform/components/viewers/source-explorer';

import { FileList } from '../file-list';
import { usePreference } from '../preferences';
import { Laymo } from '../laymo';
import { indexChanges } from '../project-changes';
import { StoriesCanvas, type StoriesCanvasProps } from '../stories-canvas';

export type { LoadFileDiff };

export interface LaymosProps {
  readonly analysis: ArchitectureAnalysis;
  readonly loadFileList: (
    modulePath: string,
  ) => Effect.Effect<FileListData, unknown>;
  readonly loadFileContent: (
    path: string,
  ) => Effect.Effect<FileContent, unknown>;
  readonly changes?: ChangeSet;
  readonly loadFileDiff?: LoadFileDiff;
  readonly branches?: readonly Branch[];
  readonly baseRef?: string;
  readonly onBaseRefChange?: (baseRef: string) => void;
  readonly gitAvailable?: boolean;
  readonly stories?: Omit<StoriesCanvasProps, 'className'>;
  readonly className?: string;
}

const laymoTabId = 'laymo';
const storiesTabId = 'stories';

/**
 * The door to Laymos: the Laymo of a Project and, when given, its Stories,
 * each a tab, with the Base ref picker above when git is there. A right-click
 * on a card, or on its row in the Module outline, opens its File list over
 * the Laymo.
 */
export function Laymos({
  analysis,
  loadFileList,
  loadFileContent,
  changes,
  loadFileDiff,
  branches = [],
  baseRef = uncommittedBaseRef,
  onBaseRefChange,
  // Whether git exists for this Project at all, apart from whether a Change
  // set has been fetched yet: a caller that lets the reader pick a Base ref
  // before any Change set exists must say so, or the picker never opens.
  gitAvailable = changes !== undefined ||
    branches.length > 0 ||
    onBaseRefChange !== undefined,
  stories,
  className,
}: LaymosProps) {
  const [activeTab, setActiveTab] = useState(laymoTabId);
  // Whether changes show, and with them unchanged and deleted Modules, are
  // preferences; the Base ref compared against is not.
  const [gitOptions, setGitOptions] = usePreference<GitOptions>(
    'git-options',
    defaultGitOptions,
  );
  const [filesFor, setFilesFor] = useState<string>();
  const shownChanges =
    changes !== undefined && gitOptions.showChanges ? changes : undefined;
  const hasChanges = useMemo(
    () =>
      shownChanges !== undefined &&
      indexChanges(analysis, shownChanges).modules.size > 0,
    [analysis, shownChanges],
  );
  const modulePaths = useMemo(
    () =>
      analysis.tree.nodes
        .filter(({ kind, shape }) => kind === 'module' && shape === 'folder')
        .map(({ path }) => path),
    [analysis.tree.nodes],
  );
  const changedPaths = useMemo(
    () =>
      shownChanges === undefined
        ? undefined
        : new Map(shownChanges.files.map(({ path, status }) => [path, status])),
    [shownChanges],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        'flex min-h-0 flex-col gap-0 overflow-hidden bg-background md:rounded-xl md:border md:border-border md:shadow-sm',
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 max-sm:h-10 sm:px-5">
        <TabsList variant="line" className="h-12 max-sm:h-10">
          <TabsTrigger
            value={laymoTabId}
            className="font-mono text-xs lowercase"
          >
            Laymo
          </TabsTrigger>
          {stories !== undefined && (
            <TabsTrigger
              value={storiesTabId}
              className="font-mono text-xs lowercase"
            >
              Stories
            </TabsTrigger>
          )}
        </TabsList>
        {gitAvailable && activeTab === laymoTabId && (
          <ChangesMenu
            options={gitOptions}
            baseRef={baseRef}
            branches={branches}
            hasChanges={hasChanges}
            ownerLabel="Modules"
            offerDeleted
            onOptionsChange={setGitOptions}
            onBaseRefChange={onBaseRefChange}
          />
        )}
      </div>
      <TabsContent value={laymoTabId} className="flex min-h-0 flex-1 flex-col">
        <Laymo
          analysis={analysis}
          changes={shownChanges}
          onlyChanged={
            shownChanges !== undefined && !gitOptions.includeUnchanged
          }
          showDeleted={gitOptions.includeDeleted}
          onOpenFiles={setFilesFor}
          panel={
            filesFor === undefined
              ? undefined
              : {
                  label: `File list of ${filesFor}`,
                  content: (
                    <FileList
                      key={filesFor}
                      modulePath={filesFor}
                      loadFileList={loadFileList}
                      loadFileContent={loadFileContent}
                      loadFileDiff={loadFileDiff}
                      changedPaths={changedPaths}
                      modules={modulePaths}
                      onClose={() => setFilesFor(undefined)}
                    />
                  ),
                  onClose: () => setFilesFor(undefined),
                }
          }
          className="min-h-0 flex-1"
        />
      </TabsContent>
      {stories !== undefined && (
        <TabsContent
          value={storiesTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <StoriesCanvas {...stories} className="min-h-0 flex-1" />
        </TabsContent>
      )}
    </Tabs>
  );
}
