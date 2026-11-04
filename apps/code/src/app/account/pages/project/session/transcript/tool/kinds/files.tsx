import {
  FileTextIcon,
  FilePlus2Icon,
  FilePenIcon,
  Trash2Icon,
} from 'lucide-react';
import { type Kind, Output, Block, json, Labelled } from '../output/index.ts';
import { changesOf, relative, diffsOf } from '../parse/index.ts';
import { Clamped } from '../../words/index.ts';
import { DiffViewer } from '@kestack/web-platform/ui/viewers/diff-viewer';

/*
 * Tools that work on files: one read, written whole, edited, or deleted.
 */

/** A file read: opened, what the agent saw of it. */
export const read: Kind = {
  icon: FileTextIcon,
  Detail: ({ row, opening }) => (
    <Output row={row} opening={opening} label="What it read" />
  ),
};

/**
 * Files written whole: opened, what was written to each, under its path.
 * Claude writes one file, its `content`; Codex any number, its `changes`.
 * Any other shape shows its input as given, and what the tool said.
 */
export const write: Kind = {
  icon: FilePlus2Icon,
  Detail: ({ row, opening, folder }) => {
    const input = row.call.input as { content?: unknown; file_path?: unknown };
    const changes = changesOf(row.call);
    const files =
      changes.length > 0
        ? changes.map(({ path, diff }) => ({ path, text: diff }))
        : typeof input?.content === 'string'
          ? [{ path: String(input.file_path ?? ''), text: input.content }]
          : [];
    if (files.length === 0)
      return (
        <>
          <Labelled label={row.call.name}>
            <Block>
              <Clamped
                id={`${row.id}:input`}
                opening={opening}
                text={json(row.call.input)}
              />
            </Block>
          </Labelled>
          <Output row={row} opening={opening} />
        </>
      );
    return (
      <>
        {files.map(({ path, text }) => (
          <Labelled key={path} label={relative(path, folder)}>
            <Block>
              <Clamped id={`${row.id}:${path}`} opening={opening} text={text} />
            </Block>
          </Labelled>
        ))}
        {row.result?.isError && <Output row={row} opening={opening} />}
      </>
    );
  },
};

/** A file edited: opened, the diff it made, one per file; why, if it failed. */
export const edit: Kind = {
  icon: FilePenIcon,
  Detail: ({ row, opening, folder }) => {
    const diffs = diffsOf(row.call, folder);
    if (diffs.length === 0) return <Output row={row} opening={opening} />;
    return (
      <>
        {diffs.map((diff) => (
          <div key={diff.path} className="min-w-0 overflow-x-auto">
            <DiffViewer
              diff={diff as Parameters<typeof DiffViewer>[0]['diff']}
              defaultLayout="unified"
              autoHeight
              className="rounded-lg border border-border"
            />
          </div>
        ))}
        {row.result?.isError && <Output row={row} opening={opening} />}
      </>
    );
  },
};

/** A file deleted: opened, what the tool said of it. */
export const remove: Kind = {
  icon: Trash2Icon,
  Detail: ({ row, opening }) => <Output row={row} opening={opening} />,
};
